import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { WorkflowError } from "@/lib/access";
import { eligibleForBatchUndo, getBatchPreview } from "@/lib/import-removal";
import { BatchUndoForm } from "@/components/import-removal-form";

export default async function BatchDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser();
  if (user.role !== "admin") notFound();
  const { id } = await params;
  let batch;
  try { batch = await getBatchPreview(user, id); }
  catch (error) { if (error instanceof WorkflowError && ["missing", "invalid"].includes(error.code)) notFound(); throw error; }
  const eligible = batch.rows.filter(eligibleForBatchUndo);
  const excluded = batch.rows.filter((row) => !eligibleForBatchUndo(row));
  return <div className="space-y-6">
    <Link href="/forms/import/batches" className="text-sm text-teal-800 hover:underline">← Import history</Link>
    <h1 className="text-3xl font-bold">Batch undo preview</h1>
    <p className="break-all font-mono text-xs text-slate-500">{id}</p>
    {(await searchParams).saved === "1" && <p role="status" className="rounded-lg bg-teal-50 p-4 text-sm text-teal-900">Eligible drafts were removed. The current preview reflects the updated batch.</p>}
    <div className="panel space-y-4">
      <p className="text-sm">{eligible.length} eligible untouched drafts · {excluded.length} excluded or already removed. Edited, reviewed, submitted, legally held, and removed records are never included.</p>
      <BatchUndoForm batch={id} token={batch.token} count={eligible.length} />
    </div>
    {([["Eligible", eligible], ["Excluded or already removed", excluded]] as const).map(([label, rows]) =>
      <details className="panel" key={label} open={label === "Excluded or already removed" && rows.length > 0}>
        <summary className="cursor-pointer font-semibold">{label} ({rows.length})</summary>
        <ul className="mt-4 space-y-2 text-sm">{rows.map((row) => <li key={row.id} className="border-b border-slate-100 pb-2">
          Record {row.row_number}: <Link className="break-all text-teal-800 underline" href={`/forms/${row.id}`}>{row.participant_id ? `Participant ${row.participant_id}` : `Referral ${row.id}`}</Link>
          {" "}· {row.removed_at ? "Removed" : row.legal_hold ? "Legal hold" : row.revision !== 1 ? `Changed (revision ${row.revision})` : `${row.status}, ${row.review_state.replaceAll("_", " ")}`}
        </li>)}</ul>
      </details>)}
  </div>;
}
