import { requireUser } from "@/lib/auth";
import { ConsentForm } from "@/components/consent-form";

export default async function NewConsent() {
  const user = await requireUser();
  if (user.role !== "editor" && user.role !== "admin") return <div role="alert" className="error-box">Your account cannot create referral forms.</div>;
  return <div className="space-y-6">
    <div><p className="text-xs font-bold uppercase tracking-widest text-teal-700">Phase 2 of 5</p><h1 className="mt-2 text-3xl font-bold">New referral: Consent</h1>
      <p className="mt-2 text-sm text-slate-500">Assigned to {user.group_name}. Case File can be added later. Synthetic data only.</p></div>
    <p className="text-sm text-slate-600">Save Consent first to add referral notes.</p>
    <ConsentForm />
  </div>;
}
