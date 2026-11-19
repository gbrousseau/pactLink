import { requireUser } from "@/lib/auth";
import { IntakeForm } from "@/components/intake-form";
export default async function NewIntake() {
  const user = await requireUser();
  if (user.role === "viewer") return <div role="alert" className="error-box">Your account is read-only. You cannot create intake forms.</div>;
  return <div className="space-y-6">
    <div><p className="text-xs font-bold uppercase tracking-widest text-teal-700">New enrollment</p><h1 className="mt-2 text-3xl font-bold">Participant intake</h1>
      <p className="mt-2 text-sm text-slate-500">Assigned to {user.group_name}. Each new intake creates a participant and enrollment reference. Synthetic data only.</p></div>
    <IntakeForm initial={{ navigator: user.display_name }} />
  </div>;
}
