import { requireUser } from "@/lib/auth";
import { WorkflowError } from "@/lib/access";
import { downloadPrototype } from "@/lib/redcap-prototype";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; exportId: string }> }) {
  const user = await requireUser();
  const { id, exportId } = await params;
  try {
    const body = await downloadPrototype(user, id, exportId);
    return new Response(body, { headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="synthetic-redcap-prototype-${exportId}.json"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    if (error instanceof WorkflowError) return new Response("File not found or not available.", { status: 404, headers: { "Cache-Control": "no-store" } });
    console.error("REDCap prototype download failed", { category: error instanceof Error ? error.name : "unknown" });
    return new Response("Download failed. Please retry or contact support.", { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
