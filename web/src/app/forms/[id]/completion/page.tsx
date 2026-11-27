import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canEdit, canReview } from "@/lib/access";
import { getSubmission } from "@/lib/submissions";
import { getScreeningServices } from "@/lib/screening-services";
import { getCompletionApprovals, getCompletionDecisions, getProgramCompletion, isCompletionContributor } from "@/lib/program-completion";
import { completionSchema } from "@/lib/program-completion-schema";
import { ProgramCompletionForm } from "@/components/program-completion-form";
import { ProgramCompletionReview } from "@/components/program-completion-review";
import { ProgramCompletionView } from "@/components/program-completion-view";
import { CorrectionPrompt } from "@/components/correction-prompt";
import { CollapsibleSection } from "@/components/collapsible-section";
import { ReferralNotesPanel } from "@/components/referral-notes-panel";
import { ReviewNotificationRead } from "@/components/review-notification-read";
import { listReviewNotifications } from "@/lib/review-notifications";
import { ActivityNotificationRead } from "@/components/activity-notification-read";

export default async function CompletionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; correct?: string; noticeKind?: string; noticeId?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const referral = await getSubmission(user, id);
  if (!referral) notFound();
  const screening = await getScreeningServices(user, id);
  if (!referral.has_consent || referral.review_state !== "approved" || screening?.review_state !== "approved" || referral.status === "archived" || referral.removed_at) {
    return <div className="space-y-4"><ActivityNotificationRead kind={query.noticeKind} id={query.noticeId} referralId={id} /><h1 className="text-2xl font-bold">Program Completion is locked</h1>
      <p className="text-sm text-slate-600">Submit Consent and obtain current Intake and Screening and Services approval before opening Phase 5.</p>
      <Link href={`/forms/${id}`} className="text-teal-800 underline">Return to referral</Link></div>;
  }
  const [record, approvals, decisions, contributed] = await Promise.all([
    getProgramCompletion(user, id), getCompletionApprovals(user, id), getCompletionDecisions(user, id), isCompletionContributor(user, id),
  ]);
  const edit = canEdit(user, referral.group_id) && !referral.legal_hold;
  const canDecide = canReview(user, referral.group_id) && !contributed && record?.review_requested_by !== user.id;
  const reviewNotice = canReview(user, referral.group_id) && record?.review_state === "pending_review"
    ? (await listReviewNotifications(user, id, "completion"))[0] : undefined;
  return <div className="space-y-6">
    <ActivityNotificationRead kind={query.noticeKind} id={query.noticeId} referralId={id} />
    {reviewNotice && <ReviewNotificationRead noticeId={reviewNotice.id} />}
    <Link href={`/forms/${id}`} className="text-sm text-teal-800 underline">Back to referral</Link>
    <div><p className="text-xs font-bold uppercase tracking-widest text-teal-700">Phase 5 of 5</p>
      <h1 className="mt-2 text-3xl font-bold">Program Completion</h1>
      <p className="mt-2 text-sm text-slate-600">Record outcomes at the end of the program. Phase approval does not imply the participant completed the program.</p></div>
    <ReferralNotesPanel user={user} referral={referral} />
    {query.saved === "1" && <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">The saved database record is shown below.</p>}
    {record && <CollapsibleSection title={`Phase status: ${record.review_state.replaceAll("_", " ")}`} contentClassName="mt-5 space-y-3">
      <p className="text-sm text-slate-600">Revision {record.revision} · Updated {record.updated_at.toISOString()} · {record.updated_by}</p>
      {record.return_reason && <p className="whitespace-pre-wrap rounded-lg bg-rose-50 p-3 text-sm text-rose-900">Returned: {record.return_reason}</p>}
      {edit && ["draft", "returned"].includes(record.review_state) && <ProgramCompletionReview id={id} revision={record.revision} intent="request" />}
      {record.review_state === "pending_review" && <p className="text-sm text-blue-800">This revision is awaiting review. Saving changes cancels the request.</p>}
    </CollapsibleSection>}
    {record && <CollapsibleSection title="Current phase answers" className="space-y-4"><ProgramCompletionView answers={record.answers} /></CollapsibleSection>}
    {record?.review_state === "pending_review" && canDecide && <section className="panel flex flex-wrap items-start gap-5">
      <ProgramCompletionReview id={id} revision={record.revision} intent="approve" />
      <ProgramCompletionReview id={id} revision={record.revision} intent="return" />
    </section>}
    {record?.review_state === "pending_review" && canReview(user, referral.group_id) && !canDecide && <p className="text-sm text-amber-800">A different reviewer must review changes they did not edit or submit.</p>}
    {edit && record?.review_state === "approved" && query.correct !== "1" && <CorrectionPrompt phase="Program Completion" href={`/forms/${id}/completion?correct=1`}
      warning="Saving a correction creates a new Program Completion draft that must be reviewed again. Previous approved versions remain available." />}
    {edit && (record?.review_state !== "approved" || query.correct === "1") && <CollapsibleSection title={record?.review_state === "approved" ? "Correct approved Program Completion" : record ? "Edit phase draft" : "Enter phase data"} className="space-y-4">
      {record?.review_state === "approved" && <p className="mb-4 text-sm text-amber-800">Saving this correction creates a draft for review; previous approved versions remain available.</p>}
      <ProgramCompletionForm id={id} revision={record?.revision} initial={record?.answers ?? completionSchema.parse({})} />
    </CollapsibleSection>}
    {!record && !edit && <p className="panel text-sm text-slate-600">No Program Completion information has been entered.</p>}
    {approvals.length > 0 && <CollapsibleSection title="Approved Program Completion versions" defaultOpen={false}>
      <div className="mt-4 space-y-3">{approvals.map((approval) => <details key={approval.version} className="rounded-lg border p-4">
        <summary className="cursor-pointer font-semibold">Version {approval.version} · Approved by {approval.reviewer_name} · {approval.approved_at.toISOString()}</summary>
        <p className="my-3 text-xs text-slate-500">Revision {approval.revision}; requested by {approval.requested_by}; contributors: {approval.editor_ids.join(", ")}</p>
        <ProgramCompletionView answers={approval.answers} />
      </details>)}</div>      </CollapsibleSection>}
      {decisions.length > 0 && <CollapsibleSection title="Phase review decisions" defaultOpen={false}>
      <ol className="mt-4 space-y-3">{decisions.map((decision, index) => <li key={`${decision.revision}-${index}`} className="border-l-2 border-blue-200 pl-4 text-sm">
        <p><strong>{decision.reviewer_name}</strong> · {decision.decision} · revision {decision.revision} · {decision.decided_at.toISOString()}</p>
        {decision.reason && <p className="mt-1 whitespace-pre-wrap text-slate-600">{decision.reason}</p>}
      </li>)}</ol>      </CollapsibleSection>}
  </div>;
}
