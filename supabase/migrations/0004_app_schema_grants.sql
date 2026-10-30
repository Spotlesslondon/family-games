-- The row level security policies call the claim helpers in the app schema,
-- and policies run as the caller's role. Without these grants every policy
-- fails with "permission denied for schema app" for anon and authenticated.
-- The helpers only read the caller's own token claims, so exposing them is safe.

grant usage on schema app to anon, authenticated, service_role;
grant execute on all functions in schema app to anon, authenticated, service_role;
alter default privileges in schema app grant execute on functions to anon, authenticated, service_role;
