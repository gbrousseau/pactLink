"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { markReviewNotificationsReadAction } from "@/app/actions";

export function ReviewNotificationRead({ noticeId }: { noticeId: string }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    markReviewNotificationsReadAction(noticeId).then((changed) => { if (active && changed) router.refresh(); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [noticeId, router]);
  return failed ? <p role="alert" className="error-box">The review notification could not be marked as read. Reload to retry.</p> : null;
}
