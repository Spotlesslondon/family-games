// POST /api/rooms/log: { roomId }. The night's timeline from the ledger, for
// the room's host (or the family owner): what happened, who did it, when, and
// how long the server took. Secrets are never in the ledger (see service.ts).

import { bearer, errorResponse, readJson } from "@/lib/auth/http";
import { AuthError, caller } from "@/lib/auth/service";
import { serviceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const token = bearer(request);
    if (!token) throw new AuthError("not_signed_in", 401);
    const body = await readJson(request);
    if (typeof body.roomId !== "string") throw new AuthError("invalid_request", 400);
    const who = await caller(token);
    const db = serviceClient();
    const { data: room, error: roomError } = await db.from("rooms").select("id, family_id, host_member_id, opened_at, status").eq("id", body.roomId).maybeSingle();
    if (roomError) throw new AuthError("server_busy", 503, { reason: roomError.message });
    if (!room || room.family_id !== who.family_id) throw new AuthError("room_not_found", 404);
    if (who.id !== room.host_member_id && who.role !== "owner") throw new AuthError("host_only", 403);
    const [{ data: events, error }, { data: members }] = await Promise.all([
      db.from("game_events").select("id, member_id, event_type, payload, created_at").eq("room_id", room.id).order("id").limit(5000),
      db.from("members").select("id, display_name").eq("family_id", room.family_id),
    ]);
    if (error) throw new AuthError("server_busy", 503, { reason: error.message });
    const name = new Map((members ?? []).map((m) => [m.id as string, m.display_name as string]));
    return Response.json({
      ok: true,
      room: { id: room.id, status: room.status, opened_at: room.opened_at },
      events: (events ?? []).map((e) => ({ at: e.created_at, who: e.member_id ? (name.get(e.member_id as string) ?? "someone") : null, type: e.event_type, ...(e.payload as Record<string, unknown>) })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
