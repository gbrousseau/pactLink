CREATE TABLE case_file_versions (
  submission_id uuid NOT NULL REFERENCES submissions(id),
  version integer NOT NULL CHECK (version > 0),
  answers jsonb NOT NULL,
  photo bytea,
  photo_type text CHECK (photo_type IN ('image/jpeg', 'image/png')),
  created_by text NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (submission_id, version),
  CHECK ((photo IS NULL) = (photo_type IS NULL))
);
CREATE TRIGGER case_file_versions_immutable BEFORE UPDATE OR DELETE ON case_file_versions
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
