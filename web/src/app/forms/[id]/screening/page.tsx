import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canEdit, canReview } from "@/lib/access";
import { getSubmission } from "@/lib/submissions";
import { getScreeningServices, getScreeningServiceApprovals, getScreeningServiceDecisions, isScreeningServiceContributor } from "@/lib/screening-services";
import { screeningServicesSchema } from "@/lib/screening-service-schema";
import { ScreeningServicesForm } from "@/components/screening-services-form";
import { ScreeningServicesView } from "@/components/screening-services-view";
import { ScreeningServicesReviewActions } from "@/components/screening-services-review-actions";

export default async function ScreeningPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const referral = await getSubmission(user, id);
  if (!referral) notFound();
  if (!referral.has_consent || referral.review_state !== "approved" || referral.status === "archived" || referral.removed_at) {
    return <div className="space-y-4"><h1 className="text-2xl font-bold">Screening and Services is locked</h1>
      <p className="text-sm text-slate-600">Submit Consent and obtain current Intake approval before opening Phase 3.</p>
      <Link href={`/forms/${id}`} className="text-teal-800 underline">Return to referral</Link></div>;
  }
  const [record, approvals, decisions, contributed] = await Promise.all([
    getScreeningServices(user, id), getScreeningServiceApprovals(user, id), getScreeningServiceDecisions(user, id), isScreeningServiceContributor(user, id),
  ]);
  const canEditPhase = canEdit(user, referral.group_id) && !referral.legal_hold;
  const canReviewPhase = canReview(user, referral.group_id) && !contributed && record?.review_requested_by !== user.id;
  const empty = screeningServicesSchema.parse({});
  return <div className="space-y-6">
    <Link href={`/forms/${id}`} className="text-sm text-teal-800 underline">Back to referral</Link>
    <div><p className="text-xs font-bold uppercase tracking-widest text-teal-700">Phase 3 of 4</p>
      <h1 className="mt-2 text-3xl font-bold">Screening and Services</h1>
      <p className="mt-2 text-sm text-slate-600">Intake is approved. No participant name or date of birth is requested in this phase.</p></div>
    {record && <section className="panel space-y-3">
      <h2 className="text-lg font-bold">Phase status: {record.review_state.replaceAll("_", " ")}</h2>
      <p className="text-sm text-slate-600">Revision {record.revision} · Updated {record.updated_at.toISOString()} · {record.updated_by}</p>
      {record.return_reason && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900">Returned: {record.return_reason}</p>}
      {record.review_state === "pending_review" && canReviewPhase && <ScreeningServicesReviewActions id={id} revision={record.revision} />}
      {record.review_state === "pending_review" && record.review_requested_by === user.id && <p className="text-sm text-amber-800">You requested this review; another reviewer must decide.</p>}
    </section>}
    {canEditPhase && <section><h2 className="mb-4 text-xl font-bold">{record ? "Edit phase draft" : "Enter phase data"}</h2>
      {record?.review_state === "pending_review" && <p className="mb-4 text-sm text-amber-800">Saving will cancel the pending review request.</p>}
      <ScreeningServicesForm id={id} revision={record?.revision} initial={record ? record.answers : empty} />
    </section>}
    {record && <ScreeningServicesView answers={record.answers} />}
    {!record && !canEditPhase && <p className="panel text-sm text-slate-600">No Screening and Services information has been entered.</p>}
    {approvals.length > 0 && <section className="panel"><h2 className="text-lg font-bold">Approved Screening and Services versions</h2>
      <div className="mt-4 space-y-3">{approvals.map((approval) => <details key={approval.version} className="rounded-lg border p-4">
        <summary className="cursor-pointer font-semibold">Version {approval.version} · Approved by {approval.reviewer_name} · {approval.approved_at.toISOString()}</summary>
        <p className="my-3 text-xs text-slate-500">Revision {approval.revision}; requested by {approval.requested_by}; contributors: {approval.editor_ids.join(", ")}</p>
        <ScreeningServicesView answers={approval.answers} />
      </details>)}</div>
    </section>}
    {decisions.length > 0 && <section className="panel"><h2 className="text-lg font-bold">Phase review decisions</h2>
      <ol className="mt-4 space-y-3">{decisions.map((decision, index) => <li key={`${decision.revision}-${index}`} className="border-l-2 border-blue-200 pl-4 text-sm">
        <p><strong>{decision.reviewer_name}</strong> · {decision.decision} · revision {decision.revision} · {decision.decided_at.toISOString()}</p>
        {decision.reason && <p className="mt-1 whitespace-pre-wrap text-slate-600">{decision.reason}</p>}
      </li>)}</ol>
    </section>}
  </div>;
}
