import { completionSections, type CompletionAnswers } from "@/lib/program-completion-schema";
import { CollapsibleSection } from "./collapsible-section";

export function ProgramCompletionView({ answers }: { answers: CompletionAnswers }) {
  return <div className="space-y-4">{completionSections.map((section) => <CollapsibleSection key={section.title} title={section.title}>
    <dl className="mt-4 grid gap-4 sm:grid-cols-2">{section.fields.map((field) => {
      const answer = answers[field.key];
      const value = Array.isArray(answer) ? answer.join("; ") : answer;
      const other = answers[`${field.key}Other`];
      return <div key={field.key}><dt className="text-sm text-slate-500">{field.label}</dt>
        <dd className="mt-1 whitespace-pre-wrap break-words text-sm">{value || "Unanswered"}{typeof other === "string" && other && ` (${other})`}</dd></div>;
    })}</dl>
  </CollapsibleSection>)}</div>;
}
