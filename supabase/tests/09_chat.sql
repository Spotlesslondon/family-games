-- Chat (0015). Each check raises on failure.

\set ON_ERROR_STOP on

begin;

insert into families (id, name, code, owner_user_id) values
  ('f5000000-0000-0000-0000-000000000001', 'Family C', 'JSCCCC', gen_random_uuid()),
  ('f5000000-0000-0000-0000-000000000002', 'Family D', 'JSDDDD', gen_random_uuid());
insert into members (id, family_id, display_name, date_of_birth, age_band, role, pin_hash, auth_user_id) values
  ('f5000000-0000-0000-0000-00000000000a', 'f5000000-0000-0000-0000-000000000001', 'Host', '1980-01-01', null, 'owner', 'scrypt$x', '8f500000-0000-0000-0000-00000000000a'),
  ('f5000000-0000-0000-0000-00000000000b', 'f5000000-0000-0000-0000-000000000001', 'Kid', null, '9-11', 'member', null, null),
  ('f5000000-0000-0000-0000-00000000000c', 'f5000000-0000-0000-0000-000000000001', 'Not tonight', null, '16+', 'member', null, null),
  ('f5000000-0000-0000-0000-00000000000d', 'f5000000-0000-0000-0000-000000000002', 'Other family', null, '16+', 'member', null, null);
insert into rooms (id, family_id, code, host_member_id, phase, join_code) values
  ('f5000000-0000-0000-0000-0000000000e1', 'f5000000-0000-0000-0000-000000000001', 'JSCH', 'f5000000-0000-0000-0000-00000000000a', 'lobby', '777888');
insert into room_members (room_id, member_id, family_id) values
  ('f5000000-0000-0000-0000-0000000000e1', 'f5000000-0000-0000-0000-00000000000a', 'f5000000-0000-0000-0000-000000000001'),
  ('f5000000-0000-0000-0000-0000000000e1', 'f5000000-0000-0000-0000-00000000000b', 'f5000000-0000-0000-0000-000000000001');
insert into room_messages (room_id, family_id, member_id, body, quick) values
  ('f5000000-0000-0000-0000-0000000000e1', 'f5000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-00000000000a', 'Good luck all', null),
  ('f5000000-0000-0000-0000-0000000000e1', 'f5000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-00000000000b', null, 'ha');

-- The table refuses a message with both or neither, and one over 120 characters.
do $$
begin
  begin
    insert into room_messages (room_id, family_id, member_id, body, quick) values
      ('f5000000-0000-0000-0000-0000000000e1', 'f5000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-00000000000a', 'x', 'ha');
    raise exception 'a message with text and a quick reply was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into room_messages (room_id, family_id, member_id, body) values
      ('f5000000-0000-0000-0000-0000000000e1', 'f5000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-00000000000a', repeat('a', 121));
    raise exception 'a 121 character message was accepted';
  exception when check_violation then null;
  end;
end $$;

create temp table seen (who text, n int);
grant all on seen to authenticated;

-- Who reads what.
select set_config('request.jwt.claims', '{"role":"authenticated","kind":"member","member_role":"owner","family_id":"f5000000-0000-0000-0000-000000000001","member_id":"f5000000-0000-0000-0000-00000000000a"}', true);
set local role authenticated;
insert into seen select 'host in the room', count(*) from room_messages;
reset role;

select set_config('request.jwt.claims', '{"role":"authenticated","kind":"member","member_role":"member","family_id":"f5000000-0000-0000-0000-000000000001","member_id":"f5000000-0000-0000-0000-00000000000c"}', true);
set local role authenticated;
insert into seen select 'family, not in the room', count(*) from room_messages;
reset role;

select set_config('request.jwt.claims', '{"role":"authenticated","kind":"member","member_role":"member","family_id":"f5000000-0000-0000-0000-000000000002","member_id":"f5000000-0000-0000-0000-00000000000d"}', true);
set local role authenticated;
insert into seen select 'other family', count(*) from room_messages;
reset role;

select set_config('request.jwt.claims', '{"role":"authenticated","kind":"seat","family_id":"f5000000-0000-0000-0000-000000000001","room_id":"f5000000-0000-0000-0000-0000000000e1","member_id":"f5000000-0000-0000-0000-00000000000b"}', true);
set local role authenticated;
insert into seen select 'seat in the room', count(*) from room_messages;
reset role;

select set_config('request.jwt.claims', '{"role":"authenticated","kind":"screen","family_id":"f5000000-0000-0000-0000-000000000001","room_id":"f5000000-0000-0000-0000-0000000000e1"}', true);
set local role authenticated;
insert into seen select 'TV of the room', count(*) from room_messages;
reset role;

-- A phone cannot write, change or delete a message itself.
select set_config('request.jwt.claims', '{"role":"authenticated","kind":"member","member_role":"owner","family_id":"f5000000-0000-0000-0000-000000000001","member_id":"f5000000-0000-0000-0000-00000000000a"}', true);
set local role authenticated;
do $$
begin
  begin
    insert into room_messages (room_id, family_id, member_id, body) values
      ('f5000000-0000-0000-0000-0000000000e1', 'f5000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-00000000000a', 'sneaky');
    raise exception 'a phone wrote a message directly';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from room_messages;
    raise exception 'a phone deleted messages directly';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$
declare r record; expected jsonb := '{"host in the room":2,"family, not in the room":0,"other family":0,"seat in the room":2,"TV of the room":2}';
begin
  for r in select * from seen loop
    if (expected ->> r.who)::int <> r.n then
      raise exception 'chat read: % saw % messages, expected %', r.who, r.n, expected ->> r.who;
    end if;
  end loop;
  if (select count(*) from seen) <> 5 then raise exception 'chat read: a check did not run'; end if;
end $$;

-- Closing the night deletes its chat.
update rooms set status = 'closed', closed_at = now() where id = 'f5000000-0000-0000-0000-0000000000e1';
do $$
begin
  if exists (select 1 from room_messages where room_id = 'f5000000-0000-0000-0000-0000000000e1') then
    raise exception 'chat survived the night closing';
  end if;
end $$;

rollback;
\echo 09_chat: PASS
