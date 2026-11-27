import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { canEdit, canView, WorkflowError, type User } from "./access";
import { database, transaction } from "./db";
import { createDraft } from "./submissions";
import { renderCaseFilePdf } from "./case-file-pdf";

const optionalDate = z.union([z.literal(""), z.iso.date()]).refine(
  (value) => !value || value <= new Date().toISOString().slice(0, 10), "Dates cannot be in the future.",
);
export const caseFileSchema = z.object({
  firstName: z.string().trim().max(100),
  middleName: z.string().trim().max(100),
  lastName: z.string().trim().max(100),
  address: z.string().trim().max(500),
  phone: z.union([z.literal(""), z.string().trim().regex(/^[+\d().\s\-x]{7,40}$/i)]),
  dob: optionalDate,
  leContact: z.string().trim().max(500),
  arrestDate: optionalDate,
  leoName: z.string().trim().max(200),
  leContactLocation: z.string().trim().max(500),
  agency: z.string().trim().max(200),
  agencyReportNumber: z.string().trim().max(200),
  incidentSummary: z.string().trim().max(30000),
  reviewNote: z.string().trim().max(2000),
  appearanceDate: z.union([z.literal(""), z.iso.date()]).default(""),
  appearanceTime: z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]).default(""),
}).refine((value) => !!value.appearanceDate === !!value.appearanceTime, "Provide both the scheduled date and time.");
export type CaseFileAnswers = z.infer<typeof caseFileSchema>;
export type CaseFileVersion = { version: number; answers: CaseFileAnswers; has_photo: boolean; created_at: Date; entered_at: Date; display_name: string };
export type CasePhoto = { bytes: Buffer; type: "image/png" | "image/jpeg" };
const maxPhoto = 4 * 1024 * 1024;
const keys = ["firstName", "middleName", "lastName", "address", "phone", "dob", "leContact", "arrestDate", "leoName",
  "leContactLocation", "agency", "agencyReportNumber", "incidentSummary", "reviewNote", "appearanceDate", "appearanceTime"] as const;

export function parseCaseFile(form: FormData): CaseFileAnswers {
  const parsed = caseFileSchema.safeParse(Object.fromEntries(keys.map((key) => [key, form.get(key) ?? ""])));
  if (!parsed.success) throw new WorkflowError("Check the Case File fields, dates, phone number and length limits.", "invalid");
  return parsed.data;
}

function validPhoto(photo: CasePhoto) {
  const bytes = photo.bytes;
  return bytes.length > 0 && bytes.length <= maxPhoto && (
    (photo.type === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (photo.type === "image/jpeg" && bytes.length >= 4 && bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) && bytes.subarray(-2).equals(Buffer.from([255, 217])))
  );
}
export async function parseCasePhoto(form: FormData): Promise<CasePhoto | null> {
  const file = form.get("photo");
  if (file === null || (file instanceof File && file.size === 0 && (!file.name || file.name === "undefined"))) return null;
  if (!(file instanceof File) || !file.size || file.size > maxPhoto || (file.type !== "image/png" && file.type !== "image/jpeg")) {
    throw new WorkflowError("The optional photo must be a nonempty JPEG or PNG no larger than 4 MiB.", "invalid");
  }
  const photo: CasePhoto = { bytes: Buffer.from(await file.arrayBuffer()), type: file.type };
  if (!validPhoto(photo)) throw new WorkflowError("The photo does not match its image format.", "invalid");
  return photo;
}

