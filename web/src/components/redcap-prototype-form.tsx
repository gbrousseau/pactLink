"use client";

import { useActionState, useState } from "react";
import { redcapPrototypeAction } from "@/app/actions";
import type { RedcapField } from "@/lib/redcap-codebook";
import type { PrototypeValues } from "@/lib/redcap-prototype";
import type { PrefillResult } from "@/lib/redcap-prefill";

export function RedcapPrototypeForm({ id, versions, fields, hash, prefill }: {
  id: string; versions: { intake: number; screening: number | null; completion: number | null }; fields: RedcapField[]; hash: string; prefill: PrefillResult;
}) {
  const [state, action, pending] = useActionState(redcapPrototypeAction, {});
  const [values, setValues] = useState<PrototypeValues>(prefill.values);
  const sections = [...new Set(fields.map((field) => field.section))];
  const set = (name: string, value: string | string[]) => setValues((old) => ({ ...old, [name]: value }));
  return <form action={action} className="space-y-5">
    <input type="hidden" name="submissionId" value={id} />
    <input type="hidden" name="approvedVersion" value={versions.intake} />
    <input type="hidden" name="screeningVersion" value={versions.screening ?? "none"} />
    <input type="hidden" name="completionVersion" value={versions.completion ?? "none"} />
    <input type="hidden" name="codebookHash" value={hash} />
    <div className="rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950 space-y-2">
      <p className="font-bold">Synthetic prototype only. Do not upload to REDCap or use real personal, legal, or health data.</p>
      <p>The JSON format, conditional rules and completeness have not been verified. All codebook questions are shown, including conditional ones; check applicability manually. Blank questions are omitted, not marked as no. A generated file is not a REDCap submission.</p>
      <p>Sources: approved Intake version {versions.intake}; Screening and Services {versions.screening ? `version ${versions.screening}` : "not currently approved"}; Program Completion {versions.completion ? `version ${versions.completion}` : "not currently available or approved"}. Only currently approved phases are used.</p>
      <p>Equivalent approved answers are prefilled where unambiguous. Names and date of birth are restricted to Consent and cannot be included. Review every answer, including flagged mappings and conditions.</p>
      {Object.keys(prefill.issues).length > 0 && <p>{Object.keys(prefill.issues).length} field(s) need manual mapping review; warnings appear alongside the relevant questions.</p>}
      {prefill.unmapped.length > 0 && <p>Source information without a direct mapping: {prefill.unmapped.join("; ")}. Review manually.</p>}
      <p>New answers entered here are not separately reviewed or approved; approvals apply only to the source phase snapshots.</p>
    </div>
    {sections.map((section, index) => <details key={section} className="panel" open={index === 0}>
      <summary className="cursor-pointer text-lg font-bold">{section}</summary>
      <div className="mt-4 space-y-6">
        {fields.filter((field) => field.section === section).map((field) => {
          const value = values[field.name];
          const selected = Array.isArray(value) ? value : [];
          const scalar = typeof value === "string" ? value : "";
          return <div key={field.name} className="border-t border-slate-200 pt-4">
            <label htmlFor={`redcap-${field.name}`} className="block whitespace-pre-line text-sm font-semibold">{field.label}</label>
            <p className="mt-1 text-xs text-slate-500">{field.name}{field.attributes.includes("Required") ? " · Codebook says required when applicable" : ""}</p>
            {field.condition && <p className="mt-1 whitespace-pre-line text-xs text-amber-800">Codebook condition (check manually): {field.condition}</p>}
            {prefill.issues[field.name] && <p className="mt-1 text-sm font-semibold text-amber-800">{prefill.issues[field.name]}</p>}
            {field.name === "id" && <p className="mt-1 text-xs font-semibold text-slate-700">The participant ID is used as the record ID. UUID compatibility and import behavior are not verified.</p>}
            {field.type === "checkbox" ? <fieldset className="mt-2 grid gap-2 sm:grid-cols-2"><legend className="sr-only">{field.label}</legend>
              {field.choices.map((choice) => <label key={choice.code} className="flex items-start gap-2 text-sm"><input type="checkbox" name={field.name} value={choice.code}
                checked={selected.includes(choice.code)} onChange={(event) => set(field.name, event.target.checked ? [...selected, choice.code] : selected.filter((item) => item !== choice.code))} />{choice.label}</label>)}
            </fieldset> : field.choices.length ? <select id={`redcap-${field.name}`} name={field.name} value={scalar} onChange={(event) => set(field.name, event.target.value)} className="input mt-2">
              <option value="">Unanswered</option>{field.choices.map((choice) => <option key={choice.code} value={choice.code}>{choice.label}</option>)}
            </select> : field.type === "notes" ? <textarea id={`redcap-${field.name}`} name={field.name} value={scalar} onChange={(event) => set(field.name, event.target.value)} maxLength={2000} rows={3} className="input mt-2" /> :
              <input id={`redcap-${field.name}`} name={field.name} value={scalar} onChange={(event) => set(field.name, event.target.value)}
                type={field.attributes.includes("date_mdy") ? "date" : "text"} maxLength={field.name === "id" ? 100 : 2000} readOnly={field.name === "id"} className="input mt-2" />}
          </div>;
        })}
      </div>
    </details>)}
    <label className="flex items-start gap-2 text-sm font-semibold"><input name="synthetic" type="checkbox" value="yes" required /> I confirm this contains synthetic data only and is not for REDCap import.</label>
    {state.error && <p role="alert" className="error-box">{state.error}</p>}
    <button className="btn-primary" disabled={pending}>{pending ? "Generating..." : "Generate synthetic prototype JSON"}</button>
  </form>;
}
