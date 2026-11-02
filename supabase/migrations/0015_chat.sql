-- Chat inside a game night (Joshua, 2 Nov 2026 22:30: "Chat is needed for
-- socialising when not in the same room"). Plan: claude/chat-room-plan-v0.md.
--
-- Rules the database holds:
--  * Only people in that night's room read its messages (and its TV screen).
--    Not the rest of the family, not another family.
--  * Phones never write here directly: every message goes through the server,
--    which checks the length, the word filter, the rate limit and the host's
--    chat setting.
--  * Messages are deleted the moment the night closes. Never kept in the game
--    history ledger.

create table room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  -- Exactly one of: typed text, or the key of a quick reply.
  body text check (body is null or char_length(body) between 1 and 120),
  quick text check (quick is null or char_length(quick) between 1 and 20),
  created_at timestamptz not null default now(),
  check ((body is null) <> (quick is null))
);

create index room_messages_room_idx on room_messages (room_id, created_at);
create index room_messages_family_idx on room_messages (family_id);
create index room_messages_member_idx on room_messages (member_id);

alter table room_messages enable row level security;

-- Read only. No insert, update or delete policy: writes are server-side only.
revoke all on room_messages from anon, authenticated;
grant select on room_messages to authenticated;

create policy room_messages_member_read on room_messages for select
  using (
    app.token_kind() in ('member', 'owner')
    and family_id = app.family_id()
    and exists (
      select 1 from room_members rm
      where rm.room_id = room_messages.room_id and rm.member_id = app.member_id()
    )
  );

create policy room_messages_seat_read on room_messages for select
  using (app.token_kind() = 'seat' and room_id = app.room_id());

create policy room_messages_screen_read on room_messages for select
  using (app.token_kind() = 'screen' and room_id = app.room_id());

-- The host's chat setting for the night. Null: automatic (quick replies only
-- while a child is in the room, typing otherwise).
alter table rooms add column chat_mode text check (chat_mode in ('typed', 'quick', 'off'));

-- Closing a night deletes its chat.
create or replace function app.delete_chat_on_close() returns trigger
language plpgsql
set search_path = public, app, pg_temp
as $$
begin
  delete from room_messages where room_id = new.id;
  return new;
end $$;

create trigger rooms_close_deletes_chat after update of status on rooms
  for each row when (new.status = 'closed' and old.status is distinct from 'closed')
  execute function app.delete_chat_on_close();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table room_messages;
  end if;
end $$;
