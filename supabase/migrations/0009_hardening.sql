-- Hardening after the independent review of 1 Nov 2026. Each block names the
-- finding it closes. Every function here runs only for the server
-- (service_role); phones cannot call them.

-- ---------------------------------------------------------------------------
-- 1. PIN guessing. Before: the server read failed_pins and wrote failed+1 in
--    two steps, so 50 guesses sent at once all read 0 and the lock never
--    triggered; and the lock was always 15 minutes. Now each attempt is
--    counted in ONE statement before the PIN is checked, at most 5 can be in
--    flight, and each lockout doubles (15 min, 30, 60 ... capped at 24 hours)
--    until a correct PIN resets it.
-- ---------------------------------------------------------------------------

alter table members add column pin_lockouts int not null default 0;

create or replace function public.pin_attempt_start(p_member uuid, p_family uuid)
returns jsonb
language plpgsql
as $$
declare r record;
begin
  update members
     set failed_pins = failed_pins + 1
   where id = p_member
     and family_id = p_family
     and pin_hash is not null
     and (locked_until is null or locked_until <= now())
     and failed_pins < 5
  returning id, display_name, role, pin_hash, failed_pins into r;

  if found then
    return jsonb_build_object('status', 'try', 'pin_hash', r.pin_hash, 'attempt', r.failed_pins,
                              'name', r.display_name, 'role', r.role);
  end if;

  select locked_until, pin_hash into r from members where id = p_member and family_id = p_family;
  if not found or r.pin_hash is null then
    return jsonb_build_object('status', 'no_member');
  end if;
  -- Locked, or five attempts already in flight: both are a lock to the caller.
  return jsonb_build_object('status', 'locked',
                            'until', coalesce(r.locked_until, now() + interval '1 minute'));
end $$;

create or replace function public.pin_attempt_finish(p_member uuid, p_correct boolean)
returns jsonb
language plpgsql
as $$
declare r record;
begin
  if p_correct then
    update members set failed_pins = 0, pin_lockouts = 0, locked_until = null where id = p_member;
    return jsonb_build_object('status', 'ok');
  end if;

  update members
     set locked_until = case when failed_pins >= 5
                             then now() + least(interval '15 minutes' * power(2, pin_lockouts), interval '24 hours')
                             else locked_until end,
         pin_lockouts = case when failed_pins >= 5 then pin_lockouts + 1 else pin_lockouts end,
         failed_pins  = case when failed_pins >= 5 then 0 else failed_pins end
   where id = p_member
  returning locked_until, failed_pins into r;

  if r.locked_until is not null and r.locked_until > now() then
    return jsonb_build_object('status', 'locked', 'until', r.locked_until);
  end if;
  return jsonb_build_object('status', 'wrong', 'attempts_left', greatest(5 - r.failed_pins, 0));
end $$;

-- ---------------------------------------------------------------------------
-- 2. No rate limits anywhere. A small fixed-window counter keyed by whatever
--    the server chooses (for example route plus the visitor's address).
-- ---------------------------------------------------------------------------

create table rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);
alter table rate_limits enable row level security; -- no policies: server only

create or replace function public.rate_hit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n int;
begin
  insert into rate_limits (key, window_start, hits) values (p_key, w, 1)
  on conflict (key, window_start) do update set hits = rate_limits.hits + 1
  returning hits into n;
  return n <= p_limit;
end $$;

-- Old windows are cleared by the daily keepalive.
create or replace function public.rate_limits_prune()
returns int
language sql
as $$
  with gone as (delete from rate_limits where window_start < now() - interval '1 day' returning 1)
  select count(*)::int from gone;
$$;

-- ---------------------------------------------------------------------------
-- 3. Duplicate game nights. Two taps at once could open two rooms; after that
--    every lookup failed and every tap opened another. Now the database allows
--    one open room per family, and opening is one all-or-nothing step.
-- ---------------------------------------------------------------------------

create unique index rooms_one_open_per_family on rooms (family_id) where status = 'open';

