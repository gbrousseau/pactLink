import { currentUser } from "@/lib/auth";
import { WorkflowError } from "@/lib/access";
import { downloadCaseFilePdf } from "@/lib/case-file";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; version: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Authentication required.", { status: 401, headers: { "Cache-Control": "no-store" } });
  const { id, version } = await params;
  try {
    const bytes = await downloadCaseFilePdf(user, id, Number(version));
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=\"synthetic-case-file.pdf\"",
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    if (error instanceof WorkflowError) {
      const status = error.code === "missing" || error.code === "forbidden" ? 404 : error.code === "conflict" ? 409 : 422;
      return new Response(status === 404 ? "Case File not found or not available." : error.message, { status, headers: { "Cache-Control": "no-store" } });
    }
    console.error("Case File PDF export failed", { category: error instanceof Error ? error.name : "unknown" });
    return new Response("PDF export failed. Please retry or contact support.", { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
