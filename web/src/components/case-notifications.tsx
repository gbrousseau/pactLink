"use client";

import { Bell, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { clearNotificationAction, noteAlertsPreferenceAction } from "@/app/actions";

type Phase = "intake" | "screening" | "completion";
type Notice = { id: string; kind: "case" | Phase | "note" | "review_approved" | "review_returned" | "inactive"; submission_id: string; created_at: string; phase?: Phase | null };
const phaseLabels = { intake: "Intake", screening: "Screening and Services", completion: "Program Completion" };
const paths = { intake: "", screening: "/screening", completion: "/completion" };
function label(notice: Notice) {
  if (notice.kind === "case") return "Case File submitted";
  if (notice.kind === "note") return "New referral note";
  if (notice.kind === "inactive") return "No referral updates for 30 days";
  if (notice.kind === "review_approved" || notice.kind === "review_returned") {
    return `${notice.phase ? phaseLabels[notice.phase] : "Referral"} review ${notice.kind === "review_approved" ? "approved" : "returned"}`;
  }
  return `${phaseLabels[notice.kind]} review requested`;
}
function target(notice: Notice) {
  const base = `/forms/${notice.submission_id}`;
  if (notice.kind === "case") return `${base}/case-file`;
  if (notice.kind === "intake" || notice.kind === "screening" || notice.kind === "completion") return `${base}${paths[notice.kind]}`;
  const phase = notice.phase ? paths[notice.phase] : "";
  const kind = notice.kind === "inactive" ? "inactive" : "activity";
  return `${base}${phase}?noticeKind=${kind}&noticeId=${encodeURIComponent(notice.id)}`;
}
export function Notifications({ initial, noteAlerts }: { initial: Notice[]; noteAlerts?: boolean }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initial);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState("");
  const [preference, setPreference] = useState(noteAlerts);
  const [pending, startTransition] = useTransition();
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const current = generation.current;
      try {
        const response = await fetch("/api/notifications", { cache: "no-store" });
        if (!response.ok) throw new Error("Notifications unavailable");
        const data: Notice[] = await response.json();
        if (active && current === generation.current) { setNotifications(data); setError(false); }
      } catch {
        if (active && current === generation.current) setError(true);
      }
    };
    const timer = setInterval(refresh, 30000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  function dismiss(notice: Notice) {
    setActionError("");
    generation.current += 1;
    startTransition(async () => {
      try {
        const kind = notice.kind === "note" || notice.kind === "review_approved" || notice.kind === "review_returned" ? "activity" : notice.kind;
        const result = await clearNotificationAction(kind, notice.id);
        if (result.error) { setActionError(result.error); return; }
        setNotifications((current) => current.filter((item) => item.id !== notice.id || item.kind !== notice.kind));
      } catch {
        setActionError("The notification could not be dismissed. Check your connection and retry.");
      }
    });
  }
  function changePreference(enabled: boolean) {
    setActionError("");
    startTransition(async () => {
      try {
        const result = await noteAlertsPreferenceAction(enabled);
        if (result.error) { setActionError(result.error); return; }
        setPreference(enabled);
        router.refresh();
      } catch {
        setActionError("The preference could not be saved. Check your connection and retry.");
      }
    });
  }
  return <details className="relative">
    <summary className="cursor-pointer rounded-lg border border-slate-300 p-2" aria-label={`Notifications: ${notifications.length} unread`}>
      <span className="flex items-center gap-1"><Bell size={20} /><span className={notifications.length ? "rounded-full bg-red-700 px-1.5 py-0.5 text-xs font-bold text-white" : "text-xs font-bold"}>{notifications.length}</span></span>
    </summary>
    <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
      <p className="mb-2 text-sm font-bold">Unread notifications</p>
      {error && <p role="alert" className="text-sm text-rose-800">Notifications unavailable. Check your session or reload.</p>}
      {actionError && <p role="alert" className="text-sm text-rose-800">{actionError}</p>}
      {notifications.length ? <ul className="max-h-96 space-y-2 overflow-y-auto">{notifications.map((notice) => <li key={`${notice.kind}-${notice.id}`} className="flex items-start gap-1">
        <Link prefetch={false} href={target(notice)} className="block min-w-0 flex-1 rounded border p-2 text-sm text-teal-800 underline">
          {label(notice)} · {notice.created_at.slice(0, 10)}<br /><span className="break-all">Referral {notice.submission_id}</span>
        </Link>
        <button type="button" className="rounded border p-2" disabled={pending} onClick={() => dismiss(notice)}
          aria-label={`Dismiss ${label(notice)} for referral ${notice.submission_id}`}><X size={16} /></button>
      </li>)}</ul> : !error && <p className="text-sm text-slate-500">No unread notifications.</p>}
      {preference !== undefined && <label className="mt-3 flex items-start gap-2 border-t pt-3 text-xs">
        <input type="checkbox" checked={preference} disabled={pending} onChange={(event) => changePreference(event.target.checked)} />
        Notify me about new notes (future notes only)
      </label>}
    </div>
  </details>;
}
