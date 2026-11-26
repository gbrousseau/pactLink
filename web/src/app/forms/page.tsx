import Link from "next/link";
import { Plus, Search as SearchIcon, ArrowUpRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listSubmissions, searchSchema, type ListedSubmission, type Search } from "@/lib/submissions";
import { programs } from "@/lib/intake-fields";
import { Status } from "@/components/status";
import { currentReferralPhase } from "@/lib/referral-progress";

const formatDate = (date: Date) => date.toISOString().slice(0, 10);
function pageLink(search: Search, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...search, page })) if (value !== "") params.set(key, String(value));
  return `/forms?${params}`;
}
function phaseSummary(row: ListedSubmission) {
  if (row.removed_at || row.status === "archived") return "Restore this referral to work on its phases";
  if (!row.has_consent || row.review_state !== "approved") return null;
  if (row.screening_review_state !== "approved") return "Intake: Approved";
  return "Intake and Screening and Services: Approved";
}
export default async function Forms({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const raw = await searchParams;
  const parsed = searchSchema.safeParse(raw);
  const result = parsed.success ? await listSubmissions(user, parsed.data) : null;
  const search = parsed.success ? parsed.data : searchSchema.parse({});
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="mb-2 text-xs font-bold uppercase tracking-widest text-teal-700">Records workspace</p>
        <h1 className="text-3xl font-bold tracking-tight">Form library</h1>
        <p className="mt-2 text-sm text-slate-500">Find, review, and manage {user.role === "admin" ? "all groups' " : "your group's "}referral submissions.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {user.role === "admin" && <Link href="/forms/import" className="btn-secondary">Import referrals</Link>}
        {(user.role === "editor" || user.role === "admin") && <Link href="/forms/new" className="btn-primary"><Plus size={18} />New referral</Link>}
      </div>
    </div>
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="panel !p-5"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Available form</p><p className="mt-2 text-lg font-bold">Referral</p><p className="mt-1 text-xs text-slate-500">Packet version 09.24.2026</p></div>
      <div className="panel !p-5"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Matching records</p><p className="mt-2 text-2xl font-bold">{result?.total ?? "--"}</p><p className="mt-1 text-xs text-slate-500">Current filters and access scope</p></div>
      <div className="panel !p-5"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Workspace access</p><p className="mt-2 text-lg font-bold">{user.role === "admin" ? "All groups" : user.group_name}</p><p className="mt-1 text-xs capitalize text-slate-500">{user.role} permissions</p></div>
    </div>
    <form method="get" className="panel !p-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-semibold sm:col-span-2">Participant ID, enrollment ID, or authorized name
          <div className="relative mt-2"><SearchIcon size={17} className="absolute left-3 top-3 text-slate-400" /><input name="q" defaultValue={typeof raw.q === "string" ? raw.q : ""} maxLength={100} className="input !pl-9" placeholder="Search authorized records..." /></div>
          <span className="mt-1 block font-normal text-slate-500">Name matches are limited to consent you are authorized to view.</span>
        </label>
        <label className="text-xs font-semibold">Status<select name="status" defaultValue={search.status} className="input mt-2">
          <option value="active">Active referrals</option><option value="all">All including archived</option><option value="draft">Intake draft</option><option value="pending_review">Awaiting review (any phase)</option><option value="returned">Intake returned for changes</option><option value="approved">Intake approved</option><option value="submitted">Submitted (includes legacy)</option><option value="archived">Archived</option>{user.role === "admin" && <option value="removed">Removed imports</option>}
        </select></label>
        <label className="text-xs font-semibold">Program type<select name="program" defaultValue={search.program} className="input mt-2"><option value="">All programs</option>{programs.map((p) => <option key={p}>{p}</option>)}</select></label>
        <label className="text-xs font-semibold">Navigator<input name="navigator" maxLength={100} defaultValue={search.navigator} className="input mt-2" /></label>
        <label className="text-xs font-semibold">Created from<input type="date" name="from" defaultValue={search.from} className="input mt-2" /></label>
        <label className="text-xs font-semibold">Created through<input type="date" name="to" defaultValue={search.to} className="input mt-2" /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold">Sort by<select name="sort" defaultValue={search.sort} className="input mt-2"><option value="updated">Last updated</option><option value="created">Created date</option><option value="participant">Participant ID</option><option value="contact">First contact</option></select></label>
          <label className="text-xs font-semibold">Direction<select name="direction" defaultValue={search.direction} className="input mt-2"><option value="desc">Descending</option><option value="asc">Ascending</option></select></label>
        </div>
      </div>
      <div className="mt-4 flex gap-3"><button className="btn-primary">Apply filters</button><Link href="/forms" className="btn-secondary">Reset</Link></div>
    </form>
    {!parsed.success && <p role="alert" className="error-box">Invalid filters: {parsed.error.issues.map((issue) => issue.message).join(" ")} Correct the filters or reset the search.</p>}
    {result && <section aria-label="Matching submissions">
      {result.records.length === 0 ? <div className="panel py-12 text-center"><h2 className="text-lg font-bold">No matching records</h2><p className="mt-2 text-sm text-slate-500">{result.total > 0 ? "This page is beyond the matching results. Return to the first page." : "Adjust your filters or create your first synthetic referral."}</p>
        {result.total > 0 && <Link href={pageLink(search, 1)} className="mt-4 inline-block text-teal-800 underline">First page</Link>}
      </div> : <>
        <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block"><table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Participant", "Program", "Status", "Updated", "Open"].map((label) => <th key={label} className="px-5 py-4">{label}</th>)}</tr></thead>
          <tbody>{result.records.map((row) => { const current = currentReferralPhase(row); const summary = phaseSummary(row); return <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
            <td className="px-5 py-4"><Link href={`/forms/${row.id}`} className="break-all font-semibold text-teal-900 hover:underline">{row.participant_id ? `Participant ${row.participant_id}` : `Consent needed · Referral ${row.id}`}</Link></td>
            <td className="px-5 py-4">{row.program_type ?? "Not selected"}</td><td className="px-5 py-4"><span className="mr-1 text-xs text-slate-500">{current.phase}:</span><Status status={row.status} reviewState={current.state} removed={!!row.removed_at} />{summary && <p className="mt-1 text-xs text-slate-500">{summary}</p>}
              {!row.removed_at && row.status !== "archived" && row.has_consent && row.review_state === "approved" && row.screening_review_state === "pending_review" &&
                <Link href={`/forms/${row.id}/screening`} className="mt-1 inline-block text-xs font-semibold text-teal-800 underline">Open Screening and Services review</Link>}
            </td><td className="px-5 py-4 text-slate-500">{formatDate(row.phase_updated_at)}</td>
            <td className="px-5 py-4"><Link aria-label={`Open referral for ${row.participant_id ? `participant ${row.participant_id}` : `referral ${row.id}`}`} href={`/forms/${row.id}`} className="text-teal-800"><ArrowUpRight size={18} /></Link></td>
          </tr>; })}</tbody>
        </table></div>
        <div className="grid gap-3 md:hidden">{result.records.map((row) => { const current = currentReferralPhase(row); const summary = phaseSummary(row); return <Link key={row.id} href={`/forms/${row.id}`} className="panel !p-5">
          <div className="flex items-center justify-between gap-3"><h2 className="break-all font-bold">{row.participant_id ? `Participant ${row.participant_id}` : `Consent needed · Referral ${row.id}`}</h2><span><span className="mr-1 text-xs text-slate-500">{current.phase}:</span><Status status={row.status} reviewState={current.state} removed={!!row.removed_at} /></span></div>
          <p className="mt-2 text-sm text-slate-600">{row.program_type ?? "Program not selected"}</p>{summary && <p className="mt-2 text-xs text-slate-500">{summary}</p>}<p className="mt-2 text-xs text-slate-500">Updated {formatDate(row.phase_updated_at)}</p>
        </Link>; })}</div>
      </>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-slate-500">{result.total} result{result.total === 1 ? "" : "s"} · Page {search.page} of {Math.max(1, Math.ceil(result.total / 20))}</p>
        <div className="flex gap-2">{search.page > 1 && <Link className="btn-secondary" href={pageLink(search, search.page - 1)}>Previous</Link>}{search.page * 20 < result.total && <Link className="btn-secondary" href={pageLink(search, search.page + 1)}>Next</Link>}</div>
      </div>
    </section>}
    <p className="text-xs leading-5 text-slate-500">Refresh the page to see changes made by other users. Other packet forms, approved signatures, user administration, and retention-based deletion are planned for subsequent milestones. Archiving a form does not record program completion.</p>
  </div>;
}
