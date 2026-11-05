// Server-only room service. Loads a room, runs the engine, commits the turn
// through commit_room_turn_v2 in one transaction, retrying on a lost race.

import { hasLiveForecast } from "./forecast";
import { randomInt } from "node:crypto";
import { serviceClient } from "@/lib/supabase/server";
import { ageBand } from "@/lib/auth/crypto";
import { AuthError, caller, callerMember, type Caller } from "@/lib/auth/service";
import { applyWrite } from "@/engine/apply";
import { LOBBY, applyRoomAction } from "@/engine/room";
import { cryptoRng } from "@/engine/rng";
import type { Action, GameContext, Player, PrivateMap, RoomSnapshot } from "@/engine/types";
import "@/games";

const ROOM_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O: they read as 1 and 0 across a room

function roomCode(): string {
  let out = "";
  for (let i = 0; i < 4; i++) out += ROOM_LETTERS[randomInt(0, ROOM_LETTERS.length)];
  return out;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Loaded {
  room: RoomSnapshot;
  familyId: string;
  players: Player[];
  privateMap: PrivateMap;
}

async function loadRoom(roomId: string, familyId: string): Promise<Loaded> {
  const db = serviceClient();
  const { data: row } = await db
    .from("rooms")
    .select("id, family_id, version, host_member_id, status, current_game, phase, phase_ends_at, state")
    .eq("id", roomId)
    .maybeSingle();
  if (!row || row.family_id !== familyId) throw new AuthError("room_not_found", 404);

  const [{ data: inRoom }, { data: family }, { data: secrets }] = await Promise.all([
    db.from("room_members").select("member_id, connected, joined_at").eq("room_id", roomId).order("joined_at"),
    db.from("members").select("id, display_name, date_of_birth, age_band, role").eq("family_id", familyId),
    db.from("room_private").select("member_id, state").eq("room_id", roomId),
  ]);

  const room: RoomSnapshot = {
    id: row.id,
    version: row.version,
    hostId: row.host_member_id,
    status: row.status,
    currentGame: row.current_game,
    phase: row.phase,
    phaseEndsAt: row.phase_ends_at,
    state: (row.state ?? {}) as Record<string, unknown>,
    members: (inRoom ?? []).map((m) => ({ id: m.member_id as string, connected: m.connected as boolean })),
  };

  const players: Player[] = (family ?? []).map((m) => ({
    id: m.id,
    name: m.display_name,
    // People saved from a guest have an age band instead of a date of birth.
    ageBand: m.age_band ?? ageBand(m.date_of_birth, today()),
    role: m.role,
  }));

  const privateMap: PrivateMap = {};
  for (const s of secrets ?? []) privateMap[s.member_id] = (s.state ?? {}) as Record<string, unknown>;

  return { room, familyId, players, privateMap };
}

export interface ActResult {
  ok: boolean;
  reason?: string;
  version?: number;
}

/** Applies one action for the signed-in caller (a member, or a phone seated in this room). */
export async function act(accessToken: string, roomId: string, type: string, payload?: Record<string, unknown>): Promise<ActResult> {
  const who = await caller(accessToken);
  // The TV shows the room; it never takes a turn.
  if (who.kind === "screen") throw new AuthError("screens_only_watch", 403);
  // A seat can act in its own room only.
  if (who.kind === "seat" && who.roomId !== roomId) throw new AuthError("room_not_found", 404);
  return actAs(who, roomId, type, payload);
}

/** Applies one action for a caller already identified. Retries a lost race up to three times. */
export async function actAs(
  caller: Pick<Caller, "id" | "family_id">,
  roomId: string,
  type: string,
  payload?: Record<string, unknown>
): Promise<ActResult> {
  const db = serviceClient();

  for (let attempt = 0; attempt < 3; attempt++) {
    const loaded = await loadRoom(roomId, caller.family_id);
    const ctx: GameContext = {
      room: loaded.room,
      players: loaded.players,
      private: loaded.privateMap,
      now: new Date().toISOString(),
      rng: cryptoRng(),
    };
    const action: Action = { type, actorId: caller.id, payload };
    const result = applyRoomAction(ctx, action);
    if (!result.ok) return { ok: false, reason: result.reason };
    if (result.noop) return { ok: true, version: loaded.room.version };

    const next = applyWrite(loaded.room, result.write);
    const { data, error } = await db.rpc("commit_room_turn_v2", {
      p_room_id: roomId,
      p_expected_version: loaded.room.version,
      p_current_game: next.currentGame,
      p_phase: next.phase,
      p_phase_ends_at: next.phaseEndsAt,
      p_state: next.state,
      p_host: next.hostId,
      p_status: next.status,
      p_members: next.members.map((m) => ({ member_id: m.id, connected: m.connected })),
      p_private: Object.entries(result.write.private ?? {}).map(([memberId, state]) => ({ member_id: memberId, state })),
      p_events: (result.write.events ?? []).map((e) => ({
        member_id: e.memberId ?? null,
        event_type: e.type,
        payload: e.payload ?? {},
      })),
    });
    if (!error) return { ok: true, version: data as number };
    if (!error.message.includes("version_conflict")) {
      throw new AuthError("commit_failed", 500, { reason: error.message });
    }
  }
  throw new AuthError("busy_try_again", 409);
}

/**
 * A night with no activity for this long is closed rather than reused.
 * 90 minutes, set by the CEO seat on 1 Nov 2026 so a long dinner break does
 * not end the night; to be confirmed at the family table test.
 */
export const IDLE_CLOSE_MS = 90 * 60_000;

export function isIdle(lastActivityAt: string | null | undefined, now = Date.now()): boolean {
  return !!lastActivityAt && now - Date.parse(lastActivityAt) > IDLE_CLOSE_MS;
}

export async function closeIdle(roomId: string): Promise<void> {
  await serviceClient()
    .from("rooms")
    // The idle close wipes the game too: typed clues never outlive the night.
    .update({ status: "closed", closed_at: new Date().toISOString(), state: {}, current_game: null, phase: "lobby", phase_ends_at: null })
    .eq("id", roomId)
    .eq("status", "open");
}

async function findOpenRoom(familyId: string) {
  const { data, error } = await serviceClient()
    .from("rooms")
    .select("id, code, join_code, last_activity_at")
    .eq("family_id", familyId)
    .eq("status", "open")
    .maybeSingle();
  if (error) throw new AuthError("server_busy", 503, { reason: error.message });
  return data as { id: string; code: string; join_code: string | null; last_activity_at: string } | null;
}

/** A list id from the phone, accepted only if the list is this family's. */
async function ownList(familyId: string, raw: unknown): Promise<string | null> {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string" || !/^[0-9a-f-]{36}$/i.test(raw)) throw new AuthError("invalid_list", 400);
  const { data } = await serviceClient().from("lists").select("id").eq("id", raw).eq("family_id", familyId).maybeSingle();
  if (!data) throw new AuthError("list_not_found", 404);
  return raw;
}

/** The 6-digit code in the night's link. Unique among nights still taking players (0008). */
export function joinCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export interface OpenedRoom {
  id: string;
  code: string;
  join_code: string | null;
}

/** Opens a room, or rejoins the family's room that is already open. Owners and grown-ups only. */
export async function openRoom(accessToken: string, rawListId?: unknown): Promise<OpenedRoom> {
  const caller = await callerMember(accessToken);
  if (caller.role !== "owner" && caller.role !== "adult") throw new AuthError("grown_ups_host", 403);
  const listId = await ownList(caller.family_id, rawListId);

  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await findOpenRoom(caller.family_id);
    // A live Family Forecast keeps the night open through a long day (0016).
    if (existing && isIdle(existing.last_activity_at) && !(await hasLiveForecast(existing.id))) {
      await closeIdle(existing.id);
      continue;
    }
    if (existing) {
      await actAs(caller, existing.id, "join");
      return { id: existing.id, code: existing.code, join_code: existing.join_code };
    }

    // Room, host seat and opening event in one step (0009). The database
    // allows one open room per family, so a second tap at the same moment
    // fails here and the loop rejoins the room the first tap opened.
    const code = roomCode();
    const { data, error } = await serviceClient().rpc("open_room", {
      p_family: caller.family_id,
      p_host: caller.id,
      p_code: code,
      p_phase: LOBBY,
      p_join_code: joinCode(),
      p_list_id: listId,
    });
    if (!error) return data as OpenedRoom;
    if (error.code !== "23505") throw new AuthError("room_create_failed", 500, { reason: error.message });
    // 23505: another tap opened the family's room, or the 4-letter code or the
    // 6-digit link code is in use by another night. Either way, look again.
  }
  throw new AuthError("busy_try_again", 409);
}

