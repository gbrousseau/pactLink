import { currentUser } from "@/lib/auth";
import { listCaseNotifications } from "@/lib/case-file";

export async function GET() {
  const user = await currentUser(false);
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const notifications = await listCaseNotifications(user);
  return Response.json(notifications, { headers: { "Cache-Control": "private, no-store" } });
}
