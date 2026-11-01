// POST /api/room-action: { roomId, type, payload? }. The one door every phone
// action goes through. The engine decides; the database commits; Realtime tells
// every phone.

import { bearer, errorResponse, readJson } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/service";
import { act } from "@/lib/rooms/service";

export async function POST(request: Request) {
  try {
    const token = bearer(request);
    if (!token) throw new AuthError("not_signed_in", 401);
    const body = await readJson(request);
    if (typeof body.roomId !== "string" || typeof body.type !== "string") {
      throw new AuthError("invalid_request", 400);
    }
    const payload = body.payload && typeof body.payload === "object" ? (body.payload as Record<string, unknown>) : undefined;
    const result = await act(token, body.roomId, body.type, payload);
    return Response.json(result, { status: result.ok ? 200 : 409 });
  } catch (err) {
    return errorResponse(err);
  }
}
