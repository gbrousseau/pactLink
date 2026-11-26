"use client";

import { useActionState } from "react";
import { reviewProgramCompletionAction } from "@/app/actions";

export function ProgramCompletionReview({ id, revision, intent }: { id: string; revision: number; intent: "request" | "approve" | "return" }) {
  const [state, action, pending] = useActionState(reviewProgramCompletionAction, {});
  return <form action={action} className="space-y-3">
    <input type="hidden" name="id" value={id} /><input type="hidden" name="revision" value={revision} /><input type="hidden" name="intent" value={intent} />
    {intent === "return" && <label className="block text-sm font-semibold">Reason for returning
      <textarea name="reason" required maxLength={2000} rows={3} className="input mt-2" />
    </label>}
    <button className={intent === "return" ? "btn-secondary" : "btn-primary"} disabled={pending}>
      {pending ? "Saving…" : intent === "request" ? "Request review" : intent === "approve" ? "Approve Program Completion" : "Return for changes"}
    </button>
    {state.error && <p role="alert" className="error-box">{state.error}</p>}
  </form>;
}
