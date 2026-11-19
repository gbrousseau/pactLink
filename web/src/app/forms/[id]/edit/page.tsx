import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { canEdit } from "@/lib/access";
import { getSubmission } from "@/lib/submissions";
import { IntakeForm } from "@/components/intake-form";

export default async function Edit({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const row = await getSubmission(user, id);
  if (!row) notFound();
  if (!canEdit(user, row.group_id)) return <p role="alert" className="error-box">Your account cannot edit this form.</p>;
  if (row.status === "archived") return <div className="error-box">Restore this form before editing. <Link href={`/forms/${id}`} className="underline">Return to record</Link></div>;
  return <div className="space-y-6"><div><h1 className="text-3xl font-bold">Edit intake</h1><p className="mt-2 text-sm text-slate-500">Revision {row.revision}. Conflicting changes are rejected, not overwritten.</p></div>
    <IntakeForm id={id} revision={row.revision} initial={row.answers} />
  </div>;
}
