"use client";

import { useActionState } from "react";
import { navigatorAction } from "@/app/actions";
import type { NavigatorRow } from "@/lib/navigators";

export function NavigatorForm({ groups, navigator }: { groups: { id: string; name: string }[]; navigator?: NavigatorRow }) {
  const [state, action, pending] = useActionState(navigatorAction, {});
  return <form action={action} className="space-y-4">
    {navigator && <input type="hidden" name="id" value={navigator.id} />}
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-semibold">Name<input className="input mt-2" name="displayName" defaultValue={navigator?.display_name} maxLength={100} required /></label>
      <label className="text-sm font-semibold">Group<select className="input mt-2" name="groupId" defaultValue={navigator?.group_id ?? groups[0]?.id} required>
        {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
      </select></label>
      <label className="text-sm font-semibold">Email (optional)<input className="input mt-2" name="email" type="email" defaultValue={navigator?.email ?? ""} maxLength={254} /></label>
      <label className="text-sm font-semibold">Phone (optional)<input className="input mt-2" name="phone" type="tel" defaultValue={navigator?.phone ?? ""} maxLength={40} /></label>
    </div>
    <label className="flex items-center gap-2 text-sm"><input name="active" type="checkbox" value="yes" defaultChecked={navigator?.active ?? true} /> Active navigator</label>
    {state.error && <p role="alert" className="error-box">{state.error}</p>}
    <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : navigator ? "Save navigator" : "Create navigator"}</button>
  </form>;
}
