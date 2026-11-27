import type { PoolClient } from "pg";
import { z } from "zod";
import { WorkflowError, type User } from "./access";
import { database, transaction } from "./db";
import type { ReviewPhase } from "./review-notifications";

export type ActivityKind = "note" | "review_approved" | "review_returned";
const validId = (id: string) => /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= BigInt("9223372036854775807");

export async function createNoteNotifications(client: PoolClient, submissionId: string, noteId: string, authorId: string) {
  await client.query(`INSERT INTO activity_notifications(submission_id,recipient_id,kind,note_id)
    SELECT s.id,u.id,'note',$2 FROM submissions s JOIN app_users u ON u.group_id=s.group_id
    LEFT JOIN notification_preferences p ON p.user_id=u.id
    WHERE s.id=$1 AND u.active AND u.role='editor' AND u.id<>$3 AND COALESCE(p.note_alerts,true)`,
  [submissionId, noteId, authorId]);
}

export async function createDecisionNotification(client: PoolClient, submissionId: string, recipientId: string, phase: ReviewPhase, decision: "approve" | "return") {
  await client.query(`INSERT INTO activity_notifications(submission_id,recipient_id,kind,phase)
    SELECT s.id,u.id,$3,$4 FROM submissions s JOIN app_users u ON u.id=$2
    WHERE s.id=$1 AND u.active AND (u.role='admin' OR (u.role='editor' AND u.group_id=s.group_id))`,
  [submissionId, recipientId, decision === "approve" ? "review_approved" : "review_returned", phase]);
}

export async function noteAlertsEnabled(user: User) {
  if (user.role !== "editor") return false;
  const result = await database().query<{ enabled: boolean }>(
    "SELECT COALESCE((SELECT note_alerts FROM notification_preferences WHERE user_id=$1),true) AS enabled", [user.id]);
  return result.rows[0].enabled;
}

export async function setNoteAlerts(user: User, enabled: boolean) {
  if (user.role !== "editor" || typeof enabled !== "boolean") throw new WorkflowError("Invalid notification preference.", "invalid");
  await transaction(async (client) => {
    await client.query(`INSERT INTO notification_preferences(user_id,note_alerts) VALUES ($1,$2)
      ON CONFLICT (user_id) DO UPDATE SET note_alerts=EXCLUDED.note_alerts`, [user.id, enabled]);
    await client.query("INSERT INTO audit_events(actor_id,action,changed_fields) VALUES ($1,'notification_preference_change',ARRAY['note_alerts'])", [user.id]);
  });
}

export async function listActivityNotifications(user: User) {
  if (user.role !== "editor" && user.role !== "admin") return [];
  const result = await database().query<{ id: string; submission_id: string; kind: ActivityKind; phase: ReviewPhase | null; created_at: Date }>(
    `SELECT n.id,n.submission_id,n.kind,n.phase,n.created_at FROM activity_notifications n
     JOIN submissions s ON s.id=n.submission_id
     WHERE n.recipient_id=$1 AND n.read_at IS NULL AND s.removed_at IS NULL AND s.status<>'archived'
       AND ($2 OR s.group_id=$3) ORDER BY n.created_at DESC,n.id DESC`,
    [user.id, user.role === "admin", user.group_id]);
  return result.rows;
}

const inactivityCandidates = `
  SELECT s.id, GREATEST(s.updated_at,
    COALESCE(sr.updated_at,s.updated_at), COALESCE(pr.updated_at,s.updated_at),
    COALESCE((SELECT MAX(n.created_at) FROM referral_notes n WHERE n.submission_id=s.id),s.updated_at),
    COALESCE((SELECT MAX(p.published_at) FROM case_file_publications p WHERE p.submission_id=s.id),s.updated_at)
  ) AS activity_at
  FROM submissions s
  LEFT JOIN screening_service_records sr ON sr.submission_id=s.id
  LEFT JOIN program_completion_records pr ON pr.submission_id=s.id
  WHERE s.removed_at IS NULL AND s.status<>'archived' AND COALESCE(pr.review_state,'')<>'approved'
    AND ($2 OR s.group_id=$3)`;

export async function listInactivityNotifications(user: User) {
  if (user.role !== "editor" && user.role !== "admin") return [];
  const result = await database().query<{ id: string; submission_id: string; created_at: Date }>(
    `WITH candidates AS (${inactivityCandidates})
     SELECT c.id,c.id AS submission_id,c.activity_at + interval '30 days' AS created_at
     FROM candidates c LEFT JOIN inactivity_notification_dismissals d ON d.submission_id=c.id AND d.recipient_id=$1
     WHERE c.activity_at <= now() - interval '30 days' AND d.activity_at IS DISTINCT FROM c.activity_at`,
    [user.id, user.role === "admin", user.group_id]);
  return result.rows;
}

export async function clearActivityNotification(user: User, kind: "activity" | "inactive", id: string, action: "read" | "dismiss", referralId?: string) {
  if ((user.role !== "editor" && user.role !== "admin") ||
    (kind === "activity" ? !validId(id) : kind === "inactive" ? !z.uuid().safeParse(id).success : true) ||
    (action !== "read" && action !== "dismiss") ||
    (action === "read" && (!z.uuid().safeParse(referralId).success || (kind === "inactive" && referralId !== id)))) {
    throw new WorkflowError("Invalid notification.", "invalid");
  }
  return transaction(async (client) => {
    const result = kind === "activity"
      ? await client.query<{ submission_id: string }>(
        `UPDATE activity_notifications n SET read_at=now() FROM submissions s
         WHERE n.id=$1 AND n.recipient_id=$2 AND n.read_at IS NULL AND s.id=n.submission_id
           AND s.removed_at IS NULL AND s.status<>'archived' AND ($3 OR s.group_id=$4)
           AND ($5::uuid IS NULL OR n.submission_id=$5::uuid) RETURNING n.submission_id`,
        [id, user.id, user.role === "admin", user.group_id, action === "read" ? referralId : null])
      : await client.query<{ submission_id: string }>(
        `WITH candidates AS (${inactivityCandidates})
         INSERT INTO inactivity_notification_dismissals(recipient_id,submission_id,activity_at)
         SELECT $1,c.id,c.activity_at FROM candidates c
         WHERE c.id=$4::uuid AND c.activity_at <= now() - interval '30 days'
         ON CONFLICT (recipient_id,submission_id) DO UPDATE SET activity_at=EXCLUDED.activity_at,dismissed_at=now()
           WHERE inactivity_notification_dismissals.activity_at IS DISTINCT FROM EXCLUDED.activity_at
         RETURNING submission_id`, [user.id, user.role === "admin", user.group_id, id]);
    if (result.rowCount) await client.query(
      "INSERT INTO audit_events(actor_id,action,submission_id,changed_fields) VALUES ($1,$2,$3,$4)",
      [user.id, action === "dismiss" ? "notification_dismiss" : "notification_read", result.rows[0].submission_id, [kind]]);
    return !!result.rowCount;
  });
}
