import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { parse } from "csv-parse/sync";

export type RedcapField = {
  name: string;
  section: string;
  label: string;
  attributes: string;
  condition: string;
  type: "text" | "notes" | "radio" | "dropdown" | "checkbox" | "yesno";
  choices: { code: string; label: string }[];
};
export type RedcapCodebook = { fields: RedcapField[]; hash: string };

export async function loadRedcapCodebook(): Promise<RedcapCodebook> {
  const file = await readFile(resolve(process.cwd(), "../redcap.csv"));
  const rows: string[][] = parse(file, { bom: true, delimiter: "\t", skip_empty_lines: true, relax_column_count: true });
  if (!rows[1]?.[0]?.includes("REDCap Codebook")) throw new Error("The REDCap codebook has an unexpected format.");
  const fields: RedcapField[] = [];
  let section = "";
  let current: RedcapField | undefined;
  for (const row of rows) {
    if (row[0]?.startsWith("Instrument: ")) {
      section = row[0].slice("Instrument: ".length);
      current = undefined;
    } else if (/^\d+$/.test(row[0] ?? "") && row[1]) {
      const name = /^\[([a-z0-9_]+)\]/.exec(row[1])?.[1];
      if (!name || !section || fields.some((field) => field.name === name)) throw new Error("Invalid or duplicate REDCap codebook field.");
      const attributes = row[3] ?? "";
      const first = attributes.split(/[\s,(]/)[0].toLowerCase();
      // The supplied codebook lists this text field as "alignment" rather than a field type.
      const type = first === "alignment" && name === "entered_employment_other" ? "text" : first;
      if (!["text", "notes", "radio", "dropdown", "checkbox", "yesno"].includes(type)) throw new Error(`Unsupported codebook field type for ${name}.`);
      current = { name, section, label: row[2] ?? name, attributes,
        condition: row[1].split("Show the field ONLY if:")[1]?.trim() ?? "",
        type: type as RedcapField["type"], choices: [] };
      fields.push(current);
    } else if (current && /^\d+$/.test(row[3] ?? "")) {
      const code = row[3];
      const label = current.type === "checkbox" ? row[5] : row[4];
      if (label) current.choices.push({ code, label });
    }
  }
  if (fields.length !== 165 || fields[0]?.name !== "id") throw new Error("The REDCap codebook is incomplete or has changed; review its mapping before using the prototype.");
  for (const field of fields) {
    if (["radio", "dropdown", "checkbox", "yesno"].includes(field.type) && !field.choices.length) throw new Error(`No choices found for ${field.name}.`);
    if (new Set(field.choices.map((choice) => choice.code)).size !== field.choices.length) throw new Error(`Duplicate choices for ${field.name}.`);
  }
  return { fields, hash: createHash("sha256").update(file).digest("hex") };
}
