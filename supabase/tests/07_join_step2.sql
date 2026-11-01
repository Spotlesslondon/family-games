-- Join step 2 tests (0012). Each check raises on failure.

\set ON_ERROR_STOP on

begin;

insert into families (id, name, code, owner_user_id) values
  ('f0000000-0000-0000-0000-000000000001', 'Family F', 'JSFFFF', gen_random_uuid());
insert into members (id, family_id, display_name, date_of_birth, age_band, role, pin_hash, auth_user_id, is_guest) values
  ('f0000000-0000-0000-0000-00000000000a', 'f0000000-0000-0000-0000-000000000001', 'Host', '1980-01-01', null, 'owner', 'scrypt$x', '8f000000-0000-0000-0000-00000000000a', false),
  ('f0000000-0000-0000-0000-00000000000b', 'f0000000-0000-0000-0000-000000000001', 'Kid',  null, '9-11', 'member', null, null, false),
  ('f0000000-0000-0000-0000-00000000000c', 'f0000000-0000-0000-0000-000000000001', 'Visitor', null, '16+', 'member', null, null, true);

do $$
declare r jsonb; v_room uuid; n int; c jsonb;
begin
  -- 1. Opening a night with a join code.
  r := public.open_room('f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000a', 'JSTW', 'lobby', '583920', null);
  v_room := (r ->> 'id')::uuid;
  if r ->> 'join_code' <> '583920' then raise exception 'join code not returned: %', r; end if;
  select count(*) into n from rooms where id = v_room and join_code = '583920';
  if n <> 1 then raise exception 'join code not stored'; end if;

  -- 2. Kid sits down on a phone; the seat token works.
  insert into room_members (room_id, member_id, family_id) values (v_room, 'f0000000-0000-0000-0000-00000000000b', 'f0000000-0000-0000-0000-000000000001');
  insert into seats (room_id, family_id, member_id, auth_user_id) values (v_room, 'f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000b', '9e000000-0000-0000-0000-00000000000b');
  c := public.custom_access_token_hook(jsonb_build_object('user_id', '9e000000-0000-0000-0000-00000000000b', 'claims', '{"role":"authenticated"}'::jsonb)) -> 'claims';
  if c ->> 'kind' is distinct from 'seat' then raise exception 'seated phone got %', c; end if;

  -- 3. Removed from the room: the seat is released in the same step and the
  --    phone's next token has no access.
  delete from room_members where room_id = v_room and member_id = 'f0000000-0000-0000-0000-00000000000b';
  select count(*) into n from seats where room_id = v_room and member_id = 'f0000000-0000-0000-0000-00000000000b' and released_at is null;
  if n <> 0 then raise exception 'removed player kept a live seat'; end if;
  c := public.custom_access_token_hook(jsonb_build_object('user_id', '9e000000-0000-0000-0000-00000000000b', 'claims', '{"role":"authenticated"}'::jsonb)) -> 'claims';
  if c ? 'kind' then raise exception 'removed phone kept access: %', c; end if;

  -- 4. The name is free again: another phone can take it.
  insert into seats (room_id, family_id, member_id, auth_user_id) values (v_room, 'f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000b', '9e000000-0000-0000-0000-0000000000cc');

  -- 5. Guests are people on the account, marked as guests.
  select count(*) into n from members where is_guest and family_id = 'f0000000-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'guest flag not stored'; end if;
end $$;

-- 6. Phones cannot read the guest flag or call open_room.
select set_config('request.jwt.claims',
  '{"role":"authenticated","kind":"member","member_role":"owner","family_id":"f0000000-0000-0000-0000-000000000001","member_id":"f0000000-0000-0000-0000-00000000000a"}', true);
set local role authenticated;
do $$
begin
  begin
    perform is_guest from members limit 1;
    raise exception 'phone could read members.is_guest';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.open_room(gen_random_uuid(), gen_random_uuid(), 'XXXX', 'lobby', '000000', null);
    raise exception 'phone could open a room directly';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
\echo 07_join_step2: PASS

-- 7. A removed phone's token still says "seat", but it reads nothing at once.
begin;
insert into families (id, name, code, owner_user_id) values
  ('f1000000-0000-0000-0000-000000000001', 'Family G', 'JSGGGG', gen_random_uuid());
insert into members (id, family_id, display_name, date_of_birth, age_band, role, pin_hash, auth_user_id) values
  ('f1000000-0000-0000-0000-00000000000a', 'f1000000-0000-0000-0000-000000000001', 'Host', '1980-01-01', null, 'owner', 'scrypt$x', '8f100000-0000-0000-0000-00000000000a'),
  ('f1000000-0000-0000-0000-00000000000b', 'f1000000-0000-0000-0000-000000000001', 'Kid', null, '9-11', 'member', null, null);
insert into rooms (id, family_id, code, host_member_id, phase, join_code) values
  ('f1000000-0000-0000-0000-0000000000e1', 'f1000000-0000-0000-0000-000000000001', 'JSGR', 'f1000000-0000-0000-0000-00000000000a', 'lobby', '111222');
insert into room_members (room_id, member_id, family_id) values
  ('f1000000-0000-0000-0000-0000000000e1', 'f1000000-0000-0000-0000-00000000000a', 'f1000000-0000-0000-0000-000000000001'),
  ('f1000000-0000-0000-0000-0000000000e1', 'f1000000-0000-0000-0000-00000000000b', 'f1000000-0000-0000-0000-000000000001');
insert into seats (room_id, family_id, member_id, auth_user_id) values
  ('f1000000-0000-0000-0000-0000000000e1', 'f1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-00000000000b', '9e100000-0000-0000-0000-00000000000b');

create temp table seen (step text, rooms int, people int, names int);
grant all on seen to authenticated;

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"9e100000-0000-0000-0000-00000000000b","kind":"seat","family_id":"f1000000-0000-0000-0000-000000000001","member_id":"f1000000-0000-0000-0000-00000000000b","room_id":"f1000000-0000-0000-0000-0000000000e1"}', true);
set local role authenticated;
insert into seen select 'seated', (select count(*) from rooms), (select count(*) from room_members), (select count(*) from members);
reset role;
delete from room_members where room_id = 'f1000000-0000-0000-0000-0000000000e1' and member_id = 'f1000000-0000-0000-0000-00000000000b';
set local role authenticated;
insert into seen select 'removed', (select count(*) from rooms), (select count(*) from room_members), (select count(*) from members);
reset role;

do $$
declare a seen; b seen;
begin
  select * into a from seen where step = 'seated';
  select * into b from seen where step = 'removed';
  if a.rooms <> 1 or a.people <> 2 or a.names <> 2 then raise exception 'seated phone should see its room: %', a; end if;
  -- The room row itself stays readable (no names, no secrets) so the screen can say "you are out".
  if b.rooms <> 1 or b.people <> 0 or b.names <> 0 then raise exception 'removed phone still reads: %', b; end if;
end $$;
rollback;
\echo 07_join_step2 removed-phone: PASS
