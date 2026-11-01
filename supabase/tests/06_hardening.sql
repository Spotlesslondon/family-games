-- Hardening tests (0009). Each check raises on failure.

\set ON_ERROR_STOP on

begin;

insert into families (id, name, code, owner_user_id) values
  ('e0000000-0000-0000-0000-000000000001', 'Family E', 'HHEEEE', gen_random_uuid());
insert into members (id, family_id, display_name, date_of_birth, age_band, role, pin_hash, auth_user_id) values
  ('e0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000001', 'Owner', '1980-01-01', null, 'owner', 'scrypt$x', '7e000000-0000-0000-0000-00000000000a'),
  ('e0000000-0000-0000-0000-00000000000b', 'e0000000-0000-0000-0000-000000000001', 'LinkOnly', null, '9-11', 'member', null, null);

-- 1. PIN attempts: at most five can be in flight; a sixth is refused before
--    any PIN is checked, which is what stops 50 parallel guesses.
do $$
declare r jsonb; i int;
begin
  for i in 1..5 loop
    r := public.pin_attempt_start('e0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000001');
    if r ->> 'status' <> 'try' then raise exception 'attempt % refused early: %', i, r; end if;
    if (r ->> 'attempt')::int <> i then raise exception 'attempt counted as %', r ->> 'attempt'; end if;
  end loop;
  r := public.pin_attempt_start('e0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000001');
  if r ->> 'status' <> 'locked' then raise exception 'sixth attempt in flight was allowed: %', r; end if;
  if r ? 'pin_hash' then raise exception 'a refused attempt was handed the PIN hash'; end if;

  -- The five fail: the fifth failure locks for 15 minutes.
  for i in 1..4 loop
    r := public.pin_attempt_finish('e0000000-0000-0000-0000-00000000000a', false);
  end loop;
  r := public.pin_attempt_finish('e0000000-0000-0000-0000-00000000000a', false);
  if r ->> 'status' <> 'locked' then raise exception 'five failures did not lock: %', r; end if;
  if (r ->> 'until')::timestamptz not between now() + interval '14 minutes' and now() + interval '16 minutes' then
    raise exception 'first lock is not 15 minutes: %', r ->> 'until';
  end if;
  r := public.pin_attempt_start('e0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000001');
  if r ->> 'status' <> 'locked' then raise exception 'locked member could try again: %', r; end if;

  -- Lock runs out; five more failures lock for 30 minutes.
  update members set locked_until = now() - interval '1 second' where id = 'e0000000-0000-0000-0000-00000000000a';
  for i in 1..5 loop
    r := public.pin_attempt_start('e0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000001');
    r := public.pin_attempt_finish('e0000000-0000-0000-0000-00000000000a', false);
  end loop;
  if (r ->> 'until')::timestamptz not between now() + interval '29 minutes' and now() + interval '31 minutes' then
    raise exception 'second lock did not double: %', r ->> 'until';
  end if;

  -- A correct PIN after the lock clears everything.
  update members set locked_until = now() - interval '1 second' where id = 'e0000000-0000-0000-0000-00000000000a';
  r := public.pin_attempt_start('e0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000001');
  r := public.pin_attempt_finish('e0000000-0000-0000-0000-00000000000a', true);
  if exists (select 1 from members where id = 'e0000000-0000-0000-0000-00000000000a'
             and (failed_pins <> 0 or pin_lockouts <> 0 or locked_until is not null)) then
    raise exception 'correct PIN did not reset the counters';
  end if;

  -- A wrong guess reports the tries left.
  r := public.pin_attempt_start('e0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000001');
  r := public.pin_attempt_finish('e0000000-0000-0000-0000-00000000000a', false);
  if (r ->> 'attempts_left')::int <> 4 then raise exception 'tries left reported as %', r ->> 'attempts_left'; end if;

  -- Someone with no PIN, or from another family, can never be tried.
  r := public.pin_attempt_start('e0000000-0000-0000-0000-00000000000b', 'e0000000-0000-0000-0000-000000000001');
  if r ->> 'status' <> 'no_member' then raise exception 'a link-only person could be tried: %', r; end if;
  r := public.pin_attempt_start('e0000000-0000-0000-0000-00000000000a', gen_random_uuid());
  if r ->> 'status' <> 'no_member' then raise exception 'a person was tried under the wrong family: %', r; end if;
end $$;

