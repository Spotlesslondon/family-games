-- Local-only shim so the migrations and tests run on a plain Postgres.
-- Recreates the pieces of a Supabase project that the schema depends on:
-- the auth.jwt() claims function and the three API roles.
-- Never applied to a real Supabase project.

create schema if not exists auth;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin nologin;
  end if;
end $$;

grant usage on schema public, auth to anon, authenticated, service_role;
-- On Supabase supabase_auth_admin owns the auth schema.
grant usage on schema auth to supabase_auth_admin;
grant execute on function auth.jwt() to supabase_auth_admin;
grant execute on function auth.jwt() to anon, authenticated, service_role;
-- Match Supabase exactly: every role gets ALL on new tables, sequences and
-- functions in public, and row level security does the blocking. (Before
-- 1 Nov 2026 this shim granted only SELECT, which hid any table that forgot
-- row level security; 06_hardening.sql now checks every table.)
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
