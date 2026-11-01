-- Big screen (0014). Each check raises on failure.

\set ON_ERROR_STOP on

begin;

insert into families (id, name, code, owner_user_id) values
  ('f3000000-0000-0000-0000-000000000001', 'Family T', 'JSTTTT', gen_random_uuid()),
  ('f3000000-0000-0000-0000-000000000002', 'Family U', 'JSUUUU', gen_random_uuid());
insert into members (id, family_id, display_name, date_of_birth, age_band, role, pin_hash, auth_user_id) values
  ('f3000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-000000000001', 'Host', '1980-01-01', null, 'owner', 'scrypt$x', '8f300000-0000-0000-0000-00000000000a'),
  ('f3000000-0000-0000-0000-00000000000b', 'f3000000-0000-0000-0000-000000000001', 'Kid', null, '9-11', 'member', null, null),
  ('f3000000-0000-0000-0000-00000000000c', 'f3000000-0000-0000-0000-000000000001', 'Not tonight', null, '16+', 'member', null, null),
  ('f3000000-0000-0000-0000-00000000000d', 'f3000000-0000-0000-0000-000000000002', 'Other family', null, '16+', 'member', null, null);
insert into rooms (id, family_id, code, host_member_id, phase, join_code) values
  ('f3000000-0000-0000-0000-0000000000e1', 'f3000000-0000-0000-0000-000000000001', 'JSTV', 'f3000000-0000-0000-0000-00000000000a', 'lobby', '555666');
insert into room_members (room_id, member_id, family_id) values
  ('f3000000-0000-0000-0000-0000000000e1', 'f3000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-000000000001'),
  ('f3000000-0000-0000-0000-0000000000e1', 'f3000000-0000-0000-0000-00000000000b', 'f3000000-0000-0000-0000-000000000001');
insert into screen_sessions (auth_user_id, room_id, family_id, approved_by) values
  ('77700000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-0000000000e1', 'f3000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-00000000000a');

create temp table seen (step text, rooms int, people int, names int, secrets int, list text);
grant all on seen to authenticated;

-- 1. The hook gives the TV screen claims while the night is open.
do $$
declare c jsonb;
begin
  c := public.custom_access_token_hook(jsonb_build_object('user_id', '77700000-0000-0000-0000-000000000001', 'claims', '{"role":"authenticated"}'::jsonb)) -> 'claims';
  if c ->> 'kind' is distinct from 'screen' or c ->> 'room_id' is distinct from 'f3000000-0000-0000-0000-0000000000e1' then
    raise exception 'open night: screen claims wrong: %', c;
  end if;
end $$;

-- 2. What the TV reads: its room, the people in it and their names, no secrets.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"77700000-0000-0000-0000-000000000001","kind":"screen","family_id":"f3000000-0000-0000-0000-000000000001","room_id":"f3000000-0000-0000-0000-0000000000e1"}', true);
set local role authenticated;
insert into seen select 'open', (select count(*) from rooms), (select count(*) from room_members), (select count(*) from members),
  (select count(*) from room_private), (select string_agg(display_name, ',' order by display_name) from members);
reset role;

-- 3. The night closes.
update rooms set status = 'closed', closed_at = now() where id = 'f3000000-0000-0000-0000-0000000000e1';
set local role authenticated;
insert into seen select 'closed', (select count(*) from rooms), (select count(*) from room_members), (select count(*) from members),
  (select count(*) from room_private), null;
reset role;

do $$
declare a seen; b seen; c jsonb; n int;
begin
  select * into a from seen where step = 'open';
  select * into b from seen where step = 'closed';
  if a.rooms <> 1 or a.people <> 2 or a.names <> 2 or a.secrets <> 0 or a.list <> 'Host,Kid' then
    raise exception 'TV on an open night should see its room and the 2 names in it, nothing else: %', a;
  end if;
  -- After close: the room row (so the TV can say the night is over), nothing else.
  if b.rooms <> 1 or b.people <> 0 or b.names <> 0 or b.secrets <> 0 then
    raise exception 'TV after close still reads: %', b;
  end if;
  -- 4. Closing ended the session, and the hook gives no new screen claims.
  select count(*) into n from screen_sessions where room_id = 'f3000000-0000-0000-0000-0000000000e1' and expires_at > now();
  if n <> 0 then raise exception 'closing the night left a live screen session'; end if;
  c := public.custom_access_token_hook(jsonb_build_object('user_id', '77700000-0000-0000-0000-000000000001', 'claims', '{"role":"authenticated"}'::jsonb)) -> 'claims';
  if c ? 'kind' then raise exception 'TV of a closed night still gets claims: %', c; end if;
end $$;

rollback;
\echo 08_big_screen: PASS

-- 5. Hook: a screen session in a room that is not open gets nothing, even
--    if it has not expired (sessions written before 0014 had no close step).
begin;
insert into families (id, name, code, owner_user_id) values
  ('f4000000-0000-0000-0000-000000000001', 'Family V', 'JSVVVV', gen_random_uuid());
insert into members (id, family_id, display_name, date_of_birth, role, pin_hash, auth_user_id) values
  ('f4000000-0000-0000-0000-00000000000a', 'f4000000-0000-0000-0000-000000000001', 'Host', '1980-01-01', 'owner', 'scrypt$x', '8f400000-0000-0000-0000-00000000000a');
insert into rooms (id, family_id, code, host_member_id, phase, status, closed_at) values
  ('f4000000-0000-0000-0000-0000000000e1', 'f4000000-0000-0000-0000-000000000001', 'JSVR', 'f4000000-0000-0000-0000-00000000000a', 'lobby', 'closed', now());
insert into screen_sessions (auth_user_id, room_id, family_id, approved_by) values
  ('77700000-0000-0000-0000-000000000002', 'f4000000-0000-0000-0000-0000000000e1', 'f4000000-0000-0000-0000-000000000001', 'f4000000-0000-0000-0000-00000000000a');
do $$
declare c jsonb;
begin
  c := public.custom_access_token_hook(jsonb_build_object('user_id', '77700000-0000-0000-0000-000000000002', 'claims', '{"role":"authenticated"}'::jsonb)) -> 'claims';
  if c ? 'kind' then raise exception 'screen of a closed room got claims: %', c; end if;
end $$;
rollback;
\echo 08_big_screen closed-room hook: PASS
