ALTER TABLE consent_versions
  ADD COLUMN signature jsonb,
  ADD COLUMN signature_statement text,
  ADD CONSTRAINT consent_signature_pair CHECK (
    (signature IS NULL AND signature_statement IS NULL) OR
    (signature IS NOT NULL AND jsonb_typeof(signature) = 'array' AND signature_statement IS NOT NULL AND signature_statement <> '')
  );
