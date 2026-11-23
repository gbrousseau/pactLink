import { describe, expect, it } from "vitest";
import { parseIntakeImport } from "../src/lib/intake-import";

const headers = ["DOB", "Houseless", "Gender", "Race", "AGENCY", "LEA #", "DA #", "COURT #", "CHARGE CODE", "CHARGE DESCRIPT", "INCIDENT/REFERRAL DATE", "REVIEW STATUS", "HB 4002 REPORTING", "DEFLECT OUTCOME", "CD OUTCOME", "REFERRAL TYPE", "OUTCOME 2", "SUBSTANCE", "SUBSTANCE 2", "DEATHS", "RE-OFFENSE", "NOTES", "OUTCOME3", "ARRESTED", "WEIGHT"];
const encode = (value: string) => new TextEncoder().encode(value);
describe("intake import parsing", () => {
  it("preserves quoted multiline TSV fields and recognizes valid DOBs", () => {
    const row = Array(25).fill(""); row[0] = "2/29/2000"; row[21] = '"line one\nline two\twith tab"';
    const parsed = parseIntakeImport(encode(`\ufeff${headers.join("\t")}\n${row.join("\t")}\n`));
    expect(parsed.rows[0].dob).toBe("2000-02-29");
    expect(parsed.rows[0].source.NOTES).toBe("line one\nline two\twith tab");
  });
  it("supports comma CSV, flags ambiguous dates, and skips bad-width records", () => {
    const row = Array(25).fill(""); row[0] = "01-01-00 / 24";
    const parsed = parseIntakeImport(encode(`${headers.join(",")}\n${row.join(",")}\nshort,row\n`));
    expect(parsed.rows[0].dob).toBeNull();
    expect(parsed.issues[0].record).toBe(3);
  });
  it("rejects malformed, incorrect, or non-UTF-8 files", () => {
    expect(() => parseIntakeImport(encode(`${headers.join(",")}\n"unfinished`))).toThrow("malformed");
    expect(() => parseIntakeImport(encode("DOB,name\n2000-01-01,Test"))).toThrow("25 columns");
    expect(() => parseIntakeImport(new Uint8Array([0xff]))).toThrow("UTF-8");
  });
  it("skips values that PostgreSQL cannot store", () => {
    const row = Array(25).fill(""); row[21] = "invalid\0value";
    const parsed = parseIntakeImport(encode(`${headers.join(",")}\n${row.join(",")}\n`));
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.issues[0].record).toBe(2);
  });
});
