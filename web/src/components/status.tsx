export function Status({ status }: { status: "draft" | "submitted" | "archived" }) {
  const colors = { draft: "bg-amber-50 text-amber-800 ring-amber-200", submitted: "bg-teal-50 text-teal-800 ring-teal-200", archived: "bg-slate-100 text-slate-600 ring-slate-200" };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${colors[status]}`}>{status}</span>;
}
