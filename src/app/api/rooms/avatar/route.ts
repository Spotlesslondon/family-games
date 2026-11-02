// POST /api/rooms/avatar: { roomId, avatar } - a person in the lobby picks
// their character (one of six keys). Refused once a game has started.

import { bearer, errorResponse, readJson } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/service";
import { setAvatar } from "@/lib/rooms/night";

export async function POST(request: Request) {
  try {
    const token = bearer(request);
    if (!token) throw new AuthError("not_signed_in", 401);
    const body = await readJson(request);
    return Response.json(await setAvatar(token, body.roomId, body.avatar));
  } catch (err) {
    return errorResponse(err);
  }
}
