ALTER TABLE intake_import_batches DROP CONSTRAINT intake_import_batches_file_hash_key;
CREATE INDEX intake_import_batches_hash ON intake_import_batches(file_hash);
ALTER TABLE submissions ADD COLUMN removed_at timestamptz;

CREATE TABLE intake_removal_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id uuid NOT NULL REFERENCES submissions(id),
  batch_id uuid NOT NULL REFERENCES intake_import_batches(id),
  actor_id text NOT NULL REFERENCES app_users(id),
  action text NOT NULL CHECK (action IN ('batch_undo', 'duplicate', 'restore')),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 2000),
  duplicate_of uuid REFERENCES submissions(id),
  revision integer NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (submission_id, revision) REFERENCES form_revisions(submission_id, revision),
  CHECK ((action = 'duplicate' AND duplicate_of IS NOT NULL AND duplicate_of <> submission_id)
      OR (action <> 'duplicate' AND duplicate_of IS NULL))
);
CREATE INDEX intake_removal_submission ON intake_removal_events(submission_id, id DESC);
CREATE TRIGGER intake_removal_events_immutable BEFORE UPDATE OR DELETE ON intake_removal_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
