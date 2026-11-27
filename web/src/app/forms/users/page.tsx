import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { database } from "@/lib/db";
import { listNavigators } from "@/lib/navigators";
import { NavigatorForm } from "@/components/navigator-form";
import { CollapsibleSection } from "@/components/collapsible-section";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser();
  if (user.role !== "admin") notFound();
  const [groups, navigators] = await Promise.all([
    database().query<{ id: string; name: string }>("SELECT id,name FROM app_groups ORDER BY name,id"),
    listNavigators(user),
  ]);
  return <div className="space-y-6"><div><h1 className="text-3xl font-bold">Navigator profiles</h1>
    <p className="mt-2 text-sm text-slate-600">Synthetic demo accounts only. Email and text delivery are disabled; no messages are sent.</p></div>
    {(await searchParams).saved === "1" && <p role="status" className="rounded-lg bg-teal-50 p-4 text-sm text-teal-900">Navigator profile saved.</p>}
    <CollapsibleSection title="Create navigator"><NavigatorForm groups={groups.rows} /></CollapsibleSection>
    {navigators.map((navigator) => <CollapsibleSection key={navigator.id} title={`${navigator.display_name} · ${navigator.group_name}${navigator.active ? "" : " · inactive"}`} defaultOpen={false}>
      <NavigatorForm groups={groups.rows} navigator={navigator} />
    </CollapsibleSection>)}
  </div>;
}
