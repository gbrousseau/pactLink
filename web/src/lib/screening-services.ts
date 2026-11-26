import { z } from "zod";
import { database, transaction } from "./db";
import { canEdit, canReview, canView, WorkflowError, type User } from "./access";

export const screeningTools = [
  "ASAM Criteria", "Substance use (e.g. DAST-10, AUDIT, ASSIST, CUDIT)",
  "Mental health (e.g. GAD-7, PHQ-9)", "Social determinants of health",
  "Physical health", "TAPS (Tobacco, Alcohol, Prescription medication, and other Substance use)",
  "DAST-10 (Drug Abuse Screen Test)", "ASSIST (Alcohol, Smoking, and Substance Abuse Involvement Screen Test)",
  "ASAM Criteria (American Society of Addiction Medicine Criteria)",
  "CUDIT (Cannabis Use Disorders Identification Test)", "GAD-7 (Generalized Anxiety Disorder-7)",
  "PHQ-9 (Patient Health Questionnaire-9)", "CRAFFT", "DSM-5 Checklist",
  "AUDIT (Alcohol Use Disorders Identification Test)", "CASI (Cognitive Ability Screening Instrument)",
  "Locally-developed behavioral health assessment", "Physical health screening",
  "Social determinants of health screening", "Locally-developed mental health assessment",
  "Locally-developed substance use disorder assessment", "Other assessment", "No assessments were administered", "Don't know",
] as const;
export const identificationOptions = [
  "Use of an evidence-based screening or risk tool", "Self-reported", "Previously documented",
  "Observed by staff", "Presumed due to receiving treatment", "Other", "Don't know",
] as const;
export const substanceTypes = [
  "Alcohol", "Methamphetamine", "Cocaine", "Other amphetamine/Stimulant", "Heroin", "Fentanyl",
  "Other opioids (e.g. morphine, oxycodone)", "Cannabis", "Psychedelic/hallucinogen (e.g. psilocybin, DMT, LSD)",
  "Benzodiazepines (e.g. Xanax, Valium, Ativan)", "Other", "Don't know",
] as const;
export const mentalHealthDiagnoses = [
  "Anxiety", "Depression", "Bipolar spectrum disorder", "Other mood disorder",
  "Substance-induced psychosis", "Personality disorder",
  "Schizophrenia and other psychotic disorders (not substance-induced)", "ADD/ADHD",
  "Suicidal ideation/attempt/intentional self-harm", "Trauma- and stressor-related disorder (includes PTSD)",
  "Other", "Don't know",
] as const;
export const screeningsReceived = ["ASAM", "Substance use", "Mental health", "Social determinants of health", "Physical health", "None", "Don't know"] as const;
export const referralTypes = ["SUD treatment", "Mental health treatment", "Culturally specific care", "Social and health related services", "Other", "None", "Don't know"] as const;
export const serviceCategories = {
  "SUD treatment": [
    "Medically managed inpatient", "Detox/withdrawal management", "Sobering services", "Residential facility",
    "Intensive outpatient", "Outpatient", "Medication for opioid use disorder", "Medication for alcohol use disorder",
    "Medication for stimulant use disorder", "SUD counseling", "Harm reduction", "Recovery support", "Contingency management",
  ],
  "Mental health treatment": ["Psychotherapy", "Mental health medication", "Hospitalization", "Mental health counseling", "Group therapy"],
  "Culturally responsive care": ["Interpreter services", "Translated printed materials", "Language concordant care", "Culturally and linguistically specific services"],
  "Social and health related services": [
    "Housing supports", "Employment supports", "Financial supports (e.g. SSI/SSDI)", "OHP enrollment",
    "SNAP enrollment or other food assistance", "TANF enrollment", "Primary care", "Dental care", "Intensive case management",
    "Transportation", "Cell phone", "Basic needs (e.g. clothing, hygiene products)", "Legal assistance",
    "ID/Driver's license", "Veteran's services", "Family services", "Other service",
  ],
} as const;
export const serviceStatuses = ["Referred to service", "Received service", "Referred but didn't receive", "Don't know if service was received"] as const;
export const serviceReasons = [
  "Service not available in their area", "Waitlist was too long", "Declined service", "CCO refused coverage",
  "Change to treatment plan", "No longer needed", "Lost to follow up/unable to contact",
] as const;

