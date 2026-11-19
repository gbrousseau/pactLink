import { describe, expect, it } from "vitest";
import { intakeFields } from "../src/lib/intake-fields";
import { getIntakeCompleteness, parseFormAnswers, validateAnswers, type Answers } from "../src/lib/intake-validation";
import { canEdit, canView, developmentEnabled, type User } from "../src/lib/access";
import { searchSchema } from "../src/lib/submissions";

const user: User = { id: "test", display_name: "Test", role: "editor", group_id: "north", group_name: "North" };
function valid(): Answers {
  return { name: "Synthetic Participant", dob: "1990-01-01", programType: "Deflection", date: "2026-01-01", navigator: "Demo Navigator" };
}
describe("Intake validation", () => {
  it("maps the packet's 34 intake questions", () => {
    expect(intakeFields).toHaveLength(34);
    expect(intakeFields.map((f) => f.key)).toContain("emergencyPhone");
  });
  it("allows incomplete drafts but requires identity and program for submission", () => {
    expect(validateAnswers({}, false)).toEqual({});
    expect(validateAnswers({}, true)).toHaveProperty("name");
    expect(validateAnswers(valid(), true)).toEqual({});
  });
  it("flags unanswered questions by section, ignores inactive conditional questions, and clears answered flags", () => {
    const empty = getIntakeCompleteness({});
    expect(empty.totalMissing).toBeGreaterThan(0);
    expect(empty.missingBySection[0]).toContain("name");
    expect(empty.missingBySection[3]).toContain("qualified");
    expect(empty.missingBySection[3]).not.toContain("disqualification");
    const filled: Answers = {};
    for (const field of intakeFields) {
      filled[field.key] = field.type === "multi" ? [field.options![0]] :
        field.type === "date" ? "2000-01-01" :
          field.type === "tel" ? "503-555-0100" : "Answered";
    }
    filled.qualified = "Yes";
    filled.disqualification = [];
    expect(getIntakeCompleteness(filled).totalMissing).toBe(0);
    expect(getIntakeCompleteness({ ...filled, qualified: "No" }).missingBySection[3]).toContain("disqualification");
  });
  it("requires details when an Other option is selected", () => {
    const missing = getIntakeCompleteness({ gender: ["Other"] });
    expect(missing.missingBySection[0]).toContain("genderOther");
    expect(getIntakeCompleteness({ gender: ["Other"], genderOther: "Self described" }).missingBySection[0]).not.toContain("genderOther");
  });
  it("rejects invalid dates and dates after today", () => {
    expect(validateAnswers({ ...valid(), dob: "2026-02-30" }, true)).toHaveProperty("dob");
    expect(validateAnswers({ ...valid(), contactDate: "2099-01-01" }, false)).toHaveProperty("contactDate");
    expect(validateAnswers({ ...valid(), contactDate: "1980-01-01" }, false)).toHaveProperty("contactDate");
  });
  it("rejects forged choices and unknown answer keys", () => {
    expect(validateAnswers({ ...valid(), programType: "invented" }, true)).toHaveProperty("programType");
    expect(validateAnswers({ ...valid(), group_id: "south" }, true)).not.toEqual({});
  });
  it("distinguishes unknown, no, and unanswered and prevents exclusive-choice conflicts", () => {
    expect(validateAnswers({ housingStable: "Don't know" }, false)).toEqual({});
    expect(validateAnswers({ housingStable: "No" }, false)).toEqual({});
    expect(validateAnswers({ medicalNeeds: ["None", "Dental care"] }, false)).toHaveProperty("medicalNeeds");
  });
  it("validates Other and dependent answers", () => {
    expect(validateAnswers({ ...valid(), gender: ["Other"] }, true)).toHaveProperty("genderOther");
    expect(validateAnswers({ genderOther: "text without selection" }, false)).toHaveProperty("genderOther");
    expect(validateAnswers({ qualified: "Yes", disqualification: ["Pending warrant"] }, false)).toHaveProperty("disqualification");
  });
  it("extracts and trims form input, preserving multiple choices", () => {
    const form = new FormData();
    form.set("name", "  Synthetic Name  "); form.append("race", "White"); form.append("race", "Hispanic or Latino");
    const answers = parseFormAnswers(form);
    expect(answers.name).toBe("Synthetic Name");
    expect(answers.race).toEqual(["White", "Hispanic or Latino"]);
    expect(answers.qualified).toBe("");
  });
});
describe("Access controls", () => {
  it("scopes editor reads and writes to the group", () => {
    expect(canView(user, "north")).toBe(true); expect(canEdit(user, "north")).toBe(true);
    expect(canView(user, "south")).toBe(false); expect(canEdit(user, "south")).toBe(false);
  });
  it("never permits viewer mutations; permits admin across groups", () => {
    expect(canEdit({ ...user, role: "viewer" }, "north")).toBe(false);
    expect(canEdit({ ...user, role: "admin" }, "south")).toBe(true);
  });
  it("blocks production even when the development flag is set", () => {
    expect(developmentEnabled({ NODE_ENV: "production", DEV_AUTH_ENABLED: "true" })).toBe(false);
    expect(developmentEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(developmentEnabled({ NODE_ENV: "development", DEV_AUTH_ENABLED: "true" })).toBe(true);
  });
});
describe("Search input", () => {
  it("rejects injection into sorting and impossible filters", () => {
    expect(searchSchema.safeParse({ sort: "id; DROP TABLE submissions" }).success).toBe(false);
    expect(searchSchema.safeParse({ page: -1 }).success).toBe(false);
    expect(searchSchema.safeParse({ from: "2026-05-01", to: "2026-01-01" }).success).toBe(false);
  });
});
