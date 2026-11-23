import { ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { demoAccessEnabled, hostedDemoEnabled } from "@/lib/access";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";
export default async function Login() {
  if (await currentUser()) redirect("/dashboard");
  return <main className="flex min-h-screen items-center justify-center px-4 py-12">
    <div className="w-full max-w-lg">
      <div className="mb-8 flex items-center gap-3"><ShieldCheck className="text-teal-800" size={38} /><div>
        <h1 className="text-2xl font-bold tracking-tight">Deflection Workspace</h1>
        <p className="mt-1 text-sm text-slate-500">Clackamas County · Development intake pilot</p>
      </div></div>
      <section className="panel">
        <h2 className="mb-2 text-xl font-bold">Welcome to the intake pilot</h2>
        <p className="mb-6 text-sm leading-6 text-slate-500">Create and manage intake records in an access-controlled workspace.</p>
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <strong>Synthetic data only.</strong> This prototype is not CJIS approved and must not contain real participant, legal, or health information.
        </div>
        {demoAccessEnabled() ? <LoginForm hostedDemo={hostedDemoEnabled()} /> : <p role="alert" className="error-box">Production access is blocked. Connect an approved identity provider and complete agency security approval before enabling a production environment.</p>}
      </section>
    </div>
  </main>;
}
