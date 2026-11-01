// Server-only: joining a game night by its link, without a login.
//
// The host shares https://ashergames.com/j/583920 (or just the six digits).
// A phone that opens it sees the host's name and the people expected tonight,
// taps its own name (or adds itself as a guest), and becomes a seat: an
// anonymous Supabase Auth user that can see and act in that one room only,
// for as long as it stays in the room and the room stays open (0008, 0012).
// The host locks the room once everyone is in; the link then stops working.

import { serviceClient } from "@/lib/supabase/server";
import { cleanName } from "@/lib/auth/crypto";
import { AuthError, caller, refresh, type Session } from "@/lib/auth/service";
import { actAs, closeIdle, isIdle, joinCode } from "./service";

export const AGE_BANDS = ["6-8", "9-11", "12-15", "16+"] as const;
type AgeBand = (typeof AGE_BANDS)[number];

interface NightRow {
  id: string;
  family_id: string;
  host_member_id: string;
  list_id: string | null;
  last_activity_at: string;
}

function parseCode(raw: unknown): string {
  const code = typeof raw === "string" ? raw.replace(/\s/g, "") : "";
  if (!/^[0-9]{6}$/.test(code)) throw new AuthError("invalid_join_code", 400);
  return code;
}

/** The night behind a link code, if it is still taking players. */
async function liveNight(rawCode: unknown): Promise<NightRow> {
  const code = parseCode(rawCode);
  const { data, error } = await serviceClient()
    .from("rooms")
    .select("id, family_id, host_member_id, list_id, last_activity_at")
    .eq("join_code", code)
    .eq("status", "open")
    .is("locked_at", null)
    .maybeSingle();
  if (error) throw new AuthError("server_busy", 503, { reason: error.message });
  // One answer for "no such night", "locked" and "over", so a guessed code reveals nothing.
  if (!data) throw new AuthError("night_not_found", 404);
  if (isIdle(data.last_activity_at)) {
    await closeIdle(data.id);
    throw new AuthError("night_not_found", 404);
  }
  return data as NightRow;
}

export interface NightPerson {
  id: string;
  name: string;
  taken: boolean;
}

/** Who can be picked tonight: the night's list, or else the family's regular people. */
async function peopleFor(night: NightRow): Promise<NightPerson[]> {
  const db = serviceClient();
  let ids: string[] | null = null;
  if (night.list_id) {
    const { data } = await db.from("list_people").select("member_id").eq("list_id", night.list_id);
    ids = (data ?? []).map((r) => r.member_id as string);
  }
  let query = db.from("members").select("id, display_name, is_guest").eq("family_id", night.family_id).order("created_at");
  if (ids) query = query.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  else query = query.eq("is_guest", false);
  const [{ data: people }, { data: inRoom }] = await Promise.all([
    query,
    db.from("room_members").select("member_id").eq("room_id", night.id),
  ]);
  const taken = new Set((inRoom ?? []).map((r) => r.member_id as string));
  return (people ?? [])
    .filter((p) => p.id !== night.host_member_id)
    .map((p) => ({ id: p.id as string, name: p.display_name as string, taken: taken.has(p.id as string) }));
}

/** What a phone sees when it opens the link. First names only, nothing else about anyone. */
export async function lookupNight(rawCode: unknown): Promise<{ host: string; people: NightPerson[] }> {
  const night = await liveNight(rawCode);
  const [{ data: host }, people] = await Promise.all([
    serviceClient().from("members").select("display_name").eq("id", night.host_member_id).maybeSingle(),
    peopleFor(night),
  ]);
  return { host: (host?.display_name as string) ?? "The host", people };
}

export interface SeatSession extends Session {
  member: { id: string; name: string; role: string; familyId: string };
  seat: { roomId: string };
}

