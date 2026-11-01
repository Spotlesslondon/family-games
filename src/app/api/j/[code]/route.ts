// /api/j/[code]: joining a game night by its link.
// GET  -> { host, people } for the "who are you?" screen.
// POST -> moved to /api/auth/join/[code] (where the session cookie is sent);
//         kept here for pages opened before the move.

import { errorResponse, rateLimit } from "@/lib/auth/http";
import { lookupNight } from "@/lib/rooms/night";

export { POST } from "@/app/api/auth/join/[code]/route";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    await rateLimit(request, "joinLookup");
    const { code } = await params;
    return Response.json(await lookupNight(code), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

