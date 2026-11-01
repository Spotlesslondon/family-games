-- commit_room_turn_v2 tests. Each check raises on failure.

\set ON_ERROR_STOP on

begin;

insert into families (id, name, code, owner_user_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Family A', 'AAAAAA', gen_random_uuid()),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Family B', 'BBBBBB', gen_random_uuid());

insert into members (id, family_id, display_name, date_of_birth, role, pin_hash) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'Alice', '1985-03-01', 'owner', 'x'),
  ('aaaaaaaa-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'Arthur', '2016-07-14', 'member', 'x'),
  ('aaaaaaaa-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'Ava', '2012-07-14', 'member', 'x'),
  ('bbbbbbbb-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-000000000001', 'Bea', '1990-01-01', 'owner', 'x');

insert into rooms (id, family_id, code, host_member_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'ROOM', 'aaaaaaaa-0000-0000-0000-00000000000a');

insert into room_members (room_id, member_id, family_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001');

do $$
declare v int; n int; c boolean; h uuid; s text;
begin
  execute 'set local role service_role';

  -- 1. Two members join in one turn.
  v := commit_room_turn_v2('aaaaaaaa-0000-0000-0000-0000000000a1', 0, null, 'lobby', null, '{}'::jsonb,
    'aaaaaaaa-0000-0000-0000-00000000000a', 'open',
    '[{"member_id":"aaaaaaaa-0000-0000-0000-00000000000a","connected":true},
      {"member_id":"aaaaaaaa-0000-0000-0000-00000000000b","connected":true},
      {"member_id":"aaaaaaaa-0000-0000-0000-00000000000c","connected":true}]'::jsonb,
    '[]'::jsonb, '[{"member_id":"aaaaaaaa-0000-0000-0000-00000000000b","event_type":"member_joined"}]'::jsonb);
  if v <> 1 then raise exception 'join commit returned %', v; end if;
  select count(*) into n from room_members where room_id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
  if n <> 3 then raise exception 'expected 3 members, got %', n; end if;

  -- 2. One disconnects, one leaves, host hands over.
  v := commit_room_turn_v2('aaaaaaaa-0000-0000-0000-0000000000a1', 1, null, 'lobby', null, '{}'::jsonb,
    'aaaaaaaa-0000-0000-0000-00000000000c', 'open',
    '[{"member_id":"aaaaaaaa-0000-0000-0000-00000000000b","connected":false},
      {"member_id":"aaaaaaaa-0000-0000-0000-00000000000c","connected":true}]'::jsonb);
  select count(*) into n from room_members where room_id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
  if n <> 2 then raise exception 'leave did not remove the member, % left', n; end if;
  select connected into c from room_members where member_id = 'aaaaaaaa-0000-0000-0000-00000000000b';
  if c then raise exception 'disconnect not recorded'; end if;
  select host_member_id into h from rooms where id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
  if h <> 'aaaaaaaa-0000-0000-0000-00000000000c' then raise exception 'host not handed over'; end if;

  -- 3. Someone from another family is refused and nothing is written.
  begin
    perform commit_room_turn_v2('aaaaaaaa-0000-0000-0000-0000000000a1', 2, null, 'lobby', null, '{}'::jsonb,
      'aaaaaaaa-0000-0000-0000-00000000000c', 'open',
      '[{"member_id":"aaaaaaaa-0000-0000-0000-00000000000c","connected":true},
        {"member_id":"bbbbbbbb-0000-0000-0000-00000000000a","connected":true}]'::jsonb);
    raise exception 'cross-family member was accepted';
  exception when others then
    if sqlerrm <> 'member_not_in_family' then raise exception 'unexpected: %', sqlerrm; end if;
  end;
  begin
    perform commit_room_turn_v2('aaaaaaaa-0000-0000-0000-0000000000a1', 2, null, 'lobby', null, '{}'::jsonb,
      'bbbbbbbb-0000-0000-0000-00000000000a', 'open', '[]'::jsonb);
    raise exception 'cross-family host was accepted';
  exception when others then
    if sqlerrm <> 'host_not_in_family' then raise exception 'unexpected: %', sqlerrm; end if;
  end;
  select count(*) into n from room_members where member_id = 'bbbbbbbb-0000-0000-0000-00000000000a';
  if n <> 0 then raise exception 'cross-family member was written'; end if;

  -- 4. A stale version writes nothing.
  begin
    perform commit_room_turn_v2('aaaaaaaa-0000-0000-0000-0000000000a1', 1, null, 'lobby', null, '{}'::jsonb,
      'aaaaaaaa-0000-0000-0000-00000000000a', 'closed', '[]'::jsonb);
    raise exception 'stale commit accepted';
  exception when others then
    if sqlerrm <> 'version_conflict' then raise exception 'unexpected: %', sqlerrm; end if;
  end;
  select status into s from rooms where id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
  if s <> 'open' then raise exception 'stale commit closed the room'; end if;

  -- 5. Closing stamps closed_at.
  v := commit_room_turn_v2('aaaaaaaa-0000-0000-0000-0000000000a1', 2, null, 'lobby', null, '{}'::jsonb,
    'aaaaaaaa-0000-0000-0000-00000000000c', 'closed', '[]'::jsonb);
  select count(*) into n from rooms where id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and status = 'closed' and closed_at is not null;
  if n <> 1 then raise exception 'close not recorded'; end if;

  reset role;
end $$;

-- 6. Clients cannot call it.
do $$
begin
  perform set_config('request.jwt.claims', '{"kind":"member","family_id":"aaaaaaaa-0000-0000-0000-000000000001","member_id":"aaaaaaaa-0000-0000-0000-00000000000a"}', true);
  execute 'set local role authenticated';
  begin
    perform commit_room_turn_v2('aaaaaaaa-0000-0000-0000-0000000000a1', 3, null, 'lobby', null, '{}'::jsonb,
      'aaaaaaaa-0000-0000-0000-00000000000a', 'open', '[]'::jsonb);
    raise exception 'member called commit_room_turn_v2';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;

rollback;

\echo PASS: commit_room_turn_v2
