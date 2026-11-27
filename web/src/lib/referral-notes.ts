import { z } from "zod";
import { canEdit, canReview, WorkflowError, type User } from "./access";
import { transaction } from "./db";
import { createNoteNotifications } from "./activity-notifications";

const pageSize = 20;
export const maxNoteLength = 30000;
const noteSchema = z.string().trim().min(1).max(maxNoteLength).refine((value) => !value.includes("\0"));
const cursorSchema = z.string().refine((value) => /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= BigInt("9223372036854775807"));
export const isValidNotesCursor = (value: string) => cursorSchema.safeParse(value).success;

export type ReferralNote = { id: string; content: string; author: string; created_at: Date };
export type DisplayReferralNote = Omit<ReferralNote, "created_at"> & { created_at: string };
export type AdminReferralNote = ReferralNote & { submission_id: string; participant_id: string | null; group_name: string };

export function canWriteNotes(user: User, groupId: string) {
  return canEdit(user, groupId) || canReview(user, groupId);
}

export async function addReferralNote(user: User, id: string, content: unknown): Promise<ReferralNote> {
  const parsed = noteSchema.safeParse(content);
  if (!z.uuid().safeParse(id).success || !parsed.success) {
    throw new WorkflowError(`Enter a note of 1 to ${maxNoteLength.toLocaleString("en-US")} characters.`, "invalid");
  }
  return transaction(async (client) => {
    const result = await client.query<{ group_id: string; status: string; removed_at: Date | null }>(
      "SELECT group_id,status,removed_at FROM submissions WHERE id=$1 AND ($2 OR (group_id=$3 AND removed_at IS NULL)) FOR UPDATE",
      [id, user.role === "admin", user.group_id],
    );
    const referral = result.rows[0];
    if (!referral) throw new WorkflowError("Referral not found or not available to your group.", "missing");
    if (!canWriteNotes(user, referral.group_id)) throw new WorkflowError("Your account cannot add notes.", "forbidden");
    if (referral.removed_at || referral.status === "archived") {
      throw new WorkflowError("Restore the referral before adding notes.", "invalid");
    }
    const saved = await client.query<{ id: string; content: string; created_at: Date }>(
      "INSERT INTO referral_notes(submission_id,author_id,content) VALUES ($1,$2,$3) RETURNING id,content,created_at",
      [id, user.id, parsed.data],
    );
    await client.query("INSERT INTO audit_events(actor_id,action,submission_id,changed_fields) VALUES ($1,'add_referral_note',$2,ARRAY['notes'])", [user.id, id]);
    await createNoteNotifications(client, id, saved.rows[0].id, user.id);
    return { ...saved.rows[0], author: user.display_name };
  });
}

export async function listReferralNotes(user: User, id: string, before?: string) {
  if (!z.uuid().safeParse(id).success || (before !== undefined && !cursorSchema.safeParse(before).success)) {
    throw new WorkflowError("Invalid referral or notes page.", "invalid");
  }
  return transaction(async (client) => {
    const referral = await client.query(
      "SELECT id FROM submissions WHERE id=$1 AND ($2 OR (group_id=$3 AND removed_at IS NULL)) FOR SHARE",
      [id, user.role === "admin", user.group_id],
    );
    if (!referral.rowCount) throw new WorkflowError("Referral not found or not available to your group.", "missing");
    const result = await client.query<ReferralNote>(
      `SELECT n.id,n.content,n.created_at,u.display_name AS author FROM referral_notes n
       JOIN app_users u ON u.id=n.author_id WHERE n.submission_id=$1 AND ($2::bigint IS NULL OR n.id<$2::bigint)
       ORDER BY n.id DESC LIMIT $3`, [id, before ?? null, pageSize + 1],
    );
    await client.query("INSERT INTO audit_events(actor_id,action,submission_id) VALUES ($1,'view_referral_notes',$2)", [user.id, id]);
    return { notes: result.rows.slice(0, pageSize), hasMore: result.rows.length > pageSize };
  });
}

export async function listAllReferralNotes(user: User, before?: string) {
  if (user.role !== "admin") throw new WorkflowError("Only administrators can view all referral notes.", "forbidden");
  if (before !== undefined && !cursorSchema.safeParse(before).success) throw new WorkflowError("Invalid notes page.", "invalid");
  return transaction(async (client) => {
    const result = await client.query<AdminReferralNote>(
      `SELECT n.id,n.content,n.created_at,u.display_name AS author,n.submission_id,g.name AS group_name,
       CASE WHEN EXISTS (SELECT 1 FROM consent_versions c WHERE c.submission_id=s.id) THEN e.participant_id END AS participant_id
       FROM referral_notes n JOIN app_users u ON u.id=n.author_id
       JOIN submissions s ON s.id=n.submission_id JOIN enrollments e ON e.id=s.enrollment_id
       JOIN app_groups g ON g.id=s.group_id WHERE ($1::bigint IS NULL OR n.id<$1::bigint)
       ORDER BY n.id DESC LIMIT $2`, [before ?? null, pageSize + 1],
    );
    await client.query("INSERT INTO audit_events(actor_id,action) VALUES ($1,'view_all_referral_notes')", [user.id]);
    return { notes: result.rows.slice(0, pageSize), hasMore: result.rows.length > pageSize };
  });
}
