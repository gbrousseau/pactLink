import Link from "next/link";
import { ClipboardList, ShieldCheck, Plus, LogOut, LayoutDashboard, Users } from "lucide-react";
import { logoutAction } from "@/app/actions";
import type { User } from "@/lib/access";
import { hostedDemoEnabled } from "@/lib/access";
import { listCaseNotifications } from "@/lib/case-file";
import { CaseNotifications } from "./case-notifications";

export async function Shell({ user, children }: { user: User; children: React.ReactNode }) {
  const notifications = await listCaseNotifications(user);
  return <div className="min-h-screen">
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-900">
      {hostedDemoEnabled() ? "HOSTED DEMO · Synthetic data only · Not approved for CJI or protected health information" : "DEVELOPMENT ONLY · Synthetic data only · Not approved for CJI or protected health information"}
    </div>
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-8">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="rounded-xl bg-teal-800 p-2.5 text-white"><ShieldCheck size={25} /></div>
          <div><p className="text-lg font-bold tracking-tight text-slate-900">Deflection Workspace</p><p className="text-xs text-slate-500">Clackamas County · Referral pilot</p></div>
        </Link>
        <div className="flex items-center gap-4">
          {user.role === "editor" && <CaseNotifications key={notifications.map((notice) => notice.id).join(",")}
            initial={notifications.map((notice) => ({ ...notice, created_at: notice.created_at.toISOString() }))} />}
          <div className="text-right"><p className="text-sm font-semibold">{user.display_name}</p><p className="text-xs capitalize text-slate-500">{user.role} · {user.role === "admin" ? "All groups" : user.group_name}</p></div>
          <form action={logoutAction}><button className="btn-secondary" aria-label="Sign out"><LogOut size={16} /><span className="hidden sm:inline">Sign out</span></button></form>
        </div>
      </div>
    </header>
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-8 lg:grid-cols-[200px_1fr] lg:py-8">
      <aside>
        <nav aria-label="Main navigation" className="flex flex-wrap gap-2 lg:flex-col">
          <Link href="/dashboard" className="nav-link"><LayoutDashboard size={18} /> Dashboard</Link>
          <Link href="/forms" className="nav-link"><ClipboardList size={18} /> Form library</Link>
          {(user.role === "editor" || user.role === "admin") && <Link href="/forms/new" className="nav-link"><Plus size={18} /> New referral</Link>}
          {user.role === "admin" && <Link href="/forms/users" className="nav-link"><Users size={18} /> Navigator profiles</Link>}
        </nav>
        <div className="mt-8 hidden rounded-xl border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-500 lg:block">
          <p className="mb-1 font-semibold text-slate-700">Access-controlled workspace</p>
          Viewing and editing are checked on the server. All successful record changes are audited.
        </div>
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  </div>;
}
