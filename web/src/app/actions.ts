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
import { consentDocument, parseConsent, submitConsent } from "@/lib/consent";
import { parseScreeningForm, reviewScreeningServices, saveScreeningServices } from "@/lib/screening-services";
import { parseCompletionForm } from "@/lib/program-completion-schema";
import { reviewProgramCompletion, saveProgramCompletion } from "@/lib/program-completion";
import { markCaseNotificationsRead, parseCaseFile, parseCasePhoto, publishCaseFile, saveCaseFile } from "@/lib/case-file";
import { saveNavigator } from "@/lib/navigators";

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
  const account = z.string().min(1).max(100).safeParse(form.get("account"));
  if (!account.success) return { error: "Select a valid development account." };
  try { await createSession(account.data); }
  catch (error) { return { error: safeError(error) }; }
  redirect("/dashboard");
}
export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
export async function consentAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = form.get("id");
  if (id !== null && typeof id !== "string") return { error: "Invalid record identifier." };
  let saved: string;
  try {
    const input = parseConsent(form);
    const document = await consentDocument(form);
    saved = await submitConsent(user, input, document, id || undefined, id ? Number(form.get("revision")) : undefined);
  } catch (error) { return { error: safeError(error) }; }
  revalidatePath("/forms");
  redirect(`/forms/${saved}?saved=1`);
}
export async function caseFileAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = form.get("id");
  if (id !== null && typeof id !== "string") return { error: "Invalid record identifier." };
  const version = id ? z.string().regex(/^(0|[1-9]\d*)$/).transform(Number).pipe(z.number().int().safe()).safeParse(form.get("version")) : null;
  if (id && !version?.success) return { error: "Invalid Case File version." };
  const group = !id ? z.string().min(1).max(100).safeParse(form.get("groupId")) : null;
  if (!id && !group?.success) return { error: "Select an available group." };
  let saved: string;
  try {
    saved = await saveCaseFile(user, parseCaseFile(form), await parseCasePhoto(form), id || undefined,
      version?.success ? version.data : undefined, group?.success ? group.data : undefined);
  } catch (error) { return { error: safeError(error) }; }
  revalidatePath("/forms");
  revalidatePath(`/forms/${saved}`);
  redirect(`/forms/${saved}?saved=1`);
}
export async function publishCaseFileAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z.object({ id: z.uuid(), version: z.coerce.number().int().positive() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Invalid Case File version." };
  try { await publishCaseFile(user, parsed.data.id, parsed.data.version); }
  catch (error) { return { error: safeError(error) }; }
  revalidatePath(`/forms/${parsed.data.id}`);
  redirect(`/forms/${parsed.data.id}/case-file?submitted=1`);
}
export async function markCaseNotificationsReadAction(id: string, version: number) {
  const user = await requireUser();
  await markCaseNotificationsRead(user, id, version);
  revalidatePath("/forms", "layout");
  revalidatePath("/dashboard");
}
export async function navigatorAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const rawId = form.get("id");
  if (rawId !== null && typeof rawId !== "string") return { error: "Invalid navigator." };
  try {
    await saveNavigator(user, { displayName: form.get("displayName"), groupId: form.get("groupId"),
      email: form.get("email"), phone: form.get("phone"), active: form.get("active") === "yes" }, rawId || undefined);
  } catch (error) { return { error: safeError(error) }; }
  revalidatePath("/forms/users");
  redirect("/forms/users?saved=1");
}
export async function screeningServicesAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = z.uuid().safeParse(form.get("id"));
  const revision = z.union([z.literal(""), z.coerce.number().int().positive()]).safeParse(form.get("revision") ?? "");
  const intent = z.enum(["draft", "request"]).safeParse(form.get("intent"));
  if (!id.success || !revision.success || !intent.success) return { error: "Invalid Screening and Services request." };
  try {
    const answers = await parseScreeningForm(form);
    await saveScreeningServices(user, id.data, revision.data || undefined, answers, intent.data === "request");
  } catch (error) { return { error: safeError(error) }; }
  revalidatePath("/forms");
  revalidatePath(`/forms/${id.data}`);
  revalidatePath(`/forms/${id.data}/screening`);
  redirect(`/forms/${id.data}?saved=1`);
}
export async function screeningServicesReviewAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z.object({
    id: z.uuid(), revision: z.coerce.number().int().positive(),
    intent: z.enum(["approve", "return"]), reason: z.string().max(2000).optional(),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Invalid Screening and Services review." };
  try { await reviewScreeningServices(user, parsed.data.id, parsed.data.revision, parsed.data.intent, parsed.data.reason ?? ""); }
  catch (error) { return { error: safeError(error) }; }
  revalidatePath("/forms");
  revalidatePath(`/forms/${parsed.data.id}`);
  revalidatePath(`/forms/${parsed.data.id}/screening`);
  redirect(`/forms/${parsed.data.id}?saved=1`);
}
export async function saveProgramCompletionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = z.uuid().safeParse(form.get("id"));
  const revision = z.union([z.literal(""), z.coerce.number().int().positive()]).safeParse(form.get("revision") ?? "");
  if (!id.success || !revision.success) return { error: "Invalid Program Completion request." };
  try { await saveProgramCompletion(user, id.data, revision.data || undefined, parseCompletionForm(form)); }
  catch (error) { return { error: safeError(error) }; }
  revalidatePath(`/forms/${id.data}`);
  redirect(`/forms/${id.data}/completion?saved=1`);
}
export async function reviewProgramCompletionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z.object({
    id: z.uuid(), revision: z.coerce.number().int().positive(),
    intent: z.enum(["request", "approve", "return"]), reason: z.string().max(2000).optional(),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Invalid Program Completion review request." };
  try { await reviewProgramCompletion(user, parsed.data.id, parsed.data.revision, parsed.data.intent, parsed.data.reason ?? ""); }
  catch (error) { return { error: safeError(error) }; }
  revalidatePath(`/forms/${parsed.data.id}`);
  redirect(`/forms/${parsed.data.id}/completion?saved=1`);
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
  if (user.role !== "admin") return { error: "Only administrators can import referrals." };
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
  if (!id.success || !version.success) return { error: "Invalid referral or approved version." };
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
