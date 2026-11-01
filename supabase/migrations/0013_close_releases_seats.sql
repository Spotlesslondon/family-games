-- Closing a night releases every seat in it, so the seats table says plainly
-- who still holds access (nobody, once a night is over). Access already ended
-- at close (the token hook and app.seat_live both require an open room); this
-- keeps the record tidy and makes "live seats" mean what it says.
--
-- Guests are marked on the host's screen, so phones may read members.is_guest
-- (the same rows they could already read; one more yes/no column).

create or replace function app.release_seats_on_close() returns trigger
language plpgsql
set search_path = public, app, pg_temp
as $$
begin
  update seats set released_at = now() where room_id = new.id and released_at is null;
  return new;
end $$;

create trigger rooms_close_releases_seats after update of status on rooms
  for each row when (new.status = 'closed' and old.status is distinct from 'closed')
  execute function app.release_seats_on_close();

grant select (is_guest) on members to authenticated;
