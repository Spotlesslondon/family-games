// POST /api/rooms: open a room for the caller's family (owners and grown-ups),
// or join the one already open.

import { bearer, errorResponse, readJson } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/service";
import { openRoom } from "@/lib/rooms/service";

export async function POST(request: Request) {
  try {
    const token = bearer(request);
    if (!token) throw new AuthError("not_signed_in", 401);
    const body = await readJson(request);
    return Response.json({ room: await openRoom(token, body.listId) });
  } catch (err) {
    return errorResponse(err);
  }
}
