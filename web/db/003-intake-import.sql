CREATE TABLE intake_import_batches (
  id uuid PRIMARY KEY,
  file_hash text NOT NULL UNIQUE,
  group_id text NOT NULL REFERENCES app_groups(id),
  actor_id text NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  imported_count integer NOT NULL CHECK (imported_count > 0),
  skipped_count integer NOT NULL CHECK (skipped_count >= 0)
);
CREATE TABLE intake_import_sources (
  submission_id uuid PRIMARY KEY REFERENCES submissions(id),
  batch_id uuid NOT NULL REFERENCES intake_import_batches(id),
  row_number integer NOT NULL CHECK (row_number > 1),
  source jsonb NOT NULL,
  placeholder_values jsonb NOT NULL,
  placeholder_fields text[] NOT NULL,
  UNIQUE (batch_id, row_number)
);
