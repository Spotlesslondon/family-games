-- Join model tests (0008). Each check raises on failure.

\set ON_ERROR_STOP on

begin;

-- Two hosts' accounts. Family A has a host, a child, a gran and an uni friend.
insert into families (id, name, code, owner_user_id) values
  ('a0000000-0000-0000-0000-000000000001', 'Host A', 'JMAAAA', gen_random_uuid()),
  ('b0000000-0000-0000-0000-000000000001', 'Host B', 'JMBBBB', gen_random_uuid());

insert into members (id, family_id, display_name, date_of_birth, age_band, role, pin_hash, auth_user_id) values
  ('a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'Host',   '1985-01-01', null, 'owner',  'scrypt$x', '3a000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000001', 'Kid',    null, '6-8',  'member', null, null),
  ('a0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-000000000001', 'Gran',   null, '16+',  'member', null, null),
  ('a0000000-0000-0000-0000-00000000000d', 'a0000000-0000-0000-0000-000000000001', 'UniMate', null, '16+', 'member', null, null),
  ('b0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-000000000001', 'Other',  '1990-01-01', null, 'owner', 'scrypt$y', '3b000000-0000-0000-0000-000000000001');

-- 1. People rules: age must be known; anyone who signs in needs a PIN.
do $$
begin
  begin
    insert into members (family_id, display_name, role) values ('a0000000-0000-0000-0000-000000000001', 'NoAge', 'member');
    raise exception 'a person with no age was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into members (family_id, display_name, age_band, role, auth_user_id)
      values ('a0000000-0000-0000-0000-000000000001', 'NoPin', '16+', 'member', gen_random_uuid());
    raise exception 'a signing-in person with no PIN was accepted';
  exception when check_violation then null;
  end;
end $$;

-- 2. Lists: a person can be on two lists; a list cannot hold another host's person.
insert into lists (id, family_id, name) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Gran''s house'),
  ('a1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Uni guys'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'B list');
insert into list_people (list_id, member_id, family_id) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000d', 'a0000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-000000000001');

do $$
begin
  begin
    insert into list_people (list_id, member_id, family_id)
      values ('a1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001');
    raise exception 'another host''s person went onto a list';
  exception when foreign_key_violation then null;
  end;
end $$;

-- 3. Join codes: unique while live, reusable once a night is locked.
insert into rooms (id, family_id, code, host_member_id, join_code, list_id) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'GRAN', 'a0000000-0000-0000-0000-00000000000a', '482913', 'a1000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'UNIS', 'a0000000-0000-0000-0000-00000000000a', '111111', 'a1000000-0000-0000-0000-000000000002'),
  ('b2000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'BBBB', 'b0000000-0000-0000-0000-00000000000a', '222222', null);

do $$
declare before_ts timestamptz; after_ts timestamptz;
begin
  begin
    insert into rooms (family_id, code, host_member_id, join_code)
      values ('b0000000-0000-0000-0000-000000000001', 'DUPE', 'b0000000-0000-0000-0000-00000000000a', '482913');
    raise exception 'two live rooms got the same join code';
  exception when unique_violation then null;
  end;

  update rooms set locked_at = now() where id = 'a2000000-0000-0000-0000-000000000002';
  insert into rooms (family_id, code, host_member_id, join_code)
    values ('b0000000-0000-0000-0000-000000000001', 'REUS', 'b0000000-0000-0000-0000-00000000000a', '111111');

  -- 4. Any change to a room counts as activity.
  update rooms set last_activity_at = now() - interval '1 hour' where id = 'a2000000-0000-0000-0000-000000000001';
  select last_activity_at into before_ts from rooms where id = 'a2000000-0000-0000-0000-000000000001';
  -- The trigger sets now() even on that update, so check a later change moves it.
  update rooms set phase = 'lobby' where id = 'a2000000-0000-0000-0000-000000000001';
  select last_activity_at into after_ts from rooms where id = 'a2000000-0000-0000-0000-000000000001';
  if after_ts < before_ts then raise exception 'room activity time went backwards'; end if;
  if after_ts < now() - interval '1 minute' then raise exception 'room activity not recorded'; end if;
end $$;

-- 5. Seats: Kid and Gran sit in Gran's room. One phone per person, one person per phone.
insert into room_members (room_id, member_id, family_id) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-000000000001');
insert into seats (room_id, family_id, member_id, auth_user_id) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000b', '5e000000-0000-0000-0000-00000000000b'),
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000c', '5e000000-0000-0000-0000-00000000000c');
insert into room_private (room_id, member_id, family_id, state) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000001', '{"word":"cat"}'),
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-000000000001', '{"word":"lion"}');

do $$
begin
  begin
    insert into seats (room_id, family_id, member_id, auth_user_id) values
      ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000b', gen_random_uuid());
    raise exception 'a second phone took Kid''s seat';
  exception when unique_violation then null;
  end;
  begin
    insert into seats (room_id, family_id, member_id, auth_user_id) values
      ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000d', '5e000000-0000-0000-0000-00000000000b');
    raise exception 'one phone sat as two people';
  exception when unique_violation then null;
  end;
  begin
    insert into seats (room_id, family_id, member_id, auth_user_id) values
      ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000a', gen_random_uuid());
    raise exception 'another host''s person took a seat';
  exception when foreign_key_violation then null;
  end;
end $$;

-- 6. The token hook, run as Supabase Auth runs it.
create or replace function pg_temp.hook(p_user text)
returns jsonb language plpgsql as $$
declare r jsonb;
begin
  execute 'set local role supabase_auth_admin';
  r := public.custom_access_token_hook(jsonb_build_object(
    'user_id', p_user,
    'claims', '{"role":"authenticated","aud":"authenticated","kind":"member","family_id":"b0000000-0000-0000-0000-000000000001"}'::jsonb
  )) -> 'claims';
  reset role;
  return r;
end $$;

do $$
declare c jsonb;
begin
  c := pg_temp.hook('5e000000-0000-0000-0000-00000000000b');
  if c ->> 'kind' is distinct from 'seat' then raise exception 'seated phone kind is %', c ->> 'kind'; end if;
  if c ->> 'room_id' is distinct from 'a2000000-0000-0000-0000-000000000001' then raise exception 'seated phone has the wrong room'; end if;
  if c ->> 'member_id' is distinct from 'a0000000-0000-0000-0000-00000000000b' then raise exception 'seated phone is the wrong person'; end if;
  if c ->> 'family_id' is distinct from 'a0000000-0000-0000-0000-000000000001' then raise exception 'seated phone kept a forged family'; end if;

  -- A phone with no seat gets nothing, even if it arrives with forged claims.
  c := pg_temp.hook('5e000000-0000-0000-0000-0000000000ff');
  if c ? 'kind' or c ? 'family_id' then raise exception 'unseated phone kept claims: %', c; end if;
  if c ->> 'role' is distinct from 'authenticated' then raise exception 'standard role was changed'; end if;

  -- Once the host releases a seat, that phone loses its access.
  update seats set released_at = now() where auth_user_id = '5e000000-0000-0000-0000-00000000000c';
  c := pg_temp.hook('5e000000-0000-0000-0000-00000000000c');
  if c ? 'kind' then raise exception 'released seat kept kind %', c ->> 'kind'; end if;
  update seats set released_at = null where auth_user_id = '5e000000-0000-0000-0000-00000000000c';

  -- The host still signs in as a member.
  c := pg_temp.hook('3a000000-0000-0000-0000-000000000001');
  if c ->> 'kind' is distinct from 'member' then raise exception 'host kind is %', c ->> 'kind'; end if;
end $$;

-- 7. What a seated phone can read: Kid in Gran's room.
select set_config('request.jwt.claims',
  '{"role":"authenticated","kind":"seat","family_id":"a0000000-0000-0000-0000-000000000001","room_id":"a2000000-0000-0000-0000-000000000001","member_id":"a0000000-0000-0000-0000-00000000000b"}', true);
set local role authenticated;

do $$
declare n int; w text;
begin
  select count(*) into n from rooms;
  if n <> 1 then raise exception 'seat sees % rooms, expected only its own', n; end if;
  select count(*) into n from room_members;
  if n <> 3 then raise exception 'seat sees % people in the room, expected 3', n; end if;
  -- Names of the people in the room, and not UniMate, who is on another list.
  select count(*) into n from (select display_name from members) s;
  if n <> 3 then raise exception 'seat sees % names, expected the 3 in its room', n; end if;
  select count(*) into n from members where display_name = 'UniMate';
  if n <> 0 then raise exception 'seat can see someone outside its room'; end if;
  -- No lists, no family record, no scores.
  select count(*) into n from lists;
  if n <> 0 then raise exception 'seat sees % lists', n; end if;
  select count(*) into n from list_people;
  if n <> 0 then raise exception 'seat sees list membership'; end if;
  select count(*) into n from families;
  if n <> 0 then raise exception 'seat sees the family record'; end if;
  -- Its own secret word, never Gran's.
  select count(*) into n from room_private;
  if n <> 1 then raise exception 'seat sees % secret rows, expected 1', n; end if;
  select state ->> 'word' into w from room_private;
  if w is distinct from 'cat' then raise exception 'seat read the wrong secret'; end if;
end $$;

-- 8. A signed-in anonymous phone with no seat sees nothing at all.
reset role;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;

do $$
declare n int;
begin
  select (select count(*) from rooms) + (select count(*) from room_members) + (select count(*) from members)
       + (select count(*) from lists) + (select count(*) from list_people) + (select count(*) from seats)
       + (select count(*) from room_private) + (select count(*) from families) + (select count(*) from scores)
    into n;
  if n <> 0 then raise exception 'an unseated phone can read % rows', n; end if;
end $$;

-- 9. The host still sees the whole account, including lists and seats.
reset role;
select set_config('request.jwt.claims',
  '{"role":"authenticated","kind":"member","member_role":"owner","family_id":"a0000000-0000-0000-0000-000000000001","member_id":"a0000000-0000-0000-0000-00000000000a"}', true);
set local role authenticated;

do $$
declare n int;
begin
  select count(*) into n from lists;
  if n <> 2 then raise exception 'host sees % lists, expected 2', n; end if;
  select count(*) into n from seats;
  if n <> 2 then raise exception 'host sees % seats, expected 2', n; end if;
end $$;

rollback;
\echo 05_join_model: PASS
