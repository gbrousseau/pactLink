import Link from "next/link";
import { ArrowRight, ClipboardList, FilePlus2, ShieldAlert } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { defaultReportRange, demoReportingSource, reportRangeSchema } from "@/lib/demo-report";
import { ReportBreakdownCard } from "@/components/report-breakdown";
import { ReportGroupSelect } from "@/components/report-group-select";
import { database } from "@/lib/db";

export const dynamic = "force-dynamic";
export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const raw = await searchParams;
  const range = reportRangeSchema.safeParse(raw.from === undefined && raw.to === undefined ? defaultReportRange : { from: raw.from, to: raw.to });
  const groups = user.role === "admin"
    ? (await database().query<{ id: string; name: string }>("SELECT id,name FROM app_groups ORDER BY name,id")).rows
    : [{ id: user.group_id, name: user.group_name }];
  const groupValue = raw.group === undefined ? "" : raw.group;
  const groupValid = typeof groupValue === "string" && (user.role === "admin"
    ? groupValue === "" || groups.some((group) => group.id === groupValue)
    : groupValue === "" || groupValue === user.group_id);
  const selectedGroups = !groupValid ? [] : groupValue === "" ? groups : groups.filter((group) => group.id === groupValue);
  const reports = range.success && groupValid
    ? await Promise.all(selectedGroups.map(async (group) => ({ group, report: await demoReportingSource.getReport(user, range.data, group.id) })))
    : [];
  return <Shell user={user}><div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="mb-2 text-xs font-bold uppercase tracking-widest text-teal-700">Workspace overview</p>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-2 text-sm text-slate-600">Welcome, {user.display_name}. Open your workspace or explore the demonstration below.</p>
      </div>
      <Link href="/forms" className="btn-secondary"><ClipboardList size={17} />Form library</Link>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <Link href="/forms" className="panel flex items-center justify-between gap-4 !p-5 hover:border-teal-500">
        <div><h2 className="font-bold">Find intakes</h2><p className="mt-1 text-sm text-slate-500">Search and review records available to your account.</p></div><ArrowRight size={19} className="shrink-0 text-teal-700" />
      </Link>
      {(user.role === "editor" || user.role === "admin") && <Link href="/forms/new" className="panel flex items-center justify-between gap-4 !p-5 hover:border-teal-500">
        <div><h2 className="font-bold">Create an intake</h2><p className="mt-1 text-sm text-slate-500">Start a new working draft.</p></div><FilePlus2 size={19} className="shrink-0 text-teal-700" />
      </Link>}
    </div>
    <section aria-labelledby="demo-report-title" className="space-y-5">
      <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-5 text-amber-950">
        <div className="flex gap-3"><ShieldAlert className="shrink-0" size={23} /><div>
          <h2 id="demo-report-title" className="text-lg font-bold">Synthetic report demonstration — not real program data</h2>
          <p className="mt-2 text-sm font-semibold">Do not use these numbers to evaluate programs, make real-life decisions, plan budgets, or request grants.</p>
          <p className="mt-2 text-sm">Illustrative fixed examples only. This report does not read Intake records or approved snapshots. Categories, dates, and counting rules are provisional and require client approval.</p>
        </div></div>
      </div>
      <form method="get" className="panel !p-5">
        <div className="flex flex-wrap items-end gap-3">
          {user.role === "admin" && <ReportGroupSelect key={groupValid ? groupValue : ""} groups={groups} selected={groupValid && typeof groupValue === "string" ? groupValue : ""} />}
          <label className="text-sm font-semibold">From date<input className="input mt-2" name="from" type="date" defaultValue={typeof raw.from === "string" ? raw.from : defaultReportRange.from} required /></label>
          <label className="text-sm font-semibold">Through date<input className="input mt-2" name="to" type="date" defaultValue={typeof raw.to === "string" ? raw.to : defaultReportRange.to} required /></label>
          <button className="btn-primary">Apply date range</button><Link className="btn-secondary" href="/dashboard">Reset</Link>
        </div>
        <p className="mt-3 text-xs text-slate-500">Inclusive dates. The example dataset ends {defaultReportRange.to}; it does not refresh from real records.</p>
      </form>
      {!range.success && <p role="alert" className="error-box">Enter valid start and end dates; the start must not follow the end. No report was generated.</p>}
      {!groupValid && <p role="alert" className="error-box">The selected group is invalid or unavailable to your account. No report was generated.</p>}
      {groupValid && range.success && reports.length === 0 && <p role="status" className="error-box">No groups are available for reporting.</p>}
      {reports.map(({ group, report }) => <section key={group.id} aria-label={`Synthetic report for ${group.name}`} className="space-y-5 rounded-2xl border border-slate-300 p-4 sm:p-5">
        <div><h2 className="text-xl font-bold">Illustrative activity · {group.name}</h2>
          <p className="mt-1 text-sm text-slate-600">Synthetic events from {report.range.from} through {report.range.to} · fixture data through {report.fixtureThrough}</p>
          <p className="mt-1 text-xs text-slate-500">Each card uses its own event date. Counts are not a single cohort and must not be added together or used as a success rate.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Cases reviewed", report.reviewed, "Review date"],
            ["Acceptances", report.accepted, "Acceptance date"],
            ["Services started", report.servicesStarted, "Service start date"],
            ["Completions", report.completed, "Outcome date"],
          ].map(([label, count, basis]) => <div key={label} className="panel !p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{count}</p><p className="mt-2 text-xs text-slate-500">{basis} · synthetic</p>
          </div>)}
        </div>
        {report.reviewed + report.accepted + report.servicesStarted + report.outcomes.reduce((sum, item) => sum + item.count, 0) === 0 &&
          <p role="status" className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">No synthetic events fall in this range. Try a range within the example dates.</p>}
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <ReportBreakdownCard title="Program type" description="Synthetic cases reviewed in the selected range." rows={report.programs} semantics={{ comparableCounts: true, partition: { denominator: report.reviewed, label: "reviewed synthetic cases" } }} />
          <ReportBreakdownCard title="First contact" description="Synthetic cases reviewed in the selected range." rows={report.contacts} semantics={{ comparableCounts: true, partition: { denominator: report.reviewed, label: "reviewed synthetic cases" } }} />
          <ReportBreakdownCard title="Illustrative demographics" description="Fictional group labels for reviewed cases; not real demographic categories." rows={report.demographics} semantics={{ comparableCounts: true }} />
          <ReportBreakdownCard title="Referring agencies" description="Fictional agency labels for cases reviewed in the range." rows={report.agencies} semantics={{ comparableCounts: true }} />
          <ReportBreakdownCard title="Substance categories" description="Fictional labels for reviewed cases; not clinical findings." rows={report.substances} semantics={{ comparableCounts: true }} />
          <ReportBreakdownCard title="Services started" description="Synthetic service-start events in the selected range." rows={report.services} semantics={{ comparableCounts: true }} />
          <ReportBreakdownCard title="Outcomes" description="Synthetic outcome events in the selected range." rows={report.outcomes} semantics={{ comparableCounts: true }} />
        </div>
        <details className="panel !p-5"><summary className="cursor-pointer font-bold">How to interpret this demo</summary>
          <p className="mt-3 text-sm leading-6 text-slate-600">Program, contact, demographic, agency, and substance breakdowns count example cases by review date. Services, acceptances, and outcomes count their own dated example events, including cases reviewed outside the range. Each example case has at most one service and one outcome; this simplification is not a proposed production rule. Real reporting requires approved event dates, definitions, privacy rules, and source-data workflows. No export or external submission is available.</p>
        </details>
      </section>)}
    </section>
  </div></Shell>;
}
