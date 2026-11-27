import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canEdit } from "@/lib/access";
import { listConsent } from "@/lib/consent";
import { getSubmission } from "@/lib/submissions";
import { ConsentForm } from "@/components/consent-form";
import { CollapsibleSection } from "@/components/collapsible-section";
import { getCaseFile } from "@/lib/case-file";

export default async function ConsentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const row = await getSubmission(user, id);
  if (!row) notFound();
  const versions = await listConsent(user, id);
  if (row.has_consent && !versions.length) notFound();
  const canChange = canEdit(user, row.group_id) && !row.removed_at && row.status !== "archived";
  if (!row.has_consent && !canChange) notFound();
  const caseFile = !row.has_consent && canChange ? await getCaseFile(user, id) : null;
  return <div className="space-y-6"><div><p className="text-xs font-bold uppercase tracking-widest text-teal-700">Phase 2 of 5</p>
    <h1 className="mt-2 text-3xl font-bold">{versions.length ? "Consent review" : "Submit consent"}</h1></div>
    <Link className="text-sm text-teal-800 underline" href={`/forms/${id}`}>Return to referral</Link>
    {versions.length > 0 && <CollapsibleSection title="Consent versions">
      <p className="text-xs text-slate-500">Confirmations are staff attestations, not verification of signatures or legal consent. Withdrawal is not implemented. Documents are optional and retained by version.</p>
      {versions.map((consent) => <details key={consent.version} className="rounded-lg border border-slate-200 p-4" open={consent.version === versions[0].version}>
        <summary className="cursor-pointer text-sm font-semibold">Version {consent.version} · {consent.display_name} · {consent.created_at.toISOString()}</summary>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          {[["Name", [consent.first_name, consent.middle_name, consent.last_name].filter(Boolean).join(" ")], ["Date of birth", consent.date_of_birth],
            ["Address", consent.address], ["Phone", consent.phone], ["Email", consent.email], ["Emergency contact", consent.emergency_name || "Not provided"],
            ["Emergency phone", consent.emergency_phone || "Not provided"], ["Sharing and signed-document confirmations", "Attested"]].map(([label, value]) =>
            <div key={label}><dt className="text-slate-500">{label}</dt><dd className="break-words">{value}</dd></div>)}
          <div className="sm:col-span-2"><dt className="text-slate-500">Note for reviewer</dt><dd className="mt-1 whitespace-pre-wrap break-words">{consent.review_note || "No note provided."}</dd></div>
        </dl>
        <p className="mt-3 text-sm">{consent.has_document ? <a className="text-teal-800 underline" href={`/forms/${id}/consent/${consent.version}`}>Download synthetic consent PDF</a> : "No PDF stored for this version."}</p>
      </details>)}
    </CollapsibleSection>}
    {canChange && <CollapsibleSection title={versions.length ? "Correct consent" : "Consent form"} className="space-y-4">
      {versions.length > 0 && <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Submitting a correction creates a new Consent version immediately. Consent has no separate approval step; existing Intake and later approvals remain unchanged.</p>}
      <ConsentForm id={id} revision={row.revision} current={versions[0]} prefill={caseFile?.answers} />
    </CollapsibleSection>}
  </div>;
}
