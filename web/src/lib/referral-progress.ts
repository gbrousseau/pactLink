import type { ListedSubmission } from "./submissions";

type ProgressInput = Pick<ListedSubmission, "status" | "removed_at" | "has_consent" | "review_state" | "screening_review_state" | "completion_review_state">;
type PhaseState = ListedSubmission["review_state"] | "needed" | "ready";

export function currentReferralPhase(row: ProgressInput): { phase: string; state: PhaseState } {
  if (row.removed_at || row.status === "archived") return { phase: "Referral", state: "draft" };
  if (!row.has_consent) return { phase: "Consent", state: "needed" };
  if (row.review_state !== "approved") return { phase: "Intake", state: row.review_state };
  if (row.screening_review_state !== "approved") return { phase: "Screening and Services", state: row.screening_review_state ?? "ready" };
  return { phase: "Program Completion", state: row.completion_review_state ?? "ready" };
}
