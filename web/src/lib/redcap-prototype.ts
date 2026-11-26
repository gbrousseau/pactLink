import { randomUUID } from "node:crypto";
import { z } from "zod";
import { canReview, WorkflowError, type User } from "./access";
import { database, transaction } from "./db";
import { loadRedcapCodebook, type RedcapCodebook } from "./redcap-codebook";
import { requireConsent } from "./consent";
import type { PoolClient } from "pg";
import { answersSchema } from "./intake-validation";
import { screeningServicesSchema } from "./screening-service-schema";
import { completionSchema } from "./program-completion-schema";
import type { PrefillSources } from "./redcap-prefill";

export type PrototypeValues = Record<string, string | string[]>;
type ExportRow = { id: string; approved_version: number; created_at: Date; display_name: string; removed_at: Date | null };
const uuid = z.uuid();
export const consentIdentityFields = ["first_name", "first_name_2", "middle_name", "middle_name_2", "last_name", "last_name_2", "dob", "dob_2"] as const;

export function prototypePayload(codebook: RedcapCodebook, input: FormData) {
  if (consentIdentityFields.some((name) => input.getAll(name).some((value) => typeof value !== "string" || value.trim()))) {
    throw new WorkflowError("Identity fields are restricted to consent and cannot be included in this prototype.", "forbidden");
  }
  const record: Record<string, string> = {};
  for (const field of codebook.fields) {
    if (consentIdentityFields.some((name) => name === field.name)) continue;
    const raw = input.getAll(field.name);
    if (raw.some((value) => typeof value !== "string")) throw new WorkflowError("File uploads are not allowed.", "invalid");
    const values = raw as string[];
    if (field.type !== "checkbox" && values.length > 1) throw new WorkflowError(`Multiple values supplied for ${field.name}.`, "invalid");
    if (field.type === "checkbox") {
      if (new Set(values).size !== values.length || values.some((value) => !field.choices.some((choice) => choice.code === value))) throw new WorkflowError(`Invalid choice for ${field.name}.`, "invalid");
      for (const value of values) record[`${field.name}___${value}`] = "1";
    } else {
      const value = (values[0] ?? "").trim();
      if (value.length > 2000) throw new WorkflowError(`Answer is too long for ${field.name}.`, "invalid");
      if (value && field.choices.length && !field.choices.some((choice) => choice.code === value)) throw new WorkflowError(`Invalid choice for ${field.name}.`, "invalid");
      if (value && field.attributes.includes("date_mdy") && !z.iso.date().safeParse(value).success) throw new WorkflowError(`Invalid date for ${field.name}.`, "invalid");
      if (value) record[field.name] = value;
    }
  }
  return { warning: "SYNTHETIC PROTOTYPE ONLY - NOT VALIDATED FOR REDCAP IMPORT", codebook_sha256: codebook.hash, record };
}

function formValue(input: FormData, name: string) {
  const entries = input.getAll(name);
  if (entries.length > 1 || (entries.length === 1 && typeof entries[0] !== "string")) throw new WorkflowError(`Invalid ${name}.`, "invalid");
  return typeof entries[0] === "string" ? entries[0].trim() : "";
}

