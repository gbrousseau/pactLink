import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { WorkflowError, type User } from "./access";
import { database, transaction } from "./db";

type BatchRow = {
  id: string; row_number: number; revision: number; participant_name: string;
  status: string; review_state: string; legal_hold: boolean; removed_at: Date | null;
};
export type BatchPreview = { rows: BatchRow[]; token: string };
const adminOnly = (user: User) => {
  if (user.role !== "admin") throw new WorkflowError("Only administrators can manage imported records.", "forbidden");
};
function reasonText(reason: string) {
  const parsed = z.string().trim().min(1).max(2000).safeParse(reason);
  if (!parsed.success) throw new WorkflowError("Enter a reason of up to 2,000 characters.", "invalid");
  return parsed.data;
}
export async function lockImportHash(client: PoolClient, hash: string) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [hash]);
}
export function eligibleForBatchUndo(row: BatchRow) {
  return !row.removed_at && row.revision === 1 && row.status === "draft" && row.review_state === "draft" && !row.legal_hold;
}
function preview(rows: BatchRow[]): BatchPreview {
  const token = createHash("sha256").update(JSON.stringify(rows.map((r) =>
    [r.id, r.revision, r.status, r.review_state, r.legal_hold, !!r.removed_at],
  ))).digest("hex");
  return { rows, token };
}
async function batchRows(client: PoolClient, batch: string, lock: boolean) {
  return (await client.query<BatchRow>(
    `SELECT s.id,i.row_number,s.revision,s.participant_name,s.status,s.review_state,s.legal_hold,s.removed_at
     FROM intake_import_sources i JOIN submissions s ON s.id=i.submission_id
     WHERE i.batch_id=$1 ORDER BY i.row_number ${lock ? "FOR UPDATE OF s" : ""}`, [batch],
  )).rows;
}
async function batchHash(client: PoolClient, batch: string) {
  if (!z.uuid().safeParse(batch).success) throw new WorkflowError("Invalid batch identifier.", "invalid");
  const result = await client.query<{ file_hash: string }>("SELECT file_hash FROM intake_import_batches WHERE id=$1", [batch]);
  if (!result.rows[0]) throw new WorkflowError("Import batch not found.", "missing");
  return result.rows[0].file_hash;
}
export async function listImportBatches(user: User) {
  adminOnly(user);
  return (await database().query<{
    id: string; group_name: string; display_name: string; created_at: Date; imported_count: number;
    skipped_count: number; active_count: string; removed_count: string;
  }>(`SELECT b.id,g.name AS group_name,u.display_name,b.created_at,b.imported_count,b.skipped_count,
      count(*) FILTER (WHERE s.removed_at IS NULL) AS active_count,
      count(*) FILTER (WHERE s.removed_at IS NOT NULL) AS removed_count
      FROM intake_import_batches b JOIN app_groups g ON g.id=b.group_id JOIN app_users u ON u.id=b.actor_id
      JOIN intake_import_sources i ON i.batch_id=b.id JOIN submissions s ON s.id=i.submission_id
      GROUP BY b.id,g.name,u.display_name ORDER BY b.created_at DESC`)).rows;
}
export async function getBatchPreview(user: User, batch: string) {
  adminOnly(user);
  return transaction(async (client) => {
    await batchHash(client, batch);
    return preview(await batchRows(client, batch, false));
  });
}
export async function importHashState(user: User, hash: string) {
  adminOnly(user);
  const result = await database().query<{ batches: string; active: string }>(
    `SELECT count(DISTINCT b.id) AS batches, count(s.id) FILTER (WHERE s.removed_at IS NULL) AS active
     FROM intake_import_batches b JOIN intake_import_sources i ON i.batch_id=b.id
     JOIN submissions s ON s.id=i.submission_id WHERE b.file_hash=$1`, [hash],
  );
  return { batches: Number(result.rows[0].batches), active: Number(result.rows[0].active) };
}
async function recordRemoval(client: PoolClient, user: User, id: string, batch: string, revision: number,
  action: "batch_undo" | "duplicate" | "restore", reason: string, duplicateOf: string | null = null) {
  await client.query(
    `UPDATE submissions SET removed_at=CASE WHEN $2='restore' THEN NULL ELSE now() END,
     revision=revision+1,updated_by=$3,updated_at=now() WHERE id=$1`, [id, action, user.id],
  );
  await client.query(`INSERT INTO form_revisions(submission_id,revision,answers,status,actor_id)
    SELECT id,revision,answers,status,$2 FROM submissions WHERE id=$1`, [id, user.id]);
  await client.query(`INSERT INTO intake_removal_events(submission_id,batch_id,actor_id,action,reason,duplicate_of,revision)
    VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, batch, user.id, action, reason, duplicateOf, revision + 1]);
  await client.query(`INSERT INTO audit_events(actor_id,action,submission_id,changed_fields,revision)
    VALUES ($1,$2,$3,ARRAY['removed_at'],$4)`, [user.id, action === "restore" ? "restore_import" : `import_${action}`, id, revision + 1]);
}
export async function undoImportBatch(user: User, batch: string, token: string, reason: string) {
  adminOnly(user);
  const cleanReason = reasonText(reason);
  return transaction(async (client) => {
    const hash = await batchHash(client, batch);
    await lockImportHash(client, hash);
    const rows = await batchRows(client, batch, true);
    if (preview(rows).token !== token) throw new WorkflowError("The batch changed since preview. Reload it before confirming.", "conflict");
    const eligible = rows.filter(eligibleForBatchUndo);
    if (!eligible.length) throw new WorkflowError("There are no eligible untouched drafts to remove.", "invalid");
    for (const row of eligible) await recordRemoval(client, user, row.id, batch, row.revision, "batch_undo", cleanReason);
    return eligible.length;
  });
}
export async function changeImportedRemoval(user: User, id: string, revision: number, action: "duplicate" | "restore", reason: string, target?: string) {
  adminOnly(user);
  if (!z.uuid().safeParse(id).success || !Number.isInteger(revision) || revision < 1 ||
      (action === "duplicate" && (!target || !z.uuid().safeParse(target).success || target === id))) {
    throw new WorkflowError("Provide a valid record, revision, and different existing intake identifier.", "invalid");
  }
  const cleanReason = reasonText(reason);
  return transaction(async (client) => {
    const source = await client.query<{ batch_id: string; file_hash: string }>(
      `SELECT i.batch_id,b.file_hash FROM intake_import_sources i JOIN intake_import_batches b ON b.id=i.batch_id WHERE i.submission_id=$1`, [id],
    );
    if (!source.rows[0]) throw new WorkflowError("Imported record not found.", "missing");
    const { batch_id: batch, file_hash: hash } = source.rows[0];
    await lockImportHash(client, hash);
    const records = await client.query<BatchRow>(
      `SELECT id,revision,status,review_state,legal_hold,removed_at FROM submissions WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
      [action === "duplicate" ? [id, target] : [id]],
    );
    const row = records.rows.find((entry) => entry.id === id);
    if (!row || row.revision !== revision) throw new WorkflowError("The record changed. Reload before continuing.", "conflict");
    if (action === "duplicate") {
      const other = records.rows.find((entry) => entry.id === target);
      if (!other || other.removed_at || other.status === "archived") throw new WorkflowError("The existing intake must be active and available.", "invalid");
      const approved = await client.query("SELECT 1 FROM approved_intake_versions WHERE submission_id=$1 LIMIT 1", [id]);
      if (row.removed_at || row.legal_hold || row.status !== "draft" || !["draft", "returned"].includes(row.review_state) || approved.rowCount) {
        throw new WorkflowError("Only unapproved imported drafts without a legal hold can be marked as duplicates.", "invalid");
      }
    } else {
      if (!row.removed_at) throw new WorkflowError("This intake is not removed.", "invalid");
      const activeOther = await client.query(
        `SELECT 1 FROM intake_import_batches b JOIN intake_import_sources i ON i.batch_id=b.id
         JOIN submissions s ON s.id=i.submission_id
         WHERE b.file_hash=$1 AND b.id<>$2 AND s.removed_at IS NULL LIMIT 1`, [hash, batch],
      );
      if (activeOther.rowCount) throw new WorkflowError("A re-import of this file has active records. Remove those records before restoring this draft.", "conflict");
    }
    await recordRemoval(client, user, id, batch, revision, action, cleanReason, action === "duplicate" ? target! : null);
  });
}
export async function getRemovalHistory(user: User, id: string) {
  adminOnly(user);
  return (await database().query<{
    id: string; action: string; reason: string; duplicate_of: string | null; occurred_at: Date; display_name: string;
  }>(`SELECT e.id,e.action,e.reason,e.duplicate_of,e.occurred_at,u.display_name
    FROM intake_removal_events e JOIN app_users u ON u.id=e.actor_id WHERE e.submission_id=$1 ORDER BY e.id DESC`, [id])).rows;
}
