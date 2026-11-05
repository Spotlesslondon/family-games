-- The Family Forecast (0016). Each check raises on failure.

\set ON_ERROR_STOP on

begin;

insert into families (id, name, code, owner_user_id) values
  ('f6000000-0000-0000-0000-000000000001', 'Family E', 'JSEEEE', gen_random_uuid()),
  ('f6000000-0000-0000-0000-000000000002', 'Family F', 'JSFFFF', gen_random_uuid());
insert into members (id, family_id, display_name, date_of_birth, age_band, role, pin_hash, auth_user_id) values
  ('f6000000-0000-0000-0000-00000000000a', 'f6000000-0000-0000-0000-000000000001', 'Host', '1980-01-01', null, 'owner', 'scrypt$x', '8f600000-0000-0000-0000-00000000000a'),
  ('f6000000-0000-0000-0000-00000000000b', 'f6000000-0000-0000-0000-000000000001', 'Kid', null, '9-11', 'member', null, null),
  ('f6000000-0000-0000-0000-00000000000c', 'f6000000-0000-0000-0000-000000000001', 'Not tonight', null, '16+', 'member', null, null),
  ('f6000000-0000-0000-0000-00000000000d', 'f6000000-0000-0000-0000-000000000002', 'Other family', null, '16+', 'member', null, null);
insert into rooms (id, family_id, code, host_member_id, phase, join_code) values
  ('f6000000-0000-0000-0000-0000000000e1', 'f6000000-0000-0000-0000-000000000001', 'JSFC', 'f6000000-0000-0000-0000-00000000000a', 'lobby', '777999');
insert into room_members (room_id, member_id, family_id) values
  ('f6000000-0000-0000-0000-0000000000e1', 'f6000000-0000-0000-0000-00000000000a', 'f6000000-0000-0000-0000-000000000001'),
  ('f6000000-0000-0000-0000-0000000000e1', 'f6000000-0000-0000-0000-00000000000b', 'f6000000-0000-0000-0000-000000000001');
insert into forecasts (id, room_id, family_id, host_member_id) values
  ('f6000000-0000-0000-0000-0000000000f1', 'f6000000-0000-0000-0000-0000000000e1', 'f6000000-0000-0000-0000-000000000001', 'f6000000-0000-0000-0000-00000000000a');
insert into forecast_cards (id, forecast_id, family_id, card_key, text, kind, position, status) values
  ('f6000000-0000-0000-0000-0000000000c1', 'f6000000-0000-0000-0000-0000000000f1', 'f6000000-0000-0000-0000-000000000001', 'G7', 'Will someone say one more go?', 'yesno', 1, 'open'),
  ('f6000000-0000-0000-0000-0000000000c2', 'f6000000-0000-0000-0000-0000000000f1', 'f6000000-0000-0000-0000-000000000001', 'G10', 'Will someone sing out loud?', 'yesno', 2, 'settled');
insert into forecast_calls (card_id, member_id, forecast_id, family_id, call) values
  ('f6000000-0000-0000-0000-0000000000c1', 'f6000000-0000-0000-0000-00000000000a', 'f6000000-0000-0000-0000-0000000000f1', 'f6000000-0000-0000-0000-000000000001', 'yes'),
  ('f6000000-0000-0000-0000-0000000000c1', 'f6000000-0000-0000-0000-00000000000b', 'f6000000-0000-0000-0000-0000000000f1', 'f6000000-0000-0000-0000-000000000001', 'no'),
  ('f6000000-0000-0000-0000-0000000000c2', 'f6000000-0000-0000-0000-00000000000a', 'f6000000-0000-0000-0000-0000000000f1', 'f6000000-0000-0000-0000-000000000001', 'no'),
  ('f6000000-0000-0000-0000-0000000000c2', 'f6000000-0000-0000-0000-00000000000b', 'f6000000-0000-0000-0000-0000000000f1', 'f6000000-0000-0000-0000-000000000001', 'yes');

-- One live Forecast per night.
do $$
begin
  begin
    insert into forecasts (room_id, family_id, host_member_id) values
      ('f6000000-0000-0000-0000-0000000000e1', 'f6000000-0000-0000-0000-000000000001', 'f6000000-0000-0000-0000-00000000000a');
    raise exception 'a second live Forecast was allowed in one night';
  exception when unique_violation then null;
  end;
end $$;

create temp table seen (who text, what text, n int);
grant all on seen to authenticated;

