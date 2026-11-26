import { describe, expect, it } from "vitest";
import { loadRedcapCodebook } from "../src/lib/redcap-codebook";
import { prototypePayload } from "../src/lib/redcap-prototype";
import { prefillFromApproved, type PrefillSources } from "../src/lib/redcap-prefill";
import { screeningServicesSchema } from "../src/lib/screening-service-schema";
import { completionSchema } from "../src/lib/program-completion-schema";

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
    const sources: PrefillSources = { participantId: "participant", intake: { version: 1, answers: {
      name: "Synthetic Example", dob: "2000-01-01", contactDate: "2025-01-01", qualified: "Yes", agreed: "Yes",
      race: ["White", "Native Hawaiian or Pacific Islander or Asian"], gender: ["Male", "Two-Spirit"], eligibilityDate: "2025-01-02",
      firstContact: ["Law enforcement", "Social worker"], housing: ["Living in a tent"], foodNeeded: "No", charges: ["None"], abeyance: "No",
    } }, screening: null, completion: null };
    const result = prefillFromApproved(sources, book);
    expect(result.values).toMatchObject({ id: "participant", first_contact_date: "2025-01-01", elig_date: "2025-01-02", gender: ["1", "6"], entered_housing: "9" });
    expect(result.values).not.toHaveProperty("race");
    expect(result.values).not.toHaveProperty("first_contact_by");
    expect(result.values).not.toHaveProperty("dob");
    expect(result.issues).toHaveProperty("race");
    expect(result.issues).toHaveProperty("first_contact_by");
    expect(result.issues).toHaveProperty("entered_foodinsecurity");
    expect(result.values).not.toHaveProperty("charge_abeyance");
    expect(result.issues).toHaveProperty("charge_abeyance");
  });
  it("maps approved services and completion, but not conditional or ambiguous answers", async () => {
    const book = await loadRedcapCodebook();
    const screening = screeningServicesSchema.parse({
      substanceDisorder: "Yes", substanceTypes: ["Alcohol", "Other"], substanceTypesOther: "Synthetic substance",
      mentalHealthDisorder: "No", mentalHealthDiagnoses: ["Anxiety"],
      screeningTypes: ["ASAM Criteria", "PHQ-9 (Patient Health Questionnaire-9)"],
      referralTypes: ["SUD treatment"], services: {
        Outpatient: { statuses: ["Referred to service", "Referred but didn't receive"], reasons: ["Waitlist was too long"] },
      },
    });
    const completion = completionSchema.parse({ completed: "No", leftDate: "2025-02-01",
      nonCompletionReasons: ["Other"], nonCompletionReasonsOther: "Synthetic reason",
      housing: ["Living in a tent"], justiceStatus: ["Jail", "Charges filed"], journey: "Synthetic free text" });
    const sources: PrefillSources = { participantId: "participant", intake: { version: 1, answers: { qualified: "Yes", agreed: "Yes" } },
      screening: { version: 1, answers: screening }, completion: { version: 1, answers: completion } };
    const result = prefillFromApproved(sources, book);
    expect(result.values).toMatchObject({
      sud_identified: "1", sud_type: ["1", "999"], other_sud_type: "Synthetic substance",
      outpatient: ["1", "3"], outpatient_notrecvd_reason: ["2"], completed_deflection: "0",
      left_program_date: "2025-02-01", incompleted_reason: ["999"], incompleted_reason_other: "Synthetic reason",
    });
    expect(result.values).not.toHaveProperty("assessment_type");
    expect(result.values).not.toHaveProperty("mhd_diagnosis");
    expect(result.values).not.toHaveProperty("completed_housing");
    expect(result.values).not.toHaveProperty("incompleted_cjs");
    expect(result.values).not.toHaveProperty("qual_notes");
    expect(result.unmapped).toContain("Program journey notes (check for identifying information before entering)");
    expect(result.issues).toMatchObject({ assessment_type: expect.any(String), mhd_diagnosis: expect.any(String), completed_housing: expect.any(String), incompleted_cjs: expect.any(String) });
    const changedBook = { ...book, fields: book.fields.map((field) => field.name === "outpatient"
      ? { ...field, choices: field.choices.filter((choice) => choice.code !== "3") } : field) };
    const changed = prefillFromApproved(sources, changedBook);
    expect(changed.values).not.toHaveProperty("outpatient");
    expect(changed.values).not.toHaveProperty("outpatient_notrecvd_reason");
    expect(changed.issues).toHaveProperty("outpatient_notrecvd_reason");
    sources.intake.answers.agreed = "No";
    const notEntered = prefillFromApproved(sources, book);
    expect(notEntered.values).not.toHaveProperty("outpatient");
    expect(notEntered.values).not.toHaveProperty("completed_deflection");
  });
  it("rejects identity fields even when supplied directly", async () => {
    const book = await loadRedcapCodebook();
    const form = new FormData();
    form.set("dob", "2000-01-01");
    expect(() => prototypePayload(book, form)).toThrow("restricted to consent");
  });
  it("includes only selected codebook answers in an explicitly unverified wrapper", async () => {
    const book = await loadRedcapCodebook();
    const form = new FormData();
    form.set("id", "synthetic-1");
    form.append("race", "1");
    form.append("race", "2");
    form.set("charge_abeyance", "0");
    const payload = prototypePayload(book, form);
    expect(payload.warning).toContain("NOT VALIDATED");
    expect(payload.record).toEqual({ id: "synthetic-1", race___1: "1", race___2: "1", charge_abeyance: "0" });
    form.append("race", "unexpected");
    expect(() => prototypePayload(book, form)).toThrow("Invalid choice");
  });
});
