-- Supabase performance advisor, 1 Nov 2026: "Unindexed foreign keys" (18).
-- Without these, deleting a family or a person (account closure, a parent
-- asking for a child's data to be erased) scans every row of each linked
-- table. Cheap now while the tables are small; the list was generated from
-- pg_constraint so none is missed.

create index if not exists content_items_created_by_idx on content_items (created_by);
create index if not exists content_items_family_idx on content_items (family_id);
create index if not exists content_seen_item_idx on content_seen (content_item_id);
create index if not exists game_events_mission_game_idx on game_events (mission_game_id) where mission_game_id is not null;
create index if not exists list_people_list_family_idx on list_people (list_id, family_id);
create index if not exists list_people_member_family_idx on list_people (member_id, family_id);
create index if not exists mission_hands_item_idx on mission_hands (content_item_id);
create index if not exists mission_hands_family_idx on mission_hands (family_id);
create index if not exists mission_hands_member_idx2 on mission_hands (member_id);
create index if not exists mission_hands_target_idx on mission_hands (target_member_id);
create index if not exists room_members_family_idx on room_members (family_id);
create index if not exists room_private_family_idx on room_private (family_id);
create index if not exists rooms_list_family_idx on rooms (list_id, family_id) where list_id is not null;
create index if not exists scores_member_idx on scores (member_id);
create index if not exists scores_mission_game_idx on scores (mission_game_id) where mission_game_id is not null;
create index if not exists screen_sessions_family_idx on screen_sessions (family_id);
create index if not exists seats_member_family_idx on seats (member_id, family_id);
create index if not exists seats_room_family_idx on seats (room_id, family_id);
