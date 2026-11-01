-- Isolation and commit tests. Run by scripts/db-test.sh against a throwaway
-- local Postgres after the migrations. Every check raises on failure, so a
-- clean run with no ERROR lines is a pass.

\set ON_ERROR_STOP on

begin;

-- Fixtures, written as the superuser (stands in for the service role).
insert into families (id, name, code, owner_user_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Family A', 'AAAAAA', gen_random_uuid()),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Family B', 'BBBBBB', gen_random_uuid());

insert into members (id, family_id, display_name, date_of_birth, role, pin_hash) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'Alice', '1985-03-01', 'owner', 'x'),
  ('aaaaaaaa-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'Arthur', '2016-07-14', 'member', 'x'),
  ('bbbbbbbb-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-000000000001', 'Bea', '1990-01-01', 'owner', 'x');

insert into member_skills (member_id, category, rating) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'sport', 3.5),
  ('aaaaaaaa-0000-0000-0000-00000000000b', 'sport', 2.0),
  ('bbbbbbbb-0000-0000-0000-00000000000a', 'sport', 4.0);

insert into rooms (id, family_id, code, host_member_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'ROOM', 'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000001', 'OTHR', 'bbbbbbbb-0000-0000-0000-00000000000a');

insert into room_members (room_id, member_id, family_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-000000000001');

insert into room_private (room_id, member_id, family_id, state) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', '{"word":"cat"}'),
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', '{"word":"lion"}');

insert into content_items (kind, age_band, body, status) values
  ('word_pair', '6-8', '{"civilian":"cat","undercover":"lion"}', 'approved');

insert into game_events (family_id, room_id, member_id, event_type) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'room_opened');

-- Helper to assume a token.
create or replace function pg_temp.become(p_claims jsonb) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', p_claims::text, true);
  execute 'set local role authenticated';
end $$;

-- ---------------------------------------------------------------------------
-- 1. A member token sees its own family and nothing of the other.
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  perform pg_temp.become('{"kind":"member","family_id":"aaaaaaaa-0000-0000-0000-000000000001","member_id":"aaaaaaaa-0000-0000-0000-00000000000b"}');

  select count(*) into n from families;
  if n <> 1 then raise exception 'member sees % families, expected 1', n; end if;

  select count(*) into n from members;
  if n <> 2 then raise exception 'member sees % members, expected 2', n; end if;

  select count(*) into n from members where family_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'member can see another family''s members'; end if;

  select count(*) into n from rooms;
  if n <> 1 then raise exception 'member sees % rooms, expected 1', n; end if;

  select count(*) into n from room_members;
  if n <> 2 then raise exception 'member sees % room_members, expected 2', n; end if;

  -- The security boundary: only your own private row.
  select count(*) into n from room_private;
  if n <> 1 then raise exception 'member sees % private rows, expected 1', n; end if;
  select count(*) into n from room_private where member_id <> 'aaaaaaaa-0000-0000-0000-00000000000b';
  if n <> 0 then raise exception 'member can read another player''s private state'; end if;

  -- Skills: own row only for a plain member.
  select count(*) into n from member_skills;
  if n <> 1 then raise exception 'member sees % skill rows, expected 1', n; end if;

  -- Server-only tables.
  select count(*) into n from content_items;
  if n <> 0 then raise exception 'member can read the content bank'; end if;
  select count(*) into n from game_events;
  if n <> 0 then raise exception 'member can read game_events'; end if;
  select count(*) into n from devices;
  if n <> 0 then raise exception 'member can read devices'; end if;

  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The owner plays too: sees the family's skills, and their own private
--    state but nobody else's.
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  perform pg_temp.become('{"kind":"member","member_role":"owner","family_id":"aaaaaaaa-0000-0000-0000-000000000001","member_id":"aaaaaaaa-0000-0000-0000-00000000000a"}');

  select count(*) into n from member_skills;
  if n <> 2 then raise exception 'owner sees % skill rows, expected 2', n; end if;

  select count(*) into n from room_private;
  if n <> 1 then raise exception 'owner sees % private rows, expected 1 (their own)', n; end if;
  select count(*) into n from room_private where member_id <> 'aaaaaaaa-0000-0000-0000-00000000000a';
  if n <> 0 then raise exception 'owner can read another player''s private state'; end if;

  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 3. A screen token sees only its own room's public rows.
-- ---------------------------------------------------------------------------
insert into screen_sessions (auth_user_id, room_id, family_id, approved_by) values
  ('33333333-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a');

