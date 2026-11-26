import type { RedcapCodebook, RedcapField } from "./redcap-codebook";
import type { ScreeningServicesAnswers } from "./screening-service-schema";
import type { CompletionAnswers } from "./program-completion-schema";
import type { Answers } from "./intake-validation";

export type PrefillSources = {
  participantId: string;
  intake: { version: number; answers: Answers };
  screening: { version: number; answers: ScreeningServicesAnswers } | null;
  completion: { version: number; answers: CompletionAnswers } | null;
};
export type PrefillResult = {
  values: Record<string, string | string[]>;
  issues: Record<string, string>;
  unmapped: string[];
};

const aliases: Record<string, string> = {
  "american indian/alaska native": "American Indian or Alaska Native",
  "full-time employment": "Full time employment",
  "part-time employment": "Part time employment",
  "independent living - difficulty doing errands alone": "Independent living - Difficulty doing errands alone such as visiting a doctor's office or shopping",
  'violation/citation (e.g. low level quality of life crime)': 'Violation/citation (e.g. low level "quality of life" crime)',
  "emergent treatment (ed/urgent care)": "Emergent treatment",
};
const normalize = (value: string) => value.replace(/\s*\{[^}]*\}/g, "").trim().replace(/\s+/g, " ").toLowerCase();
function choiceFor(field: RedcapField, answer: string) {
  const key = normalize(answer);
  const alias = aliases[key];
  return field.choices.find((choice) => normalize(choice.label) === key)
    ?? (alias ? field.choices.find((choice) => normalize(choice.label) === normalize(alias)) : undefined)
    ?? (key === "other" ? field.choices.find((choice) => choice.code === "999") : undefined);
}

const intakeMappings = [
  ["contactDate", "first_contact_date"], ["race", "race", "race_other"],
  ["gender", "gender", "gender_other"], ["disability", "disability"],
  ["firstContact", "first_contact_by", "first_contact_by_other"],
  ["contactLocation", "first_contact_loc", "first_contact_loc_other"],
  ["pathway", "ref_pathway"], ["handoff", "handoff_type", "handoff_type_other"],
  ["eligibilityDate", "elig_date"], ["eligibilityBy", "eligibility_determined_by", "eligibility_determined_by_other"],
  ["charges", "charge"], ["abeyance", "charge_abeyance"], ["qualified", "deflection_qualified"],
  ["disqualification", "disqualified_reason", "disqualified_reason_other"], ["agreed", "entered_deflection"],
  ["housing", "entered_housing", "entered_housing_other"], ["housingStable", "entered_stablehousing"],
  ["housingSafe", "entered_safehousing"], ["employment", "entered_employment", "entered_employment_other"],
  ["medicalNeeds", "entered_medicalneeds"], ["insurance", "entered_insurance"],
] as const;
const screeningMappings = [
  ["screeningTypes", "assessment_type"], ["substanceDisorder", "sud_identified"],
  ["substanceIdentification", "sud_identified_how", "other_sud_identified"],
  ["substanceTypes", "sud_type", "other_sud_type"], ["mentalHealthDisorder", "mhd_identified"],
  ["mentalHealthIdentification", "mhd_identified_how", "mhd_identified_how_other"],
  ["mentalHealthDiagnoses", "mhd_diagnosis", "other_mhd_diagnosis"], ["referralTypes", "refservice"],
] as const;
const completionMappings = [
  ["completed", "completed_deflection"], ["completionDate", "completion_date"], ["leftDate", "left_program_date"],
  ["nonCompletionReasons", "incompleted_reason", "incompleted_reason_other"], ["engagedStaff", "engagement"],
  ["individualizedPlan", "deflection_plan"], ["improvements", "improvement"],
  ["justiceStatus", "incompleted_cjs", "incompleted_cjs_other"],
  ["completionCriteria", "completion_criteria", "completion_criteria_other"],
  ["chargeDisposition", "completed_cjsoutcome", "completed_cjsoutcome_other"],
  ["housing", "completed_housing", "completed_housing_other"], ["housingStable", "completed_stablehousing"],
  ["housingSafe", "completed_safehousing"], ["employment", "completed_employment", "completed_employment_other"],
  ["medicalNeeds", "completed_medneeds"], ["insurance", "completed_insurance"],
] as const;

