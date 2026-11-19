"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSession, destroySession, requireUser } from "@/lib/auth";
import { developmentEnabled, WorkflowError } from "@/lib/access";
import { parseFormAnswers, validateAnswers, type Answers, type FieldErrors } from "@/lib/intake-validation";
import { changeArchive, saveSubmission } from "@/lib/submissions";

export type FormState = { message?: string; errors?: FieldErrors; answers?: Answers };
export type ActionState = { error?: string };
function safeError(error: unknown) {
  if (error instanceof WorkflowError) return error.message;
  const incident = crypto.randomUUID();
  console.error("Workflow operation failed", { incident, category: error instanceof Error ? error.name : "unknown" });
  return `The operation failed. Your changes were not saved. Reference: ${incident}. Please retry or contact support.`;
}
export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  if (!developmentEnabled()) return { error: "Development login is disabled. This prototype cannot run in production." };
  const account = z.enum(["north-editor", "north-viewer", "south-editor", "demo-admin"]).safeParse(form.get("account"));
  if (!account.success) return { error: "Select a valid development account." };
  try { await createSession(account.data); }
  catch (error) { return { error: safeError(error) }; }
  redirect("/forms");
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
