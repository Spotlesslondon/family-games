-- commit_room_turn_v2: the same single-transaction turn as v1, now also
-- carrying who is in the room, who hosts it and whether it is open.
--
-- Order inside the transaction, as before: everything that is not the room
-- row first (members, private state, events), the room row last, because
-- Realtime broadcasts on the room row.
--
-- p_members: the FULL member list after the turn:
--   [{ "member_id": uuid, "connected": bool }, ...]
--   Members not listed are removed from the room.

create or replace function public.commit_room_turn_v2(
  p_room_id uuid,
  p_expected_version int,
  p_current_game text,
  p_phase text,
  p_phase_ends_at timestamptz,
  p_state jsonb,
  p_host uuid,
  p_status text,
  p_members jsonb,
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
  v_status text;
  v_new_version int;
begin
  select version, family_id, status
    into v_version, v_family_id, v_status
    from rooms
   where id = p_room_id
     for update;

  if not found then
    raise exception 'room_not_found' using errcode = 'P0002';
  end if;

  if v_version <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  if p_status not in ('open', 'closed') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;

  -- The host and every listed member must belong to the room's family.
  if not exists (select 1 from members where id = p_host and family_id = v_family_id) then
    raise exception 'host_not_in_family' using errcode = 'P0001';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(coalesce(p_members, '[]'::jsonb)) as item
      left join members m on m.id = (item ->> 'member_id')::uuid and m.family_id = v_family_id
     where m.id is null
  ) then
    raise exception 'member_not_in_family' using errcode = 'P0001';
  end if;

  -- Membership.
  delete from room_members
   where room_id = p_room_id
     and member_id not in (
       select (item ->> 'member_id')::uuid
         from jsonb_array_elements(coalesce(p_members, '[]'::jsonb)) as item
     );

  insert into room_members (room_id, member_id, family_id, connected)
  select p_room_id,
         (item ->> 'member_id')::uuid,
         v_family_id,
         coalesce((item ->> 'connected')::boolean, true)
    from jsonb_array_elements(coalesce(p_members, '[]'::jsonb)) as item
  on conflict (room_id, member_id)
  do update set connected = excluded.connected;

  -- Private state.
  insert into room_private (room_id, member_id, family_id, state, updated_at)
  select p_room_id,
         (item ->> 'member_id')::uuid,
         v_family_id,
         coalesce(item -> 'state', '{}'::jsonb),
         now()
    from jsonb_array_elements(coalesce(p_private, '[]'::jsonb)) as item
  on conflict (room_id, member_id)
  do update set state = excluded.state, updated_at = excluded.updated_at;

  -- The ledger.
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
         host_member_id = p_host,
         status = p_status,
         closed_at = case when p_status = 'closed' and v_status <> 'closed' then now() else closed_at end,
         version = v_new_version,
         updated_at = now()
   where id = p_room_id;

  return v_new_version;
end;
$$;

revoke all on function public.commit_room_turn_v2(uuid, int, text, text, timestamptz, jsonb, uuid, text, jsonb, jsonb, jsonb) from public;
revoke all on function public.commit_room_turn_v2(uuid, int, text, text, timestamptz, jsonb, uuid, text, jsonb, jsonb, jsonb) from anon, authenticated;
grant execute on function public.commit_room_turn_v2(uuid, int, text, text, timestamptz, jsonb, uuid, text, jsonb, jsonb, jsonb) to service_role;
