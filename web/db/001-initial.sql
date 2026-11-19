CREATE TABLE IF NOT EXISTS app_groups (
  id text PRIMARY KEY,
  name text NOT NULL
);
CREATE TABLE IF NOT EXISTS app_users (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('viewer', 'editor', 'admin')),
  group_id text NOT NULL REFERENCES app_groups(id),
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES app_users(id),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS participants (
  id uuid PRIMARY KEY,
  group_id text NOT NULL REFERENCES app_groups(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS enrollments (
  id uuid PRIMARY KEY,
  participant_id uuid NOT NULL REFERENCES participants(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS submissions (
  id uuid PRIMARY KEY,
  enrollment_id uuid NOT NULL REFERENCES enrollments(id),
  group_id text NOT NULL REFERENCES app_groups(id),
  form_type text NOT NULL DEFAULT 'intake' CHECK (form_type = 'intake'),
  template_version text NOT NULL DEFAULT '09.24.2026',
  status text NOT NULL CHECK (status IN ('draft', 'submitted', 'archived')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  answers jsonb NOT NULL,
  participant_name text NOT NULL,
  date_of_birth date,
  program_type text,
  contact_date date,
  navigator_name text NOT NULL DEFAULT '',
  created_by text NOT NULL REFERENCES app_users(id),
  updated_by text NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  legal_hold boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS submission_group_date ON submissions(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS submission_status_program ON submissions(group_id, status, program_type);
CREATE TABLE IF NOT EXISTS form_revisions (
  submission_id uuid NOT NULL REFERENCES submissions(id),
  revision integer NOT NULL,
  answers jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'submitted', 'archived')),
  actor_id text NOT NULL REFERENCES app_users(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(submission_id, revision)
);
CREATE TABLE IF NOT EXISTS audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id uuid REFERENCES submissions(id),
  actor_id text NOT NULL REFERENCES app_users(id),
  action text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  changed_fields text[] NOT NULL DEFAULT '{}',
  revision integer,
  outcome text NOT NULL DEFAULT 'success'
);
CREATE INDEX IF NOT EXISTS audit_submission_date ON audit_events(submission_id, occurred_at);
CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit events are append-only';
END;
$$;
DROP TRIGGER IF EXISTS audit_immutable ON audit_events;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
DROP TRIGGER IF EXISTS revision_immutable ON form_revisions;
CREATE TRIGGER revision_immutable BEFORE UPDATE OR DELETE ON form_revisions
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
INSERT INTO app_groups(id, name) VALUES
  ('north', 'North team'), ('south', 'South team')
ON CONFLICT DO NOTHING;
INSERT INTO app_users(id, display_name, role, group_id) VALUES
  ('north-editor', 'Demo North Editor', 'editor', 'north'),
  ('north-viewer', 'Demo North Viewer', 'viewer', 'north'),
  ('south-editor', 'Demo South Editor', 'editor', 'south'),
  ('demo-admin', 'Demo Administrator', 'admin', 'north')
ON CONFLICT DO NOTHING;
