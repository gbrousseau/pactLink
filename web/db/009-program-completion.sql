CREATE TABLE program_completion_records (
  submission_id uuid PRIMARY KEY REFERENCES submissions(id),
  revision integer NOT NULL CHECK (revision > 0),
  answers jsonb NOT NULL,
  review_state text NOT NULL CHECK (review_state IN ('draft', 'pending_review', 'returned', 'approved')),
  review_requested_by text REFERENCES app_users(id),
  review_requested_at timestamptz,
  return_reason text,
  updated_by text NOT NULL REFERENCES app_users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (review_state <> 'pending_review' OR (review_requested_by IS NOT NULL AND review_requested_at IS NOT NULL))
);
CREATE TABLE program_completion_revisions (
  submission_id uuid NOT NULL REFERENCES submissions(id),
  revision integer NOT NULL,
  answers jsonb NOT NULL,
  review_state text NOT NULL,
  actor_id text NOT NULL REFERENCES app_users(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (submission_id, revision)
);
CREATE TRIGGER program_completion_revisions_immutable BEFORE UPDATE OR DELETE ON program_completion_revisions
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE TABLE program_completion_contributors (
  submission_id uuid NOT NULL REFERENCES submissions(id),
  user_id text NOT NULL REFERENCES app_users(id),
  PRIMARY KEY (submission_id, user_id)
);
CREATE TABLE program_completion_decisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id uuid NOT NULL REFERENCES submissions(id),
  revision integer NOT NULL,
  reviewer_id text NOT NULL REFERENCES app_users(id),
  decision text NOT NULL CHECK (decision IN ('approved', 'returned')),
  reason text,
  decided_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (submission_id, revision) REFERENCES program_completion_revisions(submission_id, revision),
  CHECK ((decision = 'returned' AND reason IS NOT NULL AND length(trim(reason)) > 0)
    OR (decision = 'approved' AND reason IS NULL))
);
CREATE TRIGGER program_completion_decisions_immutable BEFORE UPDATE OR DELETE ON program_completion_decisions
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE TABLE program_completion_approvals (
  submission_id uuid NOT NULL REFERENCES submissions(id),
  version integer NOT NULL CHECK (version > 0),
  revision integer NOT NULL,
  answers jsonb NOT NULL,
  editor_ids text[] NOT NULL,
  requested_by text NOT NULL REFERENCES app_users(id),
  requested_at timestamptz NOT NULL,
  approved_by text NOT NULL REFERENCES app_users(id),
  approved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (submission_id, version),
  UNIQUE (submission_id, revision),
  FOREIGN KEY (submission_id, revision) REFERENCES program_completion_revisions(submission_id, revision)
);
CREATE TRIGGER program_completion_approvals_immutable BEFORE UPDATE OR DELETE ON program_completion_approvals
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
