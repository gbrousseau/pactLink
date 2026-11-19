import { z } from "zod";
import { intakeFields, intakeSections, otherOption } from "./intake-fields";

export type Answers = Record<string, string | string[]>;
export type FieldErrors = Record<string, string>;
export type IntakeCompleteness = {
  sections: number[];
  missingBySection: string[][];
  totalMissing: number;
};
export const isoDate = z.iso.date();
const answerShape: Record<string, z.ZodType> = {};
for (const field of intakeFields) {
  answerShape[field.key] = field.type === "multi"
    ? z.array(z.string().max(250)).max(field.options?.length ?? 30).default([])
    : z.string().max(500).default("");
  if (otherOption(field)) answerShape[`${field.key}Other`] = z.string().max(500).default("");
}
export const answersSchema = z.strictObject(answerShape);

export function getIntakeCompleteness(answers: Answers): IntakeCompleteness {
  const missingBySection = intakeSections.map((section) => section.fields.flatMap((field) => {
    if (field.when && answers[field.when.key] !== field.when.value) return [];
    const value = answers[field.key];
    const hasAnswer = Array.isArray(value)
      ? value.some((entry) => entry.trim().length > 0)
      : typeof value === "string" && value.trim().length > 0;
    const missing = hasAnswer ? [] : [field.key];
    const other = otherOption(field);
    if (other) {
      const selected = Array.isArray(value) ? value : value ? [value] : [];
      const otherValue = answers[`${field.key}Other`];
      if (selected.includes(other) && (typeof otherValue !== "string" || !otherValue.trim())) {
        missing.push(`${field.key}Other`);
      }
    }
    return missing;
  }));
  return {
    sections: missingBySection.map((missing) => missing.length),
    totalMissing: missingBySection.reduce((sum, missing) => sum + missing.length, 0),
    missingBySection,
  };
}

export function parseFormAnswers(form: FormData): Answers {
  const answers: Answers = {};
  for (const field of intakeFields) {
    const value = field.type === "multi" ? form.getAll(field.key) : form.get(field.key) ?? "";
    if (Array.isArray(value)) {
      answers[field.key] = value.map((entry) => {
        if (typeof entry !== "string") throw new Error("File uploads are not supported.");
        return entry.trim();
      });
    } else {
      if (typeof value !== "string") throw new Error("File uploads are not supported.");
      answers[field.key] = value.trim();
    }
    if (otherOption(field)) {
      const other = form.get(`${field.key}Other`) ?? "";
      if (typeof other !== "string") throw new Error("File uploads are not supported.");
      answers[`${field.key}Other`] = other.trim();
    }
  }
  return answers;
}

export function validateAnswers(answers: Answers, submit: boolean, today = new Date().toISOString().slice(0, 10)): FieldErrors {
  const errors: FieldErrors = {};
  const parsed = answersSchema.safeParse(answers);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors[String(issue.path[0] ?? "form")] = issue.message;
    return errors;
  }
  for (const field of intakeFields) {
    const value = answers[field.key] ?? (field.type === "multi" ? [] : "");
    const selected = Array.isArray(value) ? value : value ? [value] : [];
    if (submit && field.required && selected.length === 0) errors[field.key] = `${field.label} is required to submit.`;
    if (field.options && selected.some((option) => !field.options?.includes(option))) errors[field.key] = "Select a listed option.";
    if (new Set(selected).size !== selected.length) errors[field.key] = "Duplicate selections are not allowed.";
    if (field.type === "date" && typeof value === "string" && value) {
      if (!isoDate.safeParse(value).success) errors[field.key] = "Enter a valid calendar date.";
      else if (value > today) errors[field.key] = "This date cannot be in the future.";
    }
    if (field.type === "tel" && typeof value === "string" && value && !/^[+\d().\s\-x]{7,40}$/i.test(value)) {
      errors[field.key] = "Enter a valid phone number (7-40 characters).";
    }
    const exclusive = ["None", "Don't know", "Prefer Not to Answer", "Uninsured"];
    if (selected.length > 1 && selected.some((option) => exclusive.includes(option))) {
      errors[field.key] = "None, unknown, prefer not to answer, and uninsured cannot be combined with other choices.";
    }
    const other = otherOption(field);
    if (other && selected.includes(other) && submit && !answers[`${field.key}Other`]) {
      errors[`${field.key}Other`] = "Please specify the other answer.";
    }
    if (other && !selected.includes(other) && answers[`${field.key}Other`]) {
      errors[`${field.key}Other`] = "Select the corresponding Other choice or clear this text.";
    }
    if (field.when && answers[field.when.key] !== field.when.value && selected.length) {
      errors[field.key] = "Clear this answer because its condition no longer applies.";
    }
  }
  const birth = answers.dob;
  if (typeof birth === "string" && isoDate.safeParse(birth).success) {
    for (const key of ["contactDate", "eligibilityDate", "date"]) {
      const value = answers[key];
      if (typeof value === "string" && value && value < birth) errors[key] = "Date cannot precede date of birth.";
    }
  }
  return errors;
}
