import { identificationOptions, mentalHealthDiagnoses, screeningTools, screeningsReceived, serviceCategories, substanceTypes, type ScreeningServicesAnswers } from "@/lib/screening-service-schema";
import { CollapsibleSection } from "./collapsible-section";

export function ScreeningServicesView({ answers }: { answers: ScreeningServicesAnswers }) {
  const fields: [string, string | string[]][] = [
    ["Screenings and assessments during deflection", [...answers.screeningTypes, answers.screeningTypesOther].filter(Boolean)],
    ["Substance use disorder", answers.substanceDisorder || "Unanswered"],
    ["Substance disorder identification", [...answers.substanceIdentification, answers.substanceIdentificationOther].filter(Boolean)],
    ["Substance types", [...answers.substanceTypes, answers.substanceTypesOther].filter(Boolean)],
    ["Mental health disorder", answers.mentalHealthDisorder || "Unanswered"],
    ["Mental health identification", [...answers.mentalHealthIdentification, answers.mentalHealthIdentificationOther].filter(Boolean)],
    ["Mental health diagnosis", [...answers.mentalHealthDiagnoses, answers.mentalHealthDiagnosesOther].filter(Boolean)],
    ["Screenings received in the program", answers.screeningsReceived],
    ["ASAM completion date", answers.asamCompletionDate || "Unanswered"],
    ["ASAM completion location", answers.asamLocation || "Unanswered"],
    ["Referral types", [...answers.referralTypes, answers.referralTypesOther].filter(Boolean)],
  ];
  const value = (answer: string | string[]) => Array.isArray(answer) ? answer.join("; ") || "Unanswered" : answer;
  return <div className="space-y-4">
    {answers.reviewNote && <CollapsibleSection title="Note for reviewer" className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-950" contentClassName="mt-2">
      <p className="mt-2 whitespace-pre-wrap text-sm text-blue-900">{answers.reviewNote}</p>
    </CollapsibleSection>}
    <CollapsibleSection title="Screening and assessment details">
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">{fields.map(([label, answer]) => <div key={label}>
        <dt className="text-sm text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm">{value(answer)}</dd>
      </div>)}</dl></CollapsibleSection>
    {Object.entries(serviceCategories).map(([category, names]) => {
      const entries = names.map((name) => [name, answers.services[name]] as const).filter(([, service]) =>
        service.statuses.length || service.reasons.length || service.otherService);
      return <CollapsibleSection key={category} title={category} level={3}>
        {!entries.length ? <p className="mt-3 text-sm text-slate-500">No services recorded.</p> :
          <dl className="mt-3 space-y-3">{entries.map(([name, service]) => <div key={name} className="border-t border-slate-100 pt-3">
            <dt className="font-semibold">{name}</dt><dd className="mt-1 text-sm text-slate-600">
              {[...service.statuses, ...service.reasons, service.otherService].filter(Boolean).join("; ")}
            </dd>
          </div>)}</dl>}
      </CollapsibleSection>;
    })}
    <p className="text-xs text-slate-500">Controlled answer options: {screeningTools.length} screenings, {identificationOptions.length} identification methods, {substanceTypes.length} substance types, {mentalHealthDiagnoses.length} diagnoses, and {screeningsReceived.length} program screening options.</p>
  </div>;
}