/** The guest's person on the host's account: an earlier guest of the same name, or a new one. */
async function guestMember(night: NightRow, rawName: unknown, rawBand: unknown): Promise<{ id: string; created: boolean }> {
  const name = cleanName(rawName);
  if (!name) throw new AuthError("invalid_name", 400);
  if (!AGE_BANDS.includes(rawBand as AgeBand)) throw new AuthError("invalid_age_band", 400);
  const db = serviceClient();
  const { data: same } = await db
    .from("members")
    .select("id, is_guest")
    .eq("family_id", night.family_id)
    .ilike("display_name", name.replace(/[\\%_]/g, (c) => `\\${c}`))
    .maybeSingle();
  if (same && !same.is_guest) throw new AuthError("name_taken", 409);
  if (same) {
    await db.from("members").update({ age_band: rawBand }).eq("id", same.id);
    return { id: same.id as string, created: false };
  }
  const { data, error } = await db
    .from("members")
    .insert({ family_id: night.family_id, display_name: name, age_band: rawBand, role: "member", is_guest: true })
    .select("id")
    .single();
  if (error?.code === "23505") throw new AuthError("name_taken", 409);
  if (error || !data) throw new AuthError("member_create_failed", 500, { reason: error?.message });
  return { id: data.id as string, created: true };
}

/**
 * This phone's anonymous session: the one in its cookie if that is a link
 * session not seated elsewhere, otherwise the one the phone just created.
 *
 * The phone signs itself in anonymously (in the browser), not this server:
 * Supabase limits anonymous sign-ins per address, and every family's request
 * would otherwise arrive from the same few Vercel addresses.
 */
async function anonymousSession(
  existingRefresh: string | null,
  offeredRefresh: unknown,
  roomId: string
): Promise<Session & { userId: string }> {
  const db = serviceClient();
  const tryToken = async (token: string, mustBeFree: boolean) => {
    const s = await refresh(token);
    const { data } = await db.auth.getUser(s.accessToken);
    if (!data.user?.is_anonymous) return null; // a member's session: never turned into a seat
    if (mustBeFree) {
      // One phone session, one room, so its access never covers two nights.
      const { count } = await db
        .from("seats")
        .select("id", { count: "exact", head: true })
        .eq("auth_user_id", data.user.id)
        .is("released_at", null)
        .neq("room_id", roomId);
      if (count) return null;
    }
    return { ...s, userId: data.user.id };
  };

  if (existingRefresh) {
    try {
      const reused = await tryToken(existingRefresh, true);
      if (reused) return reused;
    } catch (err) {
      if (err instanceof AuthError && err.status === 503) throw err;
      // An expired cookie: use the phone's new session below.
    }
  }
  if (typeof offeredRefresh === "string" && offeredRefresh.length > 0 && offeredRefresh.length < 500) {
    const fresh = await tryToken(offeredRefresh, true).catch((err) => {
      if (err instanceof AuthError && err.status === 503) throw err;
      return null;
    });
    if (fresh) return fresh;
  }
  throw new AuthError("phone_session_needed", 401);
}

/**
 * Sits this phone down as a person tonight. Either { memberId } for someone on
 * the list, or { guestName, ageBand } for someone who is not.
 */
export async function claimSeat(
  rawCode: unknown,
  body: Record<string, unknown>,
  existingRefresh: string | null
): Promise<SeatSession> {
  const night = await liveNight(rawCode);
  const db = serviceClient();

  let memberId: string;
  let createdGuest = false;
  if (typeof body.memberId === "string") {
    const allowed = await peopleFor(night);
    const person = allowed.find((p) => p.id === body.memberId);
    if (!person) throw new AuthError("not_on_the_list", 403);
    memberId = person.id;
  } else {
    const guest = await guestMember(night, body.guestName, body.ageBand);
    memberId = guest.id;
    createdGuest = guest.created;
  }

  const undoGuest = async () => {
    if (createdGuest) await db.from("members").delete().eq("id", memberId);
  };

  let anon: Session & { userId: string };
  try {
    anon = await anonymousSession(existingRefresh, body.phoneSession, night.id);
  } catch (err) {
    await undoGuest();
    throw err;
  }

  // Already sitting in this room on this phone (a second tap, or a reload).
  const { data: mine } = await db
    .from("seats")
    .select("id, member_id")
    .eq("room_id", night.id)
    .eq("auth_user_id", anon.userId)
    .is("released_at", null)
    .maybeSingle();
  if (mine && mine.member_id !== memberId) {
    await undoGuest();
    throw new AuthError("already_seated", 409);
  }
  if (!mine) {
    // Someone already in the room as this person (on their own phone, signed
    // in or seated) keeps it; a second phone cannot take it over.
    const { data: inRoom } = await db.from("room_members").select("member_id").eq("room_id", night.id).eq("member_id", memberId).maybeSingle();
    if (inRoom) {
      await undoGuest();
      throw new AuthError("name_taken", 409);
    }
    const { error } = await db
      .from("seats")
      .insert({ room_id: night.id, family_id: night.family_id, member_id: memberId, auth_user_id: anon.userId });
    if (error) {
      await undoGuest();
      // The unique index says someone else's phone is already this person.
      if (error.code === "23505") throw new AuthError("name_taken", 409);
      throw new AuthError("seat_failed", 500, { reason: error.message });
    }
  }

  const joined = await actAs({ id: memberId, family_id: night.family_id }, night.id, "join");
  if (!joined.ok) {
    await db.from("seats").update({ released_at: new Date().toISOString() }).eq("room_id", night.id).eq("auth_user_id", anon.userId).is("released_at", null);
    await undoGuest();
    throw new AuthError(joined.reason ?? "join_failed", 409);
  }

  // A fresh token now carries the seat claims, so the phone can read the room.
  const seated = await refresh(anon.refreshToken);
  const who = await caller(seated.accessToken);
  return {
    ...seated,
    member: { id: who.id, name: who.display_name, role: who.role, familyId: who.family_id },
    seat: { roomId: night.id },
  };
}

