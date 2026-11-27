"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearNotificationAction } from "@/app/actions";

export function ActivityNotificationRead({ kind, id, referralId }: { kind?: string; id?: string; referralId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  useEffect(() => {
    if ((kind !== "activity" && kind !== "inactive") || !id) return;
    let active = true;
    clearNotificationAction(kind, id, "read", referralId).then((result) => {
      if (!active) return;
      if (result.error) setError(result.error);
      else if (result.changed) router.refresh();
    }).catch(() => { if (active) setError("The notification could not be marked as read. Reload to retry."); });
    return () => { active = false; };
  }, [id, kind, referralId, router]);
  return error ? <p role="alert" className="error-box">{error}</p> : null;
}
