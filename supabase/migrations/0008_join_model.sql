-- Join model (Joshua, 1 Nov 2026): only the host signs in. Players tap a link,
-- then tap their name. See claude/decision-join-model.md in the project.
--
-- Additive: everything the live app uses today keeps working.
--
-- - members are now the host's PEOPLE. A PIN is needed only by those who sign
--   in (the host). A person saved from a guest may have an age band instead of
--   a date of birth.
-- - lists: named groups of people that mirror the host's WhatsApp groups. A
--   person can be on several lists and keeps one score history.
-- - rooms get a 6-digit join code (live only while open and unlocked),
--   locked_at, last_activity_at and the list they were started from.
-- - seats: a phone (an anonymous Supabase Auth user) sitting as a person in a
--   room. One phone per person per room, one person per phone per room.
-- - The token hook gives a seated phone kind = seat with its family, room and
--   person. Row level security lets a seat read its own room and nothing else.

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

alter table members alter column pin_hash drop not null;
alter table members alter column date_of_birth drop not null;
alter table members add column age_band text
  check (age_band in ('6-8', '9-11', '12-15', '16+'));
alter table members add constraint members_age_known
  check (date_of_birth is not null or age_band is not null);
-- Anyone who signs in must have a PIN.
alter table members add constraint members_sign_in_needs_pin
  check (auth_user_id is null or pin_hash is not null);

-- Lets lists and seats prove a person belongs to the same family.
alter table members add constraint members_id_family_key unique (id, family_id);

-- ---------------------------------------------------------------------------
-- Lists
-- ---------------------------------------------------------------------------

create table lists (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null check (length(name) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (family_id, name),
  unique (id, family_id)
);

create table list_people (
  list_id uuid not null,
  member_id uuid not null,
  family_id uuid not null,
  added_at timestamptz not null default now(),
  primary key (list_id, member_id),
  foreign key (list_id, family_id) references lists(id, family_id) on delete cascade,
  foreign key (member_id, family_id) references members(id, family_id) on delete cascade
);

create index list_people_member_idx on list_people (member_id);

-- ---------------------------------------------------------------------------
-- Rooms
-- ---------------------------------------------------------------------------

alter table rooms add column join_code text check (join_code ~ '^[0-9]{6}$');
alter table rooms add column locked_at timestamptz;
alter table rooms add column last_activity_at timestamptz not null default now();
alter table rooms add column list_id uuid;
alter table rooms add constraint rooms_list_fk
  foreign key (list_id, family_id) references lists(id, family_id) on delete set null (list_id);
alter table rooms add constraint rooms_id_family_key unique (id, family_id);

-- A code can be reused once the night it opened has ended or been locked.
create unique index rooms_live_join_code_idx on rooms (join_code)
  where status = 'open' and locked_at is null and join_code is not null;

-- Any change to a room is activity; the 30 minute close reads this.
create or replace function app.touch_room() returns trigger
language plpgsql as $$
begin
  new.last_activity_at := now();
  return new;
end $$;

create trigger rooms_touch before update on rooms
  for each row execute function app.touch_room();

-- ---------------------------------------------------------------------------
-- Seats
-- ---------------------------------------------------------------------------

create table seats (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  family_id uuid not null,
  member_id uuid not null,
  auth_user_id uuid not null,
  claimed_at timestamptz not null default now(),
  released_at timestamptz,
  foreign key (room_id, family_id) references rooms(id, family_id) on delete cascade,
  foreign key (member_id, family_id) references members(id, family_id) on delete cascade
);

-- One phone per person, and one person per phone, in a room at a time.
create unique index seats_person_once_idx on seats (room_id, member_id) where released_at is null;
create unique index seats_phone_once_idx on seats (room_id, auth_user_id) where released_at is null;
create index seats_auth_user_idx on seats (auth_user_id) where released_at is null;

-- ---------------------------------------------------------------------------
-- Read rules. No client may write; the server does every write.
-- ---------------------------------------------------------------------------

alter table lists enable row level security;
alter table list_people enable row level security;
alter table seats enable row level security;

-- The host and the rest of the signed-in family see their lists.
create policy lists_read on lists for select
  using (app.token_kind() in ('member', 'owner') and family_id = app.family_id());
create policy list_people_read on list_people for select
  using (app.token_kind() in ('member', 'owner') and family_id = app.family_id());

-- Seats: the family sees its seats; a seated phone sees the seats in its room.
create policy seats_read on seats for select
  using (
    (app.token_kind() in ('member', 'owner') and family_id = app.family_id())
    or (app.token_kind() = 'seat' and room_id = app.room_id())
  );

-- A seated phone reads its own room, who is in it, and their names only.
create policy rooms_seat_read on rooms for select
  using (app.token_kind() = 'seat' and id = app.room_id());
create policy room_members_seat_read on room_members for select
  using (app.token_kind() = 'seat' and room_id = app.room_id());
create policy members_seat_read on members for select
  using (
    app.token_kind() = 'seat'
    and id in (select member_id from room_members where room_id = app.room_id())
  );
-- Its own secret state, in its own room only.
create policy room_private_seat_read on room_private for select
  using (app.token_kind() = 'seat' and member_id = app.member_id() and room_id = app.room_id());

grant select on public.lists, public.list_people, public.seats to authenticated;
revoke select on public.lists, public.list_people, public.seats from anon;

-- ---------------------------------------------------------------------------
-- Token hook: members first, then screens, then seats.
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

  select id, family_id, role, locked_until
    into m
    from public.members
   where auth_user_id = v_user;

  if found then
    if m.locked_until is null or m.locked_until <= now() then
      v_claims := v_claims || jsonb_build_object(
        'kind', 'member',
        'family_id', m.family_id,
        'member_id', m.id,
        'member_role', m.role
      );
    end if;
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

  select room_id, family_id, member_id
    into t
    from public.seats
   where auth_user_id = v_user
     and released_at is null
   order by claimed_at desc
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

grant select on public.seats to supabase_auth_admin;
create policy seats_auth_hook_read on seats as permissive for select
  to supabase_auth_admin using (true);
