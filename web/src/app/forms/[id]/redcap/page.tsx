import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canReview } from "@/lib/access";
import { getApprovedVersions, getSubmission } from "@/lib/submissions";
import { loadRedcapCodebook } from "@/lib/redcap-codebook";
import { prefillPrototype } from "@/lib/redcap-prototype";
import { RedcapPrototypeForm } from "@/components/redcap-prototype-form";
import { listConsent } from "@/lib/consent";

export default async function RedcapPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const submission = await getSubmission(user, id);
  if (!submission || !canReview(user, submission.group_id) || submission.review_state !== "approved" || submission.status === "archived" || submission.removed_at) notFound();
  if (!(await listConsent(user, id)).length) notFound();
  const [versions, codebook] = await Promise.all([getApprovedVersions(user, id), loadRedcapCodebook()]);
  if (!versions[0]) notFound();
  const prefill = prefillPrototype(versions[0].answers, codebook);
  delete prefill.dob;
  return <div className="space-y-6">
    <Link href={`/forms/${id}`} className="text-sm text-teal-800 underline">Back to referral</Link>
    <h1 className="text-3xl font-bold">Synthetic REDCap prototype</h1>
    <RedcapPrototypeForm id={id} version={versions[0].version} fields={codebook.fields} hash={codebook.hash} initial={prefill} />
  </div>;
}