const services = [
  ["Medically managed inpatient", "inpatient", "inpatient_notrecvd_reason", "SUD treatment"],
  ["Detox/withdrawal management", "detox", "detox_notreceived_reason", "SUD treatment"],
  ["Sobering services", "sobering", "sobering_notreceived_reason", "SUD treatment"],
  ["Residential facility", "res", "res_notrecvd_reason", "SUD treatment"],
  ["Intensive outpatient", "intensive", "intensive_notrecvd_reason", "SUD treatment"],
  ["Outpatient", "outpatient", "outpatient_notrecvd_reason", "SUD treatment"],
  ["Medication for opioid use disorder", "moud", "moud_notreceived_reason", "SUD treatment"],
  ["Medication for alcohol use disorder", "maud", "maud_notreceived_reason", "SUD treatment"],
  ["Medication for stimulant use disorder", "medstim", "medstim_notreceived_reason", "SUD treatment"],
  ["SUD counseling", "sudcounsel", "sudcounsel_notrecvd_reason", "SUD treatment"],
  ["Harm reduction", "harmreduc", "harmreduc_notrecvd_reason", "SUD treatment"],
  ["Recovery support", "recovery", "recovery_notrecvd_reason", "SUD treatment"],
  ["Contingency management", "contin", "contin_notrecvd_reason", "SUD treatment"],
  ["Psychotherapy", "psychother", "psychother_notrecvd_reason", "Mental health treatment"],
  ["Mental health medication", "mhmed", "mhmed_notrecvd_reason", "Mental health treatment"],
  ["Hospitalization", "hospital", "hospital_notrecvd_reason", "Mental health treatment"],
  ["Mental health counseling", "mhcounsel", "mhcounsel_notrecvd_reason", "Mental health treatment"],
  ["Group therapy", "grptherapy", "grptherpay_notrecvd_reason", "Mental health treatment"],
  ["Interpreter services", "interp", "interp_notreceived_reason", "Culturally specific care"],
  ["Translated printed materials", "translat", "translat_notrecvd_reason", "Culturally specific care"],
  ["Language concordant care", "concord", "concord_notrecvd_reason", "Culturally specific care"],
  ["Culturally and linguistically specific services", "culture", "culture_notreceived_reason", "Culturally specific care"],
  ["Housing supports", "housing", "housing_notreceived_reason", "Social and health related services"],
  ["Employment supports", "employment", "employment_notrecvd_reason", "Social and health related services"],
  ["Financial supports (e.g. SSI/SSDI)", "ssi", "ssi_notrecvd_reason", "Social and health related services"],
  ["OHP enrollment", "ohp", "ohp_notreceived_reason", "Social and health related services"],
  ["SNAP enrollment or other food assistance", "snap", "snap_notreceived_reason", "Social and health related services"],
  ["TANF enrollment", "tanf", "tanf_notreceived_reason", "Social and health related services"],
  ["Primary care", "pcp", "pcp_notreceived_reason", "Social and health related services"],
  ["Dental care", "dental", "dental_notreceived_reason", "Social and health related services"],
  ["Intensive case management", "case_mgmt", "case_mgmt_notreceived_reason", "Social and health related services"],
  ["Transportation", "transport", "transport_notreceived_reason", "Social and health related services"],
  ["Cell phone", "phone", "phone_notreceived_reason", "Social and health related services"],
  ["Basic needs (e.g. clothing, hygiene products)", "basic_needs", "basic_needs_notreceived_reason", "Social and health related services"],
  ["Legal assistance", "legal", "legal_notreceived_reason", "Social and health related services"],
  ["ID/Driver's license", "license", "license_notreceived_reason", "Social and health related services"],
  ["Veteran's services", "vet_serv", "vet_serv_notreceived_reason", "Social and health related services"],
  ["Family services", "family", "family_notreceived_reason", "Social and health related services"],
  ["Other service", "other_serv", "other_notreceived_reason", "Social and health related services"],
] as const;