do $$
declare n int;
begin
  perform pg_temp.become('{"sub":"33333333-0000-0000-0000-000000000001","kind":"screen","family_id":"aaaaaaaa-0000-0000-0000-000000000001","room_id":"aaaaaaaa-0000-0000-0000-0000000000a1"}');

  select count(*) into n from rooms;
  if n <> 1 then raise exception 'screen sees % rooms, expected 1', n; end if;
  select count(*) into n from rooms where id = 'bbbbbbbb-0000-0000-0000-0000000000b1';
  if n <> 0 then raise exception 'screen can see another room'; end if;

  select count(*) into n from room_members;
  if n <> 2 then raise exception 'screen sees % room_members, expected 2', n; end if;

  select count(*) into n from room_private;
  if n <> 0 then raise exception 'screen can read private state'; end if;

  -- Since 0014 the TV shows who is in the room: names of the people in it, nobody else.
  select count(*) into n from members;
  if n <> 2 then raise exception 'screen sees % members, expected the 2 in its room', n; end if;

  select count(*) into n from families;
  if n <> 0 then raise exception 'screen can read families'; end if;

  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 4. A token with no claims sees nothing at all.
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  perform pg_temp.become('{}');
  select count(*) into n from rooms;
  if n <> 0 then raise exception 'anonymous token sees rooms'; end if;
  select count(*) into n from members;
  if n <> 0 then raise exception 'anonymous token sees members'; end if;
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Clients cannot write.
-- ---------------------------------------------------------------------------
-- On Supabase the authenticated role holds table privileges and RLS alone
-- blocks the write (zero rows affected, or an RLS violation, both 42501 or
-- silent); on the local shim the role lacks the privilege outright. Both
-- count as "could not write".
do $$
declare n int;
begin
  perform pg_temp.become('{"kind":"member","family_id":"aaaaaaaa-0000-0000-0000-000000000001","member_id":"aaaaaaaa-0000-0000-0000-00000000000a"}');
  begin
    update rooms set phase = 'hacked' where id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'member was able to update rooms'; end if;
  exception
    when insufficient_privilege then null;
  end;
  begin
    insert into game_events (family_id, room_id, event_type)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'forged');
    raise exception 'member was able to insert game_events';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform commit_room_turn('aaaaaaaa-0000-0000-0000-0000000000a1', 0, 'mr_white', 'deal', null, '{}'::jsonb);
    raise exception 'member was able to call commit_room_turn';
  exception
    when insufficient_privilege then null;
  end;
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 6. commit_room_turn writes everything in one go and refuses a stale version.
-- ---------------------------------------------------------------------------
do $$
declare
  v int;
  n int;
  w text;
begin
  execute 'set local role service_role';

  v := commit_room_turn(
    'aaaaaaaa-0000-0000-0000-0000000000a1',
    0,
    'mr_white',
    'describe',
    now() + interval '45 seconds',
    '{"round":1,"order":["a","b"]}'::jsonb,
    '[{"member_id":"aaaaaaaa-0000-0000-0000-00000000000a","state":{"word":"dog"}},
      {"member_id":"aaaaaaaa-0000-0000-0000-00000000000b","state":{"word":"wolf"}}]'::jsonb,
    '[{"member_id":"aaaaaaaa-0000-0000-0000-00000000000a","event_type":"game_started","payload":{"game":"mr_white"}}]'::jsonb
  );
  if v <> 1 then raise exception 'first commit returned version %, expected 1', v; end if;

  select version into n from rooms where id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
  if n <> 1 then raise exception 'room version is %, expected 1', n; end if;

  select state ->> 'word' into w from room_private
   where room_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and member_id = 'aaaaaaaa-0000-0000-0000-00000000000b';
  if w <> 'wolf' then raise exception 'private state not upserted, got %', w; end if;

  select count(*) into n from game_events where room_id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
  if n <> 2 then raise exception 'expected 2 events after commit, got %', n; end if;

  -- Stale version: must write nothing.
  begin
    perform commit_room_turn(
      'aaaaaaaa-0000-0000-0000-0000000000a1', 0, 'mr_white', 'vote', null, '{}'::jsonb,
      '[{"member_id":"aaaaaaaa-0000-0000-0000-00000000000a","state":{"word":"LEAK"}}]'::jsonb,
      '[{"event_type":"should_not_exist"}]'::jsonb
    );
    raise exception 'stale commit was accepted';
  exception
    when others then
      if sqlerrm <> 'version_conflict' then
        raise exception 'unexpected error on stale commit: %', sqlerrm;
      end if;
  end;

  select count(*) into n from game_events where event_type = 'should_not_exist';
  if n <> 0 then raise exception 'stale commit wrote an event'; end if;
  select state ->> 'word' into w from room_private
   where room_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and member_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  if w <> 'dog' then raise exception 'stale commit changed private state'; end if;
  select phase into w from rooms where id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
  if w <> 'describe' then raise exception 'stale commit changed the phase'; end if;

  -- Unknown room.
  begin
    perform commit_room_turn(gen_random_uuid(), 0, null, 'lobby', null, '{}'::jsonb);
    raise exception 'commit against unknown room was accepted';
  exception
    when others then
      if sqlerrm <> 'room_not_found' then
        raise exception 'unexpected error on unknown room: %', sqlerrm;
      end if;
  end;

  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 7. After the commit, each member still sees only their own new private state.
-- ---------------------------------------------------------------------------
do $$
declare w text; n int;
begin
  perform pg_temp.become('{"kind":"member","family_id":"aaaaaaaa-0000-0000-0000-000000000001","member_id":"aaaaaaaa-0000-0000-0000-00000000000a"}');
  select count(*) into n from room_private;
  if n <> 1 then raise exception 'member sees % private rows after commit', n; end if;
  select state ->> 'word' into w from room_private;
  if w <> 'dog' then raise exception 'member sees wrong private word %', w; end if;
  reset role;
end $$;

rollback;

\echo PASS: isolation and commit_room_turn
