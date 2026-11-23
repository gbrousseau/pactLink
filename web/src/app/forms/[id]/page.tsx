import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canEdit, canReview } from "@/lib/access";
import { getApprovedVersions, getAudit, getReviewDecisions, getRevisions, getSubmission, isDraftContributor } from "@/lib/submissions";
import { intakeFields, intakeSections } from "@/lib/intake-fields";
import { getIntakeCompleteness } from "@/lib/intake-validation";
import { Status } from "@/components/status";
import { ArchiveButton } from "@/components/archive-button";
import { ReviewAction } from "@/components/review-actions";
import { getImportSource } from "@/lib/intake-import";
import { getRemovalHistory } from "@/lib/import-removal";
import { ImportedRemovalForm } from "@/components/import-removal-form";
import { listPrototypeExports } from "@/lib/redcap-prototype";
import { RedcapRemoval } from "@/components/redcap-removal";

export default async function Detail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const { id } = await params;
  const row = await getSubmission(user, id);
  if (!row) notFound();
  const [audit, revisions, approved, decisions, contributed, importSource] = await Promise.all([
    getAudit(user, id), getRevisions(user, id), getApprovedVersions(user, id),
    getReviewDecisions(user, id), isDraftContributor(user, id), getImportSource(user, id),
  ]);
  const edit = canEdit(user, row.group_id);
  const removalHistory = user.role === "admin" && importSource ? await getRemovalHistory(user, id) : [];
  const review = canReview(user, row.group_id);
  const redcapExports = review ? await listPrototypeExports(user, id) : [];
  const missing = getIntakeCompleteness(row.answers).totalMissing;
  const canDecide = review && !contributed && row.review_requested_by !== user.id;
  const labels = Object.fromEntries(intakeFields.flatMap((field) => [[field.key, field.label], [`${field.key}Other`, `${field.label} (other)`]]));
  const previous = approved[0]?.answers;
  const changes = previous && row.review_state !== "approved"
    ? [...new Set([...Object.keys(previous), ...Object.keys(row.answers)])]
      .filter((key) => JSON.stringify(previous[key] ?? "") !== JSON.stringify(row.answers[key] ?? ""))
    : [];
  const display = (value: string | string[] | undefined) => Array.isArray(value) ? value.join("; ") || "Unanswered" : value || "Unanswered";
  return <div className="space-y-6">
    <Link className="text-sm text-teal-800 hover:underline" href="/forms">← Back to library</Link>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-3xl font-bold">{row.participant_name || "Unnamed draft"}</h1><div className="mt-3 flex items-center gap-3"><Status status={row.status} reviewState={row.review_state} removed={!!row.removed_at} /><span className="text-sm text-slate-500">Intake · Revision {row.revision}</span></div></div>
      {edit && !row.removed_at && <div className="flex flex-wrap gap-3">
        {row.status !== "archived" && <Link className="btn-primary" href={`/forms/${id}/edit`}>Edit intake</Link>}
        {row.status !== "draft" && <ArchiveButton id={id} revision={row.revision} restore={row.status === "archived"} />}
      </div>}
    </div>
    {(await searchParams).saved === "1" && <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">The operation completed. This page shows the saved database record.</p>}
    {importSource && <section className="panel border-amber-300 bg-amber-50">
      <h2 className="font-bold text-amber-900">Imported synthetic-data draft</h2>
      <p className="mt-2 text-sm text-amber-900">Source record {importSource.row_number}, imported {importSource.created_at.toISOString().slice(0, 10)}. Source values are retained separately and are not automatically Intake answers.</p>
      {importSource.placeholder_fields.length > 0 && <p className="mt-2 text-sm font-semibold text-amber-900">Replace these generated placeholders before review: {importSource.placeholder_fields.join(", ")}.</p>}
      <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">View original source columns</summary>
        <dl className="mt-3 space-y-2">{Object.entries(importSource.source).map(([key, value]) => <div key={key} className="grid gap-1 border-b border-amber-200 pb-2 sm:grid-cols-2"><dt className="font-semibold">{key}</dt><dd className="whitespace-pre-wrap break-words">{value || "Empty"}</dd></div>)}</dl>
      </details>
    </section>}
    <div className="panel !p-5 text-xs leading-6 text-slate-500">
      <p>Enrollment: <span className="break-all font-mono">{row.enrollment_id}</span></p>
      <p>Intake ID: <span className="break-all font-mono">{row.id}</span></p>
      <p>Template: {row.template_version} · Updated: {row.updated_at.toISOString().replace("T", " ").slice(0, 19)} UTC</p>
      {row.legal_hold && <p className="font-bold text-amber-800">Legal hold applies. Permanent deletion is prohibited.</p>}
      <p>Attestation names are not legally approved electronic signatures. No permanent deletion is available.</p>
    </div>
    {user.role === "admin" && importSource && <section className="panel space-y-4">
      <h2 className="text-lg font-bold">Import removal</h2>
      <Link href={`/forms/import/batches/${importSource.batch_id}`} className="text-sm text-teal-800 underline">View import batch</Link>
      {row.removed_at ? <ImportedRemovalForm id={id} revision={row.revision} restore /> :
        row.status === "draft" && ["draft", "returned"].includes(row.review_state) && !row.legal_hold && approved.length === 0
          ? <ImportedRemovalForm id={id} revision={row.revision} restore={false} />
          : <p className="text-sm text-slate-600">Only unapproved imported drafts without a legal hold can be removed as duplicates.</p>}
      {removalHistory.length > 0 && <div><h3 className="font-semibold">Removal history</h3><ul className="mt-3 space-y-3">{removalHistory.map((event) => <li key={event.id} className="border-t border-slate-100 pt-3 text-sm">
        <p>{event.action.replaceAll("_", " ")} · {event.display_name} · {event.occurred_at.toISOString().replace("T", " ").slice(0, 19)} UTC</p>
        <p className="whitespace-pre-wrap break-words">Reason: {event.reason}</p>
        {event.duplicate_of && <p>Existing intake: <Link className="break-all text-teal-800 underline" href={`/forms/${event.duplicate_of}`}>{event.duplicate_of}</Link></p>}
      </li>)}</ul></div>}
    </section>}
    {review && <section className="panel space-y-4">
      <h2 className="text-lg font-bold">Synthetic REDCap JSON prototypes</h2>
      <p className="text-sm text-amber-900">Synthetic data only. These files are not validated for REDCap import; generating one does not submit it anywhere. Conditional applicability and required answers must be checked manually.</p>
      {row.review_state === "approved" && row.status !== "archived" && !row.removed_at
        ? <Link className="btn-primary inline-block" href={`/forms/${id}/redcap`}>Create prototype JSON</Link>
        : <p className="text-sm text-slate-600">Creating a file requires a currently approved, active intake.</p>}
      {redcapExports.length === 0 ? <p className="text-sm text-slate-600">No prototype files generated yet.</p> :
        <ul className="space-y-4">{redcapExports.map((file) => <li key={file.id} className="space-y-2 border-t border-slate-200 pt-3">
          <p className="text-sm">Approved intake version {file.approved_version} · {file.display_name} · {file.created_at.toISOString().replace("T", " ").slice(0, 19)} UTC{file.removed_at ? " · Removed" : ""}</p>
          {!file.removed_at && <a className="block text-sm text-teal-800 underline" href={`/forms/${id}/redcap/${file.id}`}>Download synthetic prototype JSON</a>}
          {(!row.legal_hold || file.removed_at) && <RedcapRemoval id={id} exportId={file.id} restore={!!file.removed_at} />}
        </li>)}</ul>}
    </section>}
    <section className="panel">
      <h2 className="text-lg font-bold">Intake review</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {approved.length ? `Latest approved version: ${approved[0].version}, signed off ${approved[0].approved_at.toISOString().slice(0, 10)} by ${approved[0].reviewer_name}.`
          : "No reviewer-approved version exists yet. Legacy submitted records are not automatically approved."}
        {" "}Approving an intake is not a participant signature or program completion.
      </p>
      {row.review_state === "legacy" && <p className="mt-3 text-sm text-amber-800">This legacy record has no verified reviewer sign-off. An editor must save it as a draft and request review.</p>}
      {row.review_state === "returned" && row.return_reason && <div className="mt-3 rounded-lg bg-rose-50 p-4 text-sm text-rose-900">
        <strong>Returned for changes:</strong> <span className="whitespace-pre-wrap">{row.return_reason}</span>
      </div>}
      {edit && !row.removed_at && row.status !== "archived" && ["draft", "returned"].includes(row.review_state) && <div className="mt-4">
        {importSource?.placeholder_fields.length ? <p className="text-sm text-amber-800">Replace the generated placeholders before requesting review.</p> : missing > 0
          ? <p className="text-sm text-amber-800">{missing} applicable item{missing === 1 ? "" : "s"} still need an answer before requesting review. Open Edit intake to see the flagged questions.</p>
          : <ReviewAction id={id} revision={row.revision} intent="request" />}
      </div>}
      {!row.removed_at && row.review_state === "pending_review" && <div className="mt-4 space-y-4">
        <p className="text-sm text-blue-800">Revision {row.revision} is awaiting review. Editing and saving it will cancel this review request.</p>
        {review && !canDecide && <p className="text-sm text-amber-800">A different reviewer must review changes they did not edit or submit.</p>}
        {canDecide && <div className="flex flex-wrap items-start gap-5">
          <ReviewAction id={id} revision={row.revision} intent="approve" />
          <ReviewAction id={id} revision={row.revision} intent="return" />
        </div>}
      </div>}
    </section>
    {previous && row.review_state !== "approved" && <section className="panel">
      <h2 className="text-lg font-bold">Changes since approved version {approved[0].version}</h2>
      <p className="mt-2 text-xs text-slate-500">Compare the previously approved answers with this working revision before reviewing.</p>
      {changes.length === 0 ? <p className="mt-4 text-sm text-slate-500">No answer changes detected.</p> :
        <dl className="mt-4 space-y-4">{changes.map((key) => <div key={key} className="border-b border-slate-100 pb-3 text-sm">
          <dt className="font-semibold">{labels[key] ?? key}</dt>
          <dd className="mt-1 break-words text-slate-600"><span className="font-medium">Approved:</span> {display(previous[key])}</dd>
          <dd className="mt-1 break-words text-slate-800"><span className="font-medium">Working:</span> {display(row.answers[key])}</dd>
        </div>)}</dl>}
    </section>}
    <h2 className="text-xl font-bold">{row.review_state === "approved" ? "Current approved answers" : "Current working answers"}</h2>
    {row.review_state !== "approved" && approved.length > 0 && <p className="text-sm text-slate-500">These working answers are not the approved version. Expand the approved version below to see the last signed-off answers.</p>}
    {intakeSections.map((section) => <section key={section.title} className="panel">
      <h2 className="mb-5 text-lg font-bold">{section.title}</h2>
      <dl className="space-y-4">{section.fields.filter((field) => !field.when || row.answers[field.when.key] === field.when.value).map((field) => {
        const value = row.answers[field.key];
        return <div key={field.key} className="grid gap-1 border-b border-slate-100 pb-3 text-sm last:border-0 sm:grid-cols-[40%_1fr]">
          <dt className="text-slate-500">{field.label}</dt><dd className="break-words">{Array.isArray(value) ? value.join("; ") || "Unanswered" : value || "Unanswered"}
            {row.answers[`${field.key}Other`] && ` (${row.answers[`${field.key}Other`]})`}</dd>
        </div>;
      })}</dl>
    </section>)}
    <section className="panel"><h2 className="text-lg font-bold">Reviewer-approved versions</h2>
      <p className="mb-5 mt-2 text-xs text-slate-500">Immutable approved snapshots. Each preserves the exact answers reviewed, separately from later draft changes.</p>
      {approved.length === 0 && <p className="text-sm text-slate-500">No approved versions yet.</p>}
      <div className="space-y-3">{approved.map((version) => <details key={version.version} className="rounded-lg border border-teal-200 p-4">
        <summary className="cursor-pointer text-sm font-semibold">Approved version {version.version} · {version.reviewer_name} · {version.approved_at.toISOString().slice(0, 10)}</summary>
        <p className="my-3 text-xs text-slate-500">Reviewed draft revision {version.draft_revision} · Template {version.template_version} · Approved {version.approved_at.toISOString()} · Editors: {version.editor_ids.join(", ")}</p>
        <dl className="space-y-3">{Object.entries(version.answers).filter(([, value]) => value.length > 0).map(([key, value]) => <div key={key} className="grid gap-1 text-sm sm:grid-cols-2">
          <dt className="text-slate-500">{labels[key] ?? key}</dt><dd className="break-words">{Array.isArray(value) ? value.join("; ") : value}</dd>
        </div>)}</dl>
      </details>)}</div>
    </section>
    {decisions.length > 0 && <section className="panel"><h2 className="text-lg font-bold">Review decisions</h2>
      <ol className="mt-4 space-y-3">{decisions.map((decision) => <li key={decision.id} className="border-l-2 border-blue-200 pl-4 text-sm">
        <p><strong>{decision.reviewer_name}</strong> · {decision.decision} · reviewed revision {decision.draft_revision} · {decision.decided_at.toISOString()}</p>
        {decision.reason && <p className="mt-1 whitespace-pre-wrap text-slate-600">{decision.reason}</p>}
      </li>)}</ol>
    </section>}
    <section className="panel"><h2 className="text-lg font-bold">Working revision history</h2>
      <p className="mb-5 mt-2 text-xs text-slate-500">Latest 20 immutable versions. Historical answers have the same group access restrictions as the current record.</p>
      <div className="space-y-3">{revisions.map((version) => <details key={version.revision} className="rounded-lg border border-slate-200 p-4">
        <summary className="cursor-pointer text-sm font-semibold">Revision {version.revision} · {version.status} · {version.display_name}</summary>
        <p className="my-3 text-xs text-slate-500">{version.recorded_at.toISOString()} UTC</p>
        <dl className="space-y-3">{Object.entries(version.answers).filter(([, value]) => value.length > 0).map(([key, value]) => <div key={key} className="grid gap-1 text-sm sm:grid-cols-2">
          <dt className="text-slate-500">{labels[key] ?? key}</dt><dd className="break-words">{Array.isArray(value) ? value.join("; ") : value}</dd>
        </div>)}</dl>
      </details>)}</div>
    </section>
    <section className="panel"><h2 className="text-lg font-bold">Audit history</h2><p className="mb-5 mt-2 text-xs text-slate-500">Latest 100 events, newest first. Field names only; use Saved versions to inspect historical answers.</p>
      <ol className="space-y-5">{audit.map((event) => <li key={event.id} className="border-l-2 border-teal-200 pl-4">
        <p className="text-sm"><span className="font-semibold">{event.display_name}</span> · {event.action.replaceAll("_", " ")}{event.revision && ` · Revision ${event.revision}`}</p>
        <p className="mt-1 text-xs text-slate-500">{event.occurred_at.toISOString().replace("T", " ").slice(0, 19)} UTC</p>
        {event.changed_fields.length > 0 && <p className="mt-2 text-xs leading-5 text-slate-600">Changed: {event.changed_fields.map((key) => labels[key] ?? key).join(", ")}</p>}
      </li>)}</ol>
    </section>
  </div>;
}
