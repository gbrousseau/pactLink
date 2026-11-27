import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { saveSubmission as saveIntake, createDraft, getSubmission, listSubmissions, getAudit, getRevisions, getApprovedVersions, getReviewDecisions, requestReview, decideReview, changeArchive, searchSchema } from "../src/lib/submissions";
import { database, transaction } from "../src/lib/db";
import { consentDocument, downloadConsent, listConsent, parseConsent, submitConsent, type ConsentInput } from "../src/lib/consent";
import type { User } from "../src/lib/access";
import type { Answers } from "../src/lib/intake-validation";
import { intakeFields, otherOption } from "../src/lib/intake-fields";
import { getImportSource, importIntakes, parseIntakeImport } from "../src/lib/intake-import";
import { changeImportedRemoval, eligibleForBatchUndo, getBatchPreview, getRemovalHistory, importHashState, undoImportBatch } from "../src/lib/import-removal";
import { changePrototypeRemoval, createPrototypeExport, downloadPrototype, getPrototypeSources, listPrototypeExports } from "../src/lib/redcap-prototype";
import { loadRedcapCodebook } from "../src/lib/redcap-codebook";
import { caseFileSchema, downloadCaseFilePdf, downloadCasePhoto, getCaseFile, listCaseNotifications, markCaseNotificationsRead, parseCaseFile, parseCasePhoto, publishCaseFile, saveCaseFile } from "../src/lib/case-file";
import { consentInitialValues } from "../src/lib/consent-prefill";
import { listNavigators, saveNavigator } from "../src/lib/navigators";
import {
  getScreeningServices, getScreeningServiceApprovals, parseScreeningForm, reviewScreeningServices,
  saveScreeningServices, screeningServicesSchema,
} from "../src/lib/screening-services";
import { getProgramCompletion, getCompletionApprovals, getCompletionDecisions, reviewProgramCompletion, saveProgramCompletion } from "../src/lib/program-completion";

