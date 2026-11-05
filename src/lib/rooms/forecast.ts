// The Family Forecast on the server: the only door for calls, claims and
// rulings (phones cannot write these tables, 0016). Runs beside the room's
// game, never in its game slot, so nothing here can block a foreground game.

import { AuthError, caller } from "@/lib/auth/service";
import { serviceClient } from "@/lib/supabase/server";
import { CARDS_PER_FORECAST, forecastCard, scoreCard, suitable, type ForecastPack } from "@/games/forecast/cards";

interface Seat {
  roomId: string;
  familyId: string;
  hostId: string;
  memberId: string;
  inRoom: string[];
}

async function seat(accessToken: string, roomId: unknown): Promise<Seat> {
  if (typeof roomId !== "string") throw new AuthError("invalid_request", 400);
  const who = await caller(accessToken);
  if (who.kind === "screen") throw new AuthError("screens_only_watch", 403);
  if (who.kind === "seat" && who.roomId !== roomId) throw new AuthError("room_not_found", 404);
  const db = serviceClient();
  const { data: room } = await db.from("rooms").select("id, family_id, status, host_member_id").eq("id", roomId).maybeSingle();
  if (!room || room.family_id !== who.family_id || room.status !== "open") throw new AuthError("room_not_found", 404);
  const { data: rm } = await db.from("room_members").select("member_id").eq("room_id", roomId);
  const inRoom = (rm ?? []).map((m) => m.member_id as string);
  if (!inRoom.includes(who.id)) throw new AuthError("not_in_room", 403);
  return { roomId, familyId: room.family_id as string, hostId: room.host_member_id as string, memberId: who.id, inRoom };
}

async function openForecast(roomId: string) {
  const { data } = await serviceClient()
    .from("forecasts")
    .select("id, host_member_id, presenter_member_id, status")
    .eq("room_id", roomId)
    .eq("status", "open")
    .maybeSingle();
  return data as { id: string; host_member_id: string; presenter_member_id: string | null; status: string } | null;
}

function fail(error: { message: string } | null) {
  if (error) throw new AuthError("server_busy", 503, { reason: error.message });
}

/** Host only: start a Forecast with the chosen cards (or a fresh draw) and an optional presenter. */
export async function startForecast(accessToken: string, roomId: unknown, body: { pack?: unknown; cards?: unknown; presenterId?: unknown }) {
  const s = await seat(accessToken, roomId);
  if (s.memberId !== s.hostId) throw new AuthError("host_only", 403);
  if (await openForecast(s.roomId)) throw new AuthError("forecast_running", 409);
  const pack: ForecastPack = body.pack === "christmas" ? "christmas" : "everyday";
  const pool = suitable(pack, s.inRoom.length);
  let keys = Array.isArray(body.cards) ? (body.cards as unknown[]).filter((k): k is string => typeof k === "string") : [];
  keys = [...new Set(keys)].filter((k) => pool.some((c) => c.key === k));
  if (keys.length !== CARDS_PER_FORECAST) {
    if (pool.length < CARDS_PER_FORECAST) throw new AuthError("too_few_players", 409);
    keys = [...pool].sort(() => Math.random() - 0.5).slice(0, CARDS_PER_FORECAST).map((c) => c.key);
  }
  const presenter = typeof body.presenterId === "string" && s.inRoom.includes(body.presenterId) ? body.presenterId : null;
  const db = serviceClient();
  const { data: f, error } = await db
    .from("forecasts")
    .insert({ room_id: s.roomId, family_id: s.familyId, host_member_id: s.hostId, presenter_member_id: presenter })
    .select("id")
    .single();
  if (error?.code === "23505") throw new AuthError("forecast_running", 409);
  fail(error);
  const forecastId = (f as { id: string }).id;
  fail((await db.from("forecast_players").insert(s.inRoom.map((m) => ({ forecast_id: forecastId, member_id: m, family_id: s.familyId })))).error);
  fail(
    (
      await db.from("forecast_cards").insert(
        keys.map((k, i) => {
          const c = forecastCard(k)!;
          return { forecast_id: forecastId, family_id: s.familyId, card_key: c.key, text: c.text, kind: c.kind, position: i + 1 };
        }),
      )
    ).error,
  );
  return { ok: true, forecastId };
}

async function cardFor(s: Seat, cardId: unknown) {
  if (typeof cardId !== "string") throw new AuthError("invalid_request", 400);
  const f = await openForecast(s.roomId);
  if (!f) throw new AuthError("no_forecast", 404);
  const { data: card } = await serviceClient().from("forecast_cards").select("id, kind, status, forecast_id").eq("id", cardId).maybeSingle();
  if (!card || card.forecast_id !== f.id) throw new AuthError("card_not_found", 404);
  return { f, card: card as { id: string; kind: "person" | "yesno"; status: string; forecast_id: string } };
}

