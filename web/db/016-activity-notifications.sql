CREATE TABLE notification_preferences (
  user_id text PRIMARY KEY REFERENCES app_users(id),
  note_alerts boolean NOT NULL DEFAULT true
);

CREATE TABLE activity_notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id uuid NOT NULL REFERENCES submissions(id),
  recipient_id text NOT NULL REFERENCES app_users(id),
  kind text NOT NULL CHECK (kind IN ('note', 'review_approved', 'review_returned')),
  phase text CHECK (phase IN ('intake', 'screening', 'completion')),
  note_id bigint REFERENCES referral_notes(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CHECK ((kind='note' AND note_id IS NOT NULL AND phase IS NULL) OR
         (kind IN ('review_approved', 'review_returned') AND note_id IS NULL AND phase IS NOT NULL)),
  UNIQUE (recipient_id, note_id)
);
CREATE INDEX activity_notifications_unread ON activity_notifications(recipient_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE inactivity_notification_dismissals (
  recipient_id text NOT NULL REFERENCES app_users(id),
  submission_id uuid NOT NULL REFERENCES submissions(id),
  activity_at timestamptz NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recipient_id, submission_id)
);
