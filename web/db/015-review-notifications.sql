CREATE TABLE review_notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id uuid NOT NULL REFERENCES submissions(id),
  phase text NOT NULL CHECK (phase IN ('intake', 'screening', 'completion')),
  revision integer NOT NULL CHECK (revision > 0),
  recipient_id text NOT NULL REFERENCES app_users(id),
  requested_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  UNIQUE (submission_id, phase, revision, recipient_id)
);
CREATE INDEX review_notifications_unread ON review_notifications(recipient_id, created_at DESC) WHERE read_at IS NULL;

INSERT INTO review_notifications(submission_id,phase,revision,recipient_id,requested_at,created_at)
SELECT s.id, pending.phase, pending.revision, u.id, pending.requested_at, pending.requested_at
FROM submissions s
CROSS JOIN LATERAL (
  SELECT 'intake' AS phase, s.revision, s.review_requested_at AS requested_at
    WHERE s.review_state='pending_review' AND s.review_requested_at IS NOT NULL
  UNION ALL
  SELECT 'screening', r.revision, r.review_requested_at
    FROM screening_service_records r WHERE r.submission_id=s.id AND r.review_state='pending_review' AND r.review_requested_at IS NOT NULL
  UNION ALL
  SELECT 'completion', r.revision, r.review_requested_at
    FROM program_completion_records r WHERE r.submission_id=s.id AND r.review_state='pending_review' AND r.review_requested_at IS NOT NULL
) pending
JOIN app_users u ON u.active AND (u.role='admin' OR (u.role='reviewer' AND u.group_id=s.group_id))
WHERE s.removed_at IS NULL AND s.status<>'archived';
