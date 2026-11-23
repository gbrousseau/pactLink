"use client";

import { useActionState, useState } from "react";
import { redcapPrototypeAction } from "@/app/actions";
import type { RedcapField } from "@/lib/redcap-codebook";
import type { PrototypeValues } from "@/lib/redcap-prototype";

export function RedcapPrototypeForm({ id, version, fields, hash, initial }: {
  id: string; version: number; fields: RedcapField[]; hash: string; initial: PrototypeValues;
}) {
  const [state, action, pending] = useActionState(redcapPrototypeAction, {});
  const [values, setValues] = useState<PrototypeValues>(initial);
  const sections = [...new Set(fields.map((field) => field.section))];
  const set = (name: string, value: string | string[]) => setValues((old) => ({ ...old, [name]: value }));
  return <form action={action} className="space-y-5">
    <input type="hidden" name="submissionId" value={id} />
    <input type="hidden" name="approvedVersion" value={version} />
    <input type="hidden" name="codebookHash" value={hash} />
    <div className="rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950 space-y-2">
      <p className="font-bold">Synthetic prototype only. Do not upload to REDCap or use real personal, legal, or health data.</p>
      <p>The JSON format, conditional rules and completeness have not been verified. All codebook questions are shown, including conditional ones; check applicability manually. Blank questions are omitted, not marked as no. A generated file is not a REDCap submission.</p>
      <p>Only dates and checkbox answers with exact, unambiguous equivalents were prefilled from approved version {version}. Names, ambiguous choices and confirmation fields must be entered and checked manually. Verify every prefilled answer.</p>
      <p>New answers entered here are not separately reviewed or approved; the approval applies only to the source Intake.</p>
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
            {field.name === "id" && <p className="mt-1 text-xs font-semibold text-slate-700">Optional: leave blank for a new record. If using an existing synthetic REDCap record ID, enter and confirm it. ID assignment and import behavior are not verified.</p>}
            {field.type === "checkbox" ? <fieldset className="mt-2 grid gap-2 sm:grid-cols-2"><legend className="sr-only">{field.label}</legend>
              {field.choices.map((choice) => <label key={choice.code} className="flex items-start gap-2 text-sm"><input type="checkbox" name={field.name} value={choice.code}
                checked={selected.includes(choice.code)} onChange={(event) => set(field.name, event.target.checked ? [...selected, choice.code] : selected.filter((item) => item !== choice.code))} />{choice.label}</label>)}
            </fieldset> : field.choices.length ? <select id={`redcap-${field.name}`} name={field.name} value={scalar} onChange={(event) => set(field.name, event.target.value)} className="input mt-2">
              <option value="">Unanswered</option>{field.choices.map((choice) => <option key={choice.code} value={choice.code}>{choice.label}</option>)}
            </select> : field.type === "notes" ? <textarea id={`redcap-${field.name}`} name={field.name} value={scalar} onChange={(event) => set(field.name, event.target.value)} maxLength={2000} rows={3} className="input mt-2" /> :
              <input id={`redcap-${field.name}`} name={field.name} value={scalar} onChange={(event) => set(field.name, event.target.value)}
                type={field.attributes.includes("date_mdy") ? "date" : "text"} maxLength={field.name === "id" ? 100 : 2000} className="input mt-2" />}
            {field.name === "id" && <div className="mt-3"><label htmlFor="confirm-record-id" className="block text-sm font-semibold">Re-enter synthetic record ID, if provided</label>
              <input id="confirm-record-id" name="confirmRecordId" value={typeof values.confirmRecordId === "string" ? values.confirmRecordId : ""}
                onChange={(event) => set("confirmRecordId", event.target.value)} maxLength={100} required={!!scalar.trim()} className="input mt-2" /></div>}
          </div>;
        })}
      </div>
    </details>)}
    <label className="flex items-start gap-2 text-sm font-semibold"><input name="synthetic" type="checkbox" value="yes" required /> I confirm this contains synthetic data only and is not for REDCap import.</label>
    {state.error && <p role="alert" className="error-box">{state.error}</p>}
    <button className="btn-primary" disabled={pending}>{pending ? "Generating..." : "Generate synthetic prototype JSON"}</button>
  </form>;
}
