import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canEdit } from "@/lib/access";
import { getAudit, getRevisions, getSubmission } from "@/lib/submissions";
import { intakeFields, intakeSections } from "@/lib/intake-fields";
import { Status } from "@/components/status";
import { ArchiveButton } from "@/components/archive-button";

export default async function Detail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const { id } = await params;
  const row = await getSubmission(user, id);
  if (!row) notFound();
  const [audit, revisions] = await Promise.all([getAudit(user, id), getRevisions(user, id)]);
  const edit = canEdit(user, row.group_id);
  const labels = Object.fromEntries(intakeFields.flatMap((field) => [[field.key, field.label], [`${field.key}Other`, `${field.label} (other)`]]));
  return <div className="space-y-6">
    <Link className="text-sm text-teal-800 hover:underline" href="/forms">← Back to library</Link>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-3xl font-bold">{row.participant_name || "Unnamed draft"}</h1><div className="mt-3 flex items-center gap-3"><Status status={row.status} /><span className="text-sm text-slate-500">Intake · Revision {row.revision}</span></div></div>
      {edit && <div className="flex flex-wrap gap-3">
        {row.status !== "archived" && <Link className="btn-primary" href={`/forms/${id}/edit`}>Edit intake</Link>}
        {row.status !== "draft" && <ArchiveButton id={id} revision={row.revision} restore={row.status === "archived"} />}
      </div>}
    </div>
    {(await searchParams).saved === "1" && <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">The operation completed. This page shows the saved database record.</p>}
    <div className="panel !p-5 text-xs leading-6 text-slate-500">
      <p>Enrollment: <span className="break-all font-mono">{row.enrollment_id}</span></p>
      <p>Template: {row.template_version} · Updated: {row.updated_at.toISOString().replace("T", " ").slice(0, 19)} UTC</p>
      {row.legal_hold && <p className="font-bold text-amber-800">Legal hold applies. Permanent deletion is prohibited.</p>}
      <p>Attestation names are not legally approved electronic signatures. No permanent deletion is available.</p>
    </div>
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
    <section className="panel"><h2 className="text-lg font-bold">Saved versions</h2>
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
