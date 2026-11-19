"use client";
import { useActionState } from "react";
import { loginAction } from "@/app/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, {});
  return <form action={action} className="space-y-5">
    <label className="block text-sm font-semibold" htmlFor="account">Development account</label>
    <select id="account" name="account" className="input">
      <option value="north-editor">North team - Editor</option>
      <option value="north-viewer">North team - Read-only viewer</option>
      <option value="south-editor">South team - Editor</option>
      <option value="demo-admin">Administrator - All groups</option>
    </select>
    {state.error && <p role="alert" className="error-box">{state.error}</p>}
    <button disabled={pending} className="btn-primary w-full">{pending ? "Signing in..." : "Enter development workspace"}</button>
    <p className="text-xs leading-5 text-slate-500">Synthetic accounts only. No password is required in this local demo. Sessions expire after 20 minutes of inactivity or 8 hours maximum.</p>
  </form>;
}