const multi = <T extends readonly string[]>(items: T) => z.array(z.enum(items)).max(items.length).refine((value) => new Set(value).size === value.length, "Duplicate selections are not allowed.");
const maybeOther = z.string().trim().max(250).default("");
const serviceAnswer = z.object({
  statuses: multi(serviceStatuses).default([]),
  reasons: multi(serviceReasons).default([]),
  otherService: maybeOther,
}).default({ statuses: [], reasons: [], otherService: "" });
const serviceAnswerShape = Object.fromEntries(Object.values(serviceCategories).flat().map((name) => [name, serviceAnswer]));
const emptyServices = Object.fromEntries(Object.values(serviceCategories).flat().map((name) => [name, { statuses: [], reasons: [], otherService: "" }]));
export const screeningServicesSchema = z.object({
  reviewNote: z.string().trim().max(2000).default(""),
  screeningTypes: multi(screeningTools).default([]),
  screeningTypesOther: maybeOther,
  substanceDisorder: z.enum(["Yes", "No", "Don't know", ""]).default(""),
  substanceIdentification: multi(identificationOptions).default([]),
  substanceIdentificationOther: maybeOther,
  substanceTypes: multi(substanceTypes).default([]),
  substanceTypesOther: maybeOther,
  mentalHealthDisorder: z.enum(["Yes", "No", "Don't know", ""]).default(""),
  mentalHealthIdentification: multi(identificationOptions).default([]),
  mentalHealthIdentificationOther: maybeOther,
  mentalHealthDiagnoses: multi(mentalHealthDiagnoses).default([]),
  mentalHealthDiagnosesOther: maybeOther,
  screeningsReceived: multi(screeningsReceived).default([]),
  asamCompletionDate: z.union([z.literal(""), z.iso.date()]).refine(
    (date) => !date || date <= new Date().toISOString().slice(0, 10),
    "ASAM completion date cannot be in the future.",
  ).default(""),
  asamLocation: z.string().trim().max(300).default(""),
  referralTypes: multi(referralTypes).default([]),
  referralTypesOther: maybeOther,
  services: z.object(serviceAnswerShape).default(emptyServices),
}).superRefine((value, context) => {
  const exclusiveChoices: { key: string; values: readonly string[]; exclusive: readonly string[] }[] = [
    { key: "screeningTypes", values: value.screeningTypes, exclusive: ["No assessments were administered", "Don't know"] },
    { key: "screeningsReceived", values: value.screeningsReceived, exclusive: ["None", "Don't know"] },
    { key: "referralTypes", values: value.referralTypes, exclusive: ["None", "Don't know"] },
    { key: "substanceTypes", values: value.substanceTypes, exclusive: ["Don't know"] },
    { key: "mentalHealthDiagnoses", values: value.mentalHealthDiagnoses, exclusive: ["Don't know"] },
  ];
  for (const { key, values, exclusive } of exclusiveChoices) {
    if (values.some((selection) => (exclusive as readonly string[]).includes(selection)) && values.length > 1) {
      context.addIssue({ code: "custom", path: [key], message: "None/unknown choices cannot be combined with other answers." });
    }
  }
  for (const [selectionKey, selection, textKey, label] of [
    ["screeningTypes", value.screeningTypes, "screeningTypesOther", "Other assessment"],
    ["substanceTypes", value.substanceTypes, "substanceTypesOther", "Other"],
    ["mentalHealthDiagnoses", value.mentalHealthDiagnoses, "mentalHealthDiagnosesOther", "Other"],
    ["referralTypes", value.referralTypes, "referralTypesOther", "Other"],
  ] as const) {
    const text = value[textKey].trim();
    const hasOther = (selection as readonly string[]).includes(label);
    if (hasOther && !text) context.addIssue({ code: "custom", path: [textKey], message: "Specify the other answer." });
    if (!hasOther && text) context.addIssue({ code: "custom", path: [selectionKey], message: "Select Other or clear this text." });
  }
  for (const [prefix, selections] of [
    ["substanceIdentification", value.substanceIdentification],
    ["mentalHealthIdentification", value.mentalHealthIdentification],
  ] as const) {
    if (selections.includes("Other") && !value[`${prefix}Other`].trim()) {
      context.addIssue({ code: "custom", path: [`${prefix}Other`], message: "Specify the other identification method." });
    }
    if (!selections.includes("Other") && value[`${prefix}Other`].trim()) {
      context.addIssue({ code: "custom", path: [`${prefix}Other`], message: "Select Other or clear this text." });
    }
  }
  for (const category of Object.values(serviceCategories)) for (const name of category) {
    const row = value.services[name];
    if (row.statuses.includes("Received service") && row.statuses.includes("Referred but didn't receive")) {
      context.addIssue({ code: "custom", path: ["services", name, "statuses"], message: "A service cannot be both received and not received." });
    }
    const outcomes = row.statuses.filter((item: string) => item !== "Referred to service");
    if (outcomes.length > 1) context.addIssue({ code: "custom", path: ["services", name, "statuses"], message: "Choose only one service outcome." });
    if (outcomes.length && !row.statuses.includes("Referred to service")) {
      context.addIssue({ code: "custom", path: ["services", name, "statuses"], message: "Mark the service as referred before recording an outcome." });
    }
    if (row.statuses.includes("Referred but didn't receive") && row.reasons.length === 0) {
      context.addIssue({ code: "custom", path: ["services", name, "reasons"], message: "Choose one or more reasons for not receiving the service." });
    }
    if (!row.statuses.includes("Referred but didn't receive") && row.reasons.length > 0) {
      context.addIssue({ code: "custom", path: ["services", name, "reasons"], message: "Reasons apply only when the referred service was not received." });
    }
    if (name !== "Other service" && row.otherService.trim()) {
      context.addIssue({ code: "custom", path: ["services", name, "otherService"], message: "This detail is only for Other service." });
    }
    if (name === "Other service" && row.statuses.length && !row.otherService.trim()) {
      context.addIssue({ code: "custom", path: ["services", name, "otherService"], message: "Describe the other service." });
    }
  }
});
export type ScreeningServicesAnswers = z.infer<typeof screeningServicesSchema>;
export type ScreeningServicesRecord = {
  submission_id: string; revision: number; answers: ScreeningServicesAnswers;
  review_state: "draft" | "pending_review" | "returned" | "approved";
  review_requested_by: string | null; review_requested_at: Date | null;
  return_reason: string | null; updated_at: Date; updated_by: string;
};
export type ScreeningServicesApproval = {
  version: number; revision: number; answers: ScreeningServicesAnswers; editor_ids: string[];
  requested_by: string; requested_at: Date; approved_by: string; approved_at: Date; reviewer_name: string;
};
export type ScreeningServicesDecision = {
  revision: number; decision: "approved" | "returned"; reason: string | null;
  decided_at: Date; reviewer_name: string;
};

