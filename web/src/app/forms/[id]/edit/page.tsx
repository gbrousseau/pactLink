import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { canEdit } from "@/lib/access";
import { getSubmission } from "@/lib/submissions";
import { IntakeForm } from "@/components/intake-form";
import { getImportSource } from "@/lib/intake-import";

export default async function Edit({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const row = await getSubmission(user, id);
  if (!row) notFound();
  if (!canEdit(user, row.group_id)) return <p role="alert" className="error-box">Your account cannot edit this form.</p>;
  if (row.removed_at) return <div className="error-box">Restore this removed draft before editing. <Link href={`/forms/${id}`} className="underline">Return to record</Link></div>;
  if (row.status === "archived") return <div className="error-box">Restore this form before editing. <Link href={`/forms/${id}`} className="underline">Return to record</Link></div>;
  const imported = await getImportSource(user, id);
  return <div className="space-y-6"><div><h1 className="text-3xl font-bold">Edit intake</h1><p className="mt-2 text-sm text-slate-500">Revision {row.revision}. Conflicting changes are rejected, not overwritten. Saving changes creates a working draft; any previously approved version remains intact.</p>
    {!!imported?.placeholder_fields.length && <p className="mt-2 text-sm font-semibold text-amber-800">Replace generated placeholders before review: {imported.placeholder_fields.join(", ")}.</p>}
    {row.review_state === "pending_review" && <p className="mt-2 text-sm text-amber-800">Saving this draft will cancel the pending review request.</p>}</div>
    <IntakeForm id={id} revision={row.revision} initial={row.answers} />
  </div>;
}
