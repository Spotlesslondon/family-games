-- Row level security. Clients hold a member, screen or owner token and may
-- only read. Every write happens server-side under the service role.

alter table families enable row level security;
alter table members enable row level security;
alter table member_skills enable row level security;
alter table member_expertise enable row level security;
alter table devices enable row level security;
alter table rooms enable row level security;
alter table room_members enable row level security;
alter table room_private enable row level security;
alter table game_events enable row level security;
alter table content_items enable row level security;
alter table content_seen enable row level security;
alter table mission_games enable row level security;
alter table mission_hands enable row level security;
alter table scores enable row level security;

-- A member or owner token: everything in its own family that is not secret.

create policy families_read on families for select
  using (app.token_kind() in ('member', 'owner') and id = app.family_id());

create policy members_read on members for select
  using (app.token_kind() in ('member', 'owner') and family_id = app.family_id());

create policy member_expertise_read on member_expertise for select
  using (
    app.token_kind() in ('member', 'owner')
    and member_id in (select id from members where family_id = app.family_id())
  );

-- Skill ratings are the member's own business, and the owner's.
create policy member_skills_read on member_skills for select
  using (
    (app.token_kind() = 'member' and member_id = app.member_id())
    or (app.token_kind() = 'owner'
        and member_id in (select id from members where family_id = app.family_id()))
  );

create policy rooms_read on rooms for select
  using (
    (app.token_kind() in ('member', 'owner') and family_id = app.family_id())
    or (app.token_kind() = 'screen' and id = app.room_id())
  );

create policy room_members_read on room_members for select
  using (
    (app.token_kind() in ('member', 'owner') and family_id = app.family_id())
    or (app.token_kind() = 'screen' and room_id = app.room_id())
  );

-- The security boundary: private state is readable by its own member only.
create policy room_private_read on room_private for select
  using (app.token_kind() = 'member' and member_id = app.member_id());

create policy mission_games_read on mission_games for select
  using (app.token_kind() in ('member', 'owner') and family_id = app.family_id());

create policy mission_hands_read on mission_hands for select
  using (app.token_kind() = 'member' and member_id = app.member_id());

create policy scores_read on scores for select
  using (app.token_kind() in ('member', 'owner') and family_id = app.family_id());

-- No client policy at all on: devices, game_events, content_items, content_seen.
-- They are reachable only through the service role.

-- Realtime: phones and the big screen subscribe to rooms and room_members.
-- Supabase filters change events through the same policies above.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table rooms, room_members, room_private;
  end if;
end $$;
