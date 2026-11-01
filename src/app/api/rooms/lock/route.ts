// POST /api/rooms/lock: { roomId, locked } - the host closes the link once
// everyone is in, or opens it again for a late arrival.

import { bearer, errorResponse, readJson } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/service";
import { setLocked } from "@/lib/rooms/night";

export async function POST(request: Request) {
  try {
    const token = bearer(request);
    if (!token) throw new AuthError("not_signed_in", 401);
    const body = await readJson(request);
    return Response.json(await setLocked(token, body.roomId, body.locked === true));
  } catch (err) {
    return errorResponse(err);
  }
}