async function findCaseFile(user: User, id: string, client: Pool | PoolClient): Promise<CaseFileVersion | null> {
  const result = await client.query<CaseFileVersion>(`SELECT c.version,c.answers,(c.photo IS NOT NULL) AS has_photo,c.created_at,u.display_name,
    (SELECT min(first_version.created_at) FROM case_file_versions first_version WHERE first_version.submission_id=s.id) AS entered_at
    FROM case_file_versions c JOIN submissions s ON s.id=c.submission_id JOIN app_users u ON u.id=c.created_by
    WHERE s.id=$1 AND ($2 OR ($4 AND s.group_id=$3 AND s.removed_at IS NULL AND s.status<>'archived'
      AND EXISTS (SELECT 1 FROM case_file_publications p WHERE p.submission_id=c.submission_id AND p.version=c.version)))
    ORDER BY c.version DESC LIMIT 1`, [id, user.role === "admin", user.group_id, user.role === "editor"]);
  return result.rows[0] ?? null;
}

export async function getCaseFile(user: User, id: string): Promise<CaseFileVersion | null> {
  if (!z.uuid().safeParse(id).success) throw new WorkflowError("Invalid referral identifier.", "invalid");
  return findCaseFile(user, id, database());
}

export async function downloadCaseFilePdf(user: User, id: string, version: number): Promise<Uint8Array> {
  if (!z.uuid().safeParse(id).success || !Number.isInteger(version) || version < 1) throw new WorkflowError("Invalid Case File version.", "invalid");
  return transaction(async (client) => {
    const locked = await client.query(`SELECT id FROM submissions WHERE id=$1
      AND ($2 OR ($3 AND group_id=$4 AND removed_at IS NULL AND status<>'archived')) FOR SHARE`,
    [id, user.role === "admin", user.role === "editor", user.group_id]);
    if (!locked.rowCount) throw new WorkflowError("Case File not found or not available.", "missing");
    const record = await findCaseFile(user, id, client);
    if (!record) throw new WorkflowError("Case File not found or not available.", "missing");
    if (record.version !== version) throw new WorkflowError("The Case File changed. Reload before exporting.", "conflict");
    const result = await client.query<{ photo: Buffer | null; photo_type: CasePhoto["type"] | null }>(
      "SELECT photo,photo_type FROM case_file_versions WHERE submission_id=$1 AND version=$2", [id, version]);
    const row = result.rows[0];
    if (!row || (row.photo && !row.photo_type) || (!row.photo && row.photo_type)) throw new WorkflowError("The stored Case File photo is invalid.", "invalid");
    const photo = row.photo && row.photo_type ? { bytes: row.photo, type: row.photo_type } : null;
    const bytes = await renderCaseFilePdf(record, photo);
    await client.query("INSERT INTO audit_events(actor_id,action,submission_id,changed_fields,revision) VALUES ($1,'case_file_pdf_export',$2,ARRAY['version'],$3)", [user.id, id, version]);
    return bytes;
  });
}