/** Finds an open room in the caller's family by its code and joins it. */
export async function joinByCode(accessToken: string, rawCode: unknown): Promise<{ id: string; code: string }> {
  const caller = await callerMember(accessToken);
  const code = typeof rawCode === "string" ? rawCode.replace(/\s/g, "").toUpperCase() : "";
  // The 4-letter room code, or the 6-digit code from the night's link.
  const column = /^[A-Z]{4}$/.test(code) ? "code" : /^[0-9]{6}$/.test(code) ? "join_code" : null;
  if (!column) throw new AuthError("invalid_room_code", 400);
  let query = serviceClient()
    .from("rooms")
    .select("id, code, family_id, last_activity_at")
    .eq(column, code)
    .eq("status", "open");
  // A link code is only unique, and only live, while the night is unlocked.
  if (column === "join_code") query = query.is("locked_at", null);
  const { data: room } = await query.maybeSingle();
  if (!room || room.family_id !== caller.family_id) throw new AuthError("room_not_found", 404);
  if (isIdle(room.last_activity_at) && !(await hasLiveForecast(room.id))) {
    await closeIdle(room.id);
    throw new AuthError("room_not_found", 404);
  }
  const result = await actAs(caller, room.id, "join");
  if (!result.ok) throw new AuthError(result.reason ?? "join_failed", 409);
  return { id: room.id, code: room.code };
}
