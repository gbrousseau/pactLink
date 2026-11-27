import { ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { demoAccessEnabled, hostedDemoEnabled, type Role } from "@/lib/access";
import { LoginForm } from "@/components/login-form";
import { ThemeControl } from "@/components/theme-control";
import { database } from "@/lib/db";

export const dynamic = "force-dynamic";
export default async function Login() {
  if (await currentUser()) redirect("/dashboard");
  const accounts = demoAccessEnabled() ? (await database().query<{ id: string; display_name: string; role: Role; group_name: string }>(
    "SELECT u.id,u.display_name,u.role,g.name AS group_name FROM app_users u JOIN app_groups g ON g.id=u.group_id WHERE u.active=true ORDER BY (u.role='admin'),u.display_name,u.id")).rows : [];
  return <main className="flex min-h-screen items-center justify-center px-4 py-12">
    <div className="w-full max-w-lg">
      <div className="mb-4 flex justify-end"><ThemeControl /></div>
      <div className="mb-8 flex items-center gap-3"><ShieldCheck className="text-teal-800" size={38} /><div>
        <h1 className="text-2xl font-bold tracking-tight">Deflection Workspace</h1>
        <p className="mt-1 text-sm text-slate-500">Clackamas County · Development referral pilot</p>
      </div></div>
      <section className="panel">
        <h2 className="mb-2 text-xl font-bold">Welcome to the referral pilot</h2>
        <p className="mb-6 text-sm leading-6 text-slate-500">Create and manage referral records in an access-controlled workspace.</p>
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <strong>Synthetic data only.</strong> This prototype is not CJIS approved and must not contain real participant, legal, or health information.
        </div>
        {demoAccessEnabled() ? <LoginForm hostedDemo={hostedDemoEnabled()} accounts={accounts} /> : <p role="alert" className="error-box">Production access is blocked. Connect an approved identity provider and complete agency security approval before enabling a production environment.</p>}
      </section>
    </div>
  </main>;
}
