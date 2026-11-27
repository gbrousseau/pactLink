import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isValidNotesCursor, listAllReferralNotes } from "@/lib/referral-notes";

export default async function AllReferralNotes({ searchParams }: { searchParams: Promise<{ before?: string | string[] }> }) {
  const user = await requireUser();
  if (user.role !== "admin") notFound();
  const before = (await searchParams).before;
  if (before !== undefined && (typeof before !== "string" || !isValidNotesCursor(before))) {
    return <p role="alert" className="error-box">Invalid notes page. <Link href="/forms/notes" className="underline">Return to the latest notes</Link>.</p>;
  }
  const { notes, hasMore } = await listAllReferralNotes(user, before);
  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold">All referral notes</h1>
      <p className="mt-2 text-sm text-slate-600">Notes from all groups, newest first. Shared notes must not contain restricted personal information.</p></div>
    {notes.length === 0 ? <p className="panel text-sm text-slate-500">No notes on this page.</p> :
      <ol className="space-y-3">{notes.map((note) => <li key={note.id} className="panel !p-5">
        <p className="text-sm font-semibold">{note.author} · {note.created_at.toISOString().replace("T", " ").slice(0, 19)} UTC · {note.group_name}</p>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm">{note.content}</p>
        <Link className="mt-3 inline-block break-all text-sm text-teal-800 underline" href={`/forms/${note.submission_id}`}>
          {note.participant_id ? `Participant ${note.participant_id}` : `Consent needed · Referral ${note.submission_id}`}
        </Link>
      </li>)}</ol>}
    <div className="flex flex-wrap gap-3">
      {before && <Link className="btn-secondary" href="/forms/notes">Latest notes</Link>}
      {hasMore && <Link className="btn-secondary" href={`/forms/notes?before=${notes[notes.length - 1].id}`}>Older notes</Link>}
    </div>
  </div>;
}