function assertId(id: string) {
  if (!z.uuid().safeParse(id).success) throw new WorkflowError("Invalid referral identifier.", "invalid");
}
async function lockEligibleReferral(client: import("pg").PoolClient, user: User, id: string, role: "edit" | "review"): Promise<string> {
  const result = await client.query<{ group_id: string; review_state: string; status: string; removed_at: Date | null; has_consent: boolean }>(
    `SELECT s.group_id,s.review_state,s.status,s.removed_at,
      EXISTS (SELECT 1 FROM consent_versions c WHERE c.submission_id=s.id) AS has_consent
     FROM submissions s WHERE s.id=$1 FOR UPDATE`, [id]);
  const row = result.rows[0];
  if (!row || !canView(user, row.group_id)) {
    throw new WorkflowError("Referral not found or not available to your group.", "missing");
  }
  if (role === "review" && !canReview(user, row.group_id)) throw new WorkflowError("You do not have review permission.", "forbidden");
  if (role === "edit" && !canEdit(user, row.group_id)) throw new WorkflowError("You do not have editing permission.", "forbidden");
  if (row.removed_at || row.status === "archived" || row.review_state !== "approved" || !row.has_consent) {
    throw new WorkflowError("Screening and Services is available only after Consent and current Intake approval.", "invalid");
  }
  return row.group_id;
}
async function insertRevision(client: import("pg").PoolClient, id: string, revision: number, answers: ScreeningServicesAnswers, state: string, actor: string) {
  await client.query("INSERT INTO screening_service_revisions(submission_id,revision,answers,review_state,actor_id) VALUES ($1,$2,$3,$4,$5)",
    [id, revision, JSON.stringify(answers), state, actor]);
}
async function requestScreeningReview(client: import("pg").PoolClient, user: User, id: string, revision: number, answers: ScreeningServicesAnswers) {
  await client.query(`UPDATE screening_service_records SET review_state='pending_review',review_requested_by=$2,
    review_requested_at=now(),return_reason=NULL,revision=revision+1,updated_at=now() WHERE submission_id=$1`, [id, user.id]);
  await insertRevision(client, id, revision + 1, answers, "pending_review", user.id);
  await client.query("INSERT INTO audit_events(actor_id,action,submission_id,changed_fields,revision) VALUES ($1,'screening_services_request_review',$2,ARRAY['review_state'],$3)", [user.id, id, revision + 1]);
}
export async function saveScreeningServices(user: User, id: string, revision: number | undefined, input: unknown, requestReview = false) {
  assertId(id);
  const parsed = screeningServicesSchema.safeParse(input);
  if (!parsed.success) throw new WorkflowError("Correct the highlighted Screening and Services answers before saving.", "invalid");
  return transaction(async (client) => {
    await lockEligibleReferral(client, user, id, "edit");
    const current = await client.query<ScreeningServicesRecord>("SELECT * FROM screening_service_records WHERE submission_id=$1 FOR UPDATE", [id]);
    const old = current.rows[0];
    if (old && old.revision !== revision) throw new WorkflowError("Another user changed Screening and Services. Reload before saving.", "conflict");
    if (!old && revision !== undefined) throw new WorkflowError("Screening and Services draft no longer exists.", "conflict");
    const nextRevision = (old?.revision ?? 0) + 1;
    await client.query(`INSERT INTO screening_service_records(submission_id,revision,answers,review_state,updated_by)
      VALUES ($1,$2,$3,'draft',$4)
      ON CONFLICT (submission_id) DO UPDATE SET revision=EXCLUDED.revision,answers=EXCLUDED.answers,
        review_state='draft',review_requested_by=NULL,review_requested_at=NULL,return_reason=NULL,updated_by=EXCLUDED.updated_by,updated_at=now()`,
    [id, nextRevision, JSON.stringify(parsed.data), user.id]);
    await insertRevision(client, id, nextRevision, parsed.data, "draft", user.id);
    await client.query("INSERT INTO screening_service_contributors(submission_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [id, user.id]);
    const changed = old
      ? [
        ...Object.keys(parsed.data).filter((key) => key !== "services" &&
          JSON.stringify(old.answers[key as keyof ScreeningServicesAnswers] ?? "") !== JSON.stringify(parsed.data[key as keyof ScreeningServicesAnswers])),
        ...Object.values(serviceCategories).flat().filter((name) =>
          JSON.stringify(old.answers.services[name]) !== JSON.stringify(parsed.data.services[name])).map((name) => `service:${name}`),
      ]
      : ["answers"];
    await client.query("INSERT INTO audit_events(actor_id,action,submission_id,changed_fields,revision) VALUES ($1,$2,$3,$4,$5)",
      [user.id, "screening_services_save", id, changed, nextRevision]);
    if (requestReview) {
      await requestScreeningReview(client, user, id, nextRevision, parsed.data);
      return nextRevision + 1;
    }
    return nextRevision;
  });
}
export async function reviewScreeningServices(user: User, id: string, revision: number, intent: "request" | "approve" | "return", reason = "") {
  assertId(id);
  if (!Number.isInteger(revision) || revision < 1) throw new WorkflowError("Invalid Screening and Services revision.", "invalid");
  const cleanReason = reason.trim();
  if (intent === "return" && (!cleanReason || cleanReason.length > 2000)) throw new WorkflowError("Enter a reason of up to 2,000 characters.", "invalid");
  if (intent !== "return" && cleanReason) throw new WorkflowError("A reason is only allowed when returning a draft.", "invalid");
  await transaction(async (client) => {
    const groupId = await lockEligibleReferral(client, user, id, intent === "approve" || intent === "return" ? "review" : "edit");
    const result = await client.query<ScreeningServicesRecord>("SELECT * FROM screening_service_records WHERE submission_id=$1 FOR UPDATE", [id]);
    const row = result.rows[0];
    if (!row) throw new WorkflowError("Save Screening and Services before requesting review.", "invalid");
    if (row.revision !== revision) throw new WorkflowError("Another user changed Screening and Services. Reload before reviewing.", "conflict");
    if (intent === "request") {
      if (!canEdit(user, groupId)) throw new WorkflowError("You do not have editing permission.", "forbidden");
      if (row.review_state !== "draft" && row.review_state !== "returned") throw new WorkflowError("Only a draft or returned phase can be sent for review.", "invalid");
      await requestScreeningReview(client, user, id, row.revision, row.answers);
      return;
    }
    if (!canReview(user, groupId)) throw new WorkflowError("You do not have review permission.", "forbidden");
    if (row.review_state !== "pending_review" || !row.review_requested_by || !row.review_requested_at) throw new WorkflowError("This phase is not awaiting review.", "invalid");
    const contributors = await client.query<{ user_id: string }>("SELECT user_id FROM screening_service_contributors WHERE submission_id=$1", [id]);
    if (row.review_requested_by === user.id || contributors.rows.some((entry) => entry.user_id === user.id)) {
      throw new WorkflowError("A different reviewer must review changes they did not edit or submit.", "forbidden");
    }
    const nextState = intent === "approve" ? "approved" : "returned";
    await client.query("INSERT INTO screening_service_decisions(submission_id,revision,reviewer_id,decision,reason) VALUES ($1,$2,$3,$4,$5)",
      [id, revision, user.id, nextState, intent === "return" ? cleanReason : null]);
    if (intent === "approve") await client.query(`INSERT INTO screening_service_approvals
      (submission_id,version,revision,answers,editor_ids,requested_by,requested_at,approved_by)
      VALUES ($1,(SELECT COALESCE(MAX(version),0)+1 FROM screening_service_approvals WHERE submission_id=$1),$2,$3,$4,$5,$6,$7)`,
    [id, revision, JSON.stringify(row.answers), contributors.rows.map((entry) => entry.user_id), row.review_requested_by, row.review_requested_at, user.id]);
    await client.query(`UPDATE screening_service_records SET review_state=$2,return_reason=$3,revision=revision+1,
      updated_by=$4,updated_at=now() WHERE submission_id=$1`,
    [id, nextState, intent === "return" ? cleanReason : null, user.id]);
    await insertRevision(client, id, row.revision + 1, row.answers, nextState, user.id);
    if (intent === "approve") await client.query("DELETE FROM screening_service_contributors WHERE submission_id=$1", [id]);
    await client.query("INSERT INTO audit_events(actor_id,action,submission_id,changed_fields,revision) VALUES ($1,$2,$3,ARRAY['review_state'],$4)",
      [user.id, `screening_services_${nextState}`, id, row.revision + 1]);
  });
}
export async function getScreeningServices(user: User, id: string): Promise<ScreeningServicesRecord | null> {
  assertId(id);
  const result = await database().query<ScreeningServicesRecord>(`SELECT r.* FROM screening_service_records r
    JOIN submissions s ON s.id=r.submission_id WHERE s.id=$1 AND ($2 OR s.group_id=$3 AND s.removed_at IS NULL)`,
  [id, user.role === "admin", user.group_id]);
  return result.rows[0] ?? null;
}
export async function getScreeningServiceApprovals(user: User, id: string): Promise<ScreeningServicesApproval[]> {
  assertId(id);
  const result = await database().query<ScreeningServicesApproval>(`SELECT a.*,u.display_name AS reviewer_name
    FROM screening_service_approvals a JOIN submissions s ON s.id=a.submission_id JOIN app_users u ON u.id=a.approved_by
    WHERE s.id=$1 AND ($2 OR s.group_id=$3 AND s.removed_at IS NULL) ORDER BY a.version DESC`,
  [id, user.role === "admin", user.group_id]);
  return result.rows;
}
export async function getScreeningServiceDecisions(user: User, id: string): Promise<ScreeningServicesDecision[]> {
  assertId(id);
  const result = await database().query<ScreeningServicesDecision>(`SELECT d.revision,d.decision,d.reason,d.decided_at,u.display_name AS reviewer_name
    FROM screening_service_decisions d JOIN submissions s ON s.id=d.submission_id JOIN app_users u ON u.id=d.reviewer_id
    WHERE s.id=$1 AND ($2 OR s.group_id=$3 AND s.removed_at IS NULL) ORDER BY d.id DESC`,
  [id, user.role === "admin", user.group_id]);
  return result.rows;
}
export async function isScreeningServiceContributor(user: User, id: string): Promise<boolean> {
  assertId(id);
  const result = await database().query(`SELECT 1 FROM screening_service_contributors c
    JOIN submissions s ON s.id=c.submission_id
    WHERE c.submission_id=$1 AND c.user_id=$2 AND ($3 OR s.group_id=$4 AND s.removed_at IS NULL)`,
  [id, user.id, user.role === "admin", user.group_id]);
  return !!result.rowCount;
}
export async function parseScreeningForm(form: FormData) {
  const values: Record<string, unknown> = {
    screeningTypes: form.getAll("screeningTypes"),
    reviewNote: form.get("reviewNote") ?? "",
    screeningTypesOther: form.get("screeningTypesOther") ?? "",
    substanceDisorder: form.get("substanceDisorder") ?? "",
    substanceIdentification: form.getAll("substanceIdentification"),
    substanceIdentificationOther: form.get("substanceIdentificationOther") ?? "",
    substanceTypes: form.getAll("substanceTypes"),
    substanceTypesOther: form.get("substanceTypesOther") ?? "",
    mentalHealthDisorder: form.get("mentalHealthDisorder") ?? "",
    mentalHealthIdentification: form.getAll("mentalHealthIdentification"),
    mentalHealthIdentificationOther: form.get("mentalHealthIdentificationOther") ?? "",
    mentalHealthDiagnoses: form.getAll("mentalHealthDiagnoses"),
    mentalHealthDiagnosesOther: form.get("mentalHealthDiagnosesOther") ?? "",
    screeningsReceived: form.getAll("screeningsReceived"),
    asamCompletionDate: form.get("asamCompletionDate") ?? "",
    asamLocation: form.get("asamLocation") ?? "",
    referralTypes: form.getAll("referralTypes"),
    referralTypesOther: form.get("referralTypesOther") ?? "",
    services: {},
  };
  const services = values.services as Record<string, unknown>;
  for (const category of Object.values(serviceCategories)) for (const name of category) {
    const key = `service:${name}`;
    services[name] = {
      statuses: form.getAll(`${key}:statuses`),
      reasons: form.getAll(`${key}:reasons`),
      otherService: form.get(`${key}:otherService`) ?? "",
    };
  }
  for (const value of Object.values(values)) {
    if (value instanceof File || (Array.isArray(value) && value.some((entry) => typeof entry !== "string"))) {
      throw new WorkflowError("Invalid Screening and Services input.", "invalid");
    }
  }
  const parsed = screeningServicesSchema.safeParse(values);
  if (!parsed.success) throw new WorkflowError(parsed.error.issues[0]?.message ?? "Invalid Screening and Services answers.", "invalid");
  return parsed.data;
}
