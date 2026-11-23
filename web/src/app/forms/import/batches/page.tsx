import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listImportBatches } from "@/lib/import-removal";

export default async function ImportHistory() {
  const user = await requireUser();
  if (user.role !== "admin") notFound();
  const batches = await listImportBatches(user);
  return <div className="space-y-6">
    <Link className="text-sm text-teal-800 hover:underline" href="/forms/import">← Back to import</Link>
    <h1 className="text-3xl font-bold">Import history</h1>
    <p className="text-sm text-slate-600">Open a batch to preview eligible drafts, exclusions, and reversible removal.</p>
    {batches.length === 0 ? <p className="panel">No imports yet.</p> : <div className="space-y-3">{batches.map((batch) =>
      <Link key={batch.id} href={`/forms/import/batches/${batch.id}`} className="panel block hover:border-teal-500">
        <p className="font-semibold">{batch.group_name} · {batch.created_at.toISOString().replace("T", " ").slice(0, 19)} UTC</p>
        <p className="mt-2 text-sm text-slate-600">Imported by {batch.display_name} · {batch.imported_count} imported · {batch.skipped_count} skipped · {batch.active_count} active · {batch.removed_count} removed</p>
        <p className="mt-1 break-all font-mono text-xs text-slate-500">{batch.id}</p>
      </Link>)}</div>}
  </div>;
}