export async function saveCaseFile(user: User, answers: CaseFileAnswers, photo: CasePhoto | null, id?: string, version?: number, groupId?: string) {
  if (user.role !== "admin") throw new WorkflowError("Only administrators can edit Case Files.", "forbidden");
  const parsed = caseFileSchema.safeParse(answers);
  if (!parsed.success || (photo && !validPhoto(photo))) throw new WorkflowError("Invalid Case File information or photo.", "invalid");
  if (id && (!z.uuid().safeParse(id).success || version === undefined || !Number.isInteger(version) || version < 0)) throw new WorkflowError("Invalid Case File version.", "invalid");
  return transaction(async (client) => {
    if (!id && groupId) {
      const group = await client.query("SELECT 1 FROM app_groups WHERE id=$1", [groupId]);
      if (!group.rowCount) throw new WorkflowError("Select an available group.", "invalid");
    }
    const submissionId = id ?? await createDraft(client, user, groupId ?? user.group_id, { navigator: user.display_name });
    const result = await client.query<{ group_id: string; status: string; removed_at: Date | null; legal_hold: boolean }>(
      "SELECT group_id,status,removed_at,legal_hold FROM submissions WHERE id=$1 FOR UPDATE", [submissionId]);
    const row = result.rows[0];
    if (!row || !canView(user, row.group_id)) throw new WorkflowError("Record not found or not available to your group.", "missing");
    if (!canEdit(user, row.group_id)) throw new WorkflowError("You do not have editing permission.", "forbidden");
    if (row.removed_at || row.status === "archived" || row.legal_hold) throw new WorkflowError("Restore the referral and release any legal hold before editing the Case File.", "invalid");
    const previous = await client.query<{ version: number; answers: CaseFileAnswers; photo: Buffer | null; photo_type: CasePhoto["type"] | null }>(
      "SELECT version,answers,photo,photo_type FROM case_file_versions WHERE submission_id=$1 ORDER BY version DESC LIMIT 1", [submissionId]);
    const old = previous.rows[0];
    if (id && (old?.version ?? 0) !== version) throw new WorkflowError("Case File changed. Reload before saving.", "conflict");
    const next = (old?.version ?? 0) + 1;
    await client.query(`INSERT INTO case_file_versions(submission_id,version,answers,photo,photo_type,created_by)
      VALUES ($1,$2,$3,$4,$5,$6)`, [submissionId, next, JSON.stringify(parsed.data), photo?.bytes ?? old?.photo ?? null, photo?.type ?? old?.photo_type ?? null, user.id]);
    await client.query("UPDATE submissions SET updated_by=$2,updated_at=now() WHERE id=$1", [submissionId, user.id]);
    const changed: string[] = keys.filter((key) => parsed.data[key as keyof CaseFileAnswers] !== old?.answers[key as keyof CaseFileAnswers]);
    if (photo) changed.push("photo");
    await client.query("INSERT INTO audit_events(actor_id,action,submission_id,changed_fields,revision) VALUES ($1,'case_file_save',$2,$3,$4)", [user.id, submissionId, changed, next]);
    return submissionId;
  });
}

export async function downloadCasePhoto(user: User, id: string, version: number): Promise<CasePhoto> {
  if (!z.uuid().safeParse(id).success || !Number.isInteger(version) || version < 1) throw new WorkflowError("Invalid photo.", "invalid");
  return transaction(async (client) => {
    const result = await client.query<{ photo: Buffer; photo_type: CasePhoto["type"] }>(`SELECT c.photo,c.photo_type FROM case_file_versions c
      JOIN submissions s ON s.id=c.submission_id WHERE s.id=$1 AND c.version=$2 AND c.photo IS NOT NULL
      AND ($3 OR ($5 AND s.group_id=$4 AND s.removed_at IS NULL AND s.status<>'archived'
        AND EXISTS (SELECT 1 FROM case_file_publications p WHERE p.submission_id=c.submission_id AND p.version=c.version)))`,
    [id, version, user.role === "admin", user.group_id, user.role === "editor"]);
    const row = result.rows[0];
    if (!row) throw new WorkflowError("Photo not found or not available.", "missing");
    await client.query("INSERT INTO audit_events(actor_id,action,submission_id,changed_fields,revision) VALUES ($1,'case_file_photo_download',$2,ARRAY['photo'],$3)", [user.id, id, version]);
    return { bytes: row.photo, type: row.photo_type };
  });
}

