-- Phones read names and roles, never PINs or lock state. Run after 0007.

\set ON_ERROR_STOP on

begin;

insert into families (id, name, code, owner_user_id) values
  ('cccccccc-0000-0000-0000-000000000001', 'Family C', 'CCCCCC', gen_random_uuid());
insert into members (id, family_id, display_name, date_of_birth, role, pin_hash) values
  ('cccccccc-0000-0000-0000-00000000000a', 'cccccccc-0000-0000-0000-000000000001', 'Cara', '1980-01-01', 'owner', 'scrypt$secret'),
  ('cccccccc-0000-0000-0000-00000000000b', 'cccccccc-0000-0000-0000-000000000001', 'Cub', '2017-01-01', 'member', 'scrypt$secret');

select set_config('request.jwt.claims',
  '{"kind":"member","family_id":"cccccccc-0000-0000-0000-000000000001","member_id":"cccccccc-0000-0000-0000-00000000000b"}', true);
set local role authenticated;

-- 1. The columns the app uses still read, and the child sees both names.
do $$
declare n int;
begin
  select count(*) into n from (select id, display_name, role, created_at from members) s;
  if n <> 2 then raise exception 'child sees % members, expected 2', n; end if;
end $$;

-- 2. Every secret column is refused.
do $$
declare col text;
begin
  foreach col in array array['pin_hash', 'failed_pins', 'locked_until', 'auth_user_id', 'date_of_birth'] loop
    begin
      execute format('select %I from members limit 1', col);
      raise exception 'phone could read members.%', col;
    exception when insufficient_privilege then
      null; -- refused, as it should be
    end;
  end loop;
end $$;

-- 3. select * is refused too, so no future screen can leak by accident.
do $$
begin
  begin
    perform * from members limit 1;
    raise exception 'phone could select * from members';
  exception when insufficient_privilege then
    null;
  end;
end $$;

rollback;
\echo 04_member_columns: PASS
