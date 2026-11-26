import { describe, expect, it } from "vitest";
import { intakeFields } from "../src/lib/intake-fields";
import { getIntakeCompleteness, parseFormAnswers, validateAnswers, type Answers } from "../src/lib/intake-validation";
import { canEdit, canReview, canView, databaseConnectionString, demoAccessEnabled, developmentEnabled, hostedDemoEnabled, type User } from "../src/lib/access";
import { searchSchema } from "../src/lib/submissions";

const user: User = { id: "test", display_name: "Test", role: "editor", group_id: "north", group_name: "North" };
function valid(): Answers {
  return { name: "Synthetic Participant", dob: "1990-01-01", programType: "Law Enforcement Deflection", date: "2026-01-01", navigator: "Demo Navigator" };
}
describe("Intake validation", () => {
  it("maps the packet's 34 intake questions", () => {
    expect(intakeFields).toHaveLength(34);
    expect(intakeFields.map((f) => f.key)).toContain("emergencyPhone");
  });
  it("allows incomplete drafts and requires Intake fields, not consent identity, for submission", () => {
    expect(validateAnswers({}, false)).toEqual({});
    expect(validateAnswers({}, true)).toHaveProperty("programType");
    expect(validateAnswers({}, true)).not.toHaveProperty("name");
    expect(validateAnswers(valid(), true)).toEqual({});
  });
  it("flags unanswered questions by section, ignores inactive conditional questions, and clears answered flags", () => {
    const empty = getIntakeCompleteness({});
    expect(empty.totalMissing).toBeGreaterThan(0);
    expect(empty.missingBySection[0]).not.toContain("name");
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
    expect(validateAnswers({ ...valid(), contactDate: "2099-01-01" }, false)).toHaveProperty("contactDate");
    expect(validateAnswers({ ...valid(), contactDate: "1980-01-01" }, false)).toHaveProperty("contactDate");
    expect(validateAnswers({ contactDate: "1980-01-01" }, false, "2026-01-01", "1990-01-01")).toHaveProperty("contactDate");
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
    form.set("reviewNote", "  Please review this context.  ");
    const answers = parseFormAnswers(form);
    expect(answers.name).toBeUndefined();
    expect(answers.reviewNote).toBe("Please review this context.");
    expect(answers.race).toEqual(["White", "Hispanic or Latino"]);
    expect(answers.qualified).toBe("");
    expect(validateAnswers({ ...valid(), reviewNote: "x".repeat(2001) }, false)).toHaveProperty("reviewNote");
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
  it("limits reviewers to reviewing within their assigned group", () => {
    const reviewer: User = { ...user, role: "reviewer" };
    expect(canView(reviewer, "north")).toBe(true);
    expect(canEdit(reviewer, "north")).toBe(false);
    expect(canReview(reviewer, "north")).toBe(true);
    expect(canReview(reviewer, "south")).toBe(false);
    expect(canReview(user, "north")).toBe(false);
    expect(canReview({ ...user, role: "admin" }, "south")).toBe(true);
  });
  it("blocks production even when the development flag is set", () => {
    expect(developmentEnabled({ NODE_ENV: "production", DEV_AUTH_ENABLED: "true" })).toBe(false);
    expect(developmentEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(developmentEnabled({ NODE_ENV: "development", DEV_AUTH_ENABLED: "true" })).toBe(true);
  });
  it("allows hosted production demo only with its dedicated flag and database URL", () => {
    const demo: NodeJS.ProcessEnv = { NODE_ENV: "production", DEMO_MODE_ENABLED: "true", DEMO_DATABASE_URL: "postgres://demo", DATABASE_URL: "postgres://other" };
    expect(hostedDemoEnabled(demo)).toBe(true);
    expect(demoAccessEnabled(demo)).toBe(true);
    expect(databaseConnectionString(demo)).toBe("postgres://demo");
    expect(hostedDemoEnabled({ ...demo, DEMO_DATABASE_URL: "" })).toBe(false);
    expect(demoAccessEnabled({ NODE_ENV: "production", DEV_AUTH_ENABLED: "true", DATABASE_URL: "postgres://other" })).toBe(false);
    expect(() => databaseConnectionString({ NODE_ENV: "production", DEMO_MODE_ENABLED: "true", DATABASE_URL: "postgres://other" })).toThrow("DEMO_DATABASE_URL is required");
    expect(() => databaseConnectionString({ NODE_ENV: "production", DATABASE_URL: "postgres://other" })).toThrow("blocked");
  });
  it("keeps local development on DATABASE_URL even if hosted demo variables are present", () => {
    expect(databaseConnectionString({ NODE_ENV: "development", DEV_AUTH_ENABLED: "true", DATABASE_URL: "postgres://local", DEMO_MODE_ENABLED: "true", DEMO_DATABASE_URL: "postgres://demo" })).toBe("postgres://local");
  });
});
describe("Search input", () => {
  it("rejects injection into sorting and impossible filters", () => {
    expect(searchSchema.safeParse({ sort: "id; DROP TABLE submissions" }).success).toBe(false);
    expect(searchSchema.safeParse({ page: -1 }).success).toBe(false);
    expect(searchSchema.safeParse({ from: "2026-05-01", to: "2026-01-01" }).success).toBe(false);
  });
});
