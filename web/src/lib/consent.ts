import type { PoolClient } from "pg";
import { z } from "zod";
import { canEdit, canView, WorkflowError, type User } from "./access";
import { database, transaction } from "./db";
import { createDraft } from "./submissions";
import { maxSignatureJsonLength, signatureSchema, signatureStatement, type Signature } from "./consent-signature";

export const MAX_CONSENT_PDF_BYTES = 4 * 1024 * 1024;
const phone = z.string().trim().regex(/^[+\d().\s\-x]{7,40}$/i, "Enter a valid phone number.");
const consentSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  middleName: z.string().trim().max(100),
  lastName: z.string().trim().min(1).max(100),
  dob: z.iso.date().refine((date) => date <= new Date().toISOString().slice(0, 10), "Date of birth cannot be in the future."),
  address: z.string().trim().min(1).max(500),
  phone,
  email: z.email().max(254),
  emergencyName: z.string().trim().max(200),
  emergencyPhone: z.union([z.literal(""), phone]),
  reviewNote: z.string().trim().max(2000).default(""),
  agreed: z.literal("yes"),
  signed: z.literal("yes"),
});
export type ConsentInput = z.infer<typeof consentSchema>;
export type ConsentVersion = {
  version: number; first_name: string; middle_name: string; last_name: string;
  date_of_birth: string; address: string; phone: string; email: string;
  emergency_name: string; emergency_phone: string; has_document: boolean;
  review_note: string; display_name: string; created_at: Date;
};

export function parseConsent(form: FormData): ConsentInput {
  const parsed = consentSchema.safeParse(Object.fromEntries(
    ["firstName", "middleName", "lastName", "dob", "address", "phone", "email", "emergencyName", "emergencyPhone", "reviewNote", "agreed", "signed"]
      .map((key) => [key, form.get(key) ?? ""]),
  ));
  if (!parsed.success) throw new WorkflowError("Complete all required consent fields with valid values and select both confirmations.", "invalid");
  return parsed.data;
}

export async function consentDocument(form: FormData): Promise<Buffer | null> {
  const file = form.get("document");
  // Next's multipart parser may represent an unselected file with this sentinel name.
  if (file === null || (file instanceof File && file.size === 0 && (!file.name || file.name === "undefined"))) return null;
  if (!(file instanceof File) || !file.size || file.size > MAX_CONSENT_PDF_BYTES || file.type !== "application/pdf") {
    throw new WorkflowError("The optional document must be a nonempty PDF no larger than 4 MiB.", "invalid");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-")) || !bytes.subarray(Math.max(0, bytes.length - 1024)).includes(Buffer.from("%%EOF"))) {
    throw new WorkflowError("The uploaded file does not look like a PDF.", "invalid");
  }
  return bytes;
}

export function parseConsentSignature(form: FormData): Signature | null {
  const raw = form.get("signature");
  if (raw === null || raw === "") return null;
  if (typeof raw !== "string" || raw.length > maxSignatureJsonLength) {
    throw new WorkflowError("Invalid signature. Clear it and sign again.", "invalid");
  }
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new WorkflowError("Invalid signature. Clear it and sign again.", "invalid");
  }
  const parsed = signatureSchema.safeParse(value);
  if (!parsed.success) throw new WorkflowError("Invalid signature. Clear it and sign again.", "invalid");
  return parsed.data;
}

export async function requireConsent(client: PoolClient, id: string): Promise<string> {
  const result = await client.query<{ dob: string }>(
    "SELECT to_char(date_of_birth,'YYYY-MM-DD') AS dob FROM consent_versions WHERE submission_id=$1 ORDER BY version DESC LIMIT 1", [id]);
  if (!result.rows[0]) throw new WorkflowError("Submit consent before working on Intake or creating new exports.", "invalid");
  return result.rows[0].dob;
}

