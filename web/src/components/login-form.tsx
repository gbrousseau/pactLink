"use client";
import { useActionState } from "react";
import { loginAction } from "@/app/actions";

export function LoginForm({ hostedDemo = false, accounts }: { hostedDemo?: boolean; accounts: { id: string; display_name: string; role: string; group_name: string }[] }) {
  const [state, action, pending] = useActionState(loginAction, {});
  return <form action={action} className="space-y-5">
    <label className="block text-sm font-semibold" htmlFor="account">{hostedDemo ? "Synthetic demo account" : "Development account"}</label>
    <select id="account" name="account" className="input">
      {accounts.map((account) => <option key={account.id} value={account.id}>{account.display_name} · {account.role} · {account.role === "admin" ? "All groups" : account.group_name}</option>)}
    </select>
    {state.error && <p role="alert" className="error-box">{state.error}</p>}
    <button disabled={pending} className="btn-primary w-full">{pending ? "Signing in..." : hostedDemo ? "Enter synthetic demo" : "Enter development workspace"}</button>
    <p className="text-xs leading-5 text-slate-500">Synthetic accounts only. No password is required. Anyone with access can select any demo role, including administrator. Sessions expire after 20 minutes of inactivity or 8 hours maximum.</p>
  </form>;
}
