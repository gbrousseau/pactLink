import { createHash, randomUUID } from "node:crypto";
import { parse } from "csv-parse/sync";
import { WorkflowError, type User } from "./access";
import { database, transaction } from "./db";
import { isoDate, type Answers } from "./intake-validation";
import { createDraft } from "./submissions";
import { lockImportHash } from "./import-removal";

const columns = [
  "DOB", "Houseless", "Gender", "Race", "AGENCY", "LEA #", "DA #", "COURT #",
  "CHARGE CODE", "CHARGE DESCRIPT", "INCIDENT/REFERRAL DATE", "REVIEW STATUS",
  "HB 4002 REPORTING", "DEFLECT OUTCOME", "CD OUTCOME", "REFERRAL TYPE", "OUTCOME 2",
  "SUBSTANCE", "SUBSTANCE 2", "DEATHS", "RE-OFFENSE", "NOTES", "OUTCOME3", "ARRESTED", "WEIGHT",
];
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;
const MAX_ROWS = 10000;
type ImportRow = { record: number; source: Record<string, string>; dob: string | null };
export type ImportIssue = { record: number; message: string };
export type ParsedImport = { hash: string; rows: ImportRow[]; issues: ImportIssue[]; total: number };

function parseDate(value: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  const date = match ? `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}` : value.trim();
  return isoDate.safeParse(date).success && date <= new Date().toISOString().slice(0, 10) ? date : null;
}

export function parseIntakeImport(bytes: Uint8Array): ParsedImport {
  if (!bytes.length || bytes.length > MAX_IMPORT_BYTES) throw new WorkflowError("Choose a nonempty file no larger than 4 MiB.", "invalid");
  let content: string;
  try { content = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new WorkflowError("The file must be valid UTF-8.", "invalid"); }
  const firstLine = content.split(/\r?\n/, 1)[0];
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  let records: string[][];
  try {
    records = parse(content, { bom: true, delimiter, relax_column_count: true, skip_empty_lines: true, max_record_size: 100000 }) as string[][];
  } catch {
    throw new WorkflowError("The file has malformed CSV/TSV quoting or an oversized record. No rows were imported.", "invalid");
  }
  const header = records.shift()?.map((name) => name.trim());
  if (!header || header.length !== columns.length || new Set(header).size !== header.length || columns.some((name) => !header.includes(name))) {
    throw new WorkflowError("The file must contain the 25 columns from the supplied import template, with unique headers.", "invalid");
  }
  if (!records.length || records.length > MAX_ROWS) throw new WorkflowError(`The file must contain 1 to ${MAX_ROWS} data records.`, "invalid");
  const rows: ImportRow[] = [], issues: ImportIssue[] = [];
  records.forEach((values, index) => {
    const record = index + 2;
    if (values.length !== header.length || values.some((value) => value.length > 10000 || value.includes("\0"))) {
      issues.push({ record, message: "Incorrect column count, a field exceeds 10,000 characters, or a field contains a null character." });
      return;
    }
    const source = Object.fromEntries(header.map((name, i) => [name, values[i]]));
    rows.push({ record, source, dob: parseDate(source.DOB) });
  });
  return { hash: createHash("sha256").update(bytes).digest("hex"), rows, issues, total: records.length };
}

export async function listImportGroups(user: User) {
  if (user.role !== "admin") throw new WorkflowError("Only administrators can import intakes.", "forbidden");
  return (await database().query<{ id: string; name: string }>("SELECT id,name FROM app_groups ORDER BY name")).rows;
}

export async function importIntakes(user: User, group: string, parsed: ParsedImport, confirmReimport = false) {
  if (user.role !== "admin") throw new WorkflowError("Only administrators can import intakes.", "forbidden");
  if (!parsed.rows.length) throw new WorkflowError("No valid records are available to import.", "invalid");
  return transaction(async (client) => {
    const groupExists = await client.query("SELECT 1 FROM app_groups WHERE id=$1", [group]);
    if (!groupExists.rowCount) throw new WorkflowError("Select an existing group.", "invalid");
    await lockImportHash(client, parsed.hash);
    const previous = await client.query<{ batches: string; active: string }>(
      `SELECT count(DISTINCT b.id) AS batches,count(s.id) FILTER (WHERE s.removed_at IS NULL) AS active
       FROM intake_import_batches b JOIN intake_import_sources i ON i.batch_id=b.id
       JOIN submissions s ON s.id=i.submission_id WHERE b.file_hash=$1`, [parsed.hash],
    );
    if (Number(previous.rows[0].active)) throw new WorkflowError("This exact file has active records from a previous import. No rows were saved.", "conflict");
    if (Number(previous.rows[0].batches) && !confirmReimport) throw new WorkflowError("This file was previously imported. Explicitly confirm re-import after reviewing its history.", "conflict");
    const batch = randomUUID();
    await client.query(
      `INSERT INTO intake_import_batches(id,file_hash,group_id,actor_id,imported_count,skipped_count)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [batch, parsed.hash, group, user.id, parsed.rows.length, parsed.issues.length],
    );
    for (const row of parsed.rows) {
      const placeholders: Record<string, string> = { name: `Synthetic placeholder ${randomUUID()}` };
      if (!row.dob) placeholders.dob = "1900-01-01";
      const answers: Answers = { ...placeholders, dob: row.dob ?? placeholders.dob };
      const id = await createDraft(client, user, group, answers);
      await client.query(
        `INSERT INTO intake_import_sources(submission_id,batch_id,row_number,source,placeholder_values,placeholder_fields)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, batch, row.record, JSON.stringify(row.source), JSON.stringify(placeholders), Object.keys(placeholders)],
      );
      await client.query("INSERT INTO audit_events(actor_id,action,submission_id,changed_fields,revision) VALUES ($1,'import_draft',$2,$3,1)",
        [user.id, id, ["import_source", ...Object.keys(placeholders)]]);
    }
    return batch;
  });
}

export async function getImportSource(user: User, id: string) {
  const result = await database().query<{ source: Record<string, string>; placeholder_fields: string[]; row_number: number; created_at: Date; batch_id: string }>(
    `SELECT i.source,i.placeholder_fields,i.row_number,b.created_at,i.batch_id FROM intake_import_sources i
     JOIN submissions s ON s.id=i.submission_id JOIN intake_import_batches b ON b.id=i.batch_id
     WHERE s.id=$1 AND ($2 OR (s.group_id=$3 AND s.removed_at IS NULL))`,
    [id, user.role === "admin", user.group_id],
  );
  return result.rows[0] ?? null;
}
