"use client";

import { useActionState, useState } from "react";
import { saveProgramCompletionAction } from "@/app/actions";
import { completionSections, type CompletionAnswers } from "@/lib/program-completion-schema";

export function ProgramCompletionForm({ id, revision, initial }: { id: string; revision?: number; initial: CompletionAnswers }) {
  const [state, action, pending] = useActionState(saveProgramCompletionAction, {});
  const [answers, setAnswers] = useState(initial);
  const set = (key: string, value: string | string[]) => setAnswers((old) => ({ ...old, [key]: value }));
  return <form action={action} className="space-y-6">
    <input type="hidden" name="id" value={id} />
    <input type="hidden" name="revision" value={revision ?? ""} />
    <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Synthetic data only. Name and date of birth are captured in Consent. Leave unanswered items blank; the reviewer should assess completeness.</p>
    {state.error && <p role="alert" className="error-box">{state.error}</p>}
    {completionSections.map((section) => <section key={section.title} className="panel space-y-7">
      <h2 className="text-xl font-bold">{section.title}</h2>
      {section.fields.map((field) => {
        const answer = answers[field.key] ?? (field.type === "multi" ? [] : "");
        const selected = Array.isArray(answer) ? answer : answer ? [answer] : [];
        return <div key={field.key}>
          {field.options ? <fieldset>
            <legend className="text-sm font-semibold">{field.label}</legend>
            {field.hint && <p className="mt-1 text-xs text-slate-500">{field.hint}</p>}
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {field.options.map((option) => <label key={option} className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm">
                <input type={field.type === "multi" ? "checkbox" : "radio"} name={field.key} value={option}
                  checked={selected.includes(option)} className="mt-1 shrink-0 accent-teal-800"
                  onChange={(event) => set(field.key, field.type === "multi"
                    ? event.target.checked ? [...selected, option] : selected.filter((item) => item !== option) : option)} />
                {option}
              </label>)}
            </div>
            {field.type === "single" && selected.length > 0 && <button type="button" className="mt-2 text-xs text-teal-800 underline" onClick={() => set(field.key, "")}>Clear answer</button>}
          </fieldset> : <label className="block text-sm font-semibold">{field.label}
            {field.type === "textarea"
              ? <textarea name={field.key} className="input mt-2" rows={4} maxLength={2000}
                value={typeof answer === "string" ? answer : ""} onChange={(event) => set(field.key, event.target.value)} />
              : <input name={field.key} className="input mt-2" type={field.type} maxLength={field.type === "text" ? 500 : undefined}
                value={typeof answer === "string" ? answer : ""} onChange={(event) => set(field.key, event.target.value)} />}
            {field.hint && <span className="mt-1 block text-xs font-normal text-slate-500">{field.hint}</span>}
          </label>}
          {field.options?.includes("Other") && selected.includes("Other") && <label className="mt-3 block text-sm font-semibold">
            Specify other
            <input name={`${field.key}Other`} className="input mt-2" maxLength={500}
              value={typeof answers[`${field.key}Other`] === "string" ? answers[`${field.key}Other`] : ""}
              onChange={(event) => setAnswers((old) => ({ ...old, [`${field.key}Other`]: event.target.value }))} />
          </label>}
        </div>;
      })}
    </section>)}
    <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save Program Completion draft"}</button>
  </form>;
}