create or replace function public.open_room(p_family uuid, p_host uuid, p_code text, p_phase text)
returns jsonb
language plpgsql
as $$
declare v_room uuid;
begin
  insert into rooms (family_id, code, host_member_id, phase)
  values (p_family, p_code, p_host, p_phase)
  returning id into v_room;
  insert into room_members (room_id, member_id, family_id) values (v_room, p_host, p_family);
  insert into game_events (family_id, room_id, member_id, event_type, payload)
  values (p_family, v_room, p_host, 'room_opened', jsonb_build_object('code', p_code));
  return jsonb_build_object('id', v_room, 'code', p_code);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Token hook. (a) A lockout now only stops NEW PIN sign-ins; it no longer
--    strips a signed-in person's claims, so five wrong guesses by someone else
--    cannot throw the host out mid-game. (b) A seat only counts while its room
--    is open, so a phone loses access when the night ends.
-- ---------------------------------------------------------------------------

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_user uuid := (event ->> 'user_id')::uuid;
  v_claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  m record;
  s record;
  t record;
begin
  -- Never trust custom claims arriving on the event; rebuild them here.
  v_claims := v_claims - 'kind' - 'family_id' - 'member_id' - 'member_role' - 'room_id';

  select id, family_id, role
    into m
    from public.members
   where auth_user_id = v_user;

  if found then
    v_claims := v_claims || jsonb_build_object(
      'kind', 'member',
      'family_id', m.family_id,
      'member_id', m.id,
      'member_role', m.role
    );
    return jsonb_set(event, '{claims}', v_claims);
  end if;

  select room_id, family_id
    into s
    from public.screen_sessions
   where auth_user_id = v_user
     and expires_at > now();

  if found then
    v_claims := v_claims || jsonb_build_object(
      'kind', 'screen',
      'family_id', s.family_id,
      'room_id', s.room_id
    );
    return jsonb_set(event, '{claims}', v_claims);
  end if;

  select st.room_id, st.family_id, st.member_id
    into t
    from public.seats st
    join public.rooms r on r.id = st.room_id and r.status = 'open'
   where st.auth_user_id = v_user
     and st.released_at is null
   order by st.claimed_at desc
   limit 1;

  if found then
    v_claims := v_claims || jsonb_build_object(
      'kind', 'seat',
      'family_id', t.family_id,
      'room_id', t.room_id,
      'member_id', t.member_id
    );
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

grant select on public.rooms to supabase_auth_admin;
create policy rooms_auth_hook_read on rooms as permissive for select
  to supabase_auth_admin using (true);

-- ---------------------------------------------------------------------------
-- 5. Ids phones never need. Hide the owner's Auth id and each seat's Auth id.
-- ---------------------------------------------------------------------------

revoke select on public.families from anon, authenticated;
grant select (id, name, code, created_at) on public.families to authenticated;

revoke select on public.seats from anon, authenticated;
grant select (id, room_id, family_id, member_id, claimed_at, released_at) on public.seats to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Indexes on references to people, so history lookups and any future
--    erasure stay fast as the history tables grow.
-- ---------------------------------------------------------------------------

create index if not exists room_members_member_idx on room_members (member_id);
create index if not exists room_private_member_idx on room_private (member_id);
create index if not exists game_events_member_idx on game_events (member_id) where member_id is not null;
create index if not exists seats_member_idx on seats (member_id);
create index if not exists scores_room_idx on scores (room_id) where room_id is not null;
create index if not exists rooms_host_idx on rooms (host_member_id);
create index if not exists mission_games_started_by_idx on mission_games (started_by);
create index if not exists screen_sessions_approved_by_idx on screen_sessions (approved_by);

-- ---------------------------------------------------------------------------
-- Server only.
-- ---------------------------------------------------------------------------

revoke all on function public.pin_attempt_start(uuid, uuid) from public, anon, authenticated;
revoke all on function public.pin_attempt_finish(uuid, boolean) from public, anon, authenticated;
revoke all on function public.rate_hit(text, int, int) from public, anon, authenticated;
revoke all on function public.rate_limits_prune() from public, anon, authenticated;
revoke all on function public.open_room(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.pin_attempt_start(uuid, uuid) to service_role;
grant execute on function public.pin_attempt_finish(uuid, boolean) to service_role;
grant execute on function public.rate_hit(text, int, int) to service_role;
grant execute on function public.rate_limits_prune() to service_role;
grant execute on function public.open_room(uuid, uuid, text, text) to service_role;
