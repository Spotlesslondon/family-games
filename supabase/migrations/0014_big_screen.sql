-- The big screen joins a night by the same link as the phones (decision of
-- 1 Nov 2026: no separate approval step) and shows who is in the room.
--
-- - A screen may now read the names of the people in its room, like a seat.
-- - A screen's reads, like a seat's, end the moment its night closes or its
--   session runs out (app.screen_live), not when its one-hour token does. The
--   room row itself stays readable so the TV can say "Game night is over".
-- - The token hook only issues screen claims while the night is open.
-- - Closing a night ends its screen sessions too.

create or replace function app.screen_live() returns boolean
language sql stable security definer
set search_path = public, app, pg_temp
as $$
  select exists (
    select 1
      from public.screen_sessions s
      join public.rooms r on r.id = s.room_id and r.status = 'open'
     where s.auth_user_id = (app.claim('sub'))::uuid
       and s.room_id = app.room_id()
       and s.expires_at > now()
  );
$$;
revoke all on function app.screen_live() from public;
grant execute on function app.screen_live() to authenticated;

drop policy room_members_read on room_members;
create policy room_members_read on room_members for select
  using (
    ((select app.token_kind()) in ('member', 'owner') and family_id = (select app.family_id()))
    or ((select app.token_kind()) = 'screen' and room_id = (select app.room_id()) and (select app.screen_live()))
    or ((select app.token_kind()) = 'seat' and room_id = (select app.room_id()) and (select app.seat_live()))
  );

drop policy members_read on members;
create policy members_read on members for select
  using (
    ((select app.token_kind()) in ('member', 'owner') and family_id = (select app.family_id()))
    or ((select app.token_kind()) = 'seat' and (select app.seat_live())
        and id in (select rm.member_id from room_members rm where rm.room_id = (select app.room_id())))
    or ((select app.token_kind()) = 'screen' and (select app.screen_live())
        and id in (select rm.member_id from room_members rm where rm.room_id = (select app.room_id())))
  );

create or replace function app.release_seats_on_close() returns trigger
language plpgsql
set search_path = public, app, pg_temp
as $$
begin
  update seats set released_at = now() where room_id = new.id and released_at is null;
  update screen_sessions set expires_at = now() where room_id = new.id and expires_at > now();
  return new;
end $$;

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = public, app, pg_temp
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

  -- A big screen counts only while its night is open (0014).
  select ss.room_id, ss.family_id
    into s
    from public.screen_sessions ss
    join public.rooms r on r.id = ss.room_id and r.status = 'open'
   where ss.auth_user_id = v_user
     and ss.expires_at > now();

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
