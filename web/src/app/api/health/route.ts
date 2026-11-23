import { randomUUID } from "node:crypto";
import { database } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await database().query("SELECT 1");
    return Response.json({ status: "ok" }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const incident = randomUUID();
    console.error("Health check could not reach the configured database", {
      incident,
      category: error instanceof Error ? error.name : "unknown",
    });
    return Response.json({ status: "unavailable", incident }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
