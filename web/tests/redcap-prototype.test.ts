import { describe, expect, it } from "vitest";
import { loadRedcapCodebook } from "../src/lib/redcap-codebook";
import { prefillPrototype, prototypePayload } from "../src/lib/redcap-prototype";

describe("synthetic REDCap prototype", () => {
  it("reads the supplied codebook and retains its questions, choices and conditions", async () => {
    const book = await loadRedcapCodebook();
    expect(book.fields).toHaveLength(165);
    expect(book.fields.find((field) => field.name === "race")?.choices).toContainEqual({ code: "2", label: "Asian" });
    expect(book.fields.find((field) => field.name === "race_other")?.condition).toContain("[race(999)]");
    expect(book.fields.find((field) => field.name === "entered_employment_other")?.type).toBe("text");
  });
  it("prefills exact choices and dates without partially mapping ambiguous answers", async () => {
    const book = await loadRedcapCodebook();
    expect(prefillPrototype({ name: "Synthetic Example", dob: "2000-01-01", contactDate: "2025-01-01",
      race: ["White", "Native Hawaiian or Pacific Islander or Asian"], gender: ["Male", "Two-Spirit"], eligibilityDate: "2025-01-02" }, book))
      .toEqual({ dob: "2000-01-01", first_contact_date: "2025-01-01", elig_date: "2025-01-02", gender: ["1", "6"] });
  });
  it("includes only selected codebook answers in an explicitly unverified wrapper", async () => {
    const book = await loadRedcapCodebook();
    const form = new FormData();
    form.set("id", "synthetic-1");
    form.set("confirmRecordId", "synthetic-1");
    form.append("race", "1");
    form.append("race", "2");
    form.set("charge_abeyance", "0");
    const payload = prototypePayload(book, form);
    expect(payload.warning).toContain("NOT VALIDATED");
    expect(payload.record).toEqual({ id: "synthetic-1", race___1: "1", race___2: "1", charge_abeyance: "0" });
    form.set("confirmRecordId", "different");
    expect(() => prototypePayload(book, form)).toThrow("do not match");
    form.set("confirmRecordId", "synthetic-1");
    form.append("race", "unexpected");
    expect(() => prototypePayload(book, form)).toThrow("Invalid choice");
  });
  it("omits a blank or absent record ID and checks confirmation when supplied", async () => {
    const book = await loadRedcapCodebook();
    const form = new FormData();
    form.set("race", "1");
    expect(prototypePayload(book, form).record).toEqual({ race___1: "1" });
    form.set("id", "   ");
    form.set("confirmRecordId", " ");
    expect(prototypePayload(book, form).record).toEqual({ race___1: "1" });
    form.set("confirmRecordId", "synthetic-1");
    expect(() => prototypePayload(book, form)).toThrow("do not match");
    form.set("id", "synthetic-1");
    expect(prototypePayload(book, form).record.id).toBe("synthetic-1");
    form.delete("confirmRecordId");
    expect(() => prototypePayload(book, form)).toThrow("do not match");
    form.set("id", "x".repeat(101));
    form.set("confirmRecordId", "x".repeat(101));
    expect(() => prototypePayload(book, form)).toThrow("at most 100");
  });
});
