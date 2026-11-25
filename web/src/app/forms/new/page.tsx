import { requireUser } from "@/lib/auth";
import { ConsentForm } from "@/components/consent-form";
export default async function NewIntake() {
  const user = await requireUser();
  if (user.role !== "editor" && user.role !== "admin") return <div role="alert" className="error-box">Your account cannot create referral forms.</div>;
  return <div className="space-y-6">
    <div><p className="text-xs font-bold uppercase tracking-widest text-teal-700">Phase 1 of 4</p><h1 className="mt-2 text-3xl font-bold">New referral: Consent</h1>
      <p className="mt-2 text-sm text-slate-500">Assigned to {user.group_name}. Submit consent to create the referral and unlock Intake. Synthetic data only.</p></div>
    <ConsentForm />
  </div>;
}