export async function publishCaseFile(user: User, id: string, version: number) {
  if (user.role !== "admin") throw new WorkflowError("Only administrators can submit Case Files.", "forbidden");
  if (!z.uuid().safeParse(id).success || !Number.isInteger(version) || version < 1) throw new WorkflowError("Invalid Case File version.", "invalid");
  return transaction(async (client) => {
    const result = await client.query<{ group_id: string; status: string; removed_at: Date | null; legal_hold: boolean }>(
      "SELECT group_id,status,removed_at,legal_hold FROM submissions WHERE id=$1 FOR UPDATE", [id]);
    const row = result.rows[0];
    if (!row) throw new WorkflowError("Record not found or not available.", "missing");
    if (row.removed_at || row.status === "archived" || row.legal_hold) throw new WorkflowError("Restore the referral and release any legal hold before submitting the Case File.", "invalid");
    const latest = await client.query<{ version: number }>("SELECT version FROM case_file_versions WHERE submission_id=$1 ORDER BY version DESC LIMIT 1", [id]);
    if (latest.rows[0]?.version !== version) throw new WorkflowError("Case File changed. Reload before submitting.", "conflict");
    const existing = await client.query("SELECT 1 FROM case_file_publications WHERE submission_id=$1 AND version=$2", [id, version]);
    if (existing.rowCount) throw new WorkflowError("This Case File version has already been submitted.", "conflict");
    await client.query("INSERT INTO case_file_publications(submission_id,version,published_by) VALUES ($1,$2,$3)", [id, version, user.id]);
    const recipients = await client.query<{ id: string; email: string; phone: string }>(
      "SELECT id,email,phone FROM app_users WHERE group_id=$1 AND role='editor' AND active=true ORDER BY id", [row.group_id]);
    for (const recipient of recipients.rows) {
      await client.query(`INSERT INTO case_file_notifications(id,submission_id,version,recipient_id,email_status,sms_status)
        VALUES ($1,$2,$3,$4,$5,$6)`, [randomUUID(), id, version, recipient.id, recipient.email ? "disabled" : "missing_contact", recipient.phone ? "disabled" : "missing_contact"]);
    }
    await client.query("INSERT INTO audit_events(actor_id,action,submission_id,changed_fields,revision) VALUES ($1,'case_file_publish',$2,ARRAY['version'],$3)", [user.id, id, version]);
    return recipients.rows.length;
  });
}

export async function getCasePublicationInfo(user: User, id: string) {
  if (user.role !== "admin" || !z.uuid().safeParse(id).success) throw new WorkflowError("Case File not available.", "missing");
  const result = await database().query<{ version: number; recipients: number; missing_email: number; missing_phone: number }>(`
    SELECT p.version, count(n.id)::int AS recipients,
      count(n.id) FILTER (WHERE n.email_status='missing_contact')::int AS missing_email,
      count(n.id) FILTER (WHERE n.sms_status='missing_contact')::int AS missing_phone
    FROM case_file_publications p LEFT JOIN case_file_notifications n ON n.submission_id=p.submission_id AND n.version=p.version
    WHERE p.submission_id=$1 GROUP BY p.submission_id,p.version ORDER BY p.version DESC LIMIT 1`, [id]);
  return result.rows[0] ?? null;
}

export async function listCaseNotifications(user: User) {
  if (user.role !== "editor") return [];
  const result = await database().query<{ id: string; submission_id: string; version: number; created_at: Date }>(
    `SELECT n.id,n.submission_id,n.version,n.created_at FROM case_file_notifications n
     JOIN submissions s ON s.id=n.submission_id
     WHERE n.recipient_id=$1 AND n.read_at IS NULL AND s.group_id=$2 AND s.removed_at IS NULL AND s.status<>'archived'
     ORDER BY n.created_at DESC,n.id`, [user.id, user.group_id]);
  return result.rows;
}

export async function markCaseNotificationsRead(user: User, id: string, version: number) {
  if (user.role !== "editor" || !z.uuid().safeParse(id).success || !Number.isInteger(version) || version < 1) throw new WorkflowError("Invalid Case File notification.", "invalid");
  await transaction(async (client) => {
    const result = await client.query(`UPDATE case_file_notifications n SET read_at=now() FROM submissions s
      WHERE n.submission_id=$1 AND n.recipient_id=$2 AND n.version<=$3 AND n.read_at IS NULL
      AND s.id=n.submission_id AND s.group_id=$4 AND s.removed_at IS NULL AND s.status<>'archived'
      AND EXISTS (SELECT 1 FROM case_file_publications p WHERE p.submission_id=s.id AND p.version=$3)
      RETURNING n.id`, [id, user.id, version, user.group_id]);
    if (result.rowCount) await client.query("INSERT INTO audit_events(actor_id,action,submission_id,changed_fields,revision) VALUES ($1,'case_file_notifications_read',$2,ARRAY['notification'],$3)", [user.id, id, version]);
  });
}
