import { completionSections, type CompletionAnswers } from "@/lib/program-completion-schema";

export function ProgramCompletionView({ answers }: { answers: CompletionAnswers }) {
  return <div className="space-y-4">{completionSections.map((section) => <section key={section.title} className="panel">
    <h2 className="text-lg font-bold">{section.title}</h2>
    <dl className="mt-4 grid gap-4 sm:grid-cols-2">{section.fields.map((field) => {
      const answer = answers[field.key];
      const value = Array.isArray(answer) ? answer.join("; ") : answer;
      const other = answers[`${field.key}Other`];
      return <div key={field.key}><dt className="text-sm text-slate-500">{field.label}</dt>
        <dd className="mt-1 whitespace-pre-wrap break-words text-sm">{value || "Unanswered"}{typeof other === "string" && other && ` (${other})`}</dd></div>;
    })}</dl>
  </section>)}</div>;
}
