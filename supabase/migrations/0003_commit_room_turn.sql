-- commit_room_turn: the only way a turn reaches the database.
--
-- One transaction: lock the room row, check the version the handler read is
-- still current, write private state and events first, update the public
-- room row last (Realtime broadcasts on that row, so by the time a phone sees
-- the new phase its private state is already in place).
--
-- Raises 'version_conflict' when another turn landed first. Nothing is
-- written in that case; the handler re-reads and re-applies.
--
-- p_private: [{ "member_id": uuid, "state": {...} }, ...]
-- p_events:  [{ "member_id": uuid | null, "event_type": text, "payload": {...} }, ...]

create or replace function public.commit_room_turn(
  p_room_id uuid,
  p_expected_version int,
  p_current_game text,
  p_phase text,
  p_phase_ends_at timestamptz,
  p_state jsonb,
  p_private jsonb default '[]'::jsonb,
  p_events jsonb default '[]'::jsonb
) returns int
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_version int;
  v_family_id uuid;
  v_new_version int;
begin
  select version, family_id
    into v_version, v_family_id
    from rooms
   where id = p_room_id
     for update;

  if not found then
    raise exception 'room_not_found' using errcode = 'P0002';
  end if;

  if v_version <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  -- Private state first.
  insert into room_private (room_id, member_id, family_id, state, updated_at)
  select p_room_id,
         (item ->> 'member_id')::uuid,
         v_family_id,
         coalesce(item -> 'state', '{}'::jsonb),
         now()
    from jsonb_array_elements(coalesce(p_private, '[]'::jsonb)) as item
  on conflict (room_id, member_id)
  do update set state = excluded.state, updated_at = excluded.updated_at;

  -- Then the ledger.
  insert into game_events (family_id, room_id, member_id, event_type, payload)
  select v_family_id,
         p_room_id,
         nullif(item ->> 'member_id', '')::uuid,
         item ->> 'event_type',
         coalesce(item -> 'payload', '{}'::jsonb)
    from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) as item;

  -- The public row last.
  v_new_version := v_version + 1;

  update rooms
     set current_game = p_current_game,
         phase = p_phase,
         phase_ends_at = p_phase_ends_at,
         state = p_state,
         version = v_new_version,
         updated_at = now()
   where id = p_room_id;

  return v_new_version;
end;
$$;

-- Only the service role may call it.
revoke all on function public.commit_room_turn(uuid, int, text, text, timestamptz, jsonb, jsonb, jsonb) from public;
revoke all on function public.commit_room_turn(uuid, int, text, text, timestamptz, jsonb, jsonb, jsonb) from anon, authenticated;
grant execute on function public.commit_room_turn(uuid, int, text, text, timestamptz, jsonb, jsonb, jsonb) to service_role;
