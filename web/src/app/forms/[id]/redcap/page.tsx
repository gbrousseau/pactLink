import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canReview } from "@/lib/access";
import { getSubmission } from "@/lib/submissions";
import { loadRedcapCodebook } from "@/lib/redcap-codebook";
import { consentIdentityFields, getPrototypeSources } from "@/lib/redcap-prototype";
import { prefillFromApproved } from "@/lib/redcap-prefill";
import { RedcapPrototypeForm } from "@/components/redcap-prototype-form";

export default async function RedcapPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const submission = await getSubmission(user, id);
  if (!submission || !canReview(user, submission.group_id) || submission.review_state !== "approved" || submission.status === "archived" || submission.removed_at) notFound();
  if (!submission.has_consent) notFound();
  const [sources, codebook] = await Promise.all([getPrototypeSources(user, id), loadRedcapCodebook()]);
  const prefill = prefillFromApproved(sources, codebook);
  return <div className="space-y-6">
    <Link href={`/forms/${id}`} className="text-sm text-teal-800 underline">Back to referral</Link>
    <h1 className="text-3xl font-bold">REDCap data preparation</h1>
    <RedcapPrototypeForm id={id} versions={{ intake: sources.intake.version, screening: sources.screening?.version ?? null, completion: sources.completion?.version ?? null }} fields={codebook.fields.filter((field) => !consentIdentityFields.some((name) => name === field.name))} hash={codebook.hash} prefill={prefill} />
  </div>;
}
