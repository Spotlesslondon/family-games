-- Phones may read only the member columns the app shows.
--
-- Row level security limits which ROWS a phone sees (its own family). It says
-- nothing about COLUMNS, and Supabase grants select on every column by
-- default. Before this migration a signed-in phone could read every family
-- member's pin_hash. A 4-digit PIN has 10,000 values, so a hash is cracked
-- offline in seconds: a child could recover the owner's PIN.
--
-- The server (service_role) and the auth hook (supabase_auth_admin, granted
-- in 0005) keep full access. Phones keep: id, family_id, display_name,
-- avatar, role, created_at.

revoke select on public.members from anon, authenticated;
grant select (id, family_id, display_name, avatar, role, created_at) on public.members to authenticated;