async function lockedSources(client: PoolClient, user: User, id: string): Promise<PrefillSources> {
  const locked = await client.query<{ group_id: string; review_state: string; status: string; removed_at: Date | null }>(
    "SELECT group_id,review_state,status,removed_at FROM submissions WHERE id=$1 FOR UPDATE", [id]);
  const row = locked.rows[0];
  if (!row || !canReview(user, row.group_id)) throw new WorkflowError("Record not found or not available.", "missing");
  if (row.review_state !== "approved" || row.status === "archived" || row.removed_at) {
    throw new WorkflowError("The referral is no longer currently approved. Reload the referral.", "conflict");
  }
  await requireConsent(client, id);
  const result = await client.query<{
    participant_id: string; intake_version: number | null; intake_answers: unknown;
    screening_state: string | null; screening_version: number | null; screening_answers: unknown;
    completion_state: string | null; completion_version: number | null; completion_answers: unknown;
  }>(`SELECT e.participant_id, i.version AS intake_version, i.answers AS intake_answers,
      sr.review_state AS screening_state, sa.version AS screening_version, sa.answers AS screening_answers,
      cr.review_state AS completion_state, ca.version AS completion_version, ca.answers AS completion_answers
    FROM submissions s JOIN enrollments e ON e.id=s.enrollment_id
    LEFT JOIN LATERAL (SELECT version,answers FROM approved_intake_versions WHERE submission_id=s.id ORDER BY version DESC LIMIT 1) i ON true
    LEFT JOIN screening_service_records sr ON sr.submission_id=s.id
    LEFT JOIN LATERAL (SELECT version,answers FROM screening_service_approvals WHERE submission_id=s.id ORDER BY version DESC LIMIT 1) sa ON true
    LEFT JOIN program_completion_records cr ON cr.submission_id=s.id
    LEFT JOIN LATERAL (SELECT version,answers FROM program_completion_approvals WHERE submission_id=s.id ORDER BY version DESC LIMIT 1) ca ON true
    WHERE s.id=$1`, [id]);
  const source = result.rows[0];
  if (!source?.intake_version || (source.screening_state === "approved" && !source.screening_version)
      || (source.completion_state === "approved" && !source.completion_version)) {
    throw new WorkflowError("An approved source snapshot is missing.", "invalid");
  }
  const screening = source.screening_state === "approved" && source.screening_version
    ? { version: source.screening_version, answers: screeningServicesSchema.parse(source.screening_answers) } : null;
  const completion = screening && source.completion_state === "approved" && source.completion_version
    ? { version: source.completion_version, answers: completionSchema.parse(source.completion_answers) } : null;
  return {
    participantId: source.participant_id,
    intake: { version: source.intake_version, answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])).parse(answersSchema.parse(source.intake_answers)) },
    screening, completion,
  };
}

export async function getPrototypeSources(user: User, id: string): Promise<PrefillSources> {
  if (!uuid.safeParse(id).success) throw new WorkflowError("Invalid referral identifier.", "invalid");
  return transaction((client) => lockedSources(client, user, id));
}

async function permitted(user: User, id: string) {
  if (!uuid.safeParse(id).success) throw new WorkflowError("Invalid referral identifier.", "invalid");
  const result = await database().query<{ group_id: string; review_state: string; status: string; removed_at: Date | null }>(
    "SELECT group_id,review_state,status,removed_at FROM submissions WHERE id=$1", [id]);
  const row = result.rows[0];
  if (!row || !canReview(user, row.group_id)) throw new WorkflowError("Record not found or not available.", "missing");
  return row;
}

export async function listPrototypeExports(user: User, id: string): Promise<ExportRow[]> {
  await permitted(user, id);
  const result = await database().query<ExportRow>(`SELECT e.id,e.approved_version,e.created_at,e.removed_at,u.display_name
    FROM redcap_prototype_exports e JOIN app_users u ON u.id=e.created_by
    WHERE e.submission_id=$1 ORDER BY e.created_at DESC,e.id`, [id]);
  return result.rows;
}

