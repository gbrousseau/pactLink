import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listImportGroups } from "@/lib/intake-import";
import { ImportForm } from "@/components/import-form";

export default async function ImportPage() {
  const user = await requireUser();
  if (user.role !== "admin") notFound();
  const groups = await listImportGroups(user);
  return <div className="space-y-6">
    <Link href="/forms" className="text-sm text-teal-800 hover:underline">← Back to library</Link>
    <h1 className="text-3xl font-bold">Import referral drafts</h1>
    <Link href="/forms/import/batches" className="btn-secondary">View import history and undo</Link>
    <ImportForm groups={groups} />
  </div>;
}
