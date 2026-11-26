import type { Submission } from "@/lib/submissions";
export function Status({ status, reviewState, removed = false }: { status: Submission["status"]; reviewState: Submission["review_state"] | "needed" | "ready"; removed?: boolean }) {
  const key = removed ? "removed" : status === "archived" ? "archived" : reviewState;
  const colors = { draft: "bg-amber-50 text-amber-800 ring-amber-200", pending_review: "bg-blue-50 text-blue-800 ring-blue-200",
    returned: "bg-rose-50 text-rose-800 ring-rose-200", approved: "bg-teal-50 text-teal-800 ring-teal-200",
    legacy: "bg-slate-100 text-slate-700 ring-slate-200", archived: "bg-slate-100 text-slate-600 ring-slate-200", removed: "bg-rose-50 text-rose-800 ring-rose-200",
    needed: "bg-amber-50 text-amber-800 ring-amber-200", ready: "bg-blue-50 text-blue-800 ring-blue-200" };
  const labels = { draft: "Draft", pending_review: "Awaiting review", returned: "Returned for changes", approved: "Approved", legacy: "Legacy - unverified", archived: "Archived", removed: "Removed import", needed: "Needed", ready: "Ready to begin" };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${colors[key]}`}>{labels[key]}</span>;
}
