"use client";
import { useActionState } from "react";
import { redcapRemovalAction } from "@/app/actions";

export function RedcapRemoval({ id, exportId, restore }: { id: string; exportId: string; restore: boolean }) {
  const [state, action, pending] = useActionState(redcapRemovalAction, {});
  return <form action={action} className="space-y-2">
    <input type="hidden" name="id" value={id} /><input type="hidden" name="exportId" value={exportId} />
    <input type="hidden" name="action" value={restore ? "restore" : "remove"} />
    <button className="btn-secondary" disabled={pending}>{pending ? "Saving..." : restore ? "Restore file" : "Remove file"}</button>
    {state.error && <p role="alert" className="error-box">{state.error}</p>}
  </form>;
}
