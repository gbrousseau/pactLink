import Link from "next/link";
import Image from "next/image";
import { UserRound } from "lucide-react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canEdit } from "@/lib/access";
import { getSubmission } from "@/lib/submissions";
import { getCaseFile, getCasePublicationInfo, listCaseNotifications } from "@/lib/case-file";
import { CaseFileForm } from "@/components/case-file-form";
import { CollapsibleSection } from "@/components/collapsible-section";
import { CaseFilePublish } from "@/components/case-file-publish";
import { CaseFileRead } from "@/components/case-file-read";
import { caseFileLabels } from "@/lib/case-file-fields";

export default async function CaseFilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ submitted?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const row = await getSubmission(user, id);
  if (!row) notFound();
  const current = await getCaseFile(user, id);
  const edit = user.role === "admin" && !row.removed_at && row.status !== "archived" && !row.legal_hold;
  if (!current && !edit) notFound();
  const publication = user.role === "admin" ? await getCasePublicationInfo(user, id) : null;
  const unread = user.role === "editor" ? (await listCaseNotifications(user)).some((notice) => notice.submission_id === id && notice.version <= (current?.version ?? 0)) : false;
  return <div className="space-y-6">
    <div><p className="text-xs font-bold uppercase tracking-widest text-teal-700">Phase 1 of 5</p><h1 className="mt-2 text-3xl font-bold">Case File</h1></div>
    <Link href={`/forms/${id}`} className="text-sm text-teal-800 underline">Return to referral</Link>
    {(await searchParams).submitted === "1" && <p role="status" className="rounded-lg bg-teal-50 p-4 text-sm text-teal-900">Case File submitted for in-app notification. Email and text were not sent.</p>}
    {unread && current && <CaseFileRead id={id} version={current.version} />}
    {current && <CollapsibleSection title={user.role === "admin" ? "Saved Case File" : "Submitted Case File"}>
      <p className="text-sm text-slate-500">Entered {current.entered_at.toISOString().slice(0, 10)} (UTC) · Version {current.version}</p>
      {(current.answers.appearanceDate || current.answers.appearanceTime) && <p className="rounded-lg bg-amber-100 p-3 font-semibold">Scheduled to appear: {current.answers.appearanceDate} {current.answers.appearanceTime} (local time)</p>}
      {current.has_photo ? <Image unoptimized src={`/forms/${id}/case-file/photo/${current.version}`} alt="Synthetic participant photo" width={188} height={195} className="h-48 w-48 rounded bg-slate-100 object-contain" />
        : <div aria-label="No photo available" className="flex h-48 w-48 items-center justify-center rounded bg-slate-100 text-slate-400"><UserRound size={90} /></div>}
      <dl className="grid gap-4 text-sm sm:grid-cols-2">{Object.entries(caseFileLabels).map(([key, label]) => <div key={key}>
        <dt className="text-slate-500">{label}</dt><dd className="whitespace-pre-wrap break-words">{current.answers[key as keyof typeof caseFileLabels] || "Not provided"}</dd>
      </div>)}</dl>
      {current.has_photo && <a className="text-sm text-teal-800 underline" href={`/forms/${id}/case-file/photo/${current.version}`} download>Download synthetic photo</a>}
      <a className="btn-secondary inline-flex" href={`/forms/${id}/case-file/pdf/${current.version}`} download>Export Case File PDF</a>
    </CollapsibleSection>}
    {user.role === "admin" && publication && <p className="text-sm text-slate-600">Submitted version {publication.version} · {publication.recipients} navigator(s); missing email: {publication.missing_email}, missing phone: {publication.missing_phone}. Email and text delivery are disabled.</p>}
    {edit && current && publication?.version !== current.version && <CollapsibleSection title="Submit Case File"><CaseFilePublish id={id} version={current.version} /></CollapsibleSection>}
    {edit && <CollapsibleSection title={current ? "Edit Case File" : "Enter Case File"}><CaseFileForm id={id} current={current} /></CollapsibleSection>}
    {!row.has_consent && canEdit(user, row.group_id) && !row.removed_at && row.status !== "archived" && <Link href={`/forms/${id}/consent`} className="btn-secondary inline-block">Continue to Consent</Link>}
  </div>;
}
