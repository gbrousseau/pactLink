import { execFileSync, spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { parseCaseFile, type CaseFileVersion } from "../src/lib/case-file";
import { renderCaseFilePdf } from "../src/lib/case-file-pdf";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l2sAAAAASUVORK5CYII=", "base64");
const hasPdfText = !spawnSync("pdftotext", ["-v"]).error;
function example(): CaseFileVersion {
  const form = new FormData();
  form.set("firstName", "Zoë"); form.set("lastName", "Šimek");
  form.set("incidentSummary", `${"Synthetic incident details. ".repeat(1000)}${"X".repeat(1200)} END_MARKER`);
  form.set("reviewNote", "Synthetic review note");
  form.set("appearanceDate", "2026-12-01"); form.set("appearanceTime", "09:00");
  return { version: 3, answers: parseCaseFile(form), has_photo: true,
    created_at: new Date("2026-11-27T18:00:00Z"), entered_at: new Date("2026-11-26T18:00:00Z"), display_name: "Synthetic" };
}
describe("Case File PDF", () => {
  it("embeds the photo and continues long summaries onto subsequent pages", async () => {
    const bytes = await renderCaseFilePdf(example(), { bytes: png, type: "image/png" });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    const resources = pdf.getPage(0).node.Resources();
    if (!resources) throw new Error("Missing PDF resources.");
    const objects = resources.lookup(PDFName.of("XObject"), PDFDict);
    expect(objects.keys().length).toBeGreaterThan(0);
  });
  it.skipIf(!hasPdfText)("preserves text, scheduling and long incident content in the exported PDF", async () => {
    const record = example();
    const bytes = await renderCaseFilePdf(record, { bytes: png, type: "image/png" });
    const extracted = execFileSync("pdftotext", ["-layout", "-", "-"], { input: bytes }).toString();
    expect(extracted).toContain("Zoë");
    expect(extracted).toContain("Šimek");
    expect(extracted).toContain("2026-12-01 09:00");
    expect(extracted).toContain("Synthetic review note");
    expect(extracted.replace(/\s/g, "")).toContain(record.answers.incidentSummary.replace(/\s/g, ""));
  });
  it("fails explicitly for unsupported characters and invalid photos", async () => {
    const record = example();
    record.answers.firstName = "😀";
    await expect(renderCaseFilePdf(record, null)).rejects.toThrow("cannot display");
    record.answers.firstName = "Synthetic";
    await expect(renderCaseFilePdf(record, { bytes: Buffer.from("invalid"), type: "image/png" })).rejects.toThrow("photo");
  });
});
