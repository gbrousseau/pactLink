import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canEdit } from "@/lib/access";
import { listConsent } from "@/lib/consent";
import { getSubmission } from "@/lib/submissions";
import { ConsentForm } from "@/components/consent-form";

export default async function ConsentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const row = await getSubmission(user, id);
  if (!row) notFound();
  if (!canEdit(user, row.group_id) || row.removed_at || row.status === "archived") {
    return <p role="alert" className="error-box">Consent cannot be changed for this record. <Link className="underline" href={`/forms/${id}`}>Return to referral</Link></p>;
  }
  const versions = await listConsent(user, id);
  return <div className="space-y-6"><div><p className="text-xs font-bold uppercase tracking-widest text-teal-700">Phase 1 of 4</p>
    <h1 className="mt-2 text-3xl font-bold">{versions.length ? "Correct consent" : "Submit consent"}</h1></div>
    <ConsentForm id={id} revision={row.revision} current={versions[0]} />
  </div>;
}
