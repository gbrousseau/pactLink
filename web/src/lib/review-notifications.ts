import type { PoolClient } from "pg";
import { z } from "zod";
import { WorkflowError, type User } from "./access";
import { database, transaction } from "./db";

export const reviewPhaseSchema = z.enum(["intake", "screening", "completion"]);
export type ReviewPhase = z.infer<typeof reviewPhaseSchema>;

const pendingReview = `
  s.removed_at IS NULL AND s.status<>'archived'
  AND EXISTS (SELECT 1 FROM consent_versions c WHERE c.submission_id=s.id)
  AND (
    (n.phase='intake' AND s.review_state='pending_review' AND s.review_requested_at=n.requested_at)
    OR (n.phase='screening' AND s.review_state='approved' AND EXISTS (
      SELECT 1 FROM screening_service_records r WHERE r.submission_id=s.id
        AND r.review_state='pending_review' AND r.review_requested_at=n.requested_at))
    OR (n.phase='completion' AND s.review_state='approved'
      AND EXISTS (SELECT 1 FROM screening_service_records r WHERE r.submission_id=s.id AND r.review_state='approved')
      AND EXISTS (SELECT 1 FROM program_completion_records r WHERE r.submission_id=s.id
        AND r.review_state='pending_review' AND r.review_requested_at=n.requested_at))
  )`;

export async function createReviewNotifications(client: PoolClient, id: string, phase: ReviewPhase, revision: number) {
  await client.query(`INSERT INTO review_notifications(submission_id,phase,revision,recipient_id,requested_at)
    SELECT s.id,$2,$3,u.id,CASE $2
      WHEN 'intake' THEN s.review_requested_at
      WHEN 'screening' THEN (SELECT r.review_requested_at FROM screening_service_records r WHERE r.submission_id=s.id)
      WHEN 'completion' THEN (SELECT r.review_requested_at FROM program_completion_records r WHERE r.submission_id=s.id)
    END FROM submissions s JOIN app_users u
      ON u.active AND (u.role='admin' OR (u.role='reviewer' AND u.group_id=s.group_id))
    WHERE s.id=$1`, [id, phase, revision]);
}

export async function listReviewNotifications(user: User, id?: string, phase?: ReviewPhase) {
  if (user.role !== "reviewer" && user.role !== "admin") return [];
  const result = await database().query<{ id: string; submission_id: string; phase: ReviewPhase; revision: number; created_at: Date }>(
    `SELECT n.id,n.submission_id,n.phase,n.revision,n.created_at FROM review_notifications n
     JOIN submissions s ON s.id=n.submission_id
     WHERE n.recipient_id=$1 AND n.read_at IS NULL AND ($2 OR s.group_id=$3)
       AND ($4::uuid IS NULL OR n.submission_id=$4::uuid) AND ($5::text IS NULL OR n.phase=$5) AND ${pendingReview}
     ORDER BY n.created_at DESC,n.id DESC`, [user.id, user.role === "admin", user.group_id, id ?? null, phase ?? null],
  );
  return result.rows;
}

export async function markReviewNotificationsRead(user: User, noticeId: string, action: "read" | "dismiss" = "read") {
  if ((user.role !== "reviewer" && user.role !== "admin") || typeof noticeId !== "string" ||
    !/^[1-9]\d{0,18}$/.test(noticeId) || BigInt(noticeId) > BigInt("9223372036854775807") ||
    (action !== "read" && action !== "dismiss")) {
    throw new WorkflowError("Invalid review notification.", "invalid");
  }
  return transaction(async (client) => {
    const result = await client.query<{ submission_id: string; phase: ReviewPhase; revision: number }>(
      `UPDATE review_notifications n SET read_at=now() FROM submissions s
      WHERE n.id=$1 AND n.recipient_id=$2 AND n.read_at IS NULL
      AND s.id=n.submission_id AND ($3 OR s.group_id=$4) AND ${pendingReview}
      RETURNING n.submission_id,n.phase,n.revision`,
    [noticeId, user.id, user.role === "admin", user.group_id]);
    if (result.rowCount) await client.query(
      "INSERT INTO audit_events(actor_id,action,submission_id,changed_fields,revision) VALUES ($1,$2,$3,$4,$5)",
      [user.id, action === "dismiss" ? "notification_dismiss" : "review_notification_read", result.rows[0].submission_id, [result.rows[0].phase, "notification"], result.rows[0].revision],
    );
    return !!result.rowCount;
  });
}
