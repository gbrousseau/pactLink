import { z } from "zod";
import { housingOptions, visibleIntakeFields } from "./intake-fields";
import { WorkflowError } from "./access";

type Field = {
  key: string;
  label: string;
  type: "single" | "multi" | "date" | "text" | "textarea";
  options?: readonly string[];
  hint?: string;
};

const yesNo = ["Yes", "No"] as const;
const yesNoUnknown = ["Yes", "No", "Don't know"] as const;
const intakeOptions = (key: string) => {
  const field = visibleIntakeFields.find((entry) => entry.key === key);
  if (!field?.options) throw new Error(`Missing Intake options for ${key}.`);
  return field.options;
};

export const completionSections: { title: string; fields: Field[] }[] = [
  { title: "Program outcome", fields: [
    { key: "completed", label: "Did the participant complete the program or move to alumni status?", type: "single", options: yesNo },
    { key: "completionDate", label: "Date of completion or alumni status", type: "date" },
    { key: "leftDate", label: "Date they left program", type: "date" },
    { key: "nonCompletionReasons", label: "If applicable, why did they not complete deflection?", type: "multi", hint: "Select all that apply.", options: [
      "Lost to follow-up/unable to contact", "New criminal justice involvement", "Did not engage with treatment plan",
      "Declined housing support", "Voluntarily left program", "Substance use", "Needs a higher level of care",
      "Overdose death", "Other cause of death", "Other", "Don't know",
    ] },
    { key: "engagedStaff", label: "Did the participant ever engage with deflection staff?", type: "single", options: yesNoUnknown },
    { key: "individualizedPlan", label: "Was an individualized deflection plan developed for the participant?", type: "single", options: yesNoUnknown },
    { key: "improvements", label: "Was there significant improvement in any of the following areas?", type: "multi",
      hint: "Only include things that occurred as a direct result of engagement with the deflection program.", options: [
        "Reduction in substance use", "Homelessness or housing stability", "Employment status", "General quality of life",
        "Social relationships", "Addressing medical needs", "Mental health", "No improvements", "Don't know",
      ] },
    { key: "justiceStatus", label: "If applicable, what was their criminal justice status after not completing the program?", type: "multi", options: [
      "Conditional discharge", "Conditional release", "Community supervision", "Jail", "Case referred to DA's office",
      "Charges filed", "Warrant issued", "Other county programming", "Social referral - No charges associated with event", "Other", "Don't know",
    ] },
    { key: "completionCriteria", label: "What criteria qualified them for completion?", type: "multi", hint: "Select all that apply.", options: [
      "Completed an SUD assessment", "Engaged with treatment plan for required period of time", "Continued engagement with treatment plan",
      "Reduction in substance use", "Maintained engagement with outreach and peer partners", "Other",
    ] },
    { key: "chargeDisposition", label: "Disposition of deflection charges", type: "multi", options: [
      "No charge(s) filed with DA", "Charge(s) dismissed", "Social referral - no charges associated with event", "Other", "Don't know",
    ] },
  ] },
  { title: "Situation at program completion", fields: [
    { key: "housing", label: "Housing situation at program completion", type: "multi", options: housingOptions },
    { key: "housingStable", label: "Is the housing situation stable?", type: "single", options: yesNoUnknown },
    { key: "housingSafe", label: "Is the housing situation safe?", type: "single", options: yesNoUnknown },
    { key: "employment", label: "Employment status at program completion", type: "multi", options: intakeOptions("employment") },
    { key: "medicalNeeds", label: "Medical needs at program completion", type: "multi", options: intakeOptions("medicalNeeds") },
    { key: "foodReceiving", label: "Currently receiving food assistance?", type: "single", options: yesNoUnknown },
    { key: "foodNeeded", label: "Need food assistance?", type: "single", options: yesNoUnknown },
    { key: "insurance", label: "Insurance status at program completion", type: "multi", options: intakeOptions("insurance") },
    { key: "journey", label: "Is there anything else you would like to share about this participant's journey through the deflection program? (optional)", type: "textarea" },
    { key: "date", label: "Date", type: "date" },
    { key: "navigator", label: "Program navigator name", type: "text" },
    { key: "reviewNote", label: "Note for reviewer (optional)", type: "textarea", hint: "Visible to users who can access this referral." },
  ] },
];
export const completionFields = completionSections.flatMap((section) => section.fields);
export type CompletionAnswers = Record<string, string | string[]>;
const shape: Record<string, z.ZodType<string | string[]>> = {};
for (const field of completionFields) {
  if (field.type === "multi") {
    shape[field.key] = z.array(z.string()).max(field.options!.length).default([]);
  } else if (field.type === "date") {
    shape[field.key] = z.union([z.literal(""), z.iso.date()]).refine(
      (date) => !date || date <= new Date().toISOString().slice(0, 10), "Dates cannot be in the future.",
    ).default("");
  } else {
    shape[field.key] = z.string().trim().max(field.type === "textarea" ? 2000 : 500).default("");
  }
  if (field.options?.includes("Other")) shape[`${field.key}Other`] = z.string().trim().max(500).default("");
}
export const completionSchema = z.strictObject(shape).superRefine((answers, context) => {
  for (const field of completionFields) {
    if (!field.options) continue;
    const value = answers[field.key];
    const values: string[] = Array.isArray(value) ? value : value ? [value] : [];
    if (values.some((entry) => !field.options!.includes(entry)) || new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", path: [field.key], message: `Choose valid, non-duplicate answers for ${field.label}` });
    }
    if (values.length > 1 && values.some((entry) => ["Don't know", "None", "No improvements", "Uninsured"].includes(entry))) {
      context.addIssue({ code: "custom", path: [field.key], message: `None, unknown, or uninsured cannot be combined with other answers for ${field.label}` });
    }
    if (field.options.includes("Other")) {
      const other = answers[`${field.key}Other`];
      if (values.includes("Other") !== !!other) {
        context.addIssue({ code: "custom", path: [field.key], message: `Select Other and provide details for ${field.label}, or clear both.` });
      }
    }
  }
});

export function parseCompletionForm(form: FormData): CompletionAnswers {
  const input: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};
  for (const field of completionFields) {
    input[field.key] = field.type === "multi" ? form.getAll(field.key) : form.get(field.key) ?? "";
    if (field.options?.includes("Other")) input[`${field.key}Other`] = form.get(`${field.key}Other`) ?? "";
  }
  const result = completionSchema.safeParse(input);
  if (!result.success) throw new WorkflowError(result.error.issues[0]?.message ?? "Invalid Program Completion answers.", "invalid");
  return result.data;
}