async function players(forecastId: string): Promise<string[]> {
  const { data } = await serviceClient().from("forecast_players").select("member_id").eq("forecast_id", forecastId);
  return (data ?? []).map((p) => p.member_id as string);
}

/** Lock in (or change, until someone says it happened) your secret call on a card. */
export async function makeCall(accessToken: string, roomId: unknown, cardId: unknown, call: unknown) {
  const s = await seat(accessToken, roomId);
  const { f, card } = await cardFor(s, cardId);
  if (card.status !== "open") throw new AuthError("card_closed", 409);
  const db = serviceClient();
  // Anyone who joins the night later plays too.
  let ps = await players(f.id);
  if (!ps.includes(s.memberId)) {
    fail((await db.from("forecast_players").upsert({ forecast_id: f.id, member_id: s.memberId, family_id: s.familyId })).error);
    ps = [...ps, s.memberId];
  }
  const valid = card.kind === "yesno" ? call === "yes" || call === "no" : typeof call === "string" && ps.includes(call);
  if (!valid) throw new AuthError("bad_call", 400);
  fail(
    (
      await db
        .from("forecast_calls")
        .upsert({ card_id: card.id, member_id: s.memberId, forecast_id: f.id, family_id: s.familyId, call: call as string, created_at: new Date().toISOString() })
    ).error,
  );
  return { ok: true };
}

/** Anyone: "It happened". The card waits for the host or the presenter to rule. */
export async function claimCard(accessToken: string, roomId: unknown, cardId: unknown) {
  const s = await seat(accessToken, roomId);
  const { card } = await cardFor(s, cardId);
  if (card.status !== "open") return { ok: true };
  fail(
    (await serviceClient().from("forecast_cards").update({ status: "claimed", claimed_by: s.memberId, claimed_at: new Date().toISOString() }).eq("id", card.id).eq("status", "open"))
      .error,
  );
  return { ok: true };
}

/** Host or presenter: rule on a card. "notyet" reopens it; anything else settles it and scores it. */
export async function ruleCard(accessToken: string, roomId: unknown, cardId: unknown, outcome: unknown) {
  const s = await seat(accessToken, roomId);
  const { f, card } = await cardFor(s, cardId);
  if (s.memberId !== s.hostId && s.memberId !== f.presenter_member_id) throw new AuthError("host_only", 403);
  if (card.status === "settled") throw new AuthError("card_closed", 409);
  const db = serviceClient();
  if (outcome === "notyet") {
    fail((await db.from("forecast_cards").update({ status: "open", claimed_by: null, claimed_at: null }).eq("id", card.id)).error);
    return { ok: true };
  }
  const ps = await players(f.id);
  const valid = card.kind === "yesno" ? outcome === "yes" || outcome === "no" : typeof outcome === "string" && ps.includes(outcome);
  if (!valid) throw new AuthError("bad_call", 400);
  const { data: calls } = await db.from("forecast_calls").select("member_id, call").eq("card_id", card.id);
  const map = Object.fromEntries((calls ?? []).map((c) => [c.member_id as string, c.call as string]));
  const points = scoreCard(map, outcome as string);
  fail(
    (
      await db
        .from("forecast_cards")
        .update({ status: "settled", outcome, points, settled_by: s.memberId, settled_at: new Date().toISOString() })
        .eq("id", card.id)
        .neq("status", "settled")
    ).error,
  );
  return { ok: true };
}

/** Host only: end the Forecast and show the review. */
export async function endForecast(accessToken: string, roomId: unknown) {
  const s = await seat(accessToken, roomId);
  if (s.memberId !== s.hostId) throw new AuthError("host_only", 403);
  const f = await openForecast(s.roomId);
  if (!f) return { ok: true };
  fail((await serviceClient().from("forecasts").update({ status: "finished", finished_at: new Date().toISOString() }).eq("id", f.id)).error);
  return { ok: true };
}

/** Is a Forecast keeping this night alive? Live for up to 24 hours (0016). */
export async function hasLiveForecast(roomId: string): Promise<boolean> {
  const { data } = await serviceClient()
    .from("forecasts")
    .select("id")
    .eq("room_id", roomId)
    .eq("status", "open")
    .gt("created_at", new Date(Date.now() - 24 * 3600_000).toISOString())
    .limit(1);
  return !!data && data.length > 0;
}
