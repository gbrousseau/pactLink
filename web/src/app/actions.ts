"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSession, destroySession, requireUser } from "@/lib/auth";
import { demoAccessEnabled, WorkflowError } from "@/lib/access";
import { parseFormAnswers, validateAnswers, type Answers, type FieldErrors } from "@/lib/intake-validation";
import { changeArchive, decideReview, requestReview, saveSubmission } from "@/lib/submissions";
import { importIntakes, MAX_IMPORT_BYTES, parseIntakeImport, type ImportIssue } from "@/lib/intake-import";
import { changeImportedRemoval, importHashState, undoImportBatch } from "@/lib/import-removal";
import { changePrototypeRemoval, createPrototypeExport } from "@/lib/redcap-prototype";

export type FormState = { message?: string; errors?: FieldErrors; answers?: Answers };
export type ActionState = { error?: string };
export type ImportState = {
  error?: string; hash?: string; total?: number; valid?: number; mockDob?: number;
  issues?: ImportIssue[]; imported?: number;
  previous?: { batches: number; active: number };
};
function safeError(error: unknown) {
  if (error instanceof WorkflowError) return error.message;
  const incident = crypto.randomUUID();
  console.error("Workflow operation failed", { incident, category: error instanceof Error ? error.name : "unknown" });
  return `The operation failed. Your changes were not saved. Reference: ${incident}. Please retry or contact support.`;
}
export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  if (!demoAccessEnabled()) return { error: "Demo login is disabled. Enable the explicit development or hosted demo configuration." };
  const account = z.enum(["north-editor", "north-viewer", "north-reviewer", "south-editor", "south-reviewer", "demo-admin"]).safeParse(form.get("account"));
  if (!account.success) return { error: "Select a valid development account." };
  try { await createSession(account.data); }
  catch (error) { return { error: safeError(error) }; }
  redirect("/dashboard");
}
export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
export async function saveIntakeAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  let answers: Answers;
  try { answers = parseFormAnswers(form); }
  catch { return { message: "Invalid form input. File uploads are not supported." }; }
  const intent = z.literal("draft").safeParse(form.get("intent"));
  if (!intent.success) return { message: "This workflow only saves drafts. Form completion is not available.", answers };
  const errors = validateAnswers(answers, false);
  if (Object.keys(errors).length) return { message: "Please correct the highlighted fields. Nothing has been saved.", errors, answers };
  const id = form.get("id");
  if (id !== null && typeof id !== "string") return { message: "Invalid record identifier.", answers };
  let saved: string;
  try {
    saved = await saveSubmission(user, answers, id || undefined, id ? Number(form.get("revision")) : undefined);
  } catch (error) { return { message: safeError(error), answers }; }
  revalidatePath("/forms");
  redirect(`/forms/${saved}?saved=1`);
}
export async function archiveAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z.object({
    id: z.uuid(), revision: z.coerce.number().int().positive(), intent: z.enum(["archive", "restore"]),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Invalid archive request." };
  try { await changeArchive(user, parsed.data.id, parsed.data.revision, parsed.data.intent === "restore"); }
  catch (error) { return { error: safeError(error) }; }
  revalidatePath("/forms");
  revalidatePath(`/forms/${parsed.data.id}`);
  redirect(`/forms/${parsed.data.id}?saved=1`);
}
export async function reviewAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z.object({
    id: z.uuid(), revision: z.coerce.number().int().positive(),
    intent: z.enum(["request", "approve", "return"]),
    reason: z.string().max(2000).optional(),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Invalid review request." };
  try {
    if (parsed.data.intent === "request") await requestReview(user, parsed.data.id, parsed.data.revision);
    else await decideReview(user, parsed.data.id, parsed.data.revision, parsed.data.intent, parsed.data.reason ?? "");
  } catch (error) { return { error: safeError(error) }; }
  revalidatePath("/forms");
  revalidatePath(`/forms/${parsed.data.id}`);
  redirect(`/forms/${parsed.data.id}?saved=1`);
}
export async function importIntakesAction(form: FormData): Promise<ImportState> {
  const user = await requireUser();
  if (user.role !== "admin") return { error: "Only administrators can import intakes." };
  const file = form.get("file");
  const group = form.get("group");
  const intent = form.get("intent");
  if (!(file instanceof File) || !file.size || file.size > MAX_IMPORT_BYTES || typeof group !== "string" || !group) {
    return { error: "Select a group and a nonempty UTF-8 CSV/TSV file no larger than 4 MiB." };
  }
  try {
    const parsed = parseIntakeImport(new Uint8Array(await file.arrayBuffer()));
    const previous = await importHashState(user, parsed.hash);
    const summary = { hash: parsed.hash, total: parsed.total, valid: parsed.rows.length, previous,
      mockDob: parsed.rows.filter((row) => !row.dob).length, issues: parsed.issues };
    if (intent === "preview") return summary;
    if (intent !== "import" || form.get("previewHash") !== parsed.hash || form.get("confirmed") !== "yes") {
      return { error: "Preview the selected file and confirm the synthetic-data and placeholder warning before importing." };
    }
    await importIntakes(user, group, parsed, form.get("confirmReimport") === "yes");
    revalidatePath("/forms");
    return { ...summary, imported: parsed.rows.length };
  } catch (error) {
    return { error: safeError(error) };
  }
}
export async function undoImportAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z.object({ batch: z.uuid(), token: z.string().regex(/^[a-f0-9]{64}$/), reason: z.string().trim().min(1).max(2000), confirm: z.literal("yes") }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Provide a reason and confirm the batch undo." };
  try { await undoImportBatch(user, parsed.data.batch, parsed.data.token, parsed.data.reason); }
  catch (error) { return { error: safeError(error) }; }
  revalidatePath("/forms");
  redirect(`/forms/import/batches/${parsed.data.batch}?saved=1`);
}
export async function importedRemovalAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z.object({ id: z.uuid(), revision: z.coerce.number().int().positive(), action: z.enum(["duplicate", "restore"]),
    reason: z.string().trim().min(1).max(2000), target: z.string().optional(), confirm: z.literal("yes") }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Provide a valid reason and confirm the action." };
  try { await changeImportedRemoval(user, parsed.data.id, parsed.data.revision, parsed.data.action, parsed.data.reason, parsed.data.target); }
  catch (error) { return { error: safeError(error) }; }
  revalidatePath("/forms");
  redirect(`/forms/${parsed.data.id}?saved=1`);
}
export async function redcapPrototypeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = z.uuid().safeParse(form.get("submissionId"));
  const version = z.coerce.number().int().positive().safeParse(form.get("approvedVersion"));
  if (!id.success || !version.success) return { error: "Invalid intake or approved version." };
  try { await createPrototypeExport(user, id.data, version.data, form); }
  catch (error) { return { error: safeError(error) }; }
  revalidatePath(`/forms/${id.data}`);
  redirect(`/forms/${id.data}?saved=1`);
}
export async function redcapRemovalAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z.object({ id: z.uuid(), exportId: z.uuid(), action: z.enum(["remove", "restore"]) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Invalid file removal request." };
  try { await changePrototypeRemoval(user, parsed.data.id, parsed.data.exportId, parsed.data.action === "restore"); }
  catch (error) { return { error: safeError(error) }; }
  revalidatePath(`/forms/${parsed.data.id}`);
  redirect(`/forms/${parsed.data.id}?saved=1`);
}
