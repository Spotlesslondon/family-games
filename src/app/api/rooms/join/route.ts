// POST /api/rooms/join: { code } joins the caller's family room with that code.

import { bearer, errorResponse, readJson } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/service";
import { joinByCode } from "@/lib/rooms/service";

export async function POST(request: Request) {
  try {
    const token = bearer(request);
    if (!token) throw new AuthError("not_signed_in", 401);
    const body = await readJson(request);
    return Response.json({ room: await joinByCode(token, body.code) });
  } catch (err) {
    return errorResponse(err);
  }
}