-- 2. Rate limits count within a window and refuse past the limit.
do $$
begin
  if not public.rate_hit('test:1.2.3.4', 3, 600) then raise exception 'hit 1 refused'; end if;
  if not public.rate_hit('test:1.2.3.4', 3, 600) then raise exception 'hit 2 refused'; end if;
  if not public.rate_hit('test:1.2.3.4', 3, 600) then raise exception 'hit 3 refused'; end if;
  if public.rate_hit('test:1.2.3.4', 3, 600) then raise exception 'hit 4 allowed past a limit of 3'; end if;
  if not public.rate_hit('test:5.6.7.8', 3, 600) then raise exception 'another address was limited too'; end if;
end $$;

-- 3. One open game night per family, opened in one step with its host seated.
do $$
declare r jsonb; n int;
begin
  r := public.open_room('e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000a', 'OPEN', 'lobby');
  select count(*) into n from room_members where room_id = (r ->> 'id')::uuid;
  if n <> 1 then raise exception 'opened room has % people, expected the host', n; end if;
  select count(*) into n from game_events where room_id = (r ->> 'id')::uuid and event_type = 'room_opened';
  if n <> 1 then raise exception 'opened room has no opening event'; end if;
  begin
    perform public.open_room('e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000a', 'TWOO', 'lobby');
    raise exception 'a second open game night was allowed';
  exception when unique_violation then null;
  end;
  select count(*) into n from rooms where code = 'TWOO';
  if n <> 0 then raise exception 'a failed open left a half-made room'; end if;
end $$;

-- 4. Hook: a seat stops counting when its night ends.
do $$
declare v_room uuid; c jsonb;
begin
  select id into v_room from rooms where code = 'OPEN' and family_id = 'e0000000-0000-0000-0000-000000000001';
  insert into seats (room_id, family_id, member_id, auth_user_id)
    values (v_room, 'e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000b', '7e000000-0000-0000-0000-0000000000bb');
  c := public.custom_access_token_hook(jsonb_build_object('user_id', '7e000000-0000-0000-0000-0000000000bb', 'claims', '{"role":"authenticated"}'::jsonb)) -> 'claims';
  if c ->> 'kind' is distinct from 'seat' then raise exception 'seat in an open room got %', c; end if;
  update rooms set status = 'closed', closed_at = now() where id = v_room;
  c := public.custom_access_token_hook(jsonb_build_object('user_id', '7e000000-0000-0000-0000-0000000000bb', 'claims', '{"role":"authenticated"}'::jsonb)) -> 'claims';
  if c ? 'kind' then raise exception 'seat kept access after the night ended: %', c; end if;
end $$;

-- 5. Phones: no Auth ids, no server functions, no writes anywhere.
select set_config('request.jwt.claims',
  '{"role":"authenticated","kind":"member","member_role":"owner","family_id":"e0000000-0000-0000-0000-000000000001","member_id":"e0000000-0000-0000-0000-00000000000a"}', true);
set local role authenticated;

do $$
declare col text; fn text; t text;
begin
  foreach col in array array['families.owner_user_id', 'seats.auth_user_id'] loop
    begin
      execute format('select %s from %s limit 1', split_part(col, '.', 2), split_part(col, '.', 1));
      raise exception 'phone could read %', col;
    exception when insufficient_privilege then null;
    end;
  end loop;

  foreach fn in array array[
    'select public.pin_attempt_start(gen_random_uuid(), gen_random_uuid())',
    'select public.pin_attempt_finish(gen_random_uuid(), true)',
    'select public.rate_hit(''x'', 1, 1)',
    'select public.rate_limits_prune()',
    'select public.open_room(gen_random_uuid(), gen_random_uuid(), ''XXXX'', ''lobby'')',
    'select public.commit_room_turn_v2(gen_random_uuid(), 0, null, ''lobby'', null, ''{}''::jsonb, gen_random_uuid(), ''open'', ''[]''::jsonb)'
  ] loop
    begin
      execute fn;
      raise exception 'phone could run: %', fn;
    exception when insufficient_privilege then null;
    end;
  end loop;

  -- Writes: with Supabase's default grants, only row level security stops a
  -- phone writing. Prove it on every table.
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' loop
    begin
      execute format('delete from public.%I', t);
      -- A delete that matches no rows does not error; check nothing went.
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;

reset role;

do $$
declare n int; t text;
begin
  -- Nothing was deleted by the phone above.
  select count(*) into n from members where family_id = 'e0000000-0000-0000-0000-000000000001';
  if n <> 2 then raise exception 'a phone deleted members (% left)', n; end if;
  select count(*) into n from rooms where family_id = 'e0000000-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'a phone deleted rooms'; end if;

  -- 6. Every table has row level security switched on.
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity loop
    raise exception 'table % has row level security switched off', t;
  end loop;
end $$;

rollback;
\echo 06_hardening: PASS