export async function submitConsent(user: User, input: ConsentInput, document: Buffer | null, id?: string, revision?: number, signature: Signature | null = null) {
  const parsed = consentSchema.safeParse(input);
  if (!parsed.success) throw new WorkflowError("Invalid consent information.", "invalid");
  if (document && (document.length > MAX_CONSENT_PDF_BYTES || !document.subarray(0, 5).equals(Buffer.from("%PDF-")) ||
    !document.subarray(Math.max(0, document.length - 1024)).includes(Buffer.from("%%EOF")))) {
    throw new WorkflowError("Invalid consent PDF.", "invalid");
  }
  if (signature !== null && !signatureSchema.safeParse(signature).success) throw new WorkflowError("Invalid signature.", "invalid");
  if (id && (!z.uuid().safeParse(id).success || !Number.isInteger(revision) || !revision || revision < 1)) {
    throw new WorkflowError("Invalid record or revision.", "invalid");
  }
  return transaction(async (client) => {
    let submissionId = id;
    if (!submissionId) submissionId = await createDraft(client, user, user.group_id, { navigator: user.display_name });
    const result = await client.query<{ group_id: string; revision: number; status: string; removed_at: Date | null }>(
      "SELECT group_id,revision,status,removed_at FROM submissions WHERE id=$1 FOR UPDATE", [submissionId]);
    const row = result.rows[0];
    if (!row || !canView(user, row.group_id)) throw new WorkflowError("Record not found or not available to your group.", "missing");
    if (!canEdit(user, row.group_id)) throw new WorkflowError("You do not have editing permission.", "forbidden");
    const owner = await client.query<{ created_by: string }>(
      "SELECT created_by FROM consent_versions WHERE submission_id=$1 ORDER BY version LIMIT 1", [submissionId]);
    if (owner.rows[0] && user.role !== "admin" && owner.rows[0].created_by !== user.id) {
      throw new WorkflowError("Only the original consent submitter or an administrator can correct consent.", "forbidden");
    }
    if (id && row.revision !== revision) throw new WorkflowError("Another user changed this record. Reload before submitting consent.", "conflict");
    if (row.removed_at || row.status === "archived") throw new WorkflowError("Restore the record before submitting consent.", "invalid");
    const value = parsed.data;
    await client.query(`INSERT INTO consent_versions
      (submission_id,version,first_name,middle_name,last_name,date_of_birth,address,phone,email,emergency_name,emergency_phone,review_note,agreed_to_share,signed_attested,document,created_by,signature,signature_statement)
      VALUES ($1,(SELECT COALESCE(MAX(version),0)+1 FROM consent_versions WHERE submission_id=$1),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,true,$12,$13,$14::jsonb,$15)`,
    [submissionId, value.firstName, value.middleName, value.lastName, value.dob, value.address, value.phone, value.email, value.emergencyName, value.emergencyPhone, value.reviewNote, document, user.id, signature ? JSON.stringify(signature) : null, signature ? signatureStatement : null]);
    await client.query(`UPDATE submissions SET participant_name=$2,date_of_birth=$3,updated_by=$4,updated_at=now(),
      revision=revision+$5 WHERE id=$1`, [submissionId, [value.firstName, value.middleName, value.lastName].filter(Boolean).join(" "), value.dob, user.id, id ? 1 : 0]);
    await client.query(`UPDATE intake_import_sources SET placeholder_fields = ARRAY(
      SELECT key FROM jsonb_each_text(placeholder_values)
      WHERE CASE key WHEN 'name' THEN $2 WHEN 'dob' THEN $3 ELSE '' END = value
      ORDER BY key
    ) WHERE submission_id=$1`, [submissionId, [value.firstName, value.middleName, value.lastName].filter(Boolean).join(" "), value.dob]);
    if (id) await client.query(`INSERT INTO form_revisions(submission_id,revision,answers,status,actor_id)
      SELECT id,revision,answers,status,$2 FROM submissions WHERE id=$1`, [submissionId, user.id]);
    await client.query("INSERT INTO audit_events(actor_id,action,submission_id,changed_fields,revision) VALUES ($1,'consent_submit',$2,$3,$4)",
      [user.id, submissionId, ["consent_version", ...(value.reviewNote ? ["review_note"] : []), ...(document ? ["document"] : []), ...(signature ? ["signature"] : [])], row.revision + (id ? 1 : 0)]);
    return submissionId;
  });
}

