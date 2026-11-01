// Server-only room service. Loads a room, runs the engine, commits the turn
// through commit_room_turn_v2 in one transaction, retrying on a lost race.

import { randomInt } from "node:crypto";
import { serviceClient } from "@/lib/supabase/server";
import { ageBand } from "@/lib/auth/crypto";
import { AuthError, callerMember } from "@/lib/auth/service";
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
    db.from("members").select("id, display_name, date_of_birth, role").eq("family_id", familyId),
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
    ageBand: ageBand(m.date_of_birth, today()),
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

/** Applies one action for the signed-in caller. Retries a lost race up to three times. */
export async function act(accessToken: string, roomId: string, type: string, payload?: Record<string, unknown>): Promise<ActResult> {
  const caller = await callerMember(accessToken);
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

/** Opens a room, or returns the family's room that is already open. Owners and grown-ups only. */
export async function openRoom(accessToken: string): Promise<{ id: string; code: string }> {
  const caller = await callerMember(accessToken);
  if (caller.role !== "owner" && caller.role !== "adult") throw new AuthError("grown_ups_host", 403);
  const db = serviceClient();

  const { data: existing } = await db
    .from("rooms")
    .select("id, code")
    .eq("family_id", caller.family_id)
    .eq("status", "open")
    .maybeSingle();
  if (existing) {
    await act(accessToken, existing.id, "join");
    return existing;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = roomCode();
    const { data, error } = await db
      .from("rooms")
      .insert({ family_id: caller.family_id, code, host_member_id: caller.id, phase: LOBBY })
      .select("id, code")
      .single();
    if (error) {
      if (error.code === "23505") continue;
      throw new AuthError("room_create_failed", 500, { reason: error.message });
    }
    await db.from("room_members").insert({ room_id: data.id, member_id: caller.id, family_id: caller.family_id });
    await db.from("game_events").insert({
      family_id: caller.family_id,
      room_id: data.id,
      member_id: caller.id,
      event_type: "room_opened",
      payload: { code },
    });
    return data;
  }
  throw new AuthError("room_create_failed", 500);
}

/** Finds an open room in the caller's family by its code and joins it. */
export async function joinByCode(accessToken: string, rawCode: unknown): Promise<{ id: string; code: string }> {
  const caller = await callerMember(accessToken);
  const code = typeof rawCode === "string" ? rawCode.trim().toUpperCase() : "";
  if (!/^[A-Z]{4}$/.test(code)) throw new AuthError("invalid_room_code", 400);
  const { data: room } = await serviceClient()
    .from("rooms")
    .select("id, code, family_id")
    .eq("code", code)
    .eq("status", "open")
    .maybeSingle();
  if (!room || room.family_id !== caller.family_id) throw new AuthError("room_not_found", 404);
  const result = await act(accessToken, room.id, "join");
  if (!result.ok) throw new AuthError(result.reason ?? "join_failed", 409);
  return { id: room.id, code: room.code };
}
