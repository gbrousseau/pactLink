import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/shell";
export const dynamic = "force-dynamic";
export default async function FormsLayout({ children }: { children: React.ReactNode }) {
  return <Shell user={await requireUser()}>{children}</Shell>;
}