export async function createPrototypeExport(user: User, id: string, version: number, form: FormData) {
  if (!uuid.safeParse(id).success || !Number.isInteger(version) || version < 1) throw new WorkflowError("Invalid referral or approved version.", "invalid");
  if (form.get("synthetic") !== "yes") throw new WorkflowError("Confirm that all information is synthetic.", "invalid");
  const codebook = await loadRedcapCodebook();
  if (form.get("codebookHash") !== codebook.hash) throw new WorkflowError("The codebook changed. Reload the form before generating the prototype.", "conflict");
  const payload = prototypePayload(codebook, form);
  return transaction(async (client) => {
    const sources = await lockedSources(client, user, id);
    if (sources.intake.version !== version
      || formValue(form, "screeningVersion") !== String(sources.screening?.version ?? "none")
      || formValue(form, "completionVersion") !== String(sources.completion?.version ?? "none")) {
      throw new WorkflowError("An approved source phase changed. Reload the form before generating the prototype.", "conflict");
    }
    if (formValue(form, "id") !== sources.participantId) throw new WorkflowError("The participant record ID cannot be changed.", "invalid");
    payload.record.id = sources.participantId;
    const storedPayload = { ...payload, source_versions: {
      intake: sources.intake.version, screening: sources.screening?.version ?? null, completion: sources.completion?.version ?? null,
    } };
    const exportId = randomUUID();
    await client.query("INSERT INTO redcap_prototype_exports(id,submission_id,approved_version,payload,created_by) VALUES ($1,$2,$3,$4,$5)", [exportId, id, version, JSON.stringify(storedPayload), user.id]);
    await client.query("INSERT INTO audit_events(actor_id,action,submission_id,changed_fields) VALUES ($1,'redcap_prototype_create',$2,$3)", [user.id, id, [exportId]]);
    return exportId;
  });
}

export async function changePrototypeRemoval(user: User, id: string, exportId: string, restore: boolean) {
  if (!uuid.safeParse(id).success || !uuid.safeParse(exportId).success) throw new WorkflowError("Invalid identifier.", "invalid");
  await transaction(async (client) => {
    const result = await client.query<{ group_id: string; legal_hold: boolean; removed_at: Date | null }>(
      `SELECT s.group_id,s.legal_hold,e.removed_at FROM submissions s JOIN redcap_prototype_exports e ON e.submission_id=s.id
       WHERE s.id=$1 AND e.id=$2 FOR UPDATE OF s,e`, [id, exportId]);
    const row = result.rows[0];
    if (!row || !canReview(user, row.group_id)) throw new WorkflowError("File not found or not available.", "missing");
    if (!restore && row.legal_hold) throw new WorkflowError("Files cannot be removed while a legal hold applies.", "invalid");
    if (restore !== !!row.removed_at) throw new WorkflowError("File status changed. Reload the page.", "conflict");
    await client.query("UPDATE redcap_prototype_exports SET removed_at=$1,removed_by=$2 WHERE id=$3",
      [restore ? null : new Date(), restore ? null : user.id, exportId]);
    await client.query("INSERT INTO audit_events(actor_id,action,submission_id,changed_fields) VALUES ($1,$2,$3,$4)",
      [user.id, restore ? "redcap_prototype_restore" : "redcap_prototype_remove", id, [exportId]]);
  });
}

export async function downloadPrototype(user: User, id: string, exportId: string) {
  if (!uuid.safeParse(id).success || !uuid.safeParse(exportId).success) throw new WorkflowError("Invalid identifier.", "invalid");
  return transaction(async (client) => {
    const result = await client.query<{ group_id: string; payload: unknown; removed_at: Date | null }>(
      `SELECT s.group_id,e.payload,e.removed_at FROM submissions s JOIN redcap_prototype_exports e ON e.submission_id=s.id
       WHERE s.id=$1 AND e.id=$2 FOR UPDATE OF s,e`, [id, exportId]);
    const row = result.rows[0];
    if (!row || !canReview(user, row.group_id) || row.removed_at) throw new WorkflowError("File not found or not available.", "missing");
    const payload = z.object({ record: z.record(z.string(), z.string()) }).passthrough().safeParse(row.payload);
    if (!payload.success) throw new WorkflowError("The stored prototype has an invalid format.", "invalid");
    if (consentIdentityFields.some((name) => payload.data.record[name])) {
      throw new WorkflowError("This older prototype contains restricted identity fields and cannot be downloaded.", "forbidden");
    }
    await client.query("INSERT INTO audit_events(actor_id,action,submission_id,changed_fields) VALUES ($1,'redcap_prototype_download',$2,$3)", [user.id, id, [exportId]]);
    return JSON.stringify(row.payload, null, 2) + "\n";
  });
}
