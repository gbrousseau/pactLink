CREATE TABLE consent_versions (
  submission_id uuid NOT NULL REFERENCES submissions(id),
  version integer NOT NULL CHECK (version > 0),
  first_name text NOT NULL,
  middle_name text NOT NULL,
  last_name text NOT NULL,
  date_of_birth date NOT NULL,
  address text NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  emergency_name text NOT NULL,
  emergency_phone text NOT NULL,
  agreed_to_share boolean NOT NULL CHECK (agreed_to_share),
  signed_attested boolean NOT NULL CHECK (signed_attested),
  document bytea,
  created_by text NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (submission_id, version)
);
CREATE TRIGGER consent_immutable BEFORE UPDATE OR DELETE ON consent_versions
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
