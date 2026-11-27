import { currentUser } from "@/lib/auth";
import { listNotifications } from "@/lib/notifications";

export async function GET() {
  const user = await currentUser(false);
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return Response.json(await listNotifications(user), { headers: { "Cache-Control": "private, no-store" } });
}
