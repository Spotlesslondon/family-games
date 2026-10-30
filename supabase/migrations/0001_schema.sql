-- Family Games: core schema.
-- Every table except content_items carries family_id, and row level security
-- scopes every client read to the family in the caller's token.
-- Clients only ever read. All writes go through Route Handlers using the
-- service role, which bypasses RLS, and through commit_room_turn.

create extension if not exists pgcrypto;

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Token claim helpers. Supabase exposes the verified JWT claims through
-- auth.jwt(). Our Route Handlers sign member, screen and owner tokens with
-- these claims: family_id, member_id, kind ('member' | 'screen' | 'owner'),
-- and room_id for screen tokens.
-- ---------------------------------------------------------------------------

create or replace function app.claim(p_name text) returns text
language sql stable as $$
  select nullif(auth.jwt() ->> p_name, '');
$$;

create or replace function app.family_id() returns uuid
language sql stable as $$
  select app.claim('family_id')::uuid;
$$;

create or replace function app.member_id() returns uuid
language sql stable as $$
  select app.claim('member_id')::uuid;
$$;

create or replace function app.token_kind() returns text
language sql stable as $$
  select app.claim('kind');
$$;

create or replace function app.room_id() returns uuid
language sql stable as $$
  select app.claim('room_id')::uuid;
$$;

-- ---------------------------------------------------------------------------
-- Families and members
-- ---------------------------------------------------------------------------

create table families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique check (code ~ '^[A-Z]{6}$'),
  owner_user_id uuid not null,
  created_at timestamptz not null default now()
);

create table members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 40),
  avatar text not null default 'star',
  date_of_birth date not null,
  role text not null default 'member' check (role in ('owner', 'adult', 'member')),
  pin_hash text not null,
  failed_pins int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  unique (family_id, display_name)
);

create index members_family_idx on members (family_id);

create table member_skills (
  member_id uuid not null references members(id) on delete cascade,
  category text not null,
  rating numeric(4,2) not null default 2.5 check (rating between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (member_id, category)
);

create table member_expertise (
  member_id uuid not null references members(id) on delete cascade,
  category text not null,
  primary key (member_id, category)
);

create table devices (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  refresh_token_hash text not null unique,
  push_subscription jsonb,
  push_failures int not null default 0,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index devices_member_idx on devices (member_id);

-- ---------------------------------------------------------------------------
-- Rooms: one sitting. rooms.state is public to the room; room_private holds
-- each member's secret state and is readable only by that member.
-- ---------------------------------------------------------------------------

create table rooms (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  code text not null check (code ~ '^[A-Z]{4}$'),
  host_member_id uuid not null references members(id),
  status text not null default 'open' check (status in ('open', 'closed')),
  current_game text,
  phase text not null default 'lobby',
  phase_ends_at timestamptz,
  state jsonb not null default '{}'::jsonb,
  version int not null default 0,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index rooms_family_status_idx on rooms (family_id, status);
create unique index rooms_open_code_idx on rooms (code) where status = 'open';

create table room_members (
  room_id uuid not null references rooms(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  connected boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (room_id, member_id)
);

create table room_private (
  room_id uuid not null references rooms(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (room_id, member_id)
);

-- One append-only ledger for both layers. room_id or mission_game_id is set,
-- never both. No update or delete policy exists on this table.
create table game_events (
  id bigint generated always as identity primary key,
  family_id uuid not null references families(id) on delete cascade,
  room_id uuid references rooms(id) on delete cascade,
  mission_game_id uuid,
  member_id uuid references members(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (num_nonnulls(room_id, mission_game_id) = 1)
);

create index game_events_family_created_idx on game_events (family_id, created_at);
create index game_events_room_idx on game_events (room_id) where room_id is not null;

-- ---------------------------------------------------------------------------
-- Content bank. family_id null = shared with every family.
-- Never readable by clients: words, missions and questions would be spoiled.
-- ---------------------------------------------------------------------------

create table content_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'quiz_question', 'fake_answers_prompt', 'hot_seat_question', 'word_pair', 'mission'
  )),
  category text,
  age_band text not null check (age_band in ('6-8', '9-11', '12-15', '16+')),
  difficulty int not null default 3 check (difficulty between 1 and 5),
  body jsonb not null,
  family_id uuid references families(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'retired')),
  disputed_count int not null default 0,
  created_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index content_items_pick_idx on content_items (kind, age_band, category, status);

create table content_seen (
  family_id uuid not null references families(id) on delete cascade,
  content_item_id uuid not null references content_items(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (family_id, content_item_id)
);

-- ---------------------------------------------------------------------------
-- Background games: secret missions
-- ---------------------------------------------------------------------------

create table mission_games (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  started_by uuid not null references members(id),
  target int not null default 3 check (target between 1 and 6),
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'finished')),
  created_at timestamptz not null default now()
);

create index mission_games_family_idx on mission_games (family_id, status);

alter table game_events
  add constraint game_events_mission_game_fk
  foreign key (mission_game_id) references mission_games(id) on delete cascade;

create table mission_hands (
  id uuid primary key default gen_random_uuid(),
  mission_game_id uuid not null references mission_games(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  content_item_id uuid not null references content_items(id),
  target_member_id uuid references members(id) on delete set null,
  status text not null default 'held' check (status in (
    'held', 'claimed', 'confirmed', 'denied', 'caught', 'swapped'
  )),
  strikes int not null default 0,
  claimed_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index mission_hands_member_idx on mission_hands (mission_game_id, member_id);

-- ---------------------------------------------------------------------------
-- Scores: written once per game by the server, never by a client.
-- ---------------------------------------------------------------------------

create table scores (
  id bigint generated always as identity primary key,
  family_id uuid not null references families(id) on delete cascade,
  room_id uuid references rooms(id) on delete cascade,
  mission_game_id uuid references mission_games(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  game_kind text not null,
  raw_points numeric(8,2) not null default 0,
  night_points numeric(8,2) not null default 0,
  created_at timestamptz not null default now(),
  check (num_nonnulls(room_id, mission_game_id) = 1)
);

create index scores_family_member_idx on scores (family_id, member_id);
