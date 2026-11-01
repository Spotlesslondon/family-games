-- From the Supabase security and performance advisors, 1 Nov 2026.
--
-- 1. Function Search Path Mutable (13 warnings). Fix every function's
--    search_path, with pg_temp last, so no object created later in another
--    schema can stand in for a table these functions use.
-- 2. Multiple Permissive Policies (20 warnings). rooms, room_members,
--    room_private and members each had a family rule and a separate seat
--    rule, so every read evaluated both. Each pair becomes one rule with the
--    same meaning. The claim helpers are wrapped in (select ...) so Postgres
--    reads the token once per query instead of once per row.
--
-- Not changed, by design: "Anonymous Sign-Ins Allowed" (14 warnings).
-- Anonymous phones share the authenticated role, but every rule also needs a
-- kind claim that only the token hook grants (member, owner, screen, seat).
-- 05_join_model.sql proves an unseated anonymous phone reads nothing; the same
-- was checked on the live database on 1 Nov 2026.

alter function app.claim(text) set search_path = public, app, pg_temp;
alter function app.family_id() set search_path = public, app, pg_temp;
alter function app.member_id() set search_path = public, app, pg_temp;
alter function app.member_role() set search_path = public, app, pg_temp;
alter function app.room_id() set search_path = public, app, pg_temp;
alter function app.token_kind() set search_path = public, app, pg_temp;
alter function app.touch_room() set search_path = public, app, pg_temp;
alter function public.custom_access_token_hook(jsonb) set search_path = public, app, pg_temp;
alter function public.pin_attempt_start(uuid, uuid) set search_path = public, app, pg_temp;
alter function public.pin_attempt_finish(uuid, boolean) set search_path = public, app, pg_temp;
alter function public.rate_hit(text, int, int) set search_path = public, app, pg_temp;
alter function public.rate_limits_prune() set search_path = public, app, pg_temp;
alter function public.open_room(uuid, uuid, text, text) set search_path = public, app, pg_temp;

-- rooms
drop policy rooms_read on rooms;
drop policy rooms_seat_read on rooms;
create policy rooms_read on rooms for select
  using (
    ((select app.token_kind()) in ('member', 'owner') and family_id = (select app.family_id()))
    or ((select app.token_kind()) in ('screen', 'seat') and id = (select app.room_id()))
  );

-- room_members
drop policy room_members_read on room_members;
drop policy room_members_seat_read on room_members;
create policy room_members_read on room_members for select
  using (
    ((select app.token_kind()) in ('member', 'owner') and family_id = (select app.family_id()))
    or ((select app.token_kind()) in ('screen', 'seat') and room_id = (select app.room_id()))
  );

-- room_private: a player's own secret only; a seat only in its own room.
drop policy room_private_read on room_private;
drop policy room_private_seat_read on room_private;
create policy room_private_read on room_private for select
  using (
    member_id = (select app.member_id())
    and (
      (select app.token_kind()) = 'member'
      or ((select app.token_kind()) = 'seat' and room_id = (select app.room_id()))
    )
  );

-- members: the signed-in family sees its people; a seat sees only the names
-- of the people in its room.
drop policy members_read on members;
drop policy members_seat_read on members;
create policy members_read on members for select
  using (
    ((select app.token_kind()) in ('member', 'owner') and family_id = (select app.family_id()))
    or ((select app.token_kind()) = 'seat'
        and id in (select rm.member_id from room_members rm where rm.room_id = (select app.room_id())))
  );
