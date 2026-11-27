CREATE TABLE referral_notes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id uuid NOT NULL REFERENCES submissions(id),
  author_id text NOT NULL REFERENCES app_users(id),
  content text NOT NULL CHECK (length(trim(content)) > 0 AND length(content) <= 30000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX referral_notes_submission_id ON referral_notes(submission_id, id DESC);
CREATE TRIGGER referral_notes_immutable BEFORE UPDATE OR DELETE ON referral_notes
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
