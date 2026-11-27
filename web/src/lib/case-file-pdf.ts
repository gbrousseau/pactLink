import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { WorkflowError } from "./access";
import type { CaseFileVersion, CasePhoto } from "./case-file";
import { caseFileLabels } from "./case-file-fields";

const fontNames = ["latin", "latin-ext", "vietnamese", "cyrillic", "cyrillic-ext", "greek", "greek-ext", "devanagari"];
const pageWidth = 612, pageHeight = 792, margin = 48, textSize = 10, lineHeight = 15;
const fontPath = (name: string) => join(process.cwd(), "node_modules", "@fontsource", "noto-sans", "files", `noto-sans-${name}-400-normal.woff`);
type Font = { font: PDFFont; characters: Set<number> };
type Run = { text: string; font: Font; width: number };

export async function renderCaseFilePdf(record: CaseFileVersion, photo: CasePhoto | null): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const fontBytes = await Promise.all(fontNames.map((name) => readFile(fontPath(name))));
  const fonts: Font[] = await Promise.all(fontBytes.map(async (bytes) => {
    const font = await document.embedFont(bytes, { subset: true });
    return { font, characters: new Set(font.getCharacterSet()) };
  }));
  const primary = fonts[0].font;
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let page: PDFPage = document.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  const ensure = (height: number) => {
    if (y - height < margin) { page = document.addPage([pageWidth, pageHeight]); y = pageHeight - margin; }
  };
  const runs = (text: string): Run[] => {
    const result: Run[] = [];
    for (const { segment } of segmenter.segment(text)) {
      const font = fonts.find((candidate) => Array.from(segment).every((character) => candidate.characters.has(character.codePointAt(0)!)));
      if (!font) throw new WorkflowError("The PDF cannot display some characters in this Case File. Contact support before exporting.", "invalid");
      const width = font.font.widthOfTextAtSize(segment, textSize);
      const last = result[result.length - 1];
      if (last?.font === font) { last.text += segment; last.width += width; }
      else result.push({ text: segment, font, width });
    }
    return result;
  };
  const text = (value: string) => {
    let line: Run[] = [];
    let width = 0;
    const flush = () => {
      ensure(lineHeight);
      let x = margin;
      for (const part of line) {
        page.drawText(part.text, { x, y, size: textSize, font: part.font.font, color: rgb(0.1, 0.13, 0.16) });
        x += part.width;
      }
      y -= lineHeight;
      line = []; width = 0;
    };
    const append = (parts: Run[]) => {
      for (const part of parts) {
        const last = line[line.length - 1];
        if (last?.font === part.font) { last.text += part.text; last.width += part.width; }
        else line.push({ ...part });
        width += part.width;
      }
    };
    const tokens = value.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").match(/[^\s]+|[^\S\n]+|\n/gu) ?? [];
    for (const token of tokens) {
      if (token === "\n") { flush(); continue; }
      const tokenRuns = runs(token);
      const tokenWidth = tokenRuns.reduce((total, part) => total + part.width, 0);
      if (width && width + tokenWidth > pageWidth - 2 * margin) flush();
      if (tokenWidth <= pageWidth - 2 * margin) append(tokenRuns);
      else for (const { segment } of segmenter.segment(token)) {
        const part = runs(segment);
        const partWidth = part[0].width;
        if (width && width + partWidth > pageWidth - 2 * margin) flush();
        append(part);
      }
    }
    if (line.length || !tokens.length || tokens[tokens.length - 1] === "\n") flush();
  };

  page.drawText("Case File", { x: margin, y, size: 18, font: primary, color: rgb(0.08, 0.24, 0.25) });
  y -= 25;
  text("SYNTHETIC DATA ONLY - NOT FOR OPERATIONAL USE");
  text(`Entered ${record.entered_at.toISOString().slice(0, 10)} (UTC) · Version ${record.version}`);
  if (record.answers.appearanceDate || record.answers.appearanceTime) {
    text(`Scheduled to appear: ${record.answers.appearanceDate ?? ""} ${record.answers.appearanceTime ?? ""} (local time)`);
  }
  y -= 8;
  const photoBox = 140;
  ensure(photoBox + 10);
  if (photo) {
    if (photo.type === "image/png" && (photo.bytes.length < 24 || photo.bytes.readUInt32BE(16) * photo.bytes.readUInt32BE(20) > 20_000_000)) {
      throw new WorkflowError("The stored photo is invalid or too large to export.", "invalid");
    }
    let image;
    try { image = photo.type === "image/png" ? await document.embedPng(photo.bytes) : await document.embedJpg(photo.bytes); }
    catch { throw new WorkflowError("The stored photo cannot be included in the PDF. Replace it before exporting.", "invalid"); }
    if (image.width * image.height > 20_000_000) throw new WorkflowError("The stored photo is too large to export.", "invalid");
    const scale = Math.min(photoBox / image.width, photoBox / image.height);
    page.drawImage(image, { x: margin, y: y - image.height * scale, width: image.width * scale, height: image.height * scale });
  } else {
    page.drawRectangle({ x: margin, y: y - photoBox, width: photoBox, height: photoBox, color: rgb(0.94, 0.95, 0.96) });
    page.drawText("No photo available", { x: margin + 14, y: y - photoBox / 2, size: 10, font: primary, color: rgb(0.4, 0.42, 0.45) });
  }
  y -= photoBox + 20;
  for (const [key, label] of Object.entries(caseFileLabels)) {
    const value = record.answers[key as keyof typeof caseFileLabels] || "Not provided";
    if (key === "incidentSummary" || key === "reviewNote") {
      ensure(lineHeight * 2);
      text(`${label}:`);
      text(value);
      y -= 5;
    } else {
      text(`${label}: ${value}`);
    }
  }
  return document.save();
}
