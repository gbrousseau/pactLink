"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { caseFileAction } from "@/app/actions";
import type { CaseFileAnswers, CaseFileVersion } from "@/lib/case-file";

const fields: { key: keyof CaseFileAnswers; label: string; type?: string; max: number }[] = [
  { key: "firstName", label: "First name", max: 100 }, { key: "middleName", label: "Middle name", max: 100 },
  { key: "lastName", label: "Last name", max: 100 }, { key: "dob", label: "Date of birth", type: "date", max: 10 },
  { key: "address", label: "Address", max: 500 }, { key: "phone", label: "Phone", type: "tel", max: 40 },
  { key: "leContact", label: "LE contact", max: 500 }, { key: "arrestDate", label: "Arrest date", type: "date", max: 10 },
  { key: "leoName", label: "LEO name", max: 200 }, { key: "leContactLocation", label: "LE contact location", max: 500 },
  { key: "agency", label: "Agency", max: 200 }, { key: "agencyReportNumber", label: "Agency report #", max: 200 },
];

export function CaseFileForm({ id, current, groups }: { id?: string; current?: CaseFileVersion | null; groups?: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(caseFileAction, {});
  const [values, setValues] = useState<Partial<CaseFileAnswers>>(current?.answers ?? {});
  return <form action={action} className="panel space-y-6">
    {id && <><input type="hidden" name="id" value={id} /><input type="hidden" name="version" value={current?.version ?? 0} /></>}
    <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Synthetic data and photos only. All fields are optional; Consent can proceed independently. Only administrators see drafts; submitted versions are visible to navigators in the referral group.</p>
    {state.error && <p role="alert" className="error-box">{state.error} If you selected a photo, check it is still selected before retrying.</p>}
    {!id && <label className="block text-sm font-semibold">Referral group<select className="input mt-2" name="groupId" required>
      {groups?.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
    </select></label>}
    <div className="grid gap-5 md:grid-cols-2">{fields.map((field) => <label key={field.key} className="block text-sm font-semibold">
      {field.label}<input className="input mt-2" name={field.key} type={field.type ?? "text"} maxLength={field.type === "date" ? undefined : field.max}
        value={values[field.key] ?? ""} onChange={(event) => setValues((old) => ({ ...old, [field.key]: event.target.value }))} />
    </label>)}</div>
    <label className="block text-sm font-semibold">Incident summary
      <textarea className="input mt-2" name="incidentSummary" rows={10} maxLength={30000} value={values.incidentSummary ?? ""}
        onChange={(event) => setValues((old) => ({ ...old, incidentSummary: event.target.value }))} />
    </label>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-semibold">Scheduled appearance date<input className="input mt-2" name="appearanceDate" type="date" value={values.appearanceDate ?? ""}
        onChange={(event) => setValues((old) => ({ ...old, appearanceDate: event.target.value }))} /></label>
      <label className="block text-sm font-semibold">Scheduled appearance time (local)<input className="input mt-2" name="appearanceTime" type="time" value={values.appearanceTime ?? ""}
        onChange={(event) => setValues((old) => ({ ...old, appearanceTime: event.target.value }))} /></label>
    </div>
    <label className="block text-sm font-semibold">Note for reviewer (optional)
      <textarea className="input mt-2" name="reviewNote" rows={3} maxLength={2000} value={values.reviewNote ?? ""}
        onChange={(event) => setValues((old) => ({ ...old, reviewNote: event.target.value }))} />
    </label>
    <label className="block text-sm font-semibold">Participant photo (optional JPEG or PNG, maximum 4 MiB)
      <input className="input mt-2" type="file" name="photo" accept="image/jpeg,image/png" />
      {current?.has_photo && <span className="mt-1 block text-xs font-normal text-slate-500">Leave blank to keep the current photo; selecting a photo replaces it in the new version.</span>}
    </label>
    <div className="flex flex-wrap gap-4"><button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save Case File"}</button>
      <Link href={id ? `/forms/${id}` : "/forms/new/consent"} className="btn-secondary">{id ? "Cancel" : "Skip to Consent"}</Link></div>
  </form>;
}
