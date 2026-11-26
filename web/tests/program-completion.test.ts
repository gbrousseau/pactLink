import { describe, expect, it } from "vitest";
import { completionSchema, parseCompletionForm } from "../src/lib/program-completion-schema";

describe("Program Completion answers", () => {
  it("allows blank answers and preserves unanswered separately from unknown", () => {
    const empty = completionSchema.parse({});
    expect(empty.completed).toBe("");
    expect(empty.housing).toEqual([]);
    expect(empty).not.toHaveProperty("name");
    expect(empty).not.toHaveProperty("dob");
    expect(completionSchema.parse({ foodNeeded: "Don't know" }).foodNeeded).toBe("Don't know");
  });
  it("parses screenshot outcomes, optional journey and reviewer note", () => {
    const form = new FormData();
    form.set("completed", "No");
    form.append("nonCompletionReasons", "Lost to follow-up/unable to contact");
    form.append("housing", "Other");
    form.set("housingOther", " Synthetic housing ");
    form.set("journey", " A synthetic journey. ");
    form.set("reviewNote", " Please review. ");
    expect(parseCompletionForm(form)).toMatchObject({
      completed: "No", nonCompletionReasons: ["Lost to follow-up/unable to contact"],
      housing: ["Other"], housingOther: "Synthetic housing", journey: "A synthetic journey.", reviewNote: "Please review.",
    });
  });
  it("rejects forged choices, contradictory unknown answers, missing Other details, and future dates", () => {
    expect(completionSchema.safeParse({ completed: "Maybe" }).success).toBe(false);
    expect(completionSchema.safeParse({ housing: ["Don't know", "Living in a tent"] }).success).toBe(false);
    expect(completionSchema.safeParse({ improvements: ["No improvements", "Mental health"] }).success).toBe(false);
    expect(completionSchema.safeParse({ employment: ["Other"] }).success).toBe(false);
    expect(completionSchema.safeParse({ employmentOther: "text" }).success).toBe(false);
    expect(completionSchema.safeParse({ completionDate: "2099-01-01" }).success).toBe(false);
    expect(completionSchema.safeParse({ reviewNote: "x".repeat(2001) }).success).toBe(false);
    expect(completionSchema.safeParse({ housing: ["Living in a tent", "Living in a tent"] }).success).toBe(false);
  });
});
