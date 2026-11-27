"use client";

import { useActionState } from "react";
import { publishCaseFileAction } from "@/app/actions";

export function CaseFilePublish({ id, version }: { id: string; version: number }) {
  const [state, action, pending] = useActionState(publishCaseFileAction, {});
  return <form action={action} className="space-y-3">
    <input type="hidden" name="id" value={id} /><input type="hidden" name="version" value={version} />
    <p className="text-sm text-slate-600">Submit this saved version to all active navigators in this referral&apos;s group. Email and text delivery are disabled in this demo.</p>
    {state.error && <p role="alert" className="error-box">{state.error}</p>}
    <button className="btn-primary" disabled={pending}>{pending ? "Submitting…" : "Submit Case File to navigators"}</button>
  </form>;
}
