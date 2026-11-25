import { currentUser } from "@/lib/auth";
import { WorkflowError } from "@/lib/access";
import { downloadConsent } from "@/lib/consent";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; version: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Authentication required.", { status: 401, headers: { "Cache-Control": "no-store" } });
  const { id, version } = await params;
  try {
    const bytes = await downloadConsent(user, id, Number(version));
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="synthetic-consent-v${Number(version)}.pdf"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    if (error instanceof WorkflowError) return new Response("Document not found or not available.", { status: 404, headers: { "Cache-Control": "no-store" } });
    console.error("Consent download failed", { category: error instanceof Error ? error.name : "unknown" });
    return new Response("Download failed. Please retry or contact support.", { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
