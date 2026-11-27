"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { markCaseNotificationsReadAction } from "@/app/actions";

export function CaseFileRead({ id, version }: { id: string; version: number }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    markCaseNotificationsReadAction(id, version).then(() => { if (active) router.refresh(); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [id, version, router]);
  return failed ? <p role="alert" className="error-box">The notification could not be marked as read. Reload to retry.</p> : null;
}
