"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type Notice = { id: string; submission_id: string; version: number; created_at: string };
export function CaseNotifications({ initial }: { initial: Notice[] }) {
  const [notifications, setNotifications] = useState(initial);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/case-notifications", { cache: "no-store" });
        if (!response.ok) throw new Error("Notifications unavailable");
        const data: Notice[] = await response.json();
        if (active) { setNotifications(data); setError(false); }
      } catch {
        if (active) setError(true);
      }
    };
    const timer = setInterval(refresh, 30000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  return <details className="relative">
    <summary className="cursor-pointer rounded-lg border border-slate-300 p-2" aria-label={`Notifications: ${notifications.length} unread`}>
      <span className="flex items-center gap-1"><Bell size={20} /><span className="text-xs font-bold">{notifications.length}</span></span>
    </summary>
    <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
      <p className="mb-2 text-sm font-bold">Unread notifications</p>
      {error && <p role="alert" className="text-sm text-rose-800">Notifications unavailable. Check your session or reload.</p>}
      {notifications.length ? <ul className="space-y-2">{notifications.map((notice) => <li key={notice.id}>
        <Link prefetch={false} href={`/forms/${notice.submission_id}/case-file`} className="block rounded border p-2 text-sm text-teal-800 underline">
          Case File submitted · {notice.created_at.slice(0, 10)}
        </Link></li>)}</ul> : !error && <p className="text-sm text-slate-500">No unread notifications.</p>}
    </div>
  </details>;
}
