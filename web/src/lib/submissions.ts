import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { canEdit, canView, WorkflowError, type User } from "./access";
import { database, transaction } from "./db";
import { answersSchema, isoDate, validateAnswers, type Answers } from "./intake-validation";
import { programs } from "./intake-fields";

export type Submission = {
  id: string; enrollment_id: string; group_id: string; form_type: "intake";
  template_version: string; status: "draft" | "submitted" | "archived";
  revision: number; answers: Answers; participant_name: string; date_of_birth: string | null;
  program_type: string | null; contact_date: string | null; navigator_name: string;
  created_at: Date; updated_at: Date; legal_hold: boolean;
};
export type AuditEvent = {
  id: string; action: string; occurred_at: Date; display_name: string; changed_fields: string[]; revision: number | null;
};
export type FormRevision = { revision: number; answers: Answers; status: Submission["status"]; display_name: string; recorded_at: Date };
export const searchSchema = z.object({
  q: z.string().trim().max(100).default(""),
  status: z.enum(["active", "all", "draft", "submitted", "archived"]).default("active"),
  program: z.enum(["", ...programs]).default(""),
  navigator: z.string().trim().max(100).default(""),
  from: z.union([z.literal(""), isoDate]).default(""),
  to: z.union([z.literal(""), isoDate]).default(""),
  sort: z.enum(["updated", "created", "name", "dob", "contact"]).default("updated"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
}).refine((input) => !input.from || !input.to || input.from <= input.to, { message: "Start date must not follow end date.", path: ["from"] });
export type Search = z.infer<typeof searchSchema>;
const sortColumns = { updated: "updated_at", created: "created_at", name: "participant_name", dob: "date_of_birth", contact: "contact_date" };
const selectColumns = "s.*, to_char(s.date_of_birth,'YYYY-MM-DD') AS date_of_birth, to_char(s.contact_date,'YYYY-MM-DD') AS contact_date";
const text = (answers: Answers, key: string) => typeof answers[key] === "string" ? answers[key] : "";

async function audit(client: PoolClient, user: User, action: string, id: string | null, fields: string[] = [], revision: number | null = null) {
  await client.query("INSERT INTO audit_events(actor_id,action,submission_id,changed_fields,revision) VALUES ($1,$2,$3,$4,$5)", [user.id, action, id, fields, revision]);
}
async function snapshot(client: PoolClient, id: string) {
  await client.query(`INSERT INTO form_revisions(submission_id,revision,answers,status,actor_id)
    SELECT id,revision,answers,status,updated_by FROM submissions WHERE id=$1`, [id]);
}
async function editable(client: PoolClient, user: User, id: string, revision: number): Promise<Submission> {
  const result = await client.query<Submission>("SELECT * FROM submissions WHERE id=$1 AND ($2 OR group_id=$3) FOR UPDATE", [id, user.role === "admin", user.group_id]);
  const row = result.rows[0];
  if (!row || !canView(user, row.group_id)) throw new WorkflowError("Record not found or not available to your group.", "missing");
  if (!canEdit(user, row.group_id)) throw new WorkflowError("You do not have editing permission.", "forbidden");
  if (row.revision !== revision) throw new WorkflowError("Another user changed this record. Open the latest version before saving; your changes have not been applied.", "conflict");
  return row;
}

export async function saveSubmission(user: User, answers: Answers, id?: string, revision?: number) {
  const errors = validateAnswers(answers, false);
  if (Object.keys(errors).length) throw new WorkflowError("Form validation failed.", "invalid");
  answersSchema.parse(answers);
  if (user.role === "viewer") throw new WorkflowError("You do not have editing permission.", "forbidden");
  if (id && (!z.uuid().safeParse(id).success || !Number.isInteger(revision) || !revision || revision < 1)) {
    throw new WorkflowError("Invalid record identifier or revision.", "invalid");
  }
  return transaction(async (client) => {
    const name = text(answers, "name");
    const dob = text(answers, "dob") || null;
    const program = text(answers, "programType") || null;
    const contact = text(answers, "contactDate") || null;
    const navigator = text(answers, "navigator");
    if (id) {
      const old = await editable(client, user, id, revision!);
      if (old.status === "archived") throw new WorkflowError("Restore the archived record before editing.", "invalid");
      const fields = Object.keys(answers).filter((key) => JSON.stringify(old.answers[key]) !== JSON.stringify(answers[key]));
      const status = "draft";
      if (old.status !== status) fields.push("status");
      await client.query(
        `UPDATE submissions SET answers=$1, participant_name=$2,date_of_birth=$3,program_type=$4,contact_date=$5,
         navigator_name=$6,status=$7,revision=revision+1,updated_by=$8,updated_at=now() WHERE id=$9`,
        [JSON.stringify(answers), name, dob, program, contact, navigator, status, user.id, id],
      );
      await audit(client, user, "save_draft", id, fields, old.revision + 1);
      await snapshot(client, id);
      return id;
    }
    const participant = randomUUID(), enrollment = randomUUID(), submission = randomUUID();
    await client.query("INSERT INTO participants(id,group_id) VALUES ($1,$2)", [participant, user.group_id]);
    await client.query("INSERT INTO enrollments(id,participant_id) VALUES ($1,$2)", [enrollment, participant]);
    await client.query(
      `INSERT INTO submissions(id,enrollment_id,group_id,status,answers,participant_name,date_of_birth,program_type,contact_date,navigator_name,created_by,updated_by)
       VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$10)`,
      [submission, enrollment, user.group_id, JSON.stringify(answers), name, dob, program, contact, navigator, user.id],
    );
    await audit(client, user, "create_draft", submission, Object.keys(answers).filter((key) => answers[key].length > 0), 1);
    await snapshot(client, submission);
    return submission;
  });
}
export async function changeArchive(user: User, id: string, revision: number, restore: boolean) {
  if (!z.uuid().safeParse(id).success || !Number.isInteger(revision) || revision < 1) throw new WorkflowError("Invalid record or revision.", "invalid");
  await transaction(async (client) => {
    const row = await editable(client, user, id, revision);
    if (restore ? row.status !== "archived" : row.status !== "submitted") {
      throw new WorkflowError(restore ? "Only archived submissions can be restored." : "Only submitted forms can be archived.", "invalid");
    }
    await client.query("UPDATE submissions SET status=$1,archived_at=CASE WHEN $2 THEN NULL ELSE now() END,revision=revision+1,updated_by=$3,updated_at=now() WHERE id=$4",
      [restore ? "submitted" : "archived", restore, user.id, id]);
    await audit(client, user, restore ? "restore" : "archive", id, ["status"], row.revision + 1);
    await snapshot(client, id);
  });
}
export async function getSubmission(user: User, id: string): Promise<Submission | null> {
  if (!z.uuid().safeParse(id).success) return null;
  return transaction(async (client) => {
    const result = await client.query<Submission>(`SELECT ${selectColumns} FROM submissions s WHERE s.id=$1 AND ($2 OR s.group_id=$3)`, [id, user.role === "admin", user.group_id]);
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
  if (search.q) add("(s.participant_name ILIKE ? OR s.enrollment_id::text ILIKE ?)", escaped(search.q));
  if (search.status === "active") clauses.push("s.status<>'archived'");
  else if (search.status !== "all") add("s.status=?", search.status);
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
    const records = await client.query<Submission>(
      `SELECT ${selectColumns} FROM submissions s WHERE ${where} ORDER BY ${order} LIMIT 20 OFFSET $${values.length + 1}`,
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
     WHERE s.id=$1 AND ($2 OR s.group_id=$3) ORDER BY a.occurred_at DESC,a.id DESC LIMIT 100`,
    [id, user.role === "admin", user.group_id],
  );
  return result.rows;
}
export async function getRevisions(user: User, id: string): Promise<FormRevision[]> {
  const result = await database().query<FormRevision>(
    `SELECT r.revision,r.answers,r.status,r.recorded_at,u.display_name
     FROM form_revisions r JOIN app_users u ON u.id=r.actor_id JOIN submissions s ON s.id=r.submission_id
     WHERE s.id=$1 AND ($2 OR s.group_id=$3) ORDER BY r.revision DESC LIMIT 20`,
    [id, user.role === "admin", user.group_id],
  );
  return result.rows;
}
