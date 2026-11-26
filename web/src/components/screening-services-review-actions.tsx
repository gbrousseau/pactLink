"use client";

import { useActionState } from "react";
import { screeningServicesReviewAction } from "@/app/actions";

export function ScreeningServicesReviewActions({ id, revision }: { id: string; revision: number }) {
  const [state, action, pending] = useActionState(screeningServicesReviewAction, {});
  return <div className="flex flex-wrap gap-5">
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} /><input type="hidden" name="revision" value={revision} /><input type="hidden" name="intent" value="approve" />
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Approve Screening and Services"}</button>
    </form>
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} /><input type="hidden" name="revision" value={revision} /><input type="hidden" name="intent" value="return" />
      <label className="block text-sm font-semibold">Reason for returning
        <textarea name="reason" required maxLength={2000} rows={2} className="input mt-2" />
      </label>
      <button className="btn-secondary" disabled={pending}>{pending ? "Saving…" : "Return for changes"}</button>
    </form>
    {state.error && <p role="alert" className="error-box basis-full">{state.error}</p>}
  </div>;
}
