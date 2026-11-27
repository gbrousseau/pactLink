import { requireUser } from "@/lib/auth";
import { CaseFileForm } from "@/components/case-file-form";
import { redirect } from "next/navigation";
import { database } from "@/lib/db";
export default async function NewIntake() {
  const user = await requireUser();
  if (user.role !== "editor" && user.role !== "admin") return <div role="alert" className="error-box">Your account cannot create referral forms.</div>;
  if (user.role === "editor") redirect("/forms/new/consent");
  const groups = await database().query<{ id: string; name: string }>("SELECT id,name FROM app_groups ORDER BY name,id");
  return <div className="space-y-6">
    <div><p className="text-xs font-bold uppercase tracking-widest text-teal-700">Phase 1 of 5</p><h1 className="mt-2 text-3xl font-bold">New referral: Case File</h1>
      <p className="mt-2 text-sm text-slate-500">Select the referral group. Save a Case File or skip directly to Consent. Synthetic data only.</p></div>
    <p className="text-sm text-slate-600">Save the Case File or Consent first to add referral notes.</p>
    <CaseFileForm groups={groups.rows} />
  </div>;
}
