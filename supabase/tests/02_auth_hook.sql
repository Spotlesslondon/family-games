-- Custom access token hook tests. Each check raises on failure.

\set ON_ERROR_STOP on

begin;

insert into families (id, name, code, owner_user_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Family A', 'AAAAAA', gen_random_uuid());

insert into members (id, family_id, display_name, date_of_birth, role, pin_hash, auth_user_id, locked_until) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'Alice', '1985-03-01', 'owner', 'x', '11111111-0000-0000-0000-000000000001', null),
  ('aaaaaaaa-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'Arthur', '2016-07-14', 'member', 'x', '11111111-0000-0000-0000-000000000002', null),
  ('aaaaaaaa-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'Locked', '2010-01-01', 'member', 'x', '11111111-0000-0000-0000-000000000003', now() + interval '10 minutes');

insert into rooms (id, family_id, code, host_member_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'ROOM', 'aaaaaaaa-0000-0000-0000-00000000000a');

insert into screen_sessions (auth_user_id, room_id, family_id, approved_by, expires_at) values
  ('22222222-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', now() + interval '1 hour'),
  ('22222222-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', now() - interval '1 minute');

-- The hook runs as supabase_auth_admin, as Supabase Auth runs it.
create or replace function pg_temp.hook(p_user text, p_claims jsonb default '{"role":"authenticated","aud":"authenticated"}')
returns jsonb language plpgsql as $$
declare r jsonb;
begin
  execute 'set local role supabase_auth_admin';
  r := public.custom_access_token_hook(jsonb_build_object('user_id', p_user, 'claims', p_claims)) -> 'claims';
  reset role;
  return r;
end $$;

do $$
declare c jsonb;
begin
  -- 1. The owner: member kind, owner member_role, standard role untouched.
  c := pg_temp.hook('11111111-0000-0000-0000-000000000001');
  if c ->> 'kind' is distinct from 'member' then raise exception 'owner kind is %', c ->> 'kind'; end if;
  if c ->> 'member_role' is distinct from 'owner' then raise exception 'owner member_role is %', c ->> 'member_role'; end if;
  if c ->> 'member_id' is distinct from 'aaaaaaaa-0000-0000-0000-00000000000a' then raise exception 'owner member_id wrong'; end if;
  if c ->> 'family_id' is distinct from 'aaaaaaaa-0000-0000-0000-000000000001' then raise exception 'owner family_id wrong'; end if;
  if c ->> 'role' is distinct from 'authenticated' then raise exception 'hook changed the standard role claim to %', c ->> 'role'; end if;
  if c ->> 'aud' is distinct from 'authenticated' then raise exception 'hook dropped an existing claim'; end if;

  -- 2. A child member.
  c := pg_temp.hook('11111111-0000-0000-0000-000000000002');
  if c ->> 'kind' is distinct from 'member' or c ->> 'member_role' is distinct from 'member' then
    raise exception 'child claims wrong: %', c;
  end if;

  -- 3. A locked member gets no family claims.
  c := pg_temp.hook('11111111-0000-0000-0000-000000000003');
  if c ? 'kind' or c ? 'family_id' or c ? 'member_id' then raise exception 'locked member got claims: %', c; end if;

  -- 4. An approved screen gets screen claims for its one room.
  c := pg_temp.hook('22222222-0000-0000-0000-000000000001');
  if c ->> 'kind' is distinct from 'screen' then raise exception 'screen kind is %', c ->> 'kind'; end if;
  if c ->> 'room_id' is distinct from 'aaaaaaaa-0000-0000-0000-0000000000a1' then raise exception 'screen room_id wrong'; end if;
  if c ? 'member_id' then raise exception 'screen got a member_id'; end if;

  -- 5. An expired screen gets nothing.
  c := pg_temp.hook('22222222-0000-0000-0000-000000000002');
  if c ? 'kind' then raise exception 'expired screen got claims: %', c; end if;

  -- 6. An unknown user gets nothing.
  c := pg_temp.hook('99999999-0000-0000-0000-000000000009');
  if c ? 'kind' or c ? 'family_id' then raise exception 'unknown user got claims: %', c; end if;

  -- 7. Claims smuggled in on the event are thrown away, not passed through.
  c := pg_temp.hook('99999999-0000-0000-0000-000000000009',
    '{"role":"authenticated","kind":"member","family_id":"aaaaaaaa-0000-0000-0000-000000000001","member_id":"aaaaaaaa-0000-0000-0000-00000000000a","member_role":"owner"}');
  if c ? 'kind' or c ? 'family_id' or c ? 'member_id' or c ? 'member_role' then
    raise exception 'smuggled claims survived: %', c;
  end if;
  c := pg_temp.hook('11111111-0000-0000-0000-000000000002', '{"role":"authenticated","member_role":"owner"}');
  if c ->> 'member_role' is distinct from 'member' then raise exception 'child escalated to %', c ->> 'member_role'; end if;
end $$;

-- 8. Clients cannot call the hook to mint claims for someone else.
do $$
begin
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role authenticated';
  begin
    perform public.custom_access_token_hook('{"user_id":"11111111-0000-0000-0000-000000000001","claims":{}}'::jsonb);
    raise exception 'authenticated was able to call the hook';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform 1 from screen_sessions;
    if found then raise exception 'authenticated can read screen_sessions'; end if;
  exception
    when insufficient_privilege then null;
  end;
  reset role;
end $$;

-- 9. End to end: the claims the hook issues give the access the policies promise.
do $$
declare c jsonb; n int;
begin
  c := pg_temp.hook('11111111-0000-0000-0000-000000000002');
  perform set_config('request.jwt.claims', c::text, true);
  execute 'set local role authenticated';
  select count(*) into n from members;
  if n <> 3 then raise exception 'hook-issued child token sees % members, expected 3', n; end if;
  reset role;

  c := pg_temp.hook('11111111-0000-0000-0000-000000000003');
  perform set_config('request.jwt.claims', c::text, true);
  execute 'set local role authenticated';
  select count(*) into n from members;
  if n <> 0 then raise exception 'locked member token sees % members', n; end if;
  reset role;
end $$;

rollback;

\echo PASS: auth hook
