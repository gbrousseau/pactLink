import { describe, expect, it } from "vitest";
import { parseScreeningForm, screeningServicesSchema } from "../src/lib/screening-services";

describe("Screening and Services answers", () => {
  it("allows blank phase data and does not include participant identifiers", () => {
    const answers = screeningServicesSchema.parse({});
    expect(answers.reviewNote).toBe("");
    expect(answers.screeningTypes).toEqual([]);
    expect(answers.services.Outpatient.statuses).toEqual([]);
    expect(answers).not.toHaveProperty("name");
    expect(answers).not.toHaveProperty("dob");
  });

  it("requires details for Other choices and keeps None/unknown exclusive", () => {
    expect(screeningServicesSchema.safeParse({ screeningTypes: ["Other assessment"] }).success).toBe(false);
    expect(screeningServicesSchema.safeParse({ screeningTypes: ["Other assessment"], screeningTypesOther: "Synthetic screen" }).success).toBe(true);
    expect(screeningServicesSchema.safeParse({ referralTypes: ["Other"] }).success).toBe(false);
    expect(screeningServicesSchema.safeParse({ referralTypes: ["None", "SUD treatment"] }).success).toBe(false);
  });

  it("parses assessments, single-answer yes/no fields, locations, and service matrix entries", async () => {
    const form = new FormData();
    form.set("reviewNote", "  Please check the referral details.  ");
    form.append("screeningTypes", "ASAM Criteria");
    form.set("substanceDisorder", "Yes");
    form.set("asamLocation", "Synthetic clinic");
    form.append("service:Outpatient:statuses", "Referred to service");
    form.append("service:Outpatient:statuses", "Received service");
    const answers = await parseScreeningForm(form);
    expect(answers).toMatchObject({
      reviewNote: "Please check the referral details.",
      screeningTypes: ["ASAM Criteria"], substanceDisorder: "Yes", asamLocation: "Synthetic clinic",
      services: { Outpatient: { statuses: ["Referred to service", "Received service"] } },
    });
  });

  it("requires referrals and an explanation when a referred service was not received", () => {
    expect(screeningServicesSchema.safeParse({
      services: { Outpatient: { statuses: ["Referred but didn't receive"] } },
    }).success).toBe(false);
    expect(screeningServicesSchema.safeParse({
      services: { Outpatient: { statuses: ["Referred to service", "Referred but didn't receive"], reasons: ["Declined service"] } },
    }).success).toBe(true);
  });

  it("rejects future completion dates and invalid choices", () => {
    expect(screeningServicesSchema.safeParse({ asamCompletionDate: "2099-01-01" }).success).toBe(false);
    expect(screeningServicesSchema.safeParse({ screeningTypes: ["not-a-real-assessment"] }).success).toBe(false);
    expect(screeningServicesSchema.safeParse({ reviewNote: "x".repeat(2001) }).success).toBe(false);
  });
});
