import { currentUser } from "@/lib/auth";
import { WorkflowError } from "@/lib/access";
import { downloadCasePhoto } from "@/lib/case-file";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; version: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Authentication required.", { status: 401, headers: { "Cache-Control": "no-store" } });
  const { id, version } = await params;
  try {
    const photo = await downloadCasePhoto(user, id, Number(version));
    return new Response(new Uint8Array(photo.bytes), { headers: {
      "Content-Type": photo.type, "Content-Disposition": `inline; filename="synthetic-case-photo-v${Number(version)}.${photo.type === "image/png" ? "png" : "jpg"}"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox",
    } });
  } catch (error) {
    if (error instanceof WorkflowError) return new Response("Photo not found or not available.", { status: 404, headers: { "Cache-Control": "no-store" } });
    console.error("Case photo download failed", { category: error instanceof Error ? error.name : "unknown" });
    return new Response("Download failed. Please retry or contact support.", { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
