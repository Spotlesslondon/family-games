// POST /api/auth/pin: { code, memberId, pin } -> signed in, refresh token in an HttpOnly cookie.

import { errorResponse, readJson, setRefreshCookie } from "@/lib/auth/http";
import { signInWithPin } from "@/lib/auth/service";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const signedIn = await signInWithPin(body.code, body.memberId, body.pin);
    await setRefreshCookie(signedIn.refreshToken);
    return Response.json({
      accessToken: signedIn.accessToken,
      expiresAt: signedIn.expiresAt,
      member: signedIn.member,
      family: signedIn.family,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
