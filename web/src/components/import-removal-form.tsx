"use client";
import { useActionState } from "react";
import { importedRemovalAction, undoImportAction } from "@/app/actions";

export function BatchUndoForm({ batch, token, count }: { batch: string; token: string; count: number }) {
  const [state, action, pending] = useActionState(undoImportAction, {});
  return <form action={action} className="space-y-4">
    <input type="hidden" name="batch" value={batch} /><input type="hidden" name="token" value={token} />
    <label className="block text-sm font-semibold">Reason for batch undo<textarea className="input mt-2" name="reason" required maxLength={2000} /></label>
    <label className="flex gap-2 text-sm"><input name="confirm" value="yes" type="checkbox" required />I confirm removal of the {count} eligible drafts shown in this preview. Records and history will be retained.</label>
    <button className="btn-primary" disabled={pending || count === 0}>{pending ? "Removing..." : "Remove eligible drafts"}</button>
    {state.error && <p role="alert" className="error-box">{state.error}</p>}
  </form>;
}
export function ImportedRemovalForm({ id, revision, restore }: { id: string; revision: number; restore: boolean }) {
  const [state, action, pending] = useActionState(importedRemovalAction, {});
  return <form action={action} className="space-y-3">
    <input type="hidden" name="id" value={id} /><input type="hidden" name="revision" value={revision} />
    <input type="hidden" name="action" value={restore ? "restore" : "duplicate"} />
    {!restore && <label className="block text-sm font-semibold">Existing referral ID
      <input className="input mt-2" name="target" required placeholder="UUID from the existing referral detail page" />
      <span className="mt-1 block text-xs font-normal text-slate-600">Confirm the existing referral manually. No records are merged.</span>
    </label>}
    <label className="block text-sm font-semibold">Reason<textarea className="input mt-2" name="reason" required maxLength={2000} /></label>
    <label className="flex gap-2 text-sm"><input name="confirm" type="checkbox" value="yes" required />I confirm this action; the source and audit history will be retained.</label>
    <button className="btn-secondary" disabled={pending}>{pending ? "Saving..." : restore ? "Restore imported draft" : "Remove as duplicate"}</button>
    {state.error && <p role="alert" className="error-box">{state.error}</p>}
  </form>;
}