export async function listConsentSignatures(user: User, id: string) {
  if (!z.uuid().safeParse(id).success) throw new WorkflowError("Invalid referral.", "invalid");
  return transaction(async (client) => {
    const result = await client.query<{ version: number; signature: unknown; signature_statement: string }>(
      `SELECT c.version,c.signature,c.signature_statement FROM consent_versions c JOIN submissions s ON s.id=c.submission_id
       WHERE s.id=$1 AND c.signature IS NOT NULL AND ($2 OR (s.group_id=$3 AND s.removed_at IS NULL AND
         (SELECT owner.created_by FROM consent_versions owner WHERE owner.submission_id=s.id ORDER BY owner.version LIMIT 1)=$4))
       ORDER BY c.version DESC`, [id, user.role === "admin", user.group_id, user.id],
    );
    const signatures = result.rows.map((row) => {
      const signature = signatureSchema.safeParse(row.signature);
      if (!signature.success || !row.signature_statement) throw new Error("Stored consent signature is invalid.");
      return { version: row.version, signature: signature.data, statement: row.signature_statement };
    });
    if (signatures.length) {
      await client.query("INSERT INTO audit_events(actor_id,action,submission_id,changed_fields) VALUES ($1,'view_consent_signatures',$2,$3)",
        [user.id, id, signatures.map((item) => `version_${item.version}`)]);
    }
    return signatures;
  });
}

export async function listConsent(user: User, id: string): Promise<ConsentVersion[]> {
  if (!z.uuid().safeParse(id).success) return [];
  const result = await database().query<ConsentVersion>(`SELECT c.version,c.first_name,c.middle_name,c.last_name,
    to_char(c.date_of_birth,'YYYY-MM-DD') AS date_of_birth,c.address,c.phone,c.email,c.emergency_name,c.emergency_phone,c.review_note,
    (c.document IS NOT NULL) AS has_document,c.created_at,u.display_name
    FROM consent_versions c JOIN submissions s ON s.id=c.submission_id JOIN app_users u ON u.id=c.created_by
    WHERE s.id=$1 AND ($2 OR (s.group_id=$3 AND s.removed_at IS NULL AND
      (SELECT owner.created_by FROM consent_versions owner WHERE owner.submission_id=s.id ORDER BY owner.version LIMIT 1)=$4))
    ORDER BY c.version DESC`, [id, user.role === "admin", user.group_id, user.id]);
  return result.rows;
}

export async function downloadConsent(user: User, id: string, version: number): Promise<Buffer> {
  if (!z.uuid().safeParse(id).success || !Number.isInteger(version) || version < 1) throw new WorkflowError("Invalid document.", "invalid");
  return transaction(async (client) => {
    const result = await client.query<{ document: Buffer }>(`SELECT c.document FROM consent_versions c JOIN submissions s ON s.id=c.submission_id
      WHERE s.id=$1 AND c.version=$2 AND c.document IS NOT NULL AND ($3 OR (s.group_id=$4 AND s.removed_at IS NULL AND
        (SELECT owner.created_by FROM consent_versions owner WHERE owner.submission_id=s.id ORDER BY owner.version LIMIT 1)=$5))`,
    [id, version, user.role === "admin", user.group_id, user.id]);
    if (!result.rows[0]) throw new WorkflowError("Document not found or not available.", "missing");
    await client.query("INSERT INTO audit_events(actor_id,action,submission_id,changed_fields) VALUES ($1,'consent_download',$2,$3)", [user.id, id, [`version_${version}`]]);
    return result.rows[0].document;
  });
}