export function prefillFromApproved(sources: PrefillSources, codebook: RedcapCodebook): PrefillResult {
  const result: PrefillResult = { values: { id: sources.participantId }, issues: {}, unmapped: [] };
  const fields = new Map(codebook.fields.map((field) => [field.name, field]));
  const map = (source: Record<string, unknown>, key: string, target: string, other?: string, applicable = true) => {
    const raw = source[key];
    const answers: string[] = Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string" && !!value) : typeof raw === "string" && raw ? [raw] : [];
    if (!answers.length) return;
    const field = fields.get(target);
    if (!field) throw new Error(`Missing REDCap mapping target: ${target}`);
    if (!applicable) {
      result.issues[target] = "An approved source answer may not meet this field's condition. Review manually.";
      return;
    }
    if (field.type === "text" || field.type === "notes") {
      if (answers.length === 1) result.values[target] = answers[0];
      else result.issues[target] = "Multiple source answers require manual review.";
      return;
    }
    const choices = answers.map((answer) => choiceFor(field, answer));
    if (choices.some((choice) => !choice) || (field.type !== "checkbox" && answers.length !== 1)) {
      result.issues[target] = "Source choices do not match unambiguously. Select the appropriate answer manually.";
      return;
    }
    const codes = choices.map((choice) => choice!.code);
    if (new Set(codes).size !== codes.length) {
      result.issues[target] = "Multiple source answers map to one choice. Review manually.";
      return;
    }
    const otherText = source[`${key}Other`];
    if (codes.includes("999") && (!other || typeof otherText !== "string" || !otherText.trim())) {
      result.issues[target] = "The Other choice requires a matching REDCap detail. Review manually.";
      return;
    }
    result.values[target] = field.type === "checkbox" ? codes : codes[0];
    if (codes.includes("999") && other && typeof otherText === "string") result.values[other] = otherText;
  };
  const intake = sources.intake.answers;
  const entered = intake.qualified === "Yes" && intake.agreed === "Yes";
  for (const [key, target, other] of intakeMappings) {
    const applicable = target === "disqualified_reason" ? intake.qualified === "No"
      : target === "entered_deflection" ? intake.qualified === "Yes"
      : target === "charge_abeyance" ? Array.isArray(result.values.charge) && result.values.charge.some((code) => ["2", "3", "4", "5"].includes(code))
      : target.startsWith("entered_") ? entered : true;
    map(intake, key, target, other, applicable);
  }
  if (intake.foodReceiving || intake.foodNeeded) result.issues.entered_foodinsecurity = "Food assistance answers do not directly determine one REDCap choice. Review manually.";

  if (sources.screening) {
    const screening = sources.screening.answers;
    for (const [key, target, other] of screeningMappings) {
      const applicable = entered && (target.startsWith("sud_identified_how") || target === "sud_type" ? screening.substanceDisorder === "Yes"
        : target.startsWith("mhd_identified_how") || target === "mhd_diagnosis" ? screening.mentalHealthDisorder === "Yes" : true);
      map(screening, key, target, other, applicable);
    }
    for (const [name, target, reason, category] of services) {
      const answer = screening.services[name];
      if (!answer) throw new Error(`Missing approved service answer: ${name}`);
      const code = fields.get("refservice")?.choices.find((choice) => choice.label === category)?.code;
      const parent = result.values.refservice;
      const applicable = entered && !!code && Array.isArray(parent) && parent.includes(code);
      map({ status: answer.statuses }, "status", target, undefined, applicable);
      const statuses = result.values[target];
      map({ reason: answer.reasons }, "reason", reason, undefined, Array.isArray(statuses) && statuses.includes("3"));
      if (name === "Other service" && answer.otherService && result.values[target]) result.values.other_serv_type = answer.otherService;
    }
    if (screening.screeningsReceived.length) result.unmapped.push("Program screenings received");
    if (screening.asamCompletionDate || screening.asamLocation) result.unmapped.push("ASAM completion date or location");
    if (screening.screeningTypesOther) result.unmapped.push("Other assessment details");
    if (screening.referralTypesOther) result.unmapped.push("Other referral details");
  }
  if (sources.completion) {
    const completion = sources.completion.answers;
    for (const [key, target, other] of completionMappings) {
      const no = ["leftDate", "nonCompletionReasons", "engagedStaff", "individualizedPlan", "improvements", "justiceStatus"].includes(key);
      const yes = ["completionDate", "completionCriteria", "chargeDisposition", "housing", "housingStable", "housingSafe", "employment", "medicalNeeds", "insurance"].includes(key);
      map(completion, key, target, other, entered && (!no || completion.completed === "No") && (!yes || completion.completed === "Yes"));
    }
    if (completion.foodReceiving || completion.foodNeeded) result.issues.completed_foodinsecurity = "Food assistance answers do not directly determine one REDCap choice. Review manually.";
    if (completion.journey) result.unmapped.push("Program journey notes (check for identifying information before entering)");
  }
  return result;
}
