import type { User } from "./access";
import { listCaseNotifications } from "./case-file";
import { listReviewNotifications, type ReviewPhase } from "./review-notifications";
import { listActivityNotifications, listInactivityNotifications, type ActivityKind } from "./activity-notifications";

export type Notification = {
  id: string; kind: "case" | ReviewPhase | ActivityKind | "inactive"; submission_id: string; created_at: Date; phase?: ReviewPhase | null;
};

export async function listNotifications(user: User): Promise<Notification[]> {
  const [cases, reviews, activities, inactive] = await Promise.all([
    listCaseNotifications(user), listReviewNotifications(user), listActivityNotifications(user), listInactivityNotifications(user),
  ]);
  return [
    ...cases.map((notice) => ({ id: notice.id, kind: "case" as const, submission_id: notice.submission_id, created_at: notice.created_at })),
    ...reviews.map((notice) => ({ id: notice.id, kind: notice.phase, submission_id: notice.submission_id, created_at: notice.created_at })),
    ...activities.map((notice) => ({ ...notice })),
    ...inactive.map((notice) => ({ ...notice, kind: "inactive" as const })),
  ].sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
}
