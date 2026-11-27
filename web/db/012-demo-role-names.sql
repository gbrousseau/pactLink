UPDATE app_users AS u
SET display_name = names.new_name
FROM (VALUES
  ('north-editor', 'Demo North Editor', 'Demo North Program Navigator'),
  ('south-editor', 'Demo South Editor', 'Demo South Program Navigator'),
  ('north-reviewer', 'Demo North Reviewer', 'Demo North Analyst'),
  ('south-reviewer', 'Demo South Reviewer', 'Demo South Analyst')
) AS names(id, old_name, new_name)
WHERE u.id = names.id AND u.display_name = names.old_name;
