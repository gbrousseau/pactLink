import { randomUUID } from "node:crypto";
import { z } from "zod";
import { canReview, WorkflowError, type User } from "./access";
import { database, transaction } from "./db";
import { loadRedcapCodebook, type RedcapCodebook } from "./redcap-codebook";
import { requireConsent } from "./consent";

export type PrototypeValues = Record<string, string | string[]>;
type ExportRow = { id: string; approved_version: number; created_at: Date; display_name: string; removed_at: Date | null };
const uuid = z.uuid();

export function prefillPrototype(answers: Record<string, string | string[]>, codebook: RedcapCodebook): PrototypeValues {
  const values: PrototypeValues = {};
  for (const [source, target] of [["dob", "dob"], ["contactDate", "first_contact_date"], ["eligibilityDate", "elig_date"]] as const) {
    if (typeof answers[source] === "string" && answers[source]) values[target] = answers[source];
  }
  for (const [source, target] of [
    ["race", "race"], ["gender", "gender"], ["disability", "disability"],
    ["handoff", "handoff_type"], ["eligibilityBy", "eligibility_determined_by"], ["charges", "charge"],
  ] as const) {
    const answersForField = answers[source];
    const field = codebook.fields.find((item) => item.name === target && item.type === "checkbox");
    if (!Array.isArray(answersForField) || !answersForField.length || !field) continue;
    const choices = answersForField.map((answer) => field.choices.find((choice) => choice.label === answer)?.code);
    if (choices.every((choice): choice is string => choice !== undefined)) values[target] = choices;
  }
  return values;
}

export function prototypePayload(codebook: RedcapCodebook, input: FormData) {
  const record: Record<string, string> = {};
  for (const field of codebook.fields) {
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
  if (record.id && record.id.length > 100) throw new WorkflowError("The synthetic REDCap record ID must be at most 100 characters.", "invalid");
  if (formValue(input, "confirmRecordId") !== (record.id ?? "")) throw new WorkflowError("The record ID and confirmation do not match.", "invalid");
  return { warning: "SYNTHETIC PROTOTYPE ONLY - NOT VALIDATED FOR REDCAP IMPORT", codebook_sha256: codebook.hash, record };
}

function formValue(input: FormData, name: string) {
  const entries = input.getAll(name);
  if (entries.length > 1 || (entries.length === 1 && typeof entries[0] !== "string")) throw new WorkflowError("Confirm the synthetic record ID.", "invalid");
  return typeof entries[0] === "string" ? entries[0].trim() : "";
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
    const result = await client.query<{ group_id: string; review_state: string; status: string; removed_at: Date | null; version: number | null }>(
      `SELECT s.group_id,s.review_state,s.status,s.removed_at,
       (SELECT max(v.version) FROM approved_intake_versions v WHERE v.submission_id=s.id) AS version
       FROM submissions s WHERE s.id=$1 FOR UPDATE`, [id]);
    const row = result.rows[0];
    if (!row || !canReview(user, row.group_id)) throw new WorkflowError("Record not found or not available.", "missing");
    if (row.review_state !== "approved" || row.status === "archived" || row.removed_at || row.version !== version) throw new WorkflowError("The referral is no longer currently approved or has a newer approved version. Reload the referral.", "conflict");
    await requireConsent(client, id);
    const exportId = randomUUID();
    await client.query("INSERT INTO redcap_prototype_exports(id,submission_id,approved_version,payload,created_by) VALUES ($1,$2,$3,$4,$5)", [exportId, id, version, JSON.stringify(payload), user.id]);
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
    await client.query("INSERT INTO audit_events(actor_id,action,submission_id,changed_fields) VALUES ($1,'redcap_prototype_download',$2,$3)", [user.id, id, [exportId]]);
    return JSON.stringify(row.payload, null, 2) + "\n";
  });
}
