import { canWriteNotes, listReferralNotes, maxNoteLength } from "@/lib/referral-notes";
import type { User } from "@/lib/access";
import type { Submission } from "@/lib/submissions";
import { ReferralNotes } from "./referral-notes";

export async function ReferralNotesPanel({ user, referral }: { user: User; referral: Submission }) {
  const { notes, hasMore } = await listReferralNotes(user, referral.id);
  return <ReferralNotes key={referral.id} id={referral.id} initial={notes.map((note) => ({ ...note, created_at: note.created_at.toISOString() }))}
    initialHasMore={hasMore} canWrite={canWriteNotes(user, referral.group_id) && !referral.removed_at && referral.status !== "archived"} maxLength={maxNoteLength} />;
}
