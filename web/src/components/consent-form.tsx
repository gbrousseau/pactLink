"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { consentAction } from "@/app/actions";
import type { ConsentVersion } from "@/lib/consent";
import type { CaseFileAnswers } from "@/lib/case-file";
import { consentInitialValues } from "@/lib/consent-prefill";
import { signatureSchema, signatureStatement, type Signature } from "@/lib/consent-signature";
import { SignaturePad } from "./signature-pad";

export function ConsentForm({ id, revision, current, prefill }: { id?: string; revision?: number; current?: ConsentVersion; prefill?: CaseFileAnswers }) {
  const [state, action, pending] = useActionState(consentAction, {});
  const [values, setValues] = useState<Record<string, string>>(() => consentInitialValues(current, prefill));
  const [reviewNote, setReviewNote] = useState(current?.review_note ?? "");
  const [agreed, setAgreed] = useState(false);
  const [signed, setSigned] = useState(false);
  const [signature, setSignature] = useState<Signature>([]);
  const [signatureKey, setSignatureKey] = useState(0);
  const [signatureError, setSignatureError] = useState("");
  const [signatureInvalidated, setSignatureInvalidated] = useState(false);
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
  const invalidSignature = signature.length > 0 && !signatureSchema.safeParse(signature).success;
  return <form action={action} className="panel space-y-6" onChangeCapture={() => {
    if (signature.length || signatureError) {
      setSignature([]);
      setSignatureError("");
      setSignatureInvalidated(true);
      setSignatureKey((key) => key + 1);
    }
  }}>
    {id && <><input type="hidden" name="id" value={id} /><input type="hidden" name="revision" value={revision} /></>}
    <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Synthetic data and synthetic PDFs only. The confirmations are staff attestations, not verification of a signature or legal consent. Withdrawal is not implemented.</p>
    {!current && prefill && <p className="text-sm text-slate-600">Available identity and contact fields were prefilled from the Case File. Verify them before submitting.</p>}
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
    <label className="block text-sm font-semibold">Note for reviewer (optional)
      <textarea className="input mt-2" name="reviewNote" rows={4} maxLength={2000} value={reviewNote}
        onChange={(event) => setReviewNote(event.target.value)} />
      <span className="mt-1 block text-xs font-normal text-slate-500">Share context about this consent submission. Visible only to the original consent submitter and administrators.</span>
    </label>
    <section className="space-y-3 rounded-lg border border-slate-300 p-4" aria-labelledby="signature-heading">
      <h2 id="signature-heading" className="font-semibold">Participant signature (optional, synthetic only)</h2>
      <p className="text-sm">Participant: {[values.firstName, values.middleName, values.lastName].filter(Boolean).join(" ") || "Enter the participant name above."}</p>
      <p className="text-sm">{signatureStatement}</p>
      <p className="text-sm font-semibold">Signature</p>
      {signatureInvalidated && <p role="alert" className="text-sm text-amber-800">The form changed after signing, so the signature was cleared. Sign again or select Clear signature to submit without it.</p>}
      {invalidSignature && <p role="alert" className="text-sm text-red-700">Draw a signature or clear the pad.</p>}
      <SignaturePad key={signatureKey} signature={signature} disabled={pending} error={signatureError}
        onError={setSignatureError} onChange={(value) => { setSignature(value); setSignatureInvalidated(false); }} />
      <input type="hidden" name="signature" value={signature.length ? JSON.stringify(signature) : ""} />
    </section>
    <div className="flex flex-wrap gap-4"><button className="btn-primary" disabled={pending || signatureInvalidated || !!signatureError || invalidSignature}>{pending ? "Submitting…" : "Submit consent"}</button>
      <Link href={id ? `/forms/${id}` : "/forms"} className="btn-secondary">Cancel</Link></div>
  </form>;
}
