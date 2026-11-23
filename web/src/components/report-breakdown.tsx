"use client";

import { useId, useState } from "react";
import type { ReportBreakdown } from "@/lib/demo-report";
import { availableChartViews, type ChartSemantics, type ChartView } from "@/lib/chart-options";

const colors = ["#0f766e", "#2563a6", "#b45309", "#7c3aed", "#be185d", "#475569"];
const labels: Record<ChartView, string> = { list: "List (default)", table: "Table", bar: "Bar chart", pie: "Pie chart" };

export function ReportBreakdownCard({ title, description, rows, semantics }: {
  title: string; description: string; rows: ReportBreakdown[]; semantics: ChartSemantics;
}) {
  const id = useId();
  const [selected, setSelected] = useState<ChartView>("list");
  const options = availableChartViews(rows, semantics);
  const view = options.includes(selected) ? selected : "list";
  const max = Math.max(...rows.map((row) => row.count), 1);
  const total = semantics.partition?.denominator ?? 0;
  let cumulative = 0;
  const stops = total > 0 ? rows.map((row, index) => {
    const start = cumulative;
    cumulative += row.count / total * 100;
    return `${colors[index % colors.length]} ${start}% ${cumulative}%`;
  }) : [];
  return <section className="panel !p-5">
    <h3 id={`${id}-title`} className="font-bold">{title}</h3>
    <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
    <p className="mt-1 text-xs font-semibold text-amber-800">Synthetic demonstration only — not for real decisions.</p>
    <label className="mt-3 block text-xs font-semibold">View for {title}
      <select className="input mt-1" value={view} onChange={(event) => {
        const next = options.find((option) => option === event.target.value);
        if (next) setSelected(next);
      }}>
        {options.map((option) => <option key={option} value={option}>{labels[option]}</option>)}
      </select>
    </label>
    {!semantics.partition && <p className="mt-2 text-xs text-slate-500">Pie view unavailable: a mutually exclusive whole has not been established for this measure.</p>}
    {semantics.partition && !options.includes("pie") && <p className="mt-2 text-xs text-slate-500">Pie view unavailable when the whole is empty or category counts do not match it.</p>}
    {view === "pie" && <div className="mt-4 flex justify-center">
      <div aria-hidden="true" className="h-36 w-36 rounded-full" style={{ background: `conic-gradient(${stops.join(", ")})` }} />
    </div>}
    {view === "pie" && <p className="mt-3 text-xs text-slate-500">Whole: {total} {semantics.partition?.label}. Percentages are rounded.</p>}
    {view === "table" ? <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm">
      <caption className="sr-only">{title}: synthetic counts</caption>
      <thead><tr className="border-b border-slate-200"><th scope="col" className="py-2">Category</th><th scope="col" className="py-2 text-right">Count</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.label} className="border-b border-slate-100"><th scope="row" className="py-2 font-normal">{row.label}</th><td className="py-2 text-right">{row.count}</td></tr>)}</tbody>
    </table></div> : <ul className="mt-4 space-y-3" aria-labelledby={`${id}-title`}>{rows.map((row, index) => <li key={row.label}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2">{view === "pie" && <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: colors[index % colors.length] }} />}{row.label}</span>
        <strong className="shrink-0">{row.count}{view === "pie" && ` (${(row.count / total * 100).toFixed(1)}%)`}</strong>
      </div>
      {(view === "list" || view === "bar") && <div aria-hidden="true" className={`mt-1 rounded-full bg-slate-100 ${view === "bar" ? "h-5" : "h-2"}`}>
        <div className="h-full rounded-full bg-teal-700" style={{ width: `${row.count / max * 100}%` }} />
      </div>}
    </li>)}</ul>}
    {view !== "table" && <details className="mt-4 text-sm">
      <summary className="cursor-pointer text-teal-800">View exact counts as a table</summary>
      <table className="mt-2 w-full text-left"><caption className="sr-only">{title}: synthetic counts</caption>
        <thead><tr><th scope="col">Category</th><th scope="col" className="text-right">Count</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.label}><th scope="row" className="py-1 font-normal">{row.label}</th><td className="text-right">{row.count}</td></tr>)}</tbody>
      </table>
    </details>}
  </section>;
}
