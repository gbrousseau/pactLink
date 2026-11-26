import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { canEdit, canReview, canView, WorkflowError, type User } from "./access";
import { database, transaction } from "./db";
import { answersSchema, getIntakeCompleteness, isoDate, validateAnswers, type Answers } from "./intake-validation";
import { consentMovedKeys, programs } from "./intake-fields";
import { requireConsent } from "./consent";

export type Submission = {
  id: string; enrollment_id: string; participant_id: string | null; group_id: string; form_type: "intake";
  template_version: string; status: "draft" | "submitted" | "archived";
  revision: number; answers: Answers; participant_name: string; date_of_birth: string | null;
  program_type: string | null; contact_date: string | null; navigator_name: string;
  created_at: Date; updated_at: Date; legal_hold: boolean;
  removed_at: Date | null;
  review_state: "draft" | "pending_review" | "returned" | "approved" | "legacy";
  review_requested_by: string | null; review_requested_at: Date | null; return_reason: string | null;
  has_consent: boolean;
};
export type ListedSubmission = Submission & {
  screening_review_state: "draft" | "pending_review" | "returned" | "approved" | null;
  completion_review_state: "draft" | "pending_review" | "returned" | "approved" | null;
  phase_updated_at: Date;
};
export type AuditEvent = {
  id: string; action: string; occurred_at: Date; display_name: string; changed_fields: string[]; revision: number | null;
};
export type FormRevision = { revision: number; answers: Answers; status: Submission["status"]; display_name: string; recorded_at: Date };
export type ApprovedVersion = {
  version: number; draft_revision: number; answers: Answers; template_version: string;
  editor_ids: string[]; requested_by: string; requested_at: Date; approved_by: string;
  approved_at: Date; reviewer_name: string;
};
export type ReviewDecision = {
  id: string; draft_revision: number; decision: "approved" | "returned"; reason: string | null;
  decided_at: Date; reviewer_name: string;
};
export const searchSchema = z.object({
  q: z.string().trim().max(100).default(""),
  status: z.enum(["active", "all", "draft", "pending_review", "returned", "approved", "submitted", "archived", "removed"]).default("active"),
  program: z.enum(["", ...programs]).default(""),
  navigator: z.string().trim().max(100).default(""),
  from: z.union([z.literal(""), isoDate]).default(""),
  to: z.union([z.literal(""), isoDate]).default(""),
  sort: z.enum(["updated", "created", "participant", "contact"]).default("updated"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
}).refine((input) => !input.from || !input.to || input.from <= input.to, { message: "Start date must not follow end date.", path: ["from"] });
export type Search = z.infer<typeof searchSchema>;
const sortColumns = { updated: "GREATEST(s.updated_at, r.updated_at, p.updated_at)", created: "s.created_at", participant: "(SELECT e.participant_id FROM enrollments e WHERE e.id=s.enrollment_id)", contact: "s.contact_date" };
const selectColumns = `s.*, to_char(s.date_of_birth,'YYYY-MM-DD') AS date_of_birth, to_char(s.contact_date,'YYYY-MM-DD') AS contact_date,
  EXISTS (SELECT 1 FROM consent_versions c WHERE c.submission_id=s.id) AS has_consent,
  CASE WHEN EXISTS (SELECT 1 FROM consent_versions c WHERE c.submission_id=s.id)
    THEN (SELECT e.participant_id FROM enrollments e WHERE e.id=s.enrollment_id) END AS participant_id`;
const text = (answers: Answers, key: string) => typeof answers[key] === "string" ? answers[key] : "";

async function audit(client: PoolClient, user: User, action: string, id: string | null, fields: string[] = [], revision: number | null = null) {
  await client.query("INSERT INTO audit_events(actor_id,action,submission_id,changed_fields,revision) VALUES ($1,$2,$3,$4,$5)", [user.id, action, id, fields, revision]);
}
async function snapshot(client: PoolClient, id: string, actorId: string) {
  await client.query(`INSERT INTO form_revisions(submission_id,revision,answers,status,actor_id)
    SELECT id,revision,answers,status,$2 FROM submissions WHERE id=$1`, [id, actorId]);
}
export async function createDraft(client: PoolClient, user: User, groupId: string, answers: Answers) {
  if (!canEdit(user, groupId) || Object.keys(validateAnswers(answers, false)).length) {
    throw new WorkflowError("Draft is invalid or you do not have editing permission.", "invalid");
  }
  const participant = randomUUID(), enrollment = randomUUID(), submission = randomUUID();
  await client.query("INSERT INTO participants(id,group_id) VALUES ($1,$2)", [participant, groupId]);
  await client.query("INSERT INTO enrollments(id,participant_id) VALUES ($1,$2)", [enrollment, participant]);
  await client.query(
    `INSERT INTO submissions(id,enrollment_id,group_id,status,answers,participant_name,date_of_birth,program_type,contact_date,navigator_name,created_by,updated_by)
     VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$10)`,
    [submission, enrollment, groupId, JSON.stringify(answers), text(answers, "name"), text(answers, "dob") || null,
      text(answers, "programType") || null, text(answers, "contactDate") || null, text(answers, "navigator"), user.id],
  );
  await audit(client, user, "create_draft", submission, Object.keys(answers).filter((key) => answers[key].length > 0), 1);
  await snapshot(client, submission, user.id);
  await client.query("INSERT INTO draft_contributors(submission_id,user_id) VALUES ($1,$2)", [submission, user.id]);
  return submission;
}
async function ensureNoPlaceholders(client: PoolClient, id: string) {
  const result = await client.query<{ placeholder_fields: string[] }>(
    "SELECT placeholder_fields FROM intake_import_sources WHERE submission_id=$1", [id],
  );
  if (result.rows[0]?.placeholder_fields.length) {
    throw new WorkflowError("Replace the synthetic placeholder name and date of birth before requesting review or approval.", "invalid");
  }
}
async function lockedSubmission(client: PoolClient, user: User, id: string, revision: number): Promise<Submission> {
  const result = await client.query<Submission>("SELECT * FROM submissions WHERE id=$1 AND ($2 OR group_id=$3) FOR UPDATE", [id, user.role === "admin", user.group_id]);
  const row = result.rows[0];
  if (!row || !canView(user, row.group_id)) throw new WorkflowError("Record not found or not available to your group.", "missing");
  if (row.revision !== revision) throw new WorkflowError("Another user changed this record. Open the latest version before saving; your changes have not been applied.", "conflict");
  return row;
}
async function editable(client: PoolClient, user: User, id: string, revision: number): Promise<Submission> {
  const row = await lockedSubmission(client, user, id, revision);
  if (!canEdit(user, row.group_id)) throw new WorkflowError("You do not have editing permission.", "forbidden");
  if (row.removed_at) throw new WorkflowError("Restore the removed draft before modifying it.", "invalid");
  return row;
}
function checkIdentifier(id: string, revision: number) {
  if (!z.uuid().safeParse(id).success || !Number.isInteger(revision) || revision < 1) throw new WorkflowError("Invalid record or revision.", "invalid");
}

export async function saveSubmission(user: User, answers: Answers, id?: string, revision?: number) {
  const errors = validateAnswers(answers, false);
  if (Object.keys(errors).length) throw new WorkflowError("Form validation failed.", "invalid");
  answersSchema.parse(answers);
  if (!canEdit(user, user.group_id)) throw new WorkflowError("You do not have editing permission.", "forbidden");
  if (!id) throw new WorkflowError("Submit consent before creating an Intake draft.", "invalid");
  if (id && (!z.uuid().safeParse(id).success || !Number.isInteger(revision) || !revision || revision < 1)) {
    throw new WorkflowError("Invalid record identifier or revision.", "invalid");
  }
  return transaction(async (client) => {
    const program = text(answers, "programType") || null;
    const contact = text(answers, "contactDate") || null;
    const navigator = text(answers, "navigator");
    if (id) {
      const old = await editable(client, user, id, revision!);
      if (old.status === "archived") throw new WorkflowError("Restore the archived record before editing.", "invalid");
      const dob = await requireConsent(client, id);
      const preservedAnswers = { ...answers };
      for (const key of consentMovedKeys) {
        delete preservedAnswers[key];
        if (old.answers[key] !== undefined) preservedAnswers[key] = old.answers[key];
      }
      if (Object.keys(validateAnswers(preservedAnswers, false, undefined, dob)).length) throw new WorkflowError("Form validation failed; check dates against the consent date of birth.", "invalid");
      answers = preservedAnswers;
      const fields = Object.keys(answers).filter((key) => JSON.stringify(old.answers[key] ?? "") !== JSON.stringify(answers[key]));
      const status = "draft";
      if (old.status !== status) fields.push("status");
      if (old.review_state !== "draft") fields.push("review_state");
      await client.query(
        `UPDATE submissions SET answers=$1,program_type=$2,contact_date=$3,
         navigator_name=$4,status=$5,review_state='draft',review_requested_by=NULL,review_requested_at=NULL,
         return_reason=NULL,revision=revision+1,updated_by=$6,updated_at=now() WHERE id=$7`,
        [JSON.stringify(answers), program, contact, navigator, status, user.id, id],
      );
      await audit(client, user, "save_draft", id, fields, old.revision + 1);
      await snapshot(client, id, user.id);
      await client.query("INSERT INTO draft_contributors(submission_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [id, user.id]);
      return id;
    }
    throw new WorkflowError("Submit consent before creating an Intake draft.", "invalid");
  });
}
export async function changeArchive(user: User, id: string, revision: number, restore: boolean) {
  checkIdentifier(id, revision);
  await transaction(async (client) => {
    const row = await editable(client, user, id, revision);
    if (restore ? row.status !== "archived" : row.status !== "submitted") {
      throw new WorkflowError(restore ? "Only archived submissions can be restored." : "Only submitted forms can be archived.", "invalid");
    }
    await client.query("UPDATE submissions SET status=$1,archived_at=CASE WHEN $2 THEN NULL ELSE now() END,revision=revision+1,updated_by=$3,updated_at=now() WHERE id=$4",
      [restore ? "submitted" : "archived", restore, user.id, id]);
    await audit(client, user, restore ? "restore" : "archive", id, ["status"], row.revision + 1);
    await snapshot(client, id, user.id);
  });
}
export async function requestReview(user: User, id: string, revision: number) {
      checkIdentifier(id, revision);
      await transaction(async (client) => {
        const row = await editable(client, user, id, revision);
        if (row.status === "archived" || !["draft", "returned"].includes(row.review_state)) {
          throw new WorkflowError("Only a draft or returned referral can be sent for review.", "invalid");
        }
        const dob = await requireConsent(client, id);
        await ensureNoPlaceholders(client, id);
        const parsed = answersSchema.safeParse(row.answers);
        if (!parsed.success || Object.keys(validateAnswers(row.answers, true, undefined, dob)).length || getIntakeCompleteness(row.answers).totalMissing) {
          throw new WorkflowError("Answer every applicable question and correct validation errors before requesting review.", "invalid");
        }
        await client.query(
          `UPDATE submissions SET review_state='pending_review',review_requested_by=$2,review_requested_at=now(),
           return_reason=NULL,revision=revision+1,updated_at=now() WHERE id=$1`,
          [id, user.id],
        );
        await snapshot(client, id, user.id);
        await audit(client, user, "request_review", id, ["review_state"], row.revision + 1);
      });
    }
export async function decideReview(user: User, id: string, revision: number, decision: "approve" | "return", reason = "") {
      checkIdentifier(id, revision);
      const cleanReason = reason.trim();
      if (decision !== "approve" && decision !== "return") throw new WorkflowError("Invalid review decision.", "invalid");
      if (decision === "return" && (!cleanReason || cleanReason.length > 2000)) throw new WorkflowError("Enter a return reason of up to 2,000 characters.", "invalid");
      if (decision === "approve" && cleanReason) throw new WorkflowError("A return reason is only allowed when returning a draft.", "invalid");
      await transaction(async (client) => {
        const row = await lockedSubmission(client, user, id, revision);
        if (!canReview(user, row.group_id)) throw new WorkflowError("You do not have review permission.", "forbidden");
        if (row.removed_at) throw new WorkflowError("Restore the removed draft before review.", "invalid");
        if (row.status === "archived" || row.review_state !== "pending_review" || !row.review_requested_by || !row.review_requested_at) {
          throw new WorkflowError("This referral is not awaiting review.", "invalid");
        }
        const dob = await requireConsent(client, id);
        const contributors = await client.query<{ user_id: string }>(
          "SELECT user_id FROM draft_contributors WHERE submission_id=$1 ORDER BY user_id", [id],
        );
        if (contributors.rows.some((entry) => entry.user_id === user.id) || row.review_requested_by === user.id) {
          throw new WorkflowError("A different reviewer must review changes they did not edit or submit.", "forbidden");
        }
        if (decision === "approve") {
          await ensureNoPlaceholders(client, id);
          if (!answersSchema.safeParse(row.answers).success || Object.keys(validateAnswers(row.answers, true, undefined, dob)).length || getIntakeCompleteness(row.answers).totalMissing) {
            throw new WorkflowError("The referral has missing or invalid answers and cannot be approved.", "invalid");
          }
          await client.query(
            `INSERT INTO approved_intake_versions(submission_id,version,draft_revision,answers,template_version,editor_ids,requested_by,requested_at,approved_by)
             VALUES ($1,(SELECT COALESCE(MAX(version),0)+1 FROM approved_intake_versions WHERE submission_id=$1),$2,$3,$4,$5,$6,$7,$8)`,
            [id, row.revision, JSON.stringify(row.answers), row.template_version, contributors.rows.map((r) => r.user_id), row.review_requested_by, row.review_requested_at, user.id],
          );
          await client.query("DELETE FROM draft_contributors WHERE submission_id=$1", [id]);
        }
        await client.query(
          "INSERT INTO review_decisions(submission_id,draft_revision,reviewer_id,decision,reason) VALUES ($1,$2,$3,$4,$5)",
          [id, row.revision, user.id, decision === "approve" ? "approved" : "returned", decision === "return" ? cleanReason : null],
        );
        await client.query(
          `UPDATE submissions SET status=$2,review_state=$3,return_reason=$4,revision=revision+1,updated_at=now() WHERE id=$1`,
          [id, decision === "approve" ? "submitted" : "draft", decision === "approve" ? "approved" : "returned", decision === "return" ? cleanReason : null],
        );
        await snapshot(client, id, user.id);
        await audit(client, user, decision === "approve" ? "approve_review" : "return_review", id, ["review_state"], row.revision + 1);
      });
    }
export async function getSubmission(user: User, id: string): Promise<Submission | null> {
  if (!z.uuid().safeParse(id).success) return null;
  return transaction(async (client) => {
    const result = await client.query<Submission>(`SELECT ${selectColumns} FROM submissions s WHERE s.id=$1 AND ($2 OR (s.group_id=$3 AND s.removed_at IS NULL))`, [id, user.role === "admin", user.group_id]);
    if (!result.rows[0]) return null;
    await audit(client, user, "view", id);
    return result.rows[0];
  });
}
export async function listSubmissions(user: User, input: Search) {
  const search = searchSchema.parse(input);
  const values: (string | boolean | number)[] = [user.role === "admin", user.group_id];
  const clauses = ["($1 OR s.group_id=$2)"];
  const add = (clause: string, value: string) => { values.push(value); clauses.push(clause.replaceAll("?", `$${values.length}`)); };
  const escaped = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;
  if (search.q) {
    values.push(user.id);
    add(`(s.enrollment_id::text ILIKE ? OR
    (EXISTS (SELECT 1 FROM consent_versions c WHERE c.submission_id=s.id) AND
      (SELECT e.participant_id::text FROM enrollments e WHERE e.id=s.enrollment_id) ILIKE ?) OR
    (($1 OR (SELECT owner.created_by FROM consent_versions owner WHERE owner.submission_id=s.id ORDER BY owner.version LIMIT 1)=$3)
      AND EXISTS (SELECT 1 FROM consent_versions c WHERE c.submission_id=s.id AND c.version=(SELECT max(v.version) FROM consent_versions v WHERE v.submission_id=s.id)
        AND concat_ws(' ',c.first_name,NULLIF(c.middle_name,''),c.last_name) ILIKE ?)))`, escaped(search.q));
  }
  if (search.status === "removed") {
    if (user.role !== "admin") throw new WorkflowError("Only administrators can list removed imports.", "forbidden");
    clauses.push("s.removed_at IS NOT NULL");
  } else clauses.push("s.removed_at IS NULL");
  if (search.status === "active") clauses.push("s.status<>'archived'");
  else if (search.status === "pending_review") clauses.push(`s.status<>'archived' AND (
    s.review_state='pending_review' OR (
      s.review_state='approved' AND EXISTS (SELECT 1 FROM consent_versions c WHERE c.submission_id=s.id)
      AND EXISTS (SELECT 1 FROM screening_service_records r WHERE r.submission_id=s.id AND (
        r.review_state='pending_review' OR (r.review_state='approved' AND EXISTS (
          SELECT 1 FROM program_completion_records p WHERE p.submission_id=s.id AND p.review_state='pending_review'
        ))
      ))
    ))`);
  else if (["returned", "approved"].includes(search.status)) add("(s.status<>'archived' AND s.review_state=?)", search.status);
  else if (search.status === "draft") clauses.push("s.status='draft' AND s.review_state='draft'");
  else if (search.status !== "all" && search.status !== "removed") add("s.status=?", search.status);
  if (search.program) add("s.program_type=?", search.program);
  if (search.navigator) add("s.navigator_name ILIKE ?", escaped(search.navigator));
  if (search.from) add("s.created_at >= ?::date", search.from);
  if (search.to) add("s.created_at < ?::date + interval '1 day'", search.to);
  const where = clauses.join(" AND ");
  // Both query fragments come only from validated allowlists, never raw request values.
  const order = `${sortColumns[search.sort]} ${search.direction === "asc" ? "ASC" : "DESC"} NULLS LAST, s.id ASC`;
  return transaction(async (client) => {
    const count = await client.query<{ count: string }>(`SELECT count(*) FROM submissions s WHERE ${where}`, values);
    const total = Number(count.rows[0].count);
    const records = await client.query<ListedSubmission>(
      `SELECT ${selectColumns},
        r.review_state AS screening_review_state, p.review_state AS completion_review_state,
        GREATEST(s.updated_at, r.updated_at, p.updated_at) AS phase_updated_at
       FROM submissions s LEFT JOIN screening_service_records r ON r.submission_id=s.id
       LEFT JOIN program_completion_records p ON p.submission_id=s.id
       WHERE ${where} ORDER BY ${order} LIMIT 20 OFFSET $${values.length + 1}`,
      [...values, (search.page - 1) * 20],
    );
    await audit(client, user, "search", null);
    return { records: records.rows, total };
  });
}
export async function getAudit(user: User, id: string): Promise<AuditEvent[]> {
  const result = await database().query<AuditEvent>(
    `SELECT a.id,a.action,a.occurred_at,a.changed_fields,a.revision,u.display_name
     FROM audit_events a JOIN app_users u ON u.id=a.actor_id JOIN submissions s ON s.id=a.submission_id
     WHERE s.id=$1 AND ($2 OR (s.group_id=$3 AND s.removed_at IS NULL)) ORDER BY a.occurred_at DESC,a.id DESC LIMIT 100`,
    [id, user.role === "admin", user.group_id],
  );
  return result.rows;
}
export async function getRevisions(user: User, id: string): Promise<FormRevision[]> {
  const result = await database().query<FormRevision>(
    `SELECT r.revision,r.answers,r.status,r.recorded_at,u.display_name
     FROM form_revisions r JOIN app_users u ON u.id=r.actor_id JOIN submissions s ON s.id=r.submission_id
     WHERE s.id=$1 AND ($2 OR (s.group_id=$3 AND s.removed_at IS NULL)) ORDER BY r.revision DESC LIMIT 20`,
    [id, user.role === "admin", user.group_id],
  );
  return result.rows;
}
export async function getApprovedVersions(user: User, id: string): Promise<ApprovedVersion[]> {
  const result = await database().query<ApprovedVersion>(
    `SELECT v.*,u.display_name AS reviewer_name FROM approved_intake_versions v
     JOIN submissions s ON s.id=v.submission_id JOIN app_users u ON u.id=v.approved_by
     WHERE s.id=$1 AND ($2 OR (s.group_id=$3 AND s.removed_at IS NULL)) ORDER BY v.version DESC`,
    [id, user.role === "admin", user.group_id],
  );
  return result.rows;
}
export async function getReviewDecisions(user: User, id: string): Promise<ReviewDecision[]> {
  const result = await database().query<ReviewDecision>(
    `SELECT d.id,d.draft_revision,d.decision,d.reason,d.decided_at,u.display_name AS reviewer_name
     FROM review_decisions d JOIN submissions s ON s.id=d.submission_id JOIN app_users u ON u.id=d.reviewer_id
     WHERE s.id=$1 AND ($2 OR (s.group_id=$3 AND s.removed_at IS NULL)) ORDER BY d.id DESC LIMIT 100`,
    [id, user.role === "admin", user.group_id],
  );
  return result.rows;
}
export async function isDraftContributor(user: User, id: string): Promise<boolean> {
  const result = await database().query(
    `SELECT 1 FROM draft_contributors c JOIN submissions s ON s.id=c.submission_id
     WHERE s.id=$1 AND c.user_id=$2 AND ($3 OR (s.group_id=$4 AND s.removed_at IS NULL))`,
    [id, user.id, user.role === "admin", user.group_id],
  );
  return !!result.rowCount;
}
