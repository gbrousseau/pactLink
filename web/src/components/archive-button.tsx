"use client";
import { useActionState } from "react";
import { archiveAction } from "@/app/actions";

export function ArchiveButton({ id, revision, restore }: { id: string; revision: number; restore: boolean }) {
  const [state, action, pending] = useActionState(archiveAction, {});
  return <form action={action} onSubmit={(event) => {
    if (!window.confirm(restore ? "Restore this form to submitted status?" : "Archive this submitted form? It remains searchable and is not deleted. This does not mark the participant's program as completed.")) event.preventDefault();
  }}>
    <input type="hidden" name="id" value={id} /><input type="hidden" name="revision" value={revision} />
    <input type="hidden" name="intent" value={restore ? "restore" : "archive"} />
    <button disabled={pending} className="btn-secondary">{pending ? "Saving..." : restore ? "Restore form" : "Archive form"}</button>
    {state.error && <p role="alert" className="error-box mt-3">{state.error}</p>}
  </form>;
}
