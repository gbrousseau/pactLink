import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { canEdit } from "@/lib/access";
import { getSubmission } from "@/lib/submissions";
import { IntakeForm } from "@/components/intake-form";
import { getImportSource } from "@/lib/intake-import";
import { consentMovedKeys } from "@/lib/intake-fields";
import { CorrectionPrompt } from "@/components/correction-prompt";
import { ReferralNotesPanel } from "@/components/referral-notes-panel";

export default async function Edit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ correct?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const row = await getSubmission(user, id);
  if (!row) notFound();
  if (!canEdit(user, row.group_id)) return <p role="alert" className="error-box">Your account cannot edit this form.</p>;
  if (row.removed_at) return <div className="error-box">Restore this removed draft before editing. <Link href={`/forms/${id}`} className="underline">Return to record</Link></div>;
  if (row.status === "archived") return <div className="error-box">Restore this form before editing. <Link href={`/forms/${id}`} className="underline">Return to record</Link></div>;
  if (!row.has_consent) return <div className="error-box">Submit consent before editing Intake. <Link href={`/forms/${id}/consent`} className="underline">Submit consent</Link></div>;
  if (row.review_state === "approved" && (await searchParams).correct !== "1") {
    return <div className="space-y-4">
      <Link href={`/forms/${id}`} className="text-sm text-teal-800 underline">Return to referral</Link>
      <ReferralNotesPanel user={user} referral={row} />
      <CorrectionPrompt phase="Intake" href={`/forms/${id}/edit?correct=1`}
        warning="Saving a correction creates a new Intake draft and locks Screening and Services and Program Completion until Intake is approved again. Existing later records and approvals are retained without requiring another review." />
    </div>;
  }
  const imported = await getImportSource(user, id);
  return <div className="space-y-6"><div><h1 className="text-3xl font-bold">Phase 3: Intake</h1><p className="mt-2 text-sm text-slate-500">Revision {row.revision}. Conflicting changes are rejected, not overwritten. Saving changes creates a working draft; any previously approved version remains intact.</p>
    {row.review_state === "approved" && <p className="mt-2 text-sm text-amber-800">Saving this correction locks later phases until Intake is approved again. Later records and approvals are retained.</p>}
    {!!imported?.placeholder_fields.length && <p className="mt-2 text-sm font-semibold text-amber-800">Replace generated placeholders before review: {imported.placeholder_fields.join(", ")}.</p>}
    {row.review_state === "pending_review" && <p className="mt-2 text-sm text-amber-800">Saving this draft will cancel the pending review request.</p>}</div>
    <ReferralNotesPanel user={user} referral={row} />
    <IntakeForm id={id} revision={row.revision} initial={Object.fromEntries(Object.entries(row.answers).filter(([key]) => !consentMovedKeys.some((item) => item === key)))} />
  </div>;
}
