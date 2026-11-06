// POST /api/log: { roomId, kind, detail? }. A phone reports something it saw
// go wrong (an error, a lost realtime feed, a tap that failed) so the night
// can be read back afterwards. One line in the ledger; no other personal data.

import { bearer, errorResponse, rateLimit, readJson } from "@/lib/auth/http";
import { AuthError, caller } from "@/lib/auth/service";
import { serviceClient } from "@/lib/supabase/server";

const KINDS = new Set(["error", "realtime", "tap_failed", "offline", "note"]);

export async function POST(request: Request) {
  try {
    await rateLimit(request, "phoneLog");
    const token = bearer(request);
    if (!token) throw new AuthError("not_signed_in", 401);
    const body = await readJson(request);
    const roomId = typeof body.roomId === "string" ? body.roomId : null;
    const kind = typeof body.kind === "string" && KINDS.has(body.kind) ? body.kind : "note";
    const detail = typeof body.detail === "string" ? body.detail.slice(0, 300) : "";
    if (!roomId) throw new AuthError("invalid_request", 400);
    const who = await caller(token);
    const db = serviceClient();
    // Only a member of the room's family, or a seat or screen in that room, may write to its log.
    const { data: room, error: roomError } = await db.from("rooms").select("id, family_id").eq("id", roomId).maybeSingle();
    if (roomError) throw new AuthError("server_busy", 503, { reason: roomError.message });
    if (!room || room.family_id !== who.family_id) throw new AuthError("room_not_found", 404);
    if (who.kind !== "member" && who.roomId !== roomId) throw new AuthError("room_not_found", 404);
    const { error } = await db.from("game_events").insert({
      family_id: room.family_id,
      room_id: roomId,
      member_id: who.id,
      event_type: "phone",
      payload: { kind, detail, screen: who.kind === "screen" },
    });
    if (error) throw new AuthError("server_busy", 503, { reason: error.message });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
