import { z } from "zod";

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
