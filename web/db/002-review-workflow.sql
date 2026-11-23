ALTER TABLE app_users DROP CONSTRAINT app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('viewer', 'editor', 'reviewer', 'admin'));

ALTER TABLE submissions ADD COLUMN review_state text NOT NULL DEFAULT 'draft'
  CHECK (review_state IN ('draft', 'pending_review', 'returned', 'approved', 'legacy'));
ALTER TABLE submissions ADD COLUMN review_requested_by text REFERENCES app_users(id);
ALTER TABLE submissions ADD COLUMN review_requested_at timestamptz;
ALTER TABLE submissions ADD COLUMN return_reason text;
UPDATE submissions SET review_state = 'legacy' WHERE status IN ('submitted', 'archived');

CREATE TABLE draft_contributors (
  submission_id uuid NOT NULL REFERENCES submissions(id),
  user_id text NOT NULL REFERENCES app_users(id),
  PRIMARY KEY (submission_id, user_id)
);
INSERT INTO draft_contributors (submission_id, user_id)
SELECT DISTINCT s.id, r.actor_id FROM submissions s
JOIN form_revisions r ON r.submission_id = s.id
WHERE s.status = 'draft'
ON CONFLICT DO NOTHING;
INSERT INTO draft_contributors (submission_id, user_id)
SELECT id, updated_by FROM submissions WHERE status = 'draft'
ON CONFLICT DO NOTHING;

CREATE TABLE approved_intake_versions (
  submission_id uuid NOT NULL REFERENCES submissions(id),
  version integer NOT NULL CHECK (version > 0),
  draft_revision integer NOT NULL,
  answers jsonb NOT NULL,
  template_version text NOT NULL,
  editor_ids text[] NOT NULL,
  requested_by text NOT NULL REFERENCES app_users(id),
  requested_at timestamptz NOT NULL,
  approved_by text NOT NULL REFERENCES app_users(id),
  approved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (submission_id, version),
  UNIQUE (submission_id, draft_revision),
  FOREIGN KEY (submission_id, draft_revision) REFERENCES form_revisions(submission_id, revision)
);
CREATE INDEX approved_intake_approval_date ON approved_intake_versions(approved_at, submission_id);
CREATE TRIGGER approved_versions_immutable BEFORE UPDATE OR DELETE ON approved_intake_versions
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

CREATE TABLE review_decisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id uuid NOT NULL REFERENCES submissions(id),
  draft_revision integer NOT NULL,
  reviewer_id text NOT NULL REFERENCES app_users(id),
  decision text NOT NULL CHECK (decision IN ('approved', 'returned')),
  reason text,
  decided_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (submission_id, draft_revision) REFERENCES form_revisions(submission_id, revision),
  CHECK ((decision = 'returned' AND reason IS NOT NULL AND length(trim(reason)) > 0) OR
         (decision = 'approved' AND reason IS NULL))
);
CREATE TRIGGER review_decisions_immutable BEFORE UPDATE OR DELETE ON review_decisions
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

INSERT INTO app_users(id, display_name, role, group_id) VALUES
  ('north-reviewer', 'Demo North Reviewer', 'reviewer', 'north'),
  ('south-reviewer', 'Demo South Reviewer', 'reviewer', 'south')
ON CONFLICT DO NOTHING;
