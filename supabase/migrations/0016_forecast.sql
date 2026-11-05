-- The Family Forecast, version 0 (Joshua, 4 Nov 2026: "This will be our main
-- game"; 5 Nov: "build it all"). Concept: claude/family-forecast-v0.md.
--
-- A Forecast runs in the background of a game night: it never takes the
-- room's one game slot, so any foreground game can start, switch or end while
-- it runs. Rules the database holds:
--  * Only people in that night's room (and its TV) read it.
--  * A locked call is private: until its card settles, a player reads only
--    their own call. Once settled, everyone in the room sees every call.
--  * Phones never write here directly: calls, claims and rulings go through
--    the server, which checks who may do what.
--  * Closing the night finishes the Forecast. A night with a live Forecast is
--    not closed for being idle until the Forecast is 24 hours old.

create table forecasts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  host_member_id uuid not null references members(id) on delete cascade,
  -- Optional: someone the host names to rule on cards (can be a child).
  presenter_member_id uuid references members(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'finished')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index forecasts_room_idx on forecasts (room_id);
create index forecasts_family_idx on forecasts (family_id);
create index forecasts_host_idx on forecasts (host_member_id);
create index forecasts_presenter_idx on forecasts (presenter_member_id);
-- One live Forecast per night.
create unique index forecasts_one_open_per_room on forecasts (room_id) where status = 'open';

create table forecast_players (
  forecast_id uuid not null references forecasts(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  primary key (forecast_id, member_id)
);
create index forecast_players_member_idx on forecast_players (member_id);
create index forecast_players_family_idx on forecast_players (family_id);

create table forecast_cards (
  id uuid primary key default gen_random_uuid(),
  forecast_id uuid not null references forecasts(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  card_key text not null check (char_length(card_key) between 1 and 20),
  text text not null check (char_length(text) between 1 and 200),
  kind text not null check (kind in ('person', 'yesno')),
  position int not null,
  status text not null default 'open' check (status in ('open', 'claimed', 'settled')),
  -- Who tapped "It happened", for the host or presenter to rule on.
  claimed_by uuid references members(id) on delete set null,
  claimed_at timestamptz,
  -- The outcome: a member id (person card) or 'yes' / 'no'.
  outcome text,
  settled_by uuid references members(id) on delete set null,
  settled_at timestamptz,
  -- Points per member for this card, written when it settles.
  points jsonb not null default '{}'::jsonb,
  unique (forecast_id, position)
);
create index forecast_cards_family_idx on forecast_cards (family_id);
create index forecast_cards_claimed_idx on forecast_cards (claimed_by);
create index forecast_cards_settled_by_idx on forecast_cards (settled_by);

create table forecast_calls (
  card_id uuid not null references forecast_cards(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  forecast_id uuid not null references forecasts(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  -- A member id (person card) or 'yes' / 'no'.
  call text not null check (char_length(call) between 2 and 40),
  created_at timestamptz not null default now(),
  primary key (card_id, member_id)
);
create index forecast_calls_member_idx on forecast_calls (member_id);
create index forecast_calls_forecast_idx on forecast_calls (forecast_id);
create index forecast_calls_family_idx on forecast_calls (family_id);

alter table forecasts enable row level security;
alter table forecast_players enable row level security;
alter table forecast_cards enable row level security;
alter table forecast_calls enable row level security;

revoke all on forecasts, forecast_players, forecast_cards, forecast_calls from anon, authenticated;
grant select on forecasts, forecast_players, forecast_cards, forecast_calls to authenticated;

-- Who is in a night's room: a signed-in member with a seat in room_members, a
-- guest's seat token for that room, or that room's TV.
create or replace function app.in_room(p_room uuid) returns boolean
language sql stable
set search_path = public, app, pg_temp
as $$
  select
    (app.token_kind() in ('member', 'owner') and exists (
      select 1 from room_members rm where rm.room_id = p_room and rm.member_id = app.member_id()))
    or (app.token_kind() in ('seat', 'screen') and app.room_id() = p_room)
$$;

create policy forecasts_room_read on forecasts for select
  using (family_id = app.family_id() and app.in_room(room_id));

create policy forecast_players_room_read on forecast_players for select
  using (exists (select 1 from forecasts f where f.id = forecast_id and f.family_id = app.family_id() and app.in_room(f.room_id)));

create policy forecast_cards_room_read on forecast_cards for select
  using (exists (select 1 from forecasts f where f.id = forecast_id and f.family_id = app.family_id() and app.in_room(f.room_id)));

-- A locked call: only its owner, until the card settles.
create policy forecast_calls_read on forecast_calls for select
  using (
    exists (select 1 from forecasts f where f.id = forecast_id and f.family_id = app.family_id() and app.in_room(f.room_id))
    and (
      member_id = app.member_id()
      or exists (select 1 from forecast_cards c where c.id = card_id and c.status = 'settled')
    )
  );

-- Closing the night finishes its Forecast.
create or replace function app.finish_forecast_on_close() returns trigger
language plpgsql
set search_path = public, app, pg_temp
as $$
begin
  update forecasts set status = 'finished', finished_at = now() where room_id = new.id and status = 'open';
  return new;
end $$;

create trigger rooms_close_finishes_forecast after update of status on rooms
  for each row when (new.status = 'closed' and old.status is distinct from 'closed')
  execute function app.finish_forecast_on_close();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table forecasts, forecast_cards, forecast_calls;
  end if;
end $$;
