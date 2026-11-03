// Chat in a game night: the only door a message goes through. Phones cannot
// write to room_messages themselves (0015); this checks who is asking, the
// night's chat setting, the rules (lib/chat/rules) and the rate limit.

import { ageBand } from "@/lib/auth/crypto";
import { AuthError, caller } from "@/lib/auth/service";
import { serviceClient } from "@/lib/supabase/server";
import { QUICK_REPLIES, checkTyped, effectiveMode, isQuickKey, type ChatMode } from "@/lib/chat/rules";

const today = () => new Date().toISOString().slice(0, 10);

interface Night {
  roomId: string;
  familyId: string;
  hostId: string;
  memberId: string;
  mode: ChatMode;
  chosen: ChatMode | null;
}

/** Who is asking, in which open night, and the night's chat setting. */
async function night(accessToken: string, roomId: unknown): Promise<Night> {
  if (typeof roomId !== "string") throw new AuthError("invalid_request", 400);
  const who = await caller(accessToken);
  if (who.kind === "screen") throw new AuthError("screens_only_watch", 403);
  if (who.kind === "seat" && who.roomId !== roomId) throw new AuthError("room_not_found", 404);
  const db = serviceClient();
  const { data: room } = await db.from("rooms").select("id, family_id, status, host_member_id, chat_mode").eq("id", roomId).maybeSingle();
  if (!room || room.family_id !== who.family_id || room.status !== "open") throw new AuthError("room_not_found", 404);
  const { data: inRoom } = await db.from("room_members").select("member_id").eq("room_id", roomId);
  const ids = (inRoom ?? []).map((m) => m.member_id as string);
  if (!ids.includes(who.id)) throw new AuthError("not_in_room", 403);
  const { data: people } = await db.from("members").select("id, date_of_birth, age_band").in("id", ids);
  const childInRoom = (people ?? []).some((p) => (p.age_band ?? ageBand(p.date_of_birth, today())) !== "16+");
  const chosen = (room.chat_mode as ChatMode | null) ?? null;
  return {
    roomId,
    familyId: room.family_id as string,
    hostId: room.host_member_id as string,
    memberId: who.id,
    mode: effectiveMode(chosen, childInRoom),
    chosen,
  };
}

export async function chatStatus(accessToken: string, roomId: unknown) {
  const n = await night(accessToken, roomId);
  return { mode: n.mode, chosen: n.chosen, isHost: n.memberId === n.hostId, quick: QUICK_REPLIES };
}

export async function sendChat(accessToken: string, roomId: unknown, text: unknown, quick: unknown) {
  const n = await night(accessToken, roomId);
  if (n.mode === "off") throw new AuthError("chat_off", 409);
  let row: { body: string | null; quick: string | null };
  if (quick !== undefined && quick !== null) {
    if (!isQuickKey(quick)) throw new AuthError("invalid_request", 400);
    row = { body: null, quick };
  } else {
    if (n.mode === "quick") throw new AuthError("chat_quick_only", 409);
    const checked = checkTyped(text);
    if (!checked.ok) throw new AuthError(checked.reason, 422);
    row = { body: checked.text, quick: null };
  }
  const db = serviceClient();
  // One message a second each, so a held button cannot flood the room.
  const { data: recent } = await db
    .from("room_messages")
    .select("id")
    .eq("room_id", n.roomId)
    .eq("member_id", n.memberId)
    .gt("created_at", new Date(Date.now() - 1000).toISOString())
    .limit(1);
  if (recent && recent.length) throw new AuthError("chat_slow_down", 429);
  const { error } = await db.from("room_messages").insert({ room_id: n.roomId, family_id: n.familyId, member_id: n.memberId, ...row });
  if (error) throw new AuthError("server_busy", 503, { reason: error.message });
  return { ok: true };
}

export async function setChatMode(accessToken: string, roomId: unknown, mode: unknown) {
  const n = await night(accessToken, roomId);
  if (n.memberId !== n.hostId) throw new AuthError("host_only", 403);
  if (mode !== null && mode !== "typed" && mode !== "quick" && mode !== "off") throw new AuthError("invalid_request", 400);
  const db = serviceClient();
  // Turning chat off deletes what was said at once, not at the end of the
  // night (CEO seat brief, 3 Nov); turning it back on starts empty.
  if (mode === "off") {
    const { error: wipe } = await db.from("room_messages").delete().eq("room_id", n.roomId);
    if (wipe) throw new AuthError("server_busy", 503, { reason: wipe.message });
  }
  const { error } = await db.from("rooms").update({ chat_mode: mode }).eq("id", n.roomId);
  if (error) throw new AuthError("server_busy", 503, { reason: error.message });
  return { ok: true };
}

export async function removeChat(accessToken: string, roomId: unknown, messageId: unknown) {
  const n = await night(accessToken, roomId);
  if (n.memberId !== n.hostId) throw new AuthError("host_only", 403);
  if (typeof messageId !== "string") throw new AuthError("invalid_request", 400);
  const { error } = await serviceClient().from("room_messages").delete().eq("id", messageId).eq("room_id", n.roomId);
  if (error) throw new AuthError("server_busy", 503, { reason: error.message });
  return { ok: true };
}
