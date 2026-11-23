CREATE TABLE redcap_prototype_exports (
  id uuid PRIMARY KEY,
  submission_id uuid NOT NULL,
  approved_version integer NOT NULL,
  payload jsonb NOT NULL,
  created_by text NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  removed_by text REFERENCES app_users(id),
  FOREIGN KEY (submission_id, approved_version) REFERENCES approved_intake_versions(submission_id, version),
  CHECK ((removed_at IS NULL) = (removed_by IS NULL))
);
CREATE INDEX redcap_prototype_submission ON redcap_prototype_exports(submission_id, created_at DESC);

CREATE FUNCTION protect_redcap_prototype_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NEW.id IS DISTINCT FROM OLD.id OR
     NEW.submission_id IS DISTINCT FROM OLD.submission_id OR
     NEW.approved_version IS DISTINCT FROM OLD.approved_version OR
     NEW.payload IS DISTINCT FROM OLD.payload OR
     NEW.created_by IS DISTINCT FROM OLD.created_by OR
     NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Prototype export content is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER redcap_prototype_immutable BEFORE UPDATE OR DELETE ON redcap_prototype_exports
FOR EACH ROW EXECUTE FUNCTION protect_redcap_prototype_content();
