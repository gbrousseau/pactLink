"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { consentAction } from "@/app/actions";
import type { ConsentVersion } from "@/lib/consent";

export function ConsentForm({ id, revision, current }: { id?: string; revision?: number; current?: ConsentVersion }) {
  const [state, action, pending] = useActionState(consentAction, {});
  const [values, setValues] = useState<Record<string, string>>({
    firstName: current?.first_name ?? "", middleName: current?.middle_name ?? "",
    lastName: current?.last_name ?? "", dob: current?.date_of_birth ?? "",
    address: current?.address ?? "", phone: current?.phone ?? "", email: current?.email ?? "",
    emergencyName: current?.emergency_name ?? "", emergencyPhone: current?.emergency_phone ?? "",
  });
  const [agreed, setAgreed] = useState(false);
  const [signed, setSigned] = useState(false);
  const fields = [
    { name: "firstName", label: "First name", value: current?.first_name, required: true },
    { name: "middleName", label: "Middle name", value: current?.middle_name },
    { name: "lastName", label: "Last name", value: current?.last_name, required: true },
    { name: "dob", label: "Date of birth", value: current?.date_of_birth, required: true, type: "date" },
    { name: "address", label: "Address", value: current?.address, required: true },
    { name: "phone", label: "Phone", value: current?.phone, required: true, type: "tel" },
    { name: "email", label: "Email", value: current?.email, required: true, type: "email" },
    { name: "emergencyName", label: "Emergency contact name", value: current?.emergency_name },
    { name: "emergencyPhone", label: "Emergency contact phone", value: current?.emergency_phone, type: "tel" },
  ];
  return <form action={action} className="panel space-y-6">
    {id && <><input type="hidden" name="id" value={id} /><input type="hidden" name="revision" value={revision} /></>}
    <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Synthetic data and synthetic PDFs only. The confirmations are staff attestations, not verification of a signature or legal consent. Withdrawal is not implemented.</p>
    {current && <p className="text-sm text-slate-600">Submitting creates a new consent version; previous versions and documents remain available. A document is optional for each version.</p>}
    {state.error && <p role="alert" className="error-box">{state.error} If you selected a PDF, check that it is still selected before retrying.</p>}
    <div className="grid gap-5 md:grid-cols-2">{fields.map((field) => <label key={field.name} className="block text-sm font-semibold">
      {field.label}{field.required && " *"}
      <input className="input mt-2" name={field.name} type={field.type ?? "text"} value={values[field.name]} onChange={(event) => setValues((old) => ({ ...old, [field.name]: event.target.value }))} required={field.required} maxLength={field.type === "date" ? undefined : 500} />
    </label>)}</div>
    <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="agreed" value="yes" required checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className="mt-1" />The client has agreed to share information with the DA and Love One / Peer Support / Navigator Team. *</label>
    <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="signed" value="yes" required checked={signed} onChange={(event) => setSigned(event.target.checked)} className="mt-1" />The client has signed the document. *</label>
    <label className="block text-sm font-semibold">Signed consent PDF (optional, synthetic only, maximum 4 MiB)
      <input className="input mt-2" type="file" name="document" accept="application/pdf,.pdf" />
    </label>
    <div className="flex flex-wrap gap-4"><button className="btn-primary" disabled={pending}>{pending ? "Submitting…" : "Submit consent"}</button>
      <Link href={id ? `/forms/${id}` : "/forms"} className="btn-secondary">Cancel</Link></div>
  </form>;
}