-- The kid, in the room: sees both cards, their own locked call, and every call on the settled card.
select set_config('request.jwt.claims', '{"role":"authenticated","kind":"member","member_role":"member","family_id":"f6000000-0000-0000-0000-000000000001","member_id":"f6000000-0000-0000-0000-00000000000b"}', true);
set local role authenticated;
insert into seen select 'kid', 'cards', count(*) from forecast_cards;
insert into seen select 'kid', 'open card calls', count(*) from forecast_calls where card_id = 'f6000000-0000-0000-0000-0000000000c1';
insert into seen select 'kid', 'host call on open card', count(*) from forecast_calls where card_id = 'f6000000-0000-0000-0000-0000000000c1' and member_id = 'f6000000-0000-0000-0000-00000000000a';
insert into seen select 'kid', 'settled card calls', count(*) from forecast_calls where card_id = 'f6000000-0000-0000-0000-0000000000c2';
reset role;

-- A family member not in tonight's room sees nothing.
select set_config('request.jwt.claims', '{"role":"authenticated","kind":"member","member_role":"member","family_id":"f6000000-0000-0000-0000-000000000001","member_id":"f6000000-0000-0000-0000-00000000000c"}', true);
set local role authenticated;
insert into seen select 'not in room', 'cards', count(*) from forecast_cards;
insert into seen select 'not in room', 'calls', count(*) from forecast_calls;
reset role;

-- Another family sees nothing.
select set_config('request.jwt.claims', '{"role":"authenticated","kind":"member","member_role":"member","family_id":"f6000000-0000-0000-0000-000000000002","member_id":"f6000000-0000-0000-0000-00000000000d"}', true);
set local role authenticated;
insert into seen select 'other family', 'forecasts', count(*) from forecasts;
insert into seen select 'other family', 'calls', count(*) from forecast_calls;
reset role;

-- A guest seat in the room sees the cards; the TV sees the cards but no locked calls.
select set_config('request.jwt.claims', '{"role":"authenticated","kind":"seat","family_id":"f6000000-0000-0000-0000-000000000001","room_id":"f6000000-0000-0000-0000-0000000000e1","member_id":"f6000000-0000-0000-0000-00000000000b"}', true);
set local role authenticated;
insert into seen select 'kid seat', 'cards', count(*) from forecast_cards;
insert into seen select 'kid seat', 'open card calls', count(*) from forecast_calls where card_id = 'f6000000-0000-0000-0000-0000000000c1';
reset role;
select set_config('request.jwt.claims', '{"role":"authenticated","kind":"screen","family_id":"f6000000-0000-0000-0000-000000000001","room_id":"f6000000-0000-0000-0000-0000000000e1"}', true);
set local role authenticated;
insert into seen select 'TV', 'cards', count(*) from forecast_cards;
insert into seen select 'TV', 'open card calls', count(*) from forecast_calls where card_id = 'f6000000-0000-0000-0000-0000000000c1';
reset role;

-- Phones cannot write calls, rulings or cards themselves.
select set_config('request.jwt.claims', '{"role":"authenticated","kind":"member","member_role":"owner","family_id":"f6000000-0000-0000-0000-000000000001","member_id":"f6000000-0000-0000-0000-00000000000a"}', true);
set local role authenticated;
do $$
begin
  begin
    update forecast_cards set status = 'settled', outcome = 'yes';
    raise exception 'a phone settled a card directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into forecast_calls (card_id, member_id, forecast_id, family_id, call) values
      ('f6000000-0000-0000-0000-0000000000c1', 'f6000000-0000-0000-0000-00000000000a', 'f6000000-0000-0000-0000-0000000000f1', 'f6000000-0000-0000-0000-000000000001', 'no');
    raise exception 'a phone wrote a call directly';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$
declare r record; expected jsonb := '{
  "kid/cards":2, "kid/open card calls":1, "kid/host call on open card":0, "kid/settled card calls":2,
  "not in room/cards":0, "not in room/calls":0,
  "other family/forecasts":0, "other family/calls":0,
  "kid seat/cards":2, "kid seat/open card calls":1,
  "TV/cards":2, "TV/open card calls":0}';
begin
  for r in select * from seen loop
    if (expected ->> (r.who || '/' || r.what))::int is distinct from r.n then
      raise exception 'forecast read: % % saw %, expected %', r.who, r.what, r.n, expected ->> (r.who || '/' || r.what);
    end if;
  end loop;
  if (select count(*) from seen) <> 12 then raise exception 'forecast read: a check did not run'; end if;
end $$;

-- Closing the night finishes the Forecast.
update rooms set status = 'closed', closed_at = now() where id = 'f6000000-0000-0000-0000-0000000000e1';
do $$
begin
  if (select status from forecasts where id = 'f6000000-0000-0000-0000-0000000000f1') <> 'finished' then
    raise exception 'the Forecast outlived the night closing';
  end if;
end $$;

rollback;
\echo 10_forecast: PASS
