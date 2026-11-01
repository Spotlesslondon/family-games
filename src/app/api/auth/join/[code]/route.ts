// POST /api/auth/join/[code]: joining a game night by its link.
// { memberId } or { guestName, ageBand }: sits this phone down as a player.
// { screen: true }: makes this device the night's big screen instead.
// Lives under /api/auth because the session cookie is only sent there: that is
// how a device that already joined (as a player or the TV) is recognised and
// reused, instead of being given a new identity every time.

import { errorResponse, rateLimit, readJson, readRefreshCookie, setRefreshCookie } from "@/lib/auth/http";
import { claimScreen, claimSeat } from "@/lib/rooms/night";

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