const integration = process.env.TEST_DATABASE_ADMIN_URL;
const suite = integration ? describe : describe.skip;
const north: User = { id: "north-editor", display_name: "North", role: "editor", group_id: "north", group_name: "North" };
const south: User = { ...north, id: "south-editor", group_id: "south" };
const viewer: User = { ...north, id: "north-viewer", role: "viewer" };
const admin: User = { ...north, id: "demo-admin", role: "admin" };
const reviewer: User = { ...north, id: "north-reviewer", role: "reviewer" };
const southReviewer: User = { ...south, id: "south-reviewer", role: "reviewer" };
const answers: Answers = { name: "Synthetic Test Record", dob: "1990-01-01", programType: "Law Enforcement Deflection", date: "2026-01-01", navigator: "Demo Navigator" };
function completeAnswers(): Answers {
  const result: Answers = {};
  for (const field of intakeFields) {
    if (field.when) continue;
    result[field.key] = field.type === "multi" ? [field.options![0]] :
      field.type === "single" ? field.options![0] : field.type === "date" ? "2000-01-01" :
        field.type === "tel" ? "503-555-0100" : "Synthetic answer";
    if (otherOption(field) && (Array.isArray(result[field.key]) ? result[field.key].includes(otherOption(field)!) : result[field.key] === otherOption(field))) {
      result[`${field.key}Other`] = "Synthetic other";
    }
  }
  result.dob = "1990-01-01";
  result.name = "Synthetic Test Record";
  result.qualified = "Yes";
  return result;
}
let management: Pool;
let testName: string;
const consent: ConsentInput = { firstName: "Synthetic", middleName: "", lastName: "Person", dob: "1990-01-01", address: "123 Example Street", phone: "503-555-0100", email: "synthetic@example.test", emergencyName: "", emergencyPhone: "", reviewNote: "Reviewer context", agreed: "yes", signed: "yes" };
describe("Synthetic consent validation", () => {
  it("requires identity and both confirmations, but not a PDF or optional contacts", async () => {
    const form = new FormData();
    for (const [key, value] of Object.entries(consent)) form.set(key, value);
    expect(parseConsent(form)).toEqual(consent);
    form.delete("reviewNote");
    expect(parseConsent(form).reviewNote).toBe("");
    expect(await consentDocument(form)).toBeNull();
    form.set("document", new File([], "undefined", { type: "application/octet-stream" }));
    expect(await consentDocument(form)).toBeNull();
    form.set("document", new File([], "empty.pdf", { type: "application/pdf" }));
    await expect(consentDocument(form)).rejects.toThrow("nonempty PDF");
    for (const key of ["firstName", "lastName", "dob", "address", "phone", "email", "agreed", "signed"]) {
      const invalid = new FormData();
      for (const [name, value] of Object.entries(consent)) if (name !== key) invalid.set(name, value);
      expect(() => parseConsent(invalid)).toThrow();
    }
    form.set("document", new File(["not a PDF"], "example.pdf", { type: "application/pdf" }));
    await expect(consentDocument(form)).rejects.toThrow("PDF");
    form.set("document", new File(["%PDF-1.4\n%%EOF"], "example.pdf", { type: "application/pdf" }));
    expect((await consentDocument(form))?.toString()).toContain("%PDF-");
    form.set("document", new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.pdf", { type: "application/pdf" }));
    await expect(consentDocument(form)).rejects.toThrow("4 MiB");
  });
});
async function saveSubmission(user: User, value: Answers, id?: string, revision?: number) {
  if (id) return saveIntake(user, value, id, revision);
  if (user.role !== "editor" && user.role !== "admin") return saveIntake(user, value);
  return transaction(async (client) => {
    const created = await createDraft(client, user, user.group_id, value);
    await client.query(`INSERT INTO consent_versions(submission_id,version,first_name,middle_name,last_name,date_of_birth,address,phone,email,emergency_name,emergency_phone,agreed_to_share,signed_attested,created_by)
      VALUES ($1,1,'Synthetic','','Person','1990-01-01','Example','503-555-0100','synthetic@example.test','','',true,true,$2)`, [created, user.id]);
    return created;
  });
}
async function seedSubmitted(user: User, value: Answers = answers) {
  const id = await saveSubmission(user, value);
  await database().query(
    "UPDATE submissions SET status='submitted',revision=2,updated_at=now() WHERE id=$1",
    [id],
  );
  await database().query(
    "INSERT INTO audit_events(actor_id,action,submission_id,changed_fields,revision) VALUES ($1,'test_seed_submit',$2,ARRAY['status'],2)",
    [user.id, id],
  );
  await database().query(
    "INSERT INTO form_revisions(submission_id,revision,answers,status,actor_id) VALUES ($1,2,$2,'submitted',$3)",
    [id, JSON.stringify(value), user.id],
  );
  return id;
}
suite("PostgreSQL workflow (isolated temporary database)", () => {
  beforeAll(async () => {
    management = new Pool({ connectionString: integration });
    testName = `intake_test_${randomUUID().replaceAll("-", "")}`;
    await management.query(`CREATE DATABASE "${testName}"`);
    const url = new URL(integration!); url.pathname = `/${testName}`;
    process.env.DATABASE_URL = url.toString();
    await database().query(await readFile(new URL("../db/001-initial.sql", import.meta.url), "utf8"));
    await database().query(await readFile(new URL("../db/002-review-workflow.sql", import.meta.url), "utf8"));
    await database().query(await readFile(new URL("../db/003-intake-import.sql", import.meta.url), "utf8"));
    await database().query(await readFile(new URL("../db/004-import-removal.sql", import.meta.url), "utf8"));
    await database().query(await readFile(new URL("../db/005-redcap-prototype.sql", import.meta.url), "utf8"));
    await database().query(await readFile(new URL("../db/006-consent.sql", import.meta.url), "utf8"));
    await database().query(await readFile(new URL("../db/007-screening-services.sql", import.meta.url), "utf8"));
    await database().query(await readFile(new URL("../db/008-phase-review-notes.sql", import.meta.url), "utf8"));
    await database().query(await readFile(new URL("../db/009-program-completion.sql", import.meta.url), "utf8"));
    await database().query(await readFile(new URL("../db/010-case-file.sql", import.meta.url), "utf8"));
    await database().query(await readFile(new URL("../db/011-case-notifications.sql", import.meta.url), "utf8"));
  });
  it("saves optional case files without blocking consent, scopes access, retains photos and rejects stale edits", async () => {
    const form = new FormData();
    form.set("firstName", "Synthetic"); form.set("lastName", "Person");
    form.set("dob", "1990-01-01"); form.set("phone", "503-555-0100"); form.set("leContact", "Example Police");
    form.set("incidentSummary", "Synthetic incident"); form.set("reviewNote", "Synthetic note");
    const input = parseCaseFile(form);
    expect(consentInitialValues(undefined, input)).toMatchObject({
      firstName: "Synthetic", middleName: "", lastName: "Person", dob: "1990-01-01",
      address: "", phone: "503-555-0100", email: "",
    });
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    form.set("photo", new File([png], "synthetic.png", { type: "image/png" }));
    const photo = await parseCasePhoto(form);
    await expect(saveCaseFile(north, input, photo)).rejects.toMatchObject({ code: "forbidden" });
    const id = await saveCaseFile(admin, input, photo);
    expect((await getSubmission(north, id))?.has_consent).toBe(false);
    expect(await getCaseFile(north, id)).toBeNull();
    expect(await getCaseFile(viewer, id)).toBeNull();
    expect(await getCaseFile(south, id)).toBeNull();
    await expect(downloadCasePhoto(south, id, 1)).rejects.toMatchObject({ code: "missing" });
    await expect(downloadCasePhoto(north, id, 1)).rejects.toMatchObject({ code: "missing" });
    await expect(saveCaseFile(viewer, input, null, id, 1)).rejects.toMatchObject({ code: "forbidden" });
    await expect(publishCaseFile(north, id, 1)).rejects.toMatchObject({ code: "forbidden" });
    expect(await publishCaseFile(admin, id, 1)).toBe(1);
    expect((await getCaseFile(north, id))?.answers).toMatchObject({ firstName: "Synthetic", leContact: "Example Police" });
    expect(await getCaseFile(viewer, id)).toBeNull();
    expect(await getCaseFile(reviewer, id)).toBeNull();
    await expect(downloadCasePhoto(reviewer, id, 1)).rejects.toMatchObject({ code: "missing" });
    expect((await downloadCasePhoto(north, id, 1)).bytes).toEqual(png);
    expect(await listCaseNotifications(north)).toHaveLength(1);
    expect(await listCaseNotifications(south)).toHaveLength(0);
    await saveCaseFile(admin, { ...input, incidentSummary: "Updated" }, null, id, 1);
    expect((await getCaseFile(north, id))?.answers.incidentSummary).toBe("Synthetic incident");
    await expect(downloadCasePhoto(north, id, 2)).rejects.toMatchObject({ code: "missing" });
    await expect(saveCaseFile(admin, input, null, id, 1)).rejects.toMatchObject({ code: "conflict" });
    await expect(publishCaseFile(admin, id, 1)).rejects.toMatchObject({ code: "conflict" });
    await publishCaseFile(admin, id, 2);
    expect((await downloadCasePhoto(north, id, 2)).bytes).toEqual(png);
    expect(await listCaseNotifications(north)).toHaveLength(2);
    await markCaseNotificationsRead(north, id, 1);
    expect((await listCaseNotifications(north)).map((item) => item.version)).toEqual([2]);
    await markCaseNotificationsRead(north, id, 2);
    expect(await listCaseNotifications(north)).toHaveLength(0);
    await markCaseNotificationsRead(north, id, 2);
    await database().query("UPDATE submissions SET legal_hold=true WHERE id=$1", [id]);
    await expect(saveCaseFile(admin, input, null, id, 2)).rejects.toMatchObject({ code: "invalid" });
    await database().query("UPDATE submissions SET legal_hold=false WHERE id=$1", [id]);
    await expect(database().query("UPDATE case_file_versions SET answers='{}' WHERE submission_id=$1", [id])).rejects.toThrow();
    await submitConsent(north, consent, null, id, 1);
    expect((await getSubmission(north, id))?.has_consent).toBe(true);
    expect(consentInitialValues((await listConsent(north, id))[0], { ...input, firstName: "Changed" }).firstName).toBe("Synthetic");
    expect((await getCaseFile(admin, id))?.version).toBe(2);
    const events = await getAudit(admin, id);
    expect(events.some((event) => event.action === "case_file_save" && event.changed_fields.includes("incidentSummary"))).toBe(true);
    expect(events.some((event) => event.action === "case_file_photo_download")).toBe(true);
    expect(events.some((event) => event.action === "case_file_publish")).toBe(true);
  });
  it("allows only administrators to manage navigator profiles", async () => {
    const profile = { displayName: "Synthetic Navigator", groupId: "south", email: "synthetic@example.test", phone: "503-555-0100", active: true };
    await expect(saveNavigator(north, profile)).rejects.toMatchObject({ code: "forbidden" });
    const id = await saveNavigator(admin, profile);
    expect((await listNavigators(admin)).find((item) => item.id === id)).toMatchObject({ group_id: "south", active: true });
    await saveNavigator(admin, { ...profile, active: false }, id);
    expect((await listNavigators(admin)).find((item) => item.id === id)?.active).toBe(false);
    await expect(saveNavigator(admin, { ...profile, groupId: "missing" }, id)).rejects.toMatchObject({ code: "invalid" });
  });
  it("exports only the visible Case File version and audits successful PDF downloads", async () => {
    const input = parseCaseFile(new FormData());
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l2sAAAAASUVORK5CYII=", "base64");
    const id = await saveCaseFile(admin, { ...input, firstName: "Synthetic" }, { bytes: png, type: "image/png" });
    await expect(downloadCaseFilePdf(north, id, 1)).rejects.toMatchObject({ code: "missing" });
    await expect(downloadCaseFilePdf(viewer, id, 1)).rejects.toMatchObject({ code: "missing" });
    expect(Buffer.from(await downloadCaseFilePdf(admin, id, 1)).subarray(0, 5).toString()).toBe("%PDF-");
    await publishCaseFile(admin, id, 1);
    const navigatorPdf = await downloadCaseFilePdf(north, id, 1);
    const resources = (await PDFDocument.load(navigatorPdf)).getPage(0).node.Resources();
    if (!resources) throw new Error("Missing PDF resources.");
    expect(resources.lookup(PDFName.of("XObject"), PDFDict).keys().length).toBeGreaterThan(0);
    await expect(downloadCaseFilePdf(south, id, 1)).rejects.toMatchObject({ code: "missing" });
    await expect(downloadCaseFilePdf(reviewer, id, 1)).rejects.toMatchObject({ code: "missing" });
    await saveCaseFile(admin, { ...input, firstName: "Updated" }, null, id, 1);
    await expect(downloadCaseFilePdf(admin, id, 1)).rejects.toMatchObject({ code: "conflict" });
    expect(Buffer.from(await downloadCaseFilePdf(north, id, 1)).subarray(0, 5).toString()).toBe("%PDF-");
    await publishCaseFile(admin, id, 2);
    await expect(downloadCaseFilePdf(north, id, 1)).rejects.toMatchObject({ code: "conflict" });
    await markCaseNotificationsRead(north, id, 2);
    const events = (await getAudit(admin, id)).filter((event) => event.action === "case_file_pdf_export");
    expect(events).toHaveLength(3);
    expect(events.map((event) => event.revision)).toEqual([1, 1, 1]);
  });
  it("does not audit a PDF export when the stored photo cannot be rendered", async () => {
    const input = parseCaseFile(new FormData());
    const photo = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    const id = await saveCaseFile(admin, input, { bytes: photo, type: "image/png" });
    await expect(downloadCaseFilePdf(admin, id, 1)).rejects.toMatchObject({ code: "invalid" });
    expect((await getAudit(admin, id)).some((event) => event.action === "case_file_pdf_export")).toBe(false);
  });
  it("notifies each active same-group navigator separately and records disabled delivery", async () => {
    const profile = { displayName: "Synthetic Second Navigator", groupId: "north", email: "synthetic@example.test", phone: "503-555-0100", active: true };
    const otherId = await saveNavigator(admin, profile);
    const other: User = { ...north, id: otherId };
    try {
      const input = parseCaseFile(new FormData());
      const id = await saveCaseFile(admin, input, null);
      expect(await publishCaseFile(admin, id, 1)).toBe(2);
      expect(await listCaseNotifications(north)).toHaveLength(1);
      expect(await listCaseNotifications(other)).toHaveLength(1);
      const delivery = await database().query<{ email_status: string; sms_status: string }>(
        "SELECT email_status,sms_status FROM case_file_notifications WHERE submission_id=$1 AND recipient_id=$2", [id, otherId]);
      expect(delivery.rows[0]).toEqual({ email_status: "disabled", sms_status: "disabled" });
      const missing = await database().query<{ email_status: string; sms_status: string }>(
        "SELECT email_status,sms_status FROM case_file_notifications WHERE submission_id=$1 AND recipient_id=$2", [id, north.id]);
      expect(missing.rows[0]).toEqual({ email_status: "missing_contact", sms_status: "missing_contact" });
      await markCaseNotificationsRead(other, id, 1);
      expect(await listCaseNotifications(other)).toHaveLength(0);
      expect(await listCaseNotifications(north)).toHaveLength(1);
      await markCaseNotificationsRead(north, id, 1);
      await expect(publishCaseFile(admin, id, 1)).rejects.toMatchObject({ code: "conflict" });
    } finally {
      await saveNavigator(admin, { ...profile, active: false }, otherId);
    }
  });
  it("validates optional case fields and image types", async () => {
    const empty = new FormData();
    expect(caseFileSchema.safeParse(parseCaseFile(empty)).success).toBe(true);
    expect(await parseCasePhoto(empty)).toBeNull();
    empty.set("dob", "invalid");
    expect(() => parseCaseFile(empty)).toThrow();
    empty.delete("dob");
    empty.set("appearanceDate", "2026-11-12");
    expect(() => parseCaseFile(empty)).toThrow();
    empty.set("appearanceTime", "09:00");
    expect(parseCaseFile(empty)).toMatchObject({ appearanceDate: "2026-11-12", appearanceTime: "09:00" });
    empty.set("photo", new File(["not an image"], "photo.png", { type: "image/png" }));
    await expect(parseCasePhoto(empty)).rejects.toThrow("format");
    empty.set("photo", new File(["data"], "photo.svg", { type: "image/svg+xml" }));
    await expect(parseCasePhoto(empty)).rejects.toThrow("JPEG or PNG");
  });
  it("gates Program Completion, preserves reviewed outcomes and notes, and enforces separated review", async () => {
    const id = await saveSubmission(north, { ...completeAnswers(), navigator: "Completion Queue Test" });
    await expect(saveProgramCompletion(north, id, undefined, {})).rejects.toMatchObject({ code: "invalid" });
    await requestReview(north, id, 1);
    await decideReview(reviewer, id, 2, "approve");
    await expect(saveProgramCompletion(north, id, undefined, {})).rejects.toMatchObject({ code: "invalid" });
    await saveScreeningServices(north, id, undefined, {});
    await reviewScreeningServices(north, id, 1, "request");
    await reviewScreeningServices(reviewer, id, 2, "approve");
    const outcome = { completed: "No", nonCompletionReasons: ["Voluntarily left program"], housing: ["Living in a tent"], reviewNote: "Synthetic reviewer note" };
    await expect(saveProgramCompletion(viewer, id, undefined, outcome)).rejects.toMatchObject({ code: "forbidden" });
    await expect(saveProgramCompletion(south, id, undefined, outcome)).rejects.toMatchObject({ code: "missing" });
    await expect(saveProgramCompletion(north, id, undefined, outcome)).resolves.toBe(1);
    expect(await getProgramCompletion(south, id)).toBeNull();
    expect((await getProgramCompletion(viewer, id))?.answers).toMatchObject(outcome);
    await expect(saveProgramCompletion(north, id, undefined, outcome)).rejects.toMatchObject({ code: "conflict" });
    await reviewProgramCompletion(north, id, 1, "request");
    const queue = searchSchema.parse({ status: "pending_review", navigator: "Completion Queue Test" });
    expect((await listSubmissions(reviewer, queue)).records[0]).toMatchObject({ id, completion_review_state: "pending_review" });
    await expect(reviewProgramCompletion(admin, id, 1, "approve")).rejects.toMatchObject({ code: "conflict" });
    await expect(reviewProgramCompletion(north, id, 2, "approve")).rejects.toMatchObject({ code: "forbidden" });
    await reviewProgramCompletion(reviewer, id, 2, "return", "Clarify outcome");
    expect((await listSubmissions(reviewer, queue)).total).toBe(0);
    expect((await getCompletionDecisions(north, id))[0]).toMatchObject({ decision: "returned", reason: "Clarify outcome" });
    await saveProgramCompletion(north, id, 3, outcome);
    await reviewProgramCompletion(north, id, 4, "request");
    await reviewProgramCompletion(reviewer, id, 5, "approve");
    expect((await getCompletionApprovals(viewer, id))[0].answers).toMatchObject(outcome);
    expect((await getProgramCompletion(viewer, id))?.review_state).toBe("approved");
    await saveIntake(north, completeAnswers(), id, 3);
    await expect(saveScreeningServices(north, id, 3, {})).rejects.toMatchObject({ code: "invalid" });
    await expect(saveProgramCompletion(north, id, 6, {})).rejects.toMatchObject({ code: "invalid" });
    await requestReview(north, id, 4);
    await decideReview(reviewer, id, 5, "approve");
    expect((await getScreeningServices(north, id))?.review_state).toBe("approved");
    expect((await getProgramCompletion(north, id))?.review_state).toBe("approved");
    await saveScreeningServices(north, id, 3, {});
    await expect(saveProgramCompletion(north, id, 6, {})).rejects.toMatchObject({ code: "invalid" });
    await reviewScreeningServices(north, id, 4, "request");
    await reviewScreeningServices(reviewer, id, 5, "approve");
    expect((await getProgramCompletion(north, id))?.review_state).toBe("approved");
    expect((await getCompletionApprovals(viewer, id))[0].answers).toMatchObject(outcome);
    await saveProgramCompletion(north, id, 6, { completed: "Yes" });
    expect((await getCompletionApprovals(north, id))[0].answers.completed).toBe("No");
    await expect(database().query("UPDATE program_completion_approvals SET version=8 WHERE submission_id=$1", [id])).rejects.toThrow("append-only");
    expect((await getAudit(north, id)).some((entry) => entry.action === "program_completion_approved")).toBe(true);
    await reviewProgramCompletion(north, id, 7, "request");
    await saveProgramCompletion(north, id, 8, { completed: "Yes", reviewNote: "Changed after request" });
    expect((await getProgramCompletion(north, id))?.review_state).toBe("draft");
    await expect(reviewProgramCompletion(reviewer, id, 8, "approve")).rejects.toMatchObject({ code: "conflict" });
    await saveScreeningServices(north, id, 6, {});
    await expect(saveProgramCompletion(north, id, 9, {})).rejects.toMatchObject({ code: "invalid" });
    expect((await getProgramCompletion(north, id))?.answers.completed).toBe("Yes");
  });
  it("persists Phase 3 revisions, enforces separated review, and retains approved history", async () => {
    const intakeAnswers = { ...completeAnswers(), navigator: "Screening Queue Test", reviewNote: "Please review this Intake context." };
    const id = await saveSubmission(north, intakeAnswers);
    await requestReview(north, id, 1);
    await decideReview(reviewer, id, 2, "approve");
    expect((await getApprovedVersions(north, id))[0].answers.reviewNote).toBe("Please review this Intake context.");
    const answers = screeningServicesSchema.parse({
      screeningTypes: ["ASAM Criteria"], substanceDisorder: "Yes",
      reviewNote: "Please verify the services recorded.",
      substanceIdentification: ["Self-reported"], substanceTypes: ["Alcohol"],
      mentalHealthDisorder: "No", screeningsReceived: ["ASAM"],
      asamCompletionDate: "2026-01-02", asamLocation: "Example clinic",
      referralTypes: ["SUD treatment"],
      services: { "Medically managed inpatient": { statuses: ["Referred to service", "Received service"] } },
    });
    await expect(saveScreeningServices(viewer, id, undefined, answers)).rejects.toMatchObject({ code: "forbidden" });
    await expect(saveScreeningServices(north, id, undefined, answers, true)).resolves.toBe(2);
    expect((await getScreeningServices(north, id))?.answers.asamLocation).toBe("Example clinic");
    expect((await getScreeningServices(north, id))?.answers.reviewNote).toBe("Please verify the services recorded.");
    await expect(saveScreeningServices(north, id, undefined, answers)).rejects.toMatchObject({ code: "conflict" });
    const queue = searchSchema.parse({ status: "pending_review", navigator: "Screening Queue Test" });
    expect((await listSubmissions(reviewer, queue)).records[0]).toMatchObject({ id, screening_review_state: "pending_review" });
    expect((await listSubmissions(southReviewer, queue)).total).toBe(0);
    await expect(reviewScreeningServices(north, id, 2, "approve")).rejects.toMatchObject({ code: "forbidden" });
    await expect(reviewScreeningServices(reviewer, id, 2, "approve")).resolves.toBeUndefined();
    expect((await getScreeningServices(north, id))?.review_state).toBe("approved");
    expect((await listSubmissions(reviewer, queue)).total).toBe(0);
    expect((await listSubmissions(reviewer, searchSchema.parse({ navigator: "Screening Queue Test" }))).records[0]).toMatchObject({
      id, screening_review_state: "approved", completion_review_state: null,
    });
    await expect(saveProgramCompletion(north, id, undefined, { completed: "No" })).resolves.toBe(1);
    expect((await getScreeningServiceApprovals(north, id))[0]).toMatchObject({
      version: 1, revision: 2, answers, editor_ids: [north.id], approved_by: reviewer.id,
    });
    expect((await getScreeningServiceApprovals(north, id))[0].answers.reviewNote).toBe("Please verify the services recorded.");
    await saveScreeningServices(north, id, 3, screeningServicesSchema.parse({ asamLocation: "Changed synthetic location" }));
    expect((await getScreeningServices(north, id))?.review_state).toBe("draft");
    expect((await getScreeningServiceApprovals(north, id))[0].answers.asamLocation).toBe("Example clinic");
    expect((await getAudit(north, id)).some((event) => event.action === "screening_services_approved")).toBe(true);
    await expect(database().query("UPDATE screening_service_approvals SET version=8 WHERE submission_id=$1", [id])).rejects.toThrow("append-only");
  });
  it("rolls back both screening changes and review request when review auditing fails", async () => {
    const id = await saveSubmission(north, completeAnswers());
    await requestReview(north, id, 1);
    await decideReview(reviewer, id, 2, "approve");
    const saved = await saveScreeningServices(north, id, undefined, { reviewNote: "Original note" });
    await database().query(`CREATE FUNCTION fail_screening_request_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='screening_services_request_review' THEN RAISE EXCEPTION 'Simulated screening request audit failure'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER test_screening_request_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_screening_request_audit();`);
    try {
      await expect(saveScreeningServices(north, id, saved, { reviewNote: "Changed note" }, true)).rejects.toThrow("Simulated screening request audit failure");
      expect(await getScreeningServices(north, id)).toMatchObject({
        revision: saved, review_state: "draft", answers: { reviewNote: "Original note" },
      });
    } finally {
      await database().query("DROP TRIGGER test_screening_request_audit ON audit_events; DROP FUNCTION fail_screening_request_audit();");
    }
  });
  it("blocks Phase 3 until Consent and Intake approval and rejects invalid service outcomes", async () => {
    const noConsent = await transaction((client) => createDraft(client, north, "north", completeAnswers()));
    await expect(saveScreeningServices(north, noConsent, undefined, {})).rejects.toMatchObject({ code: "invalid" });
    const notApproved = await saveSubmission(north, completeAnswers());
    await expect(saveScreeningServices(north, notApproved, undefined, {})).rejects.toMatchObject({ code: "invalid" });
    const invalid = screeningServicesSchema.safeParse({
      services: { Outpatient: { statuses: ["Received service", "Referred but didn't receive"] } },
    });
    expect(invalid.success).toBe(false);
    const missingReason = screeningServicesSchema.safeParse({
      services: { Outpatient: { statuses: ["Referred to service", "Referred but didn't receive"] } },
    });
    expect(missingReason.success).toBe(false);
    const unReferred = screeningServicesSchema.safeParse({
      services: { Outpatient: { statuses: ["Received service"] } },
    });
    expect(unReferred.success).toBe(false);
    const form = new FormData();
    form.append("screeningTypes", "ASAM Criteria");
    form.append("service:Outpatient:statuses", "Referred to service");
    form.append("service:Outpatient:statuses", "Referred but didn't receive");
    form.append("service:Outpatient:reasons", "Waitlist was too long");
    expect((await parseScreeningForm(form)).services.Outpatient.reasons).toEqual(["Waitlist was too long"]);
  });
  it("creates consent first, preserves versions and approvals, and authorizes downloads", async () => {
    await expect(saveIntake(north, {})).rejects.toThrow("consent");
    await expect(submitConsent(viewer, consent, null)).rejects.toMatchObject({ code: "invalid" });
    const id = await submitConsent(north, consent, null);
    const participantId = (await getSubmission(north, id))?.participant_id;
    expect(participantId).toMatch(/^[0-9a-f-]{36}$/);
    expect((await listSubmissions(viewer, searchSchema.parse({ q: participantId }))).records.map((row) => row.id)).toContain(id);
    expect((await listSubmissions(viewer, searchSchema.parse({ q: "Synthetic Person" }))).records.map((row) => row.id)).not.toContain(id);
    expect((await listSubmissions(north, searchSchema.parse({ q: "Synthetic Person" }))).records.map((row) => row.id)).toContain(id);
    expect((await listSubmissions(admin, searchSchema.parse({ q: "Synthetic Person" }))).records.map((row) => row.id)).toContain(id);
    expect((await listConsent(north, id))[0].has_document).toBe(false);
    expect((await listConsent(north, id))[0].review_note).toBe("Reviewer context");
    expect(await listConsent(south, id)).toEqual([]);
    await expect(submitConsent(south, consent, null, id, 1)).rejects.toMatchObject({ code: "missing" });
    await saveIntake(north, completeAnswers(), id, 1);
    expect((await getSubmission(north, id))?.answers.name).toBeUndefined();
    await requestReview(north, id, 2);
    await decideReview(reviewer, id, 3, "approve");
    const pdf = Buffer.from("%PDF-1.4\nsynthetic\n%%EOF");
    await submitConsent(north, { ...consent, firstName: "Corrected" }, pdf, id, 4);
    expect((await getSubmission(north, id))?.review_state).toBe("approved");
    expect(await getApprovedVersions(north, id)).toHaveLength(1);
    expect(await listConsent(viewer, id)).toEqual([]);
    expect(await listConsent(reviewer, id)).toEqual([]);
    expect((await listConsent(admin, id)).map((item) => item.version)).toEqual([2, 1]);
    expect(await downloadConsent(north, id, 2)).toEqual(pdf);
    await expect(downloadConsent(viewer, id, 2)).rejects.toMatchObject({ code: "missing" });
    await expect(downloadConsent(south, id, 2)).rejects.toMatchObject({ code: "missing" });
    await expect(downloadConsent(viewer, id, 1)).rejects.toMatchObject({ code: "missing" });
    await expect(submitConsent(north, consent, null, id, 4)).rejects.toMatchObject({ code: "conflict" });
    await database().query("INSERT INTO app_users(id,display_name,role,group_id) VALUES ('other-north-editor','Other Editor','editor','north')");
    const otherEditor: User = { ...north, id: "other-north-editor" };
    await expect(submitConsent(otherEditor, consent, null, id, 5)).rejects.toMatchObject({ code: "forbidden" });
    await submitConsent(admin, consent, null, id, 5);
    expect(await listConsent(otherEditor, id)).toEqual([]);
    expect((await listConsent(north, id)).map((item) => item.version)).toEqual([3, 2, 1]);
    expect((await getSubmission(north, id))?.participant_id).toBe(participantId);
    const secondId = await submitConsent(north, consent, null);
    expect((await getSubmission(north, secondId))?.participant_id).not.toBe(participantId);
    await expect(database().query("UPDATE consent_versions SET first_name='forged' WHERE submission_id=$1", [id])).rejects.toThrow("append-only");
    expect((await getAudit(admin, id)).some((event) => event.action === "consent_download")).toBe(true);
  });
  it("blocks legacy intake and approval without consent and serializes consent updates", async () => {
    const id = await transaction((client) => createDraft(client, north, "north", completeAnswers()));
    expect((await getSubmission(north, id))?.participant_id).toBeNull();
    await expect(saveIntake(north, completeAnswers(), id, 1)).rejects.toThrow("consent");
    await expect(requestReview(north, id, 1)).rejects.toThrow("consent");
    const outcomes = await Promise.allSettled([submitConsent(north, consent, null, id, 1), submitConsent(north, consent, null, id, 1)]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await listConsent(north, id))).toHaveLength(1);
    expect((await getSubmission(north, id))?.answers.name).toBe("Synthetic Test Record");
    await requestReview(north, id, 2);
  });
  it("preserves historical approval but blocks new exports until consent is submitted", async () => {
    const id = await transaction((client) => createDraft(client, north, "north", completeAnswers()));
    await database().query(`INSERT INTO approved_intake_versions
      (submission_id,version,draft_revision,answers,template_version,editor_ids,requested_by,requested_at,approved_by)
      SELECT id,1,1,answers,template_version,ARRAY['north-editor'],'north-editor',now(),'north-reviewer'
      FROM submissions WHERE id=$1`, [id]);
    await database().query("UPDATE submissions SET status='submitted',review_state='approved' WHERE id=$1", [id]);
    const codebook = await loadRedcapCodebook();
    const form = new FormData();
    form.set("synthetic", "yes"); form.set("codebookHash", codebook.hash);
    form.set("screeningVersion", "none"); form.set("completionVersion", "none");
    await expect(createPrototypeExport(reviewer, id, 1, form)).rejects.toThrow("consent");
    await submitConsent(north, consent, null, id, 1);
    expect((await getApprovedVersions(north, id))[0].answers.name).toBe("Synthetic Test Record");
    expect((await getSubmission(north, id))?.review_state).toBe("approved");
    form.set("id", (await getPrototypeSources(reviewer, id)).participantId);
    await expect(createPrototypeExport(reviewer, id, 1, form)).resolves.toBeTruthy();
  });
  it("rolls back consent and its PDF if audit insertion fails", async () => {
    const id = await transaction((client) => createDraft(client, north, "north", completeAnswers()));
    await database().query(`CREATE FUNCTION fail_consent_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='consent_submit' THEN RAISE EXCEPTION 'Simulated consent audit failure'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER test_consent_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_consent_audit();`);
    try {
      await expect(submitConsent(north, consent, Buffer.from("%PDF-1.4\n%%EOF"), id, 1)).rejects.toThrow("Simulated consent audit failure");
      expect(await listConsent(north, id)).toEqual([]);
      expect((await getSubmission(north, id))?.revision).toBe(1);
    } finally {
      await database().query("DROP TRIGGER test_consent_audit ON audit_events; DROP FUNCTION fail_consent_audit();");
    }
  });
  it("restricts, preserves and audits synthetic REDCap prototype files", async () => {
    const id = await saveSubmission(north, completeAnswers());
    const codebook = await loadRedcapCodebook();
    const form = new FormData();
    form.set("synthetic", "yes"); form.set("codebookHash", codebook.hash); form.set("screeningVersion", "none"); form.set("completionVersion", "none"); form.set("race", "1");
    await expect(createPrototypeExport(reviewer, id, 1, form)).rejects.toMatchObject({ code: "conflict" });
    await requestReview(north, id, 1);
    await decideReview(reviewer, id, 2, "approve", "");
    await expect(createPrototypeExport(north, id, 1, form)).rejects.toMatchObject({ code: "missing" });
    await expect(createPrototypeExport(southReviewer, id, 1, form)).rejects.toMatchObject({ code: "missing" });
    const participantId = (await getPrototypeSources(reviewer, id)).participantId;
    form.set("id", "tampered");
    await expect(createPrototypeExport(reviewer, id, 1, form)).rejects.toMatchObject({ code: "invalid" });
    form.set("id", participantId);
    const first = await createPrototypeExport(reviewer, id, 1, form);
    form.delete("race");
    const second = await createPrototypeExport(admin, id, 1, form);
    const older = randomUUID();
    await database().query(`INSERT INTO redcap_prototype_exports(id,submission_id,approved_version,payload,created_by)
      VALUES ($1,$2,1,$3,$4)`, [older, id, JSON.stringify({ record: { dob: "1990-01-01" } }), reviewer.id]);
    await expect(downloadPrototype(reviewer, id, older)).rejects.toMatchObject({ code: "forbidden" });
    expect(await listPrototypeExports(reviewer, id)).toHaveLength(3);
    const file = JSON.parse(await downloadPrototype(reviewer, id, first));
    expect(file.record).toEqual({ id: participantId, race___1: "1" });
    expect(file.source_versions).toEqual({ intake: 1, screening: null, completion: null });
    expect(JSON.parse(await downloadPrototype(reviewer, id, second)).record).toEqual({ id: participantId });
    await expect(downloadPrototype(viewer, id, first)).rejects.toMatchObject({ code: "missing" });
    await expect(database().query("UPDATE redcap_prototype_exports SET payload='{}' WHERE id=$1", [first])).rejects.toThrow();
    await changePrototypeRemoval(reviewer, id, first, false);
    await expect(downloadPrototype(reviewer, id, first)).rejects.toMatchObject({ code: "missing" });
    await changePrototypeRemoval(admin, id, first, true);
    expect(JSON.parse(await downloadPrototype(admin, id, first))).toEqual(file);
    await database().query("UPDATE submissions SET legal_hold=true WHERE id=$1", [id]);
    await expect(changePrototypeRemoval(reviewer, id, second, false)).rejects.toMatchObject({ code: "invalid" });
    await database().query("UPDATE submissions SET legal_hold=false WHERE id=$1", [id]);
    await saveSubmission(north, { ...completeAnswers(), name: "Changed Synthetic Name" }, id, 3);
    await expect(createPrototypeExport(reviewer, id, 1, form)).rejects.toMatchObject({ code: "conflict" });
    expect(await downloadPrototype(reviewer, id, second)).toContain("SYNTHETIC PROTOTYPE");
    const audit = await getAudit(admin, id);
    for (const action of ["redcap_prototype_create", "redcap_prototype_download", "redcap_prototype_remove", "redcap_prototype_restore"]) {
      expect(audit.some((event) => event.action === action)).toBe(true);
    }
  });
  it("uses only current approved phase snapshots and rejects stale source versions", async () => {
    const id = await saveSubmission(north, completeAnswers());
    await requestReview(north, id, 1);
    await decideReview(reviewer, id, 2, "approve");
    const codebook = await loadRedcapCodebook();
    const form = new FormData();
    form.set("synthetic", "yes"); form.set("codebookHash", codebook.hash);
    form.set("screeningVersion", "none"); form.set("completionVersion", "none");
    form.set("id", (await getPrototypeSources(reviewer, id)).participantId);
    await saveScreeningServices(north, id, undefined, { substanceDisorder: "Yes" });
    expect((await getPrototypeSources(reviewer, id)).screening).toBeNull();
    await reviewScreeningServices(north, id, 1, "request");
    await reviewScreeningServices(reviewer, id, 2, "approve");
    await expect(createPrototypeExport(reviewer, id, 1, form)).rejects.toMatchObject({ code: "conflict" });
    form.set("screeningVersion", "1");
    expect((await getPrototypeSources(reviewer, id)).screening?.answers.substanceDisorder).toBe("Yes");
    await saveProgramCompletion(north, id, undefined, { completed: "Yes" });
    await reviewProgramCompletion(north, id, 1, "request");
    await reviewProgramCompletion(reviewer, id, 2, "approve");
    await expect(createPrototypeExport(reviewer, id, 1, form)).rejects.toMatchObject({ code: "conflict" });
    form.set("completionVersion", "1");
    const exportId = await createPrototypeExport(reviewer, id, 1, form);
    expect(JSON.parse(await downloadPrototype(reviewer, id, exportId)).source_versions).toEqual({ intake: 1, screening: 1, completion: 1 });
    await saveScreeningServices(north, id, 3, { substanceDisorder: "No" });
    const sources = await getPrototypeSources(reviewer, id);
    expect(sources.screening).toBeNull();
    expect(sources.completion).toBeNull();
    await expect(createPrototypeExport(reviewer, id, 1, form)).rejects.toMatchObject({ code: "conflict" });
  });
  afterAll(async () => {
    if (management) {
      if (testName) {
        await database().end();
        await management.query(`DROP DATABASE "${testName}"`);
      }
      await management.end();
    }
  });
  it("migrates existing records without inventing approvals or losing draft contributors", async () => {
    const name = `intake_migration_${randomUUID().replaceAll("-", "")}`;
    await management.query(`CREATE DATABASE "${name}"`);
    const url = new URL(integration!); url.pathname = `/${name}`;
    const old = new Pool({ connectionString: url.toString() });
    try {
      await old.query(await readFile(new URL("../db/001-initial.sql", import.meta.url), "utf8"));
      const participant = randomUUID(), enrollment = randomUUID(), draft = randomUUID(), legacy = randomUUID();
      await old.query("INSERT INTO participants(id,group_id) VALUES ($1,'north')", [participant]);
      await old.query("INSERT INTO enrollments(id,participant_id) VALUES ($1,$2)", [enrollment, participant]);
      await old.query(
        `INSERT INTO submissions(id,enrollment_id,group_id,status,answers,participant_name,created_by,updated_by)
         VALUES ($1,$3,'north','draft','{}','Old draft','north-editor','north-editor'),
                ($2,$3,'north','submitted','{}','Old submitted','north-editor','north-editor')`,
        [draft, legacy, enrollment],
      );
      await old.query(
        `INSERT INTO form_revisions(submission_id,revision,answers,status,actor_id)
         VALUES ($1,1,'{}','draft','north-editor'),($2,1,'{}','submitted','north-editor')`, [draft, legacy],
      );
      await old.query(await readFile(new URL("../db/002-review-workflow.sql", import.meta.url), "utf8"));
      const rows = await old.query<{ id: string; review_state: string; participant_name: string }>(
        "SELECT id,review_state,participant_name FROM submissions ORDER BY participant_name",
      );
      expect(rows.rows).toEqual([
        { id: draft, review_state: "draft", participant_name: "Old draft" },
        { id: legacy, review_state: "legacy", participant_name: "Old submitted" },
      ]);
      expect((await old.query("SELECT * FROM approved_intake_versions")).rowCount).toBe(0);
      expect((await old.query("SELECT user_id FROM draft_contributors WHERE submission_id=$1", [draft])).rows).toEqual([{ user_id: "north-editor" }]);
    } finally {
      await old.end();
      await management.query(`DROP DATABASE "${name}"`);
    }
  });
  it("persists, scopes reads and counts, rejects viewers, and audits changes", async () => {
    const id = await saveSubmission(north, answers);
    expect((await getSubmission(north, id))?.answers.name).toBe(answers.name);
    expect(await getSubmission(south, id)).toBeNull();
    expect((await listSubmissions(south, searchSchema.parse({}))).total).toBe(0);
    expect((await listSubmissions(admin, searchSchema.parse({}))).records.some((record) => record.id === id)).toBe(true);
    expect(await getAudit(south, id)).toEqual([]);
    await expect(saveSubmission(viewer, answers)).rejects.toMatchObject({ code: "forbidden" });
    await expect(saveSubmission(south, answers, id, 1)).rejects.toMatchObject({ code: "missing" });
    expect((await getSubmission(north, id))?.revision).toBe(1);
    await saveSubmission(north, { ...answers, navigator: "Changed Navigator" }, id, 1);
    await expect(saveSubmission(north, answers, id, 1)).rejects.toMatchObject({ code: "conflict" });
    expect((await getSubmission(north, id))?.revision).toBe(2);
    expect((await getSubmission(north, id))?.status).toBe("draft");
    expect((await getRevisions(north, id)).map((version) => version.revision)).toEqual([2, 1]);
    expect((await getRevisions(north, id))[1].answers.phone).toBeUndefined();
    expect(await getRevisions(south, id)).toEqual([]);
    const events = await getAudit(north, id);
    expect(events.some((event) => event.action === "save_draft" && event.changed_fields.includes("navigator"))).toBe(true);
  });
  it("requires complete answers and explicit permissions before requesting review", async () => {
    const id = await saveSubmission(north, answers);
    await expect(requestReview(north, id, 1)).rejects.toMatchObject({ code: "invalid" });
    await expect(requestReview(viewer, id, 1)).rejects.toMatchObject({ code: "forbidden" });
    await expect(saveSubmission(reviewer, answers)).rejects.toMatchObject({ code: "forbidden" });
    expect(await getApprovedVersions(north, id)).toEqual([]);
    expect((await getSubmission(north, id))?.revision).toBe(1);
  });
  it("approves separate immutable snapshots and keeps the previous approval while editing", async () => {
    const id = await saveSubmission(north, completeAnswers());
    await requestReview(north, id, 1);
    expect((await getSubmission(north, id))?.review_state).toBe("pending_review");
    await expect(decideReview(viewer, id, 2, "approve")).rejects.toMatchObject({ code: "forbidden" });
    await expect(decideReview(southReviewer, id, 2, "approve")).rejects.toMatchObject({ code: "missing" });
    await decideReview(reviewer, id, 2, "approve");
    expect((await getSubmission(north, id))?.review_state).toBe("approved");
    expect((await getApprovedVersions(north, id))[0]).toMatchObject({ version: 1, draft_revision: 2, approved_by: reviewer.id });
    expect(await getApprovedVersions(south, id)).toEqual([]);
    await saveSubmission(north, { ...completeAnswers(), navigator: "Synthetic Updated" }, id, 3);
    expect((await getSubmission(north, id))?.review_state).toBe("draft");
    expect((await getApprovedVersions(north, id))[0].answers.name).toBe("Synthetic Test Record");
    await requestReview(north, id, 4);
    await decideReview(reviewer, id, 5, "approve");
    const versions = await getApprovedVersions(north, id);
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect(versions[0].answers.navigator).toBe("Synthetic Updated");
    expect(versions[1].answers.name).toBe("Synthetic Test Record");
    await expect(database().query("UPDATE approved_intake_versions SET version=99 WHERE submission_id=$1", [id])).rejects.toThrow("append-only");
    expect((await getReviewDecisions(north, id)).map((d) => d.decision)).toEqual(["approved", "approved"]);
  });
  it("enforces separation of duties and rejects stale review decisions after editing", async () => {
    const id = await saveSubmission(admin, completeAnswers());
    await requestReview(admin, id, 1);
    await expect(decideReview(admin, id, 2, "approve")).rejects.toMatchObject({ code: "forbidden" });
    await saveSubmission(north, { ...completeAnswers(), name: "Changed after request" }, id, 2);
    expect((await getSubmission(north, id))?.review_state).toBe("draft");
    await expect(decideReview(reviewer, id, 2, "approve")).rejects.toMatchObject({ code: "conflict" });
    await requestReview(north, id, 3);
    await expect(decideReview(admin, id, 4, "approve")).rejects.toMatchObject({ code: "forbidden" });
    await decideReview(reviewer, id, 4, "approve");
    expect((await getApprovedVersions(north, id))[0].editor_ids).toEqual(["demo-admin", "north-editor"]);
  });
  it("returns a draft with a reason and allows resubmission without losing history", async () => {
    const id = await saveSubmission(north, completeAnswers());
    await requestReview(north, id, 1);
    await expect(decideReview(reviewer, id, 2, "return", "  ")).rejects.toMatchObject({ code: "invalid" });
    await decideReview(reviewer, id, 2, "return", "Correct the contact date");
    expect((await getSubmission(north, id))?.return_reason).toBe("Correct the contact date");
    expect((await getReviewDecisions(north, id))[0]).toMatchObject({ decision: "returned", reason: "Correct the contact date" });
    expect(await getApprovedVersions(north, id)).toEqual([]);
    await saveSubmission(north, completeAnswers(), id, 3);
    await requestReview(north, id, 4);
    await decideReview(reviewer, id, 5, "approve");
    expect((await getApprovedVersions(north, id))).toHaveLength(1);
    expect((await getReviewDecisions(north, id))).toHaveLength(2);
  });
  it("allows only one concurrent reviewer decision for a revision", async () => {
    const id = await saveSubmission(north, completeAnswers());
    await requestReview(north, id, 1);
    const results = await Promise.allSettled([
      decideReview(reviewer, id, 2, "approve"),
      decideReview(admin, id, 2, "approve"),
    ]);
    expect(results.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((entry) => entry.status === "rejected")).toHaveLength(1);
    expect(await getApprovedVersions(north, id)).toHaveLength(1);
    expect(await getReviewDecisions(north, id)).toHaveLength(1);
  });
  it("does not list archived approvals in the active approved filter", async () => {
    const id = await saveSubmission(north, completeAnswers());
    await requestReview(north, id, 1);
    await decideReview(reviewer, id, 2, "approve");
    await changeArchive(north, id, 3, false);
    expect((await listSubmissions(north, searchSchema.parse({ status: "approved" }))).records.some((r) => r.id === id)).toBe(false);
    expect((await listSubmissions(north, searchSchema.parse({ status: "archived" }))).records.some((r) => r.id === id)).toBe(true);
    expect(await getApprovedVersions(north, id)).toHaveLength(1);
  });
  it("rolls back approval when its audit write fails", async () => {
    const id = await saveSubmission(north, completeAnswers());
    await requestReview(north, id, 1);
    await database().query(`CREATE FUNCTION fail_review_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='approve_review' THEN RAISE EXCEPTION 'Simulated review audit failure'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER test_review_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_review_audit();`);
    try {
      await expect(decideReview(reviewer, id, 2, "approve")).rejects.toThrow("Simulated review audit failure");
      expect((await getSubmission(north, id))?.review_state).toBe("pending_review");
      expect(await getApprovedVersions(north, id)).toEqual([]);
      expect(await getReviewDecisions(north, id)).toEqual([]);
    } finally {
      await database().query("DROP TRIGGER test_review_audit ON audit_events; DROP FUNCTION fail_review_audit();");
    }
  });
  it("saves edits to existing submitted records as drafts", async () => {
    const id = await seedSubmitted(north);
    await saveSubmission(north, { ...answers, phone: "503-555-0100" }, id, 2);
    expect((await getSubmission(north, id))?.status).toBe("draft");
    expect((await getSubmission(north, id))?.revision).toBe(3);
    expect((await getRevisions(north, id))[0].status).toBe("draft");
  });
  it("archives without deletion and restores only legacy submitted records", async () => {
    const id = await seedSubmitted(north);
    await changeArchive(north, id, 2, false);
    expect((await getSubmission(north, id))?.status).toBe("archived");
    expect((await listSubmissions(north, searchSchema.parse({ status: "archived" }))).records.some((row) => row.id === id)).toBe(true);
    await expect(saveSubmission(north, answers, id, 3)).rejects.toMatchObject({ code: "invalid" });
    await changeArchive(north, id, 3, true);
    expect((await getSubmission(north, id))?.status).toBe("submitted");
    await expect(changeArchive(north, id, 4, true)).rejects.toMatchObject({ code: "invalid" });
  });
  it("allows exactly one of two concurrent edits against the same revision", async () => {
    const id = await saveSubmission(north, answers);
    const result = await Promise.allSettled([
      saveSubmission(north, { ...answers, phone: "503-555-0101" }, id, 1),
      saveSubmission(north, { ...answers, phone: "503-555-0102" }, id, 1),
    ]);
    expect(result.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    expect(result.filter((entry) => entry.status === "rejected")).toHaveLength(1);
    expect((await getSubmission(north, id))?.revision).toBe(2);
    expect(await getRevisions(north, id)).toHaveLength(2);
  });
  it("paginates, filters by program and navigator, and preserves draft blank dates", async () => {
    for (let index = 0; index < 21; index++) {
      await saveSubmission(south, { name: `Synthetic Pagination ${String(index).padStart(2, "0")}`, programType: "Active Outreach Deflection Referral", navigator: "Paging Demo" });
    }
    const first = await listSubmissions(south, searchSchema.parse({ program: "Active Outreach Deflection Referral", navigator: "Paging", sort: "participant", direction: "asc" }));
    const second = await listSubmissions(south, searchSchema.parse({ program: "Active Outreach Deflection Referral", navigator: "Paging", page: 2, sort: "participant", direction: "asc" }));
    expect(first.total).toBe(21); expect(first.records).toHaveLength(20); expect(second.records).toHaveLength(1);
    expect(first.records[0].date_of_birth).toBeNull();
    expect(first.records[0].participant_id).toBeTruthy();
    expect(second.records[0].participant_id).not.toBe(first.records[0].participant_id);
    expect((await listSubmissions(south, searchSchema.parse({ program: "Law Enforcement Deflection" }))).total).toBe(0);
    expect((await listSubmissions(south, searchSchema.parse({ from: "2000-01-01", to: "2000-12-31" }))).total).toBe(0);
  });
  it("rolls back the record mutation if the audit insert fails", async () => {
    const id = await saveSubmission(north, answers);
    await database().query(`CREATE FUNCTION fail_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='save_draft' THEN RAISE EXCEPTION 'Simulated audit failure'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER test_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_test_audit();`);
    try {
      await expect(saveSubmission(north, { ...answers, name: "Should Roll Back" }, id, 1)).rejects.toThrow("Simulated audit failure");
      expect((await getSubmission(north, id))?.participant_name).toBe(answers.name);
      expect((await getSubmission(north, id))?.revision).toBe(1);
    } finally {
      await database().query("DROP TRIGGER test_audit_failure ON audit_events; DROP FUNCTION fail_test_audit();");
    }
  });
  it("makes audit events append-only and escapes search wildcards", async () => {
    await expect(database().query("UPDATE audit_events SET action='forged'")).rejects.toThrow("append-only");
    expect((await listSubmissions(north, searchSchema.parse({ q: "%" }))).total).toBe(0);
    expect((await listSubmissions(north, searchSchema.parse({ q: "Synthetic", sort: "participant", direction: "asc" }))).total).toBeGreaterThan(0);
  });
  it("imports drafts for administrators, tracks placeholders, scopes source data, and prevents duplicate files", async () => {
    const header = "DOB\tHouseless\tGender\tRace\tAGENCY\tLEA #\tDA #\tCOURT #\tCHARGE CODE\tCHARGE DESCRIPT\tINCIDENT/REFERRAL DATE\tREVIEW STATUS\tHB 4002 REPORTING\tDEFLECT OUTCOME\tCD OUTCOME\tREFERRAL TYPE\tOUTCOME 2\tSUBSTANCE\tSUBSTANCE 2\tDEATHS\tRE-OFFENSE\tNOTES\tOUTCOME3\tARRESTED\tWEIGHT";
    const row = Array(25).fill(""); row[0] = "unknown"; row[21] = "synthetic note";
    const parsed = parseIntakeImport(new TextEncoder().encode(`${header}\n${row.join("\t")}\ninvalid\n`));
    expect(parsed.issues).toHaveLength(1);
    await expect(importIntakes(north, "south", parsed)).rejects.toMatchObject({ code: "forbidden" });
    await importIntakes(admin, "south", parsed);
    await expect(importIntakes(admin, "north", parsed)).rejects.toMatchObject({ code: "conflict" });
    const result = await database().query<{ submission_id: string }>("SELECT submission_id FROM intake_import_sources WHERE source->>'NOTES'='synthetic note'");
    const id = result.rows[0].submission_id;
    expect((await getSubmission(south, id))?.status).toBe("draft");
    expect(await getImportSource(north, id)).toBeNull();
    expect((await getImportSource(south, id))?.placeholder_fields).toEqual(["name", "dob"]);
    await expect(requestReview(south, id, 1)).rejects.toThrow("consent");
    const completed = completeAnswers();
    await submitConsent(south, consent, null, id, 1);
    await saveSubmission(south, completed, id, 2);
    expect((await getImportSource(south, id))?.placeholder_fields).toEqual([]);
    await requestReview(south, id, 3);
    await decideReview(southReviewer, id, 4, "approve");
    expect((await getSubmission(south, id))?.review_state).toBe("approved");
    await submitConsent(south, { ...consent, dob: "1900-01-01" }, null, id, 5);
    expect((await getImportSource(south, id))?.placeholder_fields).toEqual(["dob"]);
    await saveSubmission(south, completed, id, 6);
    await expect(requestReview(south, id, 7)).rejects.toThrow("placeholder");
  });
  it("rolls back the entire import if any valid row fails to save", async () => {
    const header = "DOB\tHouseless\tGender\tRace\tAGENCY\tLEA #\tDA #\tCOURT #\tCHARGE CODE\tCHARGE DESCRIPT\tINCIDENT/REFERRAL DATE\tREVIEW STATUS\tHB 4002 REPORTING\tDEFLECT OUTCOME\tCD OUTCOME\tREFERRAL TYPE\tOUTCOME 2\tSUBSTANCE\tSUBSTANCE 2\tDEATHS\tRE-OFFENSE\tNOTES\tOUTCOME3\tARRESTED\tWEIGHT";
    const row = Array(25).fill(""); row[0] = "1/1/2000"; row[21] = "rollback test";
    const parsed = parseIntakeImport(new TextEncoder().encode(`${header}\n${row.join("\t")}\n`));
    await database().query(`CREATE FUNCTION fail_import_test() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='import_draft' THEN RAISE EXCEPTION 'Simulated import failure'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER test_import_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_import_test();`);
    try {
      await expect(importIntakes(admin, "south", parsed)).rejects.toThrow("Simulated import failure");
      expect((await database().query("SELECT 1 FROM intake_import_batches WHERE file_hash=$1", [parsed.hash])).rowCount).toBe(0);
      expect((await database().query("SELECT 1 FROM intake_import_sources WHERE source->>'NOTES'='rollback test'")).rowCount).toBe(0);
    } finally {
      await database().query("DROP TRIGGER test_import_failure ON audit_events; DROP FUNCTION fail_import_test();");
    }
    await expect(importIntakes(admin, "south", parsed)).resolves.toBeTruthy();
  });
  it("undoes only untouched drafts, requires a fresh preview, protects holds, and retains history", async () => {
    const header = "DOB\tHouseless\tGender\tRace\tAGENCY\tLEA #\tDA #\tCOURT #\tCHARGE CODE\tCHARGE DESCRIPT\tINCIDENT/REFERRAL DATE\tREVIEW STATUS\tHB 4002 REPORTING\tDEFLECT OUTCOME\tCD OUTCOME\tREFERRAL TYPE\tOUTCOME 2\tSUBSTANCE\tSUBSTANCE 2\tDEATHS\tRE-OFFENSE\tNOTES\tOUTCOME3\tARRESTED\tWEIGHT";
    const row = Array(25).fill(""); row[21] = "undo case";
    const parsed = parseIntakeImport(new TextEncoder().encode(`${header}\n${row.join("\t")}\n${row.join("\t")}\n${row.join("\t")}\n`));
    const batch = await importIntakes(admin, "north", parsed);
    const initial = await getBatchPreview(admin, batch);
    await expect(getBatchPreview(north, batch)).rejects.toMatchObject({ code: "forbidden" });
    await submitConsent(north, consent, null, initial.rows[1].id, 1);
    await database().query("UPDATE submissions SET legal_hold=true WHERE id=$1", [initial.rows[2].id]);
    await expect(undoImportBatch(admin, batch, initial.token, "test")).rejects.toMatchObject({ code: "conflict" });
    const current = await getBatchPreview(admin, batch);
    expect(current.rows.filter(eligibleForBatchUndo)).toHaveLength(1);
    await expect(undoImportBatch(north, batch, current.token, "test")).rejects.toMatchObject({ code: "forbidden" });
    expect(await undoImportBatch(admin, batch, current.token, "incorrect import")).toBe(1);
    const id = initial.rows[0].id;
    expect(await getSubmission(north, id)).toBeNull();
    expect((await getSubmission(admin, id))?.removed_at).toBeTruthy();
    expect((await getRemovalHistory(admin, id))[0]).toMatchObject({ action: "batch_undo", reason: "incorrect import" });
    expect((await getImportSource(admin, id))?.source.NOTES).toBe("undo case");
    await expect(saveSubmission(admin, answers, id, 2)).rejects.toThrow("Restore");
    await expect(importIntakes(admin, "north", parsed, true)).rejects.toMatchObject({ code: "conflict" });
    expect((await importHashState(admin, parsed.hash)).active).toBe(2);
    await expect(changeImportedRemoval(admin, initial.rows[2].id, 1, "duplicate", "test", initial.rows[1].id)).rejects.toThrow("legal hold");
    await changeImportedRemoval(admin, id, 2, "restore", "restore by mistake");
    expect((await getSubmission(north, id))?.removed_at).toBeNull();
    expect((await getRemovalHistory(admin, id)).map((event) => event.action)).toEqual(["restore", "batch_undo"]);
  });
  it("removes duplicates and only allows confirmed re-import after every prior record is removed", async () => {
    const header = "DOB\tHouseless\tGender\tRace\tAGENCY\tLEA #\tDA #\tCOURT #\tCHARGE CODE\tCHARGE DESCRIPT\tINCIDENT/REFERRAL DATE\tREVIEW STATUS\tHB 4002 REPORTING\tDEFLECT OUTCOME\tCD OUTCOME\tREFERRAL TYPE\tOUTCOME 2\tSUBSTANCE\tSUBSTANCE 2\tDEATHS\tRE-OFFENSE\tNOTES\tOUTCOME3\tARRESTED\tWEIGHT";
    const row = Array(25).fill(""); row[21] = "duplicate test";
    const parsed = parseIntakeImport(new TextEncoder().encode(`${header}\n${row.join("\t")}\n`));
    const target = await saveSubmission(north, answers);
    const batch = await importIntakes(admin, "north", parsed);
    const id = (await getBatchPreview(admin, batch)).rows[0].id;
    await expect(changeImportedRemoval(north, id, 1, "duplicate", "duplicate", target)).rejects.toMatchObject({ code: "forbidden" });
    await expect(changeImportedRemoval(admin, id, 1, "duplicate", "", target)).rejects.toMatchObject({ code: "invalid" });
    await expect(changeImportedRemoval(admin, id, 1, "duplicate", "duplicate", id)).rejects.toMatchObject({ code: "invalid" });
    await changeImportedRemoval(admin, id, 1, "duplicate", "already entered", target);
    expect((await getRemovalHistory(admin, id))[0]).toMatchObject({ action: "duplicate", duplicate_of: target, reason: "already entered" });
    const enrollment = (await getSubmission(admin, id))!.enrollment_id;
    expect((await listSubmissions(admin, searchSchema.parse({ status: "removed", q: enrollment }))).records.some((s) => s.id === id)).toBe(true);
    await expect(importIntakes(admin, "north", parsed)).rejects.toThrow("Explicitly confirm");
    const secondBatch = await importIntakes(admin, "south", parsed, true);
    await expect(changeImportedRemoval(admin, id, 2, "restore", "restore")).rejects.toMatchObject({ code: "conflict" });
    const second = await getBatchPreview(admin, secondBatch);
    await undoImportBatch(admin, secondBatch, second.token, "wrong group");
    await changeImportedRemoval(admin, id, 2, "restore", "restore");
    expect((await getSubmission(admin, id))?.removed_at).toBeNull();
  });
  it("rolls back batch removal on audit failure and serializes concurrent re-imports", async () => {
    const header = "DOB\tHouseless\tGender\tRace\tAGENCY\tLEA #\tDA #\tCOURT #\tCHARGE CODE\tCHARGE DESCRIPT\tINCIDENT/REFERRAL DATE\tREVIEW STATUS\tHB 4002 REPORTING\tDEFLECT OUTCOME\tCD OUTCOME\tREFERRAL TYPE\tOUTCOME 2\tSUBSTANCE\tSUBSTANCE 2\tDEATHS\tRE-OFFENSE\tNOTES\tOUTCOME3\tARRESTED\tWEIGHT";
    const row = Array(25).fill(""); row[21] = "undo rollback";
    const parsed = parseIntakeImport(new TextEncoder().encode(`${header}\n${row.join("\t")}\n${row.join("\t")}\n`));
    const batch = await importIntakes(admin, "north", parsed);
    const initial = await getBatchPreview(admin, batch);
    await database().query(`CREATE FUNCTION fail_removal_test() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='import_batch_undo' THEN RAISE EXCEPTION 'Simulated removal failure'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER test_removal_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_removal_test();`);
    try {
      await expect(undoImportBatch(admin, batch, initial.token, "test")).rejects.toThrow("Simulated removal failure");
      expect((await getBatchPreview(admin, batch)).rows.every((entry) => !entry.removed_at && entry.revision === 1)).toBe(true);
      expect(await getRemovalHistory(admin, initial.rows[0].id)).toEqual([]);
    } finally {
      await database().query("DROP TRIGGER test_removal_failure ON audit_events; DROP FUNCTION fail_removal_test();");
    }
    await undoImportBatch(admin, batch, initial.token, "test");
    const results = await Promise.allSettled([importIntakes(admin, "north", parsed, true), importIntakes(admin, "south", parsed, true)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await importHashState(admin, parsed.hash)).active).toBe(2);
  });
});
