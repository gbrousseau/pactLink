"use client";
import { useActionState } from "react";
import { reviewAction } from "@/app/actions";

export function ReviewAction({ id, revision, intent }: { id: string; revision: number; intent: "request" | "approve" | "return" }) {
  const [state, action, pending] = useActionState(reviewAction, {});
  const label = intent === "request" ? "Request review" : intent === "approve" ? "Approve reviewed revision" : "Return for changes";
  return <form action={action} className="space-y-3">
    <input type="hidden" name="id" value={id} />
    <input type="hidden" name="revision" value={revision} />
    <input type="hidden" name="intent" value={intent} />
    {intent === "return" && <div>
      <label htmlFor="return-reason" className="mb-2 block text-sm font-semibold">Reason for returning this draft</label>
      <textarea id="return-reason" name="reason" required maxLength={2000} rows={3} className="input"
        placeholder="Explain what needs to change. This note is visible to users who can access this referral." />
    </div>}
    <button disabled={pending} className={intent === "approve" || intent === "request" ? "btn-primary" : "btn-secondary"}>
      {pending ? "Saving..." : label}
    </button>
    {state.error && <p role="alert" className="error-box">{state.error}</p>}
  </form>;
}