/** The host locks the night (the link stops working) or opens it again. */
export async function setLocked(accessToken: string, roomId: unknown, locked: boolean): Promise<{ locked: boolean; join_code: string | null }> {
  if (typeof roomId !== "string") throw new AuthError("invalid_request", 400);
  const who = await caller(accessToken);
  const db = serviceClient();
  const { data: room } = await db
    .from("rooms")
    .select("id, family_id, host_member_id, status, join_code")
    .eq("id", roomId)
    .maybeSingle();
  if (!room || room.family_id !== who.family_id || room.status !== "open") throw new AuthError("room_not_found", 404);
  if (room.host_member_id !== who.id) throw new AuthError("host_only", 403);

  if (locked) {
    const { error } = await db.from("rooms").update({ locked_at: new Date().toISOString() }).eq("id", roomId);
    if (error) throw new AuthError("server_busy", 503, { reason: error.message });
    return { locked: true, join_code: room.join_code as string | null };
  }
  // Opening again: the old code may have been taken by another night while
  // this one was locked, so keep it if free, otherwise issue a new one.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = attempt === 0 && room.join_code ? (room.join_code as string) : joinCode();
    const { error } = await db.from("rooms").update({ locked_at: null, join_code: code }).eq("id", roomId);
    if (!error) return { locked: false, join_code: code };
    if (error.code !== "23505") throw new AuthError("server_busy", 503, { reason: error.message });
  }
  throw new AuthError("busy_try_again", 409);
}

export interface ScreenSession extends Session {
  screen: { roomId: string; familyId: string };
}

/** How long a TV session lasts at most. Closing the night ends it sooner (0014). */
const SCREEN_HOURS = 12;

/**
 * Turns this device into the night's big screen: it shows the room and who is
 * in it, and can never act or see anyone's secret. Decided 1 Nov 2026: the TV
 * opens the same link as the phones, with no separate approval step, so it
 * works only while the link does (before the host locks the room).
 */
export async function claimScreen(rawCode: unknown, body: Record<string, unknown>, existingRefresh: string | null): Promise<ScreenSession> {
  const night = await liveNight(rawCode);
  const anon = await anonymousSession(existingRefresh, body.phoneSession, night.id);
  const db = serviceClient();

  // A device sitting as a player cannot also be the TV.
  const { count } = await db
    .from("seats")
    .select("id", { count: "exact", head: true })
    .eq("auth_user_id", anon.userId)
    .is("released_at", null);
  if (count) throw new AuthError("already_seated", 409);

  const { error } = await db.from("screen_sessions").upsert(
    {
      auth_user_id: anon.userId,
      room_id: night.id,
      family_id: night.family_id,
      approved_by: night.host_member_id,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + SCREEN_HOURS * 3_600_000).toISOString(),
    },
    { onConflict: "auth_user_id" }
  );
  if (error) throw new AuthError("screen_failed", 500, { reason: error.message });

  // A fresh token now carries the screen claims, so the TV can read the room.
  const watching = await refresh(anon.refreshToken);
  return { ...watching, screen: { roomId: night.id, familyId: night.family_id } };
}
