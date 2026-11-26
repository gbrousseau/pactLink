import { z } from "zod";
import type { PoolClient } from "pg";
import { canEdit, canReview, canView, WorkflowError, type User } from "./access";
import { database, transaction } from "./db";
import { completionSchema, type CompletionAnswers } from "./program-completion-schema";

type ReviewState = "draft" | "pending_review" | "returned" | "approved";
export type CompletionRecord = {
  submission_id: string; revision: number; answers: CompletionAnswers; review_state: ReviewState;
  review_requested_by: string | null; review_requested_at: Date | null; return_reason: string | null;
  updated_at: Date; updated_by: string;
};
export type CompletionApproval = {
  version: number; revision: number; answers: CompletionAnswers; editor_ids: string[];
  requested_by: string; approved_at: Date; reviewer_name: string;
};
export type CompletionDecision = {
  revision: number; decision: "approved" | "returned"; reason: string | null; decided_at: Date; reviewer_name: string;
};
function assertId(id: string) {
  if (!z.uuid().safeParse(id).success) throw new WorkflowError("Invalid referral identifier.", "invalid");
}
async function lockEligible(client: PoolClient, user: User, id: string, role: "edit" | "review") {
  const result = await client.query<{ group_id: string; status: string; removed_at: Date | null; legal_hold: boolean; review_state: string }>(
    "SELECT group_id,status,removed_at,legal_hold,review_state FROM submissions WHERE id=$1 FOR UPDATE", [id]);
  const row = result.rows[0];
  if (!row || !canView(user, row.group_id)) throw new WorkflowError("Referral not found or not available to your group.", "missing");
  if (role === "edit" ? !canEdit(user, row.group_id) : !canReview(user, row.group_id)) {
    throw new WorkflowError("You do not have permission for this action.", "forbidden");
  }
  const eligibility = await client.query<{ has_consent: boolean; screening_approved: boolean }>(`SELECT
    EXISTS (SELECT 1 FROM consent_versions WHERE submission_id=$1) AS has_consent,
    EXISTS (SELECT 1 FROM screening_service_records WHERE submission_id=$1 AND review_state='approved') AS screening_approved`, [id]);
  if (row.removed_at || row.status === "archived" || !eligibility.rows[0].has_consent || row.review_state !== "approved" || !eligibility.rows[0].screening_approved) {
    throw new WorkflowError("Program Completion requires Consent and current Intake and Screening and Services approval.", "invalid");
  }
  if (row.legal_hold && role === "edit") throw new WorkflowError("Program Completion cannot be edited while the referral is on legal hold.", "invalid");
}
async function snapshot(client: PoolClient, id: string, revision: number, answers: CompletionAnswers, state: ReviewState, actor: string) {
  await client.query("INSERT INTO program_completion_revisions(submission_id,revision,answers,review_state,actor_id) VALUES ($1,$2,$3,$4,$5)",
    [id, revision, JSON.stringify(answers), state, actor]);
}
export async function saveProgramCompletion(user: User, id: string, revision: number | undefined, input: unknown) {
  assertId(id);
  const parsed = completionSchema.safeParse(input);
  if (!parsed.success) throw new WorkflowError(parsed.error.issues[0]?.message ?? "Invalid Program Completion answers.", "invalid");
  return transaction(async (client) => {
    await lockEligible(client, user, id, "edit");
    const result = await client.query<CompletionRecord>("SELECT * FROM program_completion_records WHERE submission_id=$1 FOR UPDATE", [id]);
    const old = result.rows[0];
    if (old ? old.revision !== revision : revision !== undefined) throw new WorkflowError("Program Completion changed. Reload before saving.", "conflict");
    const next = (old?.revision ?? 0) + 1;
    await client.query(`INSERT INTO program_completion_records(submission_id,revision,answers,review_state,updated_by)
      VALUES ($1,$2,$3,'draft',$4) ON CONFLICT (submission_id) DO UPDATE SET revision=EXCLUDED.revision,
      answers=EXCLUDED.answers,review_state='draft',review_requested_by=NULL,review_requested_at=NULL,
      return_reason=NULL,updated_by=EXCLUDED.updated_by,updated_at=now()`, [id, next, JSON.stringify(parsed.data), user.id]);
    await snapshot(client, id, next, parsed.data, "draft", user.id);
    await client.query("INSERT INTO program_completion_contributors(submission_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [id, user.id]);
    const changed = old ? Object.keys(parsed.data).filter((key) => JSON.stringify(old.answers[key]) !== JSON.stringify(parsed.data[key])) : ["answers"];
    await client.query("INSERT INTO audit_events(actor_id,action,submission_id,changed_fields,revision) VALUES ($1,'program_completion_save',$2,$3,$4)",
      [user.id, id, changed, next]);
    return next;
  });
}
export async function reviewProgramCompletion(user: User, id: string, revision: number, intent: "request" | "approve" | "return", reason = "") {
  assertId(id);
  if (!Number.isInteger(revision) || revision < 1 || !["request", "approve", "return"].includes(intent)) throw new WorkflowError("Invalid review request.", "invalid");
  const cleanReason = reason.trim();
  if (intent === "return" ? !cleanReason || cleanReason.length > 2000 : !!cleanReason) throw new WorkflowError("A return requires a reason of up to 2,000 characters.", "invalid");
  await transaction(async (client) => {
    await lockEligible(client, user, id, intent === "request" ? "edit" : "review");
    const result = await client.query<CompletionRecord>("SELECT * FROM program_completion_records WHERE submission_id=$1 FOR UPDATE", [id]);
    const row = result.rows[0];
    if (!row) throw new WorkflowError("Save Program Completion before requesting review.", "invalid");
    if (row.revision !== revision) throw new WorkflowError("Program Completion changed. Reload before reviewing.", "conflict");
    if (intent === "request") {
      if (!["draft", "returned"].includes(row.review_state)) throw new WorkflowError("Only a draft or returned phase can be sent for review.", "invalid");
      await client.query(`UPDATE program_completion_records SET review_state='pending_review',review_requested_by=$2,
        review_requested_at=now(),return_reason=NULL,revision=revision+1,updated_by=$2,updated_at=now() WHERE submission_id=$1`, [id, user.id]);
      await snapshot(client, id, revision + 1, row.answers, "pending_review", user.id);
      await client.query("INSERT INTO audit_events(actor_id,action,submission_id,changed_fields,revision) VALUES ($1,'program_completion_request_review',$2,ARRAY['review_state'],$3)", [user.id, id, revision + 1]);
      return;
    }
    if (row.review_state !== "pending_review" || !row.review_requested_by || !row.review_requested_at) throw new WorkflowError("This phase is not awaiting review.", "invalid");
    const contributors = await client.query<{ user_id: string }>("SELECT user_id FROM program_completion_contributors WHERE submission_id=$1 ORDER BY user_id", [id]);
    if (row.review_requested_by === user.id || contributors.rows.some((entry) => entry.user_id === user.id)) {
      throw new WorkflowError("A different reviewer must review changes they did not edit or submit.", "forbidden");
    }
    const state = intent === "approve" ? "approved" : "returned";
    await client.query("INSERT INTO program_completion_decisions(submission_id,revision,reviewer_id,decision,reason) VALUES ($1,$2,$3,$4,$5)",
      [id, revision, user.id, state, intent === "return" ? cleanReason : null]);
    if (intent === "approve") {
      await client.query(`INSERT INTO program_completion_approvals(submission_id,version,revision,answers,editor_ids,requested_by,requested_at,approved_by)
        VALUES ($1,(SELECT COALESCE(MAX(version),0)+1 FROM program_completion_approvals WHERE submission_id=$1),$2,$3,$4,$5,$6,$7)`,
      [id, revision, JSON.stringify(row.answers), contributors.rows.map((entry) => entry.user_id), row.review_requested_by, row.review_requested_at, user.id]);
      await client.query("DELETE FROM program_completion_contributors WHERE submission_id=$1", [id]);
    }
    await client.query(`UPDATE program_completion_records SET review_state=$2,return_reason=$3,revision=revision+1,updated_by=$4,updated_at=now() WHERE submission_id=$1`,
      [id, state, intent === "return" ? cleanReason : null, user.id]);
    await snapshot(client, id, revision + 1, row.answers, state, user.id);
    await client.query("INSERT INTO audit_events(actor_id,action,submission_id,changed_fields,revision) VALUES ($1,$2,$3,ARRAY['review_state'],$4)",
      [user.id, `program_completion_${state}`, id, revision + 1]);
  });
}
export async function getProgramCompletion(user: User, id: string): Promise<CompletionRecord | null> {
  assertId(id);
  const result = await database().query<CompletionRecord>(`SELECT r.* FROM program_completion_records r JOIN submissions s ON s.id=r.submission_id
    WHERE s.id=$1 AND ($2 OR (s.group_id=$3 AND s.removed_at IS NULL))`, [id, user.role === "admin", user.group_id]);
  return result.rows[0] ?? null;
}
export async function getCompletionApprovals(user: User, id: string): Promise<CompletionApproval[]> {
  assertId(id);
  const result = await database().query<CompletionApproval>(`SELECT a.*,u.display_name AS reviewer_name FROM program_completion_approvals a
    JOIN submissions s ON s.id=a.submission_id JOIN app_users u ON u.id=a.approved_by
    WHERE s.id=$1 AND ($2 OR (s.group_id=$3 AND s.removed_at IS NULL)) ORDER BY a.version DESC`, [id, user.role === "admin", user.group_id]);
  return result.rows;
}
export async function getCompletionDecisions(user: User, id: string): Promise<CompletionDecision[]> {
  assertId(id);
  const result = await database().query<CompletionDecision>(`SELECT d.revision,d.decision,d.reason,d.decided_at,u.display_name AS reviewer_name
    FROM program_completion_decisions d JOIN submissions s ON s.id=d.submission_id JOIN app_users u ON u.id=d.reviewer_id
    WHERE s.id=$1 AND ($2 OR (s.group_id=$3 AND s.removed_at IS NULL)) ORDER BY d.id DESC`, [id, user.role === "admin", user.group_id]);
  return result.rows;
}
export async function isCompletionContributor(user: User, id: string): Promise<boolean> {
  assertId(id);
  const result = await database().query(`SELECT 1 FROM program_completion_contributors c JOIN submissions s ON s.id=c.submission_id
    WHERE c.submission_id=$1 AND c.user_id=$2 AND ($3 OR (s.group_id=$4 AND s.removed_at IS NULL))`,
  [id, user.id, user.role === "admin", user.group_id]);
  return !!result.rowCount;
}
