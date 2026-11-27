import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canEdit, canReview } from "@/lib/access";
import { getApprovedVersions, getAudit, getReviewDecisions, getRevisions, getSubmission, isDraftContributor } from "@/lib/submissions";
import { consentMovedKeys, intakeFields, intakeSections } from "@/lib/intake-fields";
import { getIntakeCompleteness } from "@/lib/intake-validation";
import { Status } from "@/components/status";
import { ArchiveButton } from "@/components/archive-button";
import { ReviewAction } from "@/components/review-actions";
import { getImportSource } from "@/lib/intake-import";
import { getRemovalHistory } from "@/lib/import-removal";
import { ImportedRemovalForm } from "@/components/import-removal-form";
import { listPrototypeExports } from "@/lib/redcap-prototype";
import { RedcapRemoval } from "@/components/redcap-removal";
import { listConsent } from "@/lib/consent";
import { getScreeningServices } from "@/lib/screening-services";
import { getProgramCompletion } from "@/lib/program-completion";
import { currentReferralPhase } from "@/lib/referral-progress";
import { CollapsibleSection } from "@/components/collapsible-section";
import { getCaseFile } from "@/lib/case-file";
import { ReferralNotesPanel } from "@/components/referral-notes-panel";

export default async function Detail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const { id } = await params;
  const row = await getSubmission(user, id);
  if (!row) notFound();
  const [audit, revisions, approved, decisions, contributed, importSource, consents, screening, completion, caseFile] = await Promise.all([
    getAudit(user, id), getRevisions(user, id), getApprovedVersions(user, id),
    getReviewDecisions(user, id), isDraftContributor(user, id), getImportSource(user, id), listConsent(user, id), getScreeningServices(user, id), getProgramCompletion(user, id), getCaseFile(user, id),
  ]);
  const edit = canEdit(user, row.group_id);
  const removalHistory = user.role === "admin" && importSource ? await getRemovalHistory(user, id) : [];
  const review = canReview(user, row.group_id);
  const redcapExports = review ? await listPrototypeExports(user, id) : [];
  const missing = getIntakeCompleteness(row.answers).totalMissing;
  const canDecide = review && !contributed && row.review_requested_by !== user.id;
  const current = currentReferralPhase({
    ...row, screening_review_state: screening?.review_state ?? null, completion_review_state: completion?.review_state ?? null,
  });
  const labels = Object.fromEntries([
    ...intakeFields.flatMap((field) => [[field.key, field.label], [`${field.key}Other`, `${field.label} (other)`]]),
    ["reviewNote", "Note for reviewer"],
  ]);
  const previous = approved[0]?.answers;
  const isConsentField = (key: string) => consentMovedKeys.some((item) => item === key);
  const changes = previous && row.review_state !== "approved"
    ? [...new Set([...Object.keys(previous), ...Object.keys(row.answers)])]
      .filter((key) => !isConsentField(key) && JSON.stringify(previous[key] ?? "") !== JSON.stringify(row.answers[key] ?? ""))
    : [];
  const display = (value: string | string[] | undefined) => Array.isArray(value) ? value.join("; ") || "Unanswered" : value || "Unanswered";
  const phaseLabel = (state: "draft" | "pending_review" | "returned" | "approved") =>
    ({ draft: "Draft", pending_review: "Awaiting review", returned: "Returned for changes", approved: "Approved" })[state];
  const phaseLinkLabel = (name: string, state: string | undefined) =>
    state === "approved" ? `${edit && !row.legal_hold ? "Correct approved" : "View"} ${name}` : `${state ? "Open" : "Enter"} ${name}`;
  return <div className="space-y-6">
    <Link className="text-sm text-teal-800 hover:underline" href="/forms">← Back to library</Link>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="break-all text-3xl font-bold">{row.participant_id ? `Participant ${row.participant_id}` : `Consent needed · Referral ${row.id}`}</h1><div className="mt-3 flex flex-wrap items-center gap-3"><span className="text-sm text-slate-500">{current.phase}:</span><Status status={row.status} reviewState={current.state} removed={!!row.removed_at} /><span className="text-sm text-slate-500">Intake revision {row.revision}</span></div></div>
      {edit && !row.removed_at && <div className="flex flex-wrap gap-3">
        {row.status !== "archived" && current.phase === "Consent" && <Link className="btn-primary" href={`/forms/${id}/consent`}>Submit Consent</Link>}
        {row.status !== "archived" && current.phase === "Intake" && <Link className="btn-primary" href={`/forms/${id}/edit`}>Edit Intake</Link>}
        {row.status !== "archived" && current.phase === "Screening and Services" && <Link className="btn-primary" href={`/forms/${id}/screening`}>Open Screening and Services</Link>}
        {row.status !== "archived" && current.phase === "Program Completion" && <Link className="btn-primary" href={`/forms/${id}/completion`}>{completion?.review_state === "approved" ? phaseLinkLabel("Program Completion", completion.review_state) : "Open Program Completion"}</Link>}
        {row.status !== "draft" && <ArchiveButton id={id} revision={row.revision} restore={row.status === "archived"} />}
      </div>}
    </div>
    {(await searchParams).saved === "1" && <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">The operation completed. This page shows the saved database record.</p>}
    <ReferralNotesPanel user={user} referral={row} />
    <CollapsibleSection title="Referral phases">
      <ol className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
        {(user.role === "admin" || user.role === "editor") && <li className="rounded-lg border p-3"><strong>1. Case File</strong><p>{caseFile ? `${user.role === "admin" ? "Saved" : "Submitted"} · Version ${caseFile.version}` : user.role === "admin" ? "Optional · Not started" : "Not submitted"}</p>
          {(caseFile || (user.role === "admin" && !row.removed_at && row.status !== "archived" && !row.legal_hold)) && <Link className="mt-2 inline-block text-teal-800 underline" href={`/forms/${id}/case-file`}>{caseFile ? "Open Case File" : "Enter Case File"}</Link>}</li>}
        <li className="rounded-lg border p-3"><strong>2. Consent</strong><p>{row.has_consent ? "Submitted" : "Not submitted"}</p>
          {consents.length > 0 && <Link className="mt-2 inline-block text-teal-800 underline" href={`/forms/${id}/consent`}>View consent</Link>}</li>
        <li className="rounded-lg border p-3"><strong>3. Intake</strong><p>{!row.has_consent ? "Locked — submit consent" : row.review_state === "approved" ? "Approved" : row.review_state.replaceAll("_", " ")}</p>
          {edit && row.has_consent && row.review_state === "approved" && row.status !== "archived" && !row.removed_at && <Link className="mt-2 inline-block text-teal-800 underline" href={`/forms/${id}/edit`}>Correct approved Intake</Link>}</li>
        <li className="rounded-lg border p-3"><strong>4. Screening and Services</strong><p>{row.status === "archived" || row.removed_at ? "Locked — restore referral" : !row.has_consent || row.review_state !== "approved" ? "Locked — approve Intake first" : screening ? phaseLabel(screening.review_state) : "Ready to begin"}</p>
          {row.has_consent && row.review_state === "approved" && row.status !== "archived" && !row.removed_at && <Link className="mt-2 inline-block text-teal-800 underline" href={`/forms/${id}/screening`}>{phaseLinkLabel("Screening and Services", screening?.review_state)}</Link>}</li>
        <li className="rounded-lg border p-3"><strong>5. Program Completion</strong><p>{row.status === "archived" || row.removed_at ? "Locked — restore referral" : !row.has_consent || row.review_state !== "approved" || screening?.review_state !== "approved" ? "Locked — approve previous phases first" : completion ? phaseLabel(completion.review_state) : "Ready to begin"}</p>
          {row.has_consent && row.review_state === "approved" && screening?.review_state === "approved" && row.status !== "archived" && !row.removed_at && <Link className="mt-2 inline-block text-teal-800 underline" href={`/forms/${id}/completion`}>{phaseLinkLabel("Program Completion", completion?.review_state)}</Link>}</li>
      </ol>
      <p className="text-sm text-amber-900">Synthetic data only. Phase approval does not mean the participant completed the program.</p>
    </CollapsibleSection>
    {screening && <CollapsibleSection title="Screening and Services" contentClassName="mt-5 space-y-3">
      <p className="text-sm">Phase status: {phaseLabel(screening.review_state)} · Revision {screening.revision}</p>
      {screening.review_state === "pending_review" && <p className="text-sm font-semibold text-blue-800">Screening and Services is awaiting a separate review.</p>}
      <Link href={`/forms/${id}/screening`} className="text-sm text-teal-800 underline">{screening.review_state === "pending_review" ? "Open Screening and Services for review" : "View phase details and review history"}</Link>
      {screening.return_reason && <p className="text-sm text-rose-800">Returned: {screening.return_reason}</p>}
    </CollapsibleSection>}
    {importSource && <CollapsibleSection title="Imported synthetic-data draft" className="panel border-amber-300 bg-amber-50">
      <p className="mt-2 text-sm text-amber-900">Source record {importSource.row_number}, imported {importSource.created_at.toISOString().slice(0, 10)}. Source values are retained separately and are not automatically Referral answers.</p>
      {importSource.placeholder_fields.length > 0 && <p className="mt-2 text-sm font-semibold text-amber-900">Replace these generated placeholders before review: {importSource.placeholder_fields.join(", ")}.</p>}
    </CollapsibleSection>}
    <div className="panel !p-5 text-xs leading-6 text-slate-500">
      <p>Enrollment: <span className="break-all font-mono">{row.enrollment_id}</span></p>
      <p>Referral ID: <span className="break-all font-mono">{row.id}</span></p>
      <p>Template: {row.template_version} · Updated: {row.updated_at.toISOString().replace("T", " ").slice(0, 19)} UTC</p>
      {row.legal_hold && <p className="font-bold text-amber-800">Legal hold applies. Permanent deletion is prohibited.</p>}
      <p>Attestation names are not legally approved electronic signatures. No permanent deletion is available.</p>
    </div>
    {user.role === "admin" && importSource && <CollapsibleSection title="Import removal" defaultOpen={false}>
      <Link href={`/forms/import/batches/${importSource.batch_id}`} className="text-sm text-teal-800 underline">View import batch</Link>
      {row.removed_at ? <ImportedRemovalForm id={id} revision={row.revision} restore /> :
        row.status === "draft" && ["draft", "returned"].includes(row.review_state) && !row.legal_hold && approved.length === 0
          ? <ImportedRemovalForm id={id} revision={row.revision} restore={false} />
          : <p className="text-sm text-slate-600">Only unapproved imported drafts without a legal hold can be removed as duplicates.</p>}
      {removalHistory.length > 0 && <CollapsibleSection title="Removal history" level={3} defaultOpen={false} className="rounded-lg border p-4" contentClassName="mt-3"><ul className="space-y-3">{removalHistory.map((event) => <li key={event.id} className="border-t border-slate-100 pt-3 text-sm">
        <p>{event.action.replaceAll("_", " ")} · {event.display_name} · {event.occurred_at.toISOString().replace("T", " ").slice(0, 19)} UTC</p>
        <p className="whitespace-pre-wrap break-words">Reason: {event.reason}</p>
        {event.duplicate_of && <p>Existing referral: <Link className="break-all text-teal-800 underline" href={`/forms/${event.duplicate_of}`}>{event.duplicate_of}</Link></p>}
      </li>)}</ul></CollapsibleSection>}
    </CollapsibleSection>}
    {review && <CollapsibleSection title="REDCap data preparation" defaultOpen={false}>
      <p className="text-sm text-amber-900">Synthetic data only. These files are not validated for REDCap import; generating one does not submit it anywhere. Conditional applicability and required answers must be checked manually.</p>
      {row.has_consent && row.review_state === "approved" && row.status !== "archived" && !row.removed_at
        ? <Link className="btn-primary inline-block" href={`/forms/${id}/redcap`}>Prepare REDCap data</Link>
        : <p className="text-sm text-slate-600">Creating a file requires submitted consent and a currently approved, active Intake.</p>}
      {redcapExports.length === 0 ? <p className="text-sm text-slate-600">No prototype files generated yet.</p> :
        <ul className="space-y-4">{redcapExports.map((file) => <li key={file.id} className="space-y-2 border-t border-slate-200 pt-3">
          <p className="text-sm">Approved referral version {file.approved_version} · {file.display_name} · {file.created_at.toISOString().replace("T", " ").slice(0, 19)} UTC{file.removed_at ? " · Removed" : ""}</p>
          {!file.removed_at && <a className="block text-sm text-teal-800 underline" href={`/forms/${id}/redcap/${file.id}`}>Download synthetic prototype JSON</a>}
          {(!row.legal_hold || file.removed_at) && <RedcapRemoval id={id} exportId={file.id} restore={!!file.removed_at} />}
        </li>)}</ul>}
    </CollapsibleSection>}
    <CollapsibleSection title="Intake review">
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {approved.length ? `Latest approved version: ${approved[0].version}, signed off ${approved[0].approved_at.toISOString().slice(0, 10)} by ${approved[0].reviewer_name}.`
          : "No reviewer-approved version exists yet. Legacy submitted records are not automatically approved."}
        {" "}Approving a referral is not a participant signature or program completion.
      </p>
      {row.review_state === "legacy" && <p className="mt-3 text-sm text-amber-800">This legacy record has no verified reviewer sign-off. A program navigator or administrator must save it as a draft and request review.</p>}
      {typeof row.answers.reviewNote === "string" && row.answers.reviewNote && <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <strong>Intake note for reviewer:</strong><p className="mt-1 whitespace-pre-wrap">{row.answers.reviewNote}</p>
      </div>}
      {row.review_state === "returned" && row.return_reason && <div className="mt-3 rounded-lg bg-rose-50 p-4 text-sm text-rose-900">
        <strong>Returned for changes:</strong> <span className="whitespace-pre-wrap">{row.return_reason}</span>
      </div>}
      {row.has_consent && edit && !row.removed_at && row.status !== "archived" && ["draft", "returned"].includes(row.review_state) && <div className="mt-4">
        {importSource?.placeholder_fields.length ? <p className="text-sm text-amber-800">Replace the generated placeholders before requesting review.</p> : missing > 0
          ? <p className="text-sm text-amber-800">{missing} applicable item{missing === 1 ? "" : "s"} still need an answer before requesting review. Open Edit referral to see the flagged questions.</p>
          : <ReviewAction id={id} revision={row.revision} intent="request" />}
      </div>}
      {!row.removed_at && row.review_state === "pending_review" && <div className="mt-4 space-y-4">
        <p className="text-sm text-blue-800">Revision {row.revision} is awaiting review. Editing and saving it will cancel this review request.</p>
        {review && !canDecide && <p className="text-sm text-amber-800">A different reviewer must review changes they did not edit or submit.</p>}
        {canDecide && row.has_consent && <div className="flex flex-wrap items-start gap-5">
          <ReviewAction id={id} revision={row.revision} intent="approve" />
          <ReviewAction id={id} revision={row.revision} intent="return" />
        </div>}
      </div>}
    </CollapsibleSection>
    {previous && row.review_state !== "approved" && <CollapsibleSection title={`Changes since approved version ${approved[0].version}`}>
      <p className="mt-2 text-xs text-slate-500">Compare the previously approved answers with this working revision before reviewing.</p>
      {changes.length === 0 ? <p className="mt-4 text-sm text-slate-500">No answer changes detected.</p> :
        <dl className="mt-4 space-y-4">{changes.map((key) => <div key={key} className="border-b border-slate-100 pb-3 text-sm">
          <dt className="font-semibold">{labels[key] ?? key}</dt>
          <dd className="mt-1 break-words text-slate-600"><span className="font-medium">Approved:</span> {display(previous[key])}</dd>
          <dd className="mt-1 break-words text-slate-800"><span className="font-medium">Working:</span> {display(row.answers[key])}</dd>
        </div>)}</dl>}
    </CollapsibleSection>}
    <CollapsibleSection title={row.review_state === "approved" ? "Current approved answers" : "Current working answers"} className="space-y-4" contentClassName="space-y-4 mt-4">
    {row.review_state !== "approved" && approved.length > 0 && <p className="text-sm text-slate-500">These working answers are not the approved version. Expand the approved version below to see the last signed-off answers.</p>}
    {intakeSections.map((section) => <CollapsibleSection key={section.title} title={section.title} level={3}>
      <dl className="space-y-4">{section.fields.filter((field) => !field.when || row.answers[field.when.key] === field.when.value).map((field) => {
        const value = row.answers[field.key];
        return <div key={field.key} className="grid gap-1 border-b border-slate-100 pb-3 text-sm last:border-0 sm:grid-cols-[40%_1fr]">
          <dt className="text-slate-500">{field.label}</dt><dd className="break-words">{Array.isArray(value) ? value.join("; ") || "Unanswered" : value || "Unanswered"}
            {row.answers[`${field.key}Other`] && ` (${row.answers[`${field.key}Other`]})`}</dd>
        </div>;
      })}</dl>
    </CollapsibleSection>)}
    </CollapsibleSection>
    <CollapsibleSection title="Reviewer-approved versions" defaultOpen={false}>
      <p className="mb-5 mt-2 text-xs text-slate-500">Immutable approved snapshots. Each preserves the exact answers reviewed, separately from later draft changes.</p>
      {approved.length === 0 && <p className="text-sm text-slate-500">No approved versions yet.</p>}
      <div className="space-y-3">{approved.map((version) => <details key={version.version} className="rounded-lg border border-teal-200 p-4">
        <summary className="cursor-pointer text-sm font-semibold">Approved version {version.version} · {version.reviewer_name} · {version.approved_at.toISOString().slice(0, 10)}</summary>
        <p className="my-3 text-xs text-slate-500">Reviewed draft revision {version.draft_revision} · Template {version.template_version} · Approved {version.approved_at.toISOString()} · Contributors: {version.editor_ids.join(", ")}</p>
        <dl className="space-y-3">{Object.entries(version.answers).filter(([key, value]) => !isConsentField(key) && value.length > 0).map(([key, value]) => <div key={key} className="grid gap-1 text-sm sm:grid-cols-2">
          <dt className="text-slate-500">{labels[key] ?? key}</dt><dd className="break-words">{Array.isArray(value) ? value.join("; ") : value}</dd>
        </div>)}</dl>
      </details>)}</div>
    </CollapsibleSection>
    {decisions.length > 0 && <CollapsibleSection title="Review decisions" defaultOpen={false}>
      <ol className="mt-4 space-y-3">{decisions.map((decision) => <li key={decision.id} className="border-l-2 border-blue-200 pl-4 text-sm">
        <p><strong>{decision.reviewer_name}</strong> · {decision.decision} · reviewed revision {decision.draft_revision} · {decision.decided_at.toISOString()}</p>
        {decision.reason && <p className="mt-1 whitespace-pre-wrap text-slate-600">{decision.reason}</p>}
      </li>)}</ol>
    </CollapsibleSection>}
    <CollapsibleSection title="Working revision history" defaultOpen={false}>
      <p className="mb-5 mt-2 text-xs text-slate-500">Latest 20 immutable versions. Historical answers have the same group access restrictions as the current record.</p>
      <div className="space-y-3">{revisions.map((version) => <details key={version.revision} className="rounded-lg border border-slate-200 p-4">
        <summary className="cursor-pointer text-sm font-semibold">Revision {version.revision} · {version.status} · {version.display_name}</summary>
        <p className="my-3 text-xs text-slate-500">{version.recorded_at.toISOString()} UTC</p>
        <dl className="space-y-3">{Object.entries(version.answers).filter(([key, value]) => !isConsentField(key) && value.length > 0).map(([key, value]) => <div key={key} className="grid gap-1 text-sm sm:grid-cols-2">
          <dt className="text-slate-500">{labels[key] ?? key}</dt><dd className="break-words">{Array.isArray(value) ? value.join("; ") : value}</dd>
        </div>)}</dl>
      </details>)}</div>
    </CollapsibleSection>
    <CollapsibleSection title="Audit history" defaultOpen={false}><p className="mb-5 mt-2 text-xs text-slate-500">Latest 100 events, newest first. Field names only; use Saved versions to inspect historical answers.</p>
      <ol className="space-y-5">{audit.map((event) => <li key={event.id} className="border-l-2 border-teal-200 pl-4">
        <p className="text-sm"><span className="font-semibold">{event.display_name}</span> · {event.action.replaceAll("_", " ")}{event.revision && ` · Revision ${event.revision}`}</p>
        <p className="mt-1 text-xs text-slate-500">{event.occurred_at.toISOString().replace("T", " ").slice(0, 19)} UTC</p>
        {event.changed_fields.length > 0 && <p className="mt-2 text-xs leading-5 text-slate-600">Changed: {event.changed_fields.map((key) => labels[key] ?? key).join(", ")}</p>}
      </li>)}</ol>
    </CollapsibleSection>
  </div>;
}
