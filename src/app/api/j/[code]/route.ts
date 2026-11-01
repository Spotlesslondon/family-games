// /api/j/[code]: joining a game night by its link.
// GET  -> { host, people } for the "who are you?" screen.
// POST -> { memberId } or { guestName, ageBand }: sits this phone down, puts a
//         seat session in the HttpOnly cookie and returns the access token.
//         { screen: true }: makes this device the night's big screen instead.

import { errorResponse, rateLimit, readJson, readRefreshCookie, setRefreshCookie } from "@/lib/auth/http";
import { claimScreen, claimSeat, lookupNight } from "@/lib/rooms/night";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    await rateLimit(request, "joinLookup");
    const { code } = await params;
    return Response.json(await lookupNight(code), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    await rateLimit(request, "joinClaim");
    const { code } = await params;
    const body = await readJson(request);
    if (body.screen === true) {
      const tv = await claimScreen(code, body, await readRefreshCookie());
      await setRefreshCookie(tv.refreshToken);
      return Response.json({
        accessToken: tv.accessToken,
        expiresAt: tv.expiresAt,
        member: { id: "", name: "TV", role: "screen", familyId: tv.screen.familyId },
        screen: { roomId: tv.screen.roomId },
      });
    }
    const seated = await claimSeat(code, body, await readRefreshCookie());
    await setRefreshCookie(seated.refreshToken);
    return Response.json({ accessToken: seated.accessToken, expiresAt: seated.expiresAt, member: seated.member, seat: seated.seat });
  } catch (err) {
    return errorResponse(err);
  }
}
