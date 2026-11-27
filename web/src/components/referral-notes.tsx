"use client";

import { useState, useTransition, type FormEvent } from "react";
import { addReferralNoteAction, loadReferralNotesAction } from "@/app/actions";
import type { DisplayReferralNote } from "@/lib/referral-notes";

export function ReferralNotes({ id, initial, initialHasMore, canWrite, maxLength }: {
  id: string; initial: DisplayReferralNote[]; initialHasMore: boolean; canWrite: boolean; maxLength: number;
}) {
  const [notes, setNotes] = useState(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [adding, setAdding] = useState(false);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setMessage("");
    startTransition(async () => {
      try {
        const result = await addReferralNoteAction(id, content);
        const note = result.note;
        if (!note) { setError(result.error); return; }
        setNotes((current) => [note, ...current]);
        setContent(""); setAdding(false); setMessage("Note added.");
      } catch (error) {
        console.error("Referral note request failed", error instanceof Error ? error.name : "unknown");
        setError("The note could not be saved. Check your connection and retry.");
      }
    });
  }
  function load(before?: string) {
    setError(""); setMessage("");
    startTransition(async () => {
      try {
        const result = await loadReferralNotesAction(id, before);
        const loaded = result.notes;
        if (!loaded || result.hasMore === undefined) { setError(result.error); return; }
        setNotes((current) => before ? [...current, ...loaded] : loaded);
        setHasMore(result.hasMore);
        if (!before) setMessage("Notes refreshed.");
      } catch (error) {
        console.error("Referral notes request failed", error instanceof Error ? error.name : "unknown");
        setError("Notes could not be loaded. Check your connection and retry.");
      }
    });
  }

  return <section aria-label="Referral notes" className="panel !p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-bold">Referral notes</h2>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" disabled={pending} onClick={() => load()}>Refresh notes</button>
        {canWrite && <button type="button" className="btn-primary" aria-expanded={adding} disabled={pending} onClick={() => setAdding((open) => !open)}>
          {adding ? "Close note" : "Add note"}
        </button>}
      </div>
    </div>
    <p className="mt-3 text-xs leading-5 text-amber-800">Shared with all users who can access this referral, including viewers. Do not include names, dates of birth, other identifying information, or restricted Consent or Case File details. Notes are not automatically screened.</p>
    {adding && <form onSubmit={submit} className="mt-4 space-y-3">
      <label className="block text-sm font-semibold">New note
        <textarea className="input mt-2" value={content} onChange={(event) => setContent(event.target.value)} rows={4} maxLength={maxLength} required disabled={pending} />
      </label>
      <p className="text-xs text-slate-500">Notes cannot be edited or deleted. Add another note to correct or update one.</p>
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save note"}</button>
    </form>}
    {error && <p role="alert" className="error-box mt-4">{error}</p>}
    {message && <p role="status" className="mt-3 text-sm text-teal-800">{message}</p>}
    <details className="mt-4" open>
      <summary className="cursor-pointer text-sm font-semibold">Notes history</summary>
      {notes.length === 0 ? <p className="mt-3 text-sm text-slate-500">No notes yet.</p> :
        <ol className="mt-3 space-y-3">{notes.map((note) => <li key={note.id} className="rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-600">{note.author} · {note.created_at.replace("T", " ").slice(0, 19)} UTC</p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm">{note.content}</p>
        </li>)}</ol>}
      {hasMore && <button type="button" className="btn-secondary mt-3" disabled={pending} onClick={() => load(notes[notes.length - 1].id)}>Load older notes</button>}
    </details>
  </section>;
}
