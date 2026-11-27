ALTER TABLE app_users ADD COLUMN email text NOT NULL DEFAULT '';
ALTER TABLE app_users ADD COLUMN phone text NOT NULL DEFAULT '';

CREATE TABLE case_file_publications (
  submission_id uuid NOT NULL,
  version integer NOT NULL,
  published_by text NOT NULL REFERENCES app_users(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (submission_id, version),
  FOREIGN KEY (submission_id, version) REFERENCES case_file_versions(submission_id, version)
);
CREATE TRIGGER case_file_publications_immutable BEFORE UPDATE OR DELETE ON case_file_publications
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

CREATE TABLE case_file_notifications (
  id uuid PRIMARY KEY,
  submission_id uuid NOT NULL,
  version integer NOT NULL,
  recipient_id text NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  email_status text NOT NULL CHECK (email_status IN ('disabled', 'missing_contact')),
  sms_status text NOT NULL CHECK (sms_status IN ('disabled', 'missing_contact')),
  UNIQUE (submission_id, version, recipient_id),
  FOREIGN KEY (submission_id, version) REFERENCES case_file_publications(submission_id, version)
);
CREATE INDEX case_file_unread ON case_file_notifications(recipient_id, created_at DESC) WHERE read_at IS NULL;
