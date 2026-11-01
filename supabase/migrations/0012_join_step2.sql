-- Join model, step 2: phones join a night by link and name, without a login.
--
-- - Guests: someone who taps the link but is not on the host's list joins with
--   a name and an age band. They become a person on the host's account marked
--   as a guest, so the host can save them to a list later (or not).
-- - Leaving or being removed releases that phone's seat in the same database
--   step (a trigger on room_members), so a removed phone loses access at once.
-- - open_room now also sets the night's 6-digit join code and the list it was
--   started from. The old four-argument call keeps working (defaults).

alter table members add column is_guest boolean not null default false;

create or replace function app.release_seat_on_leave() returns trigger
language plpgsql
set search_path = public, app, pg_temp
as $$
begin
  update seats
     set released_at = now()
   where room_id = old.room_id
     and member_id = old.member_id
     and released_at is null;
  return old;
end $$;

create trigger room_members_release_seat after delete on room_members
  for each row execute function app.release_seat_on_leave();

drop function public.open_room(uuid, uuid, text, text);

create function public.open_room(
  p_family uuid,
  p_host uuid,
  p_code text,
  p_phase text,
  p_join_code text default null,
  p_list_id uuid default null
)
returns jsonb
language plpgsql
set search_path = public, app, pg_temp
as $$
declare v_room uuid;
begin
  insert into rooms (family_id, code, host_member_id, phase, join_code, list_id)
  values (p_family, p_code, p_host, p_phase, p_join_code, p_list_id)
  returning id into v_room;
  insert into room_members (room_id, member_id, family_id) values (v_room, p_host, p_family);
  insert into game_events (family_id, room_id, member_id, event_type, payload)
  values (p_family, v_room, p_host, 'room_opened', jsonb_build_object('code', p_code));
  return jsonb_build_object('id', v_room, 'code', p_code, 'join_code', p_join_code);
end $$;

revoke all on function public.open_room(uuid, uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.open_room(uuid, uuid, text, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- A seat's reads end the moment its seat does.
--
-- A seat's access token carries its room for up to an hour. Without this, a
-- phone removed by the host (or that left) could still read the room until
-- that token ran out. Each seat rule now also asks: is this phone's seat still
-- live, in an open room? Evaluated once per query (select-wrapped).
-- ---------------------------------------------------------------------------

create or replace function app.seat_live() returns boolean
language sql stable security definer
set search_path = public, app, pg_temp
as $$
  select exists (
    select 1
      from public.seats s
      join public.rooms r on r.id = s.room_id and r.status = 'open'
     where s.auth_user_id = (app.claim('sub'))::uuid
       and s.room_id = app.room_id()
       and s.member_id = app.member_id()
       and s.released_at is null
  );
$$;
revoke all on function app.seat_live() from public;
grant execute on function app.seat_live() to authenticated;

-- rooms keeps its 0010 rule on purpose: a phone that has just been removed,
-- or whose night has closed, can still read the room row itself (code, host,
-- status; no names or secrets) until its token runs out. That is how its
-- screen learns "you are out" or "the night is over" from the live update,
-- instead of freezing on a lobby it can no longer see.

drop policy room_members_read on room_members;
create policy room_members_read on room_members for select
  using (
    ((select app.token_kind()) in ('member', 'owner') and family_id = (select app.family_id()))
    or ((select app.token_kind()) = 'screen' and room_id = (select app.room_id()))
    or ((select app.token_kind()) = 'seat' and room_id = (select app.room_id()) and (select app.seat_live()))
  );

drop policy room_private_read on room_private;
create policy room_private_read on room_private for select
  using (
    member_id = (select app.member_id())
    and (
      (select app.token_kind()) = 'member'
      or ((select app.token_kind()) = 'seat' and room_id = (select app.room_id()) and (select app.seat_live()))
    )
  );

drop policy members_read on members;
create policy members_read on members for select
  using (
    ((select app.token_kind()) in ('member', 'owner') and family_id = (select app.family_id()))
    or ((select app.token_kind()) = 'seat' and (select app.seat_live())
        and id in (select rm.member_id from room_members rm where rm.room_id = (select app.room_id())))
  );
