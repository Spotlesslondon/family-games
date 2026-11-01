// POST /api/auth/session: trade the HttpOnly refresh cookie for a fresh access
// token. Called when the app opens and before the access token expires.
// Refresh tokens rotate, so the cookie is replaced every time.

import { clearRefreshCookie, errorResponse, readRefreshCookie, setRefreshCookie } from "@/lib/auth/http";
import { AuthError, caller, refresh } from "@/lib/auth/service";

export async function POST() {
  try {
    const token = await readRefreshCookie();
    if (!token) throw new AuthError("not_signed_in", 401);
    let session;
    try {
      session = await refresh(token);
    } catch (err) {
      // Only an invalid refresh token signs the phone out. A Supabase hiccup
      // (503) leaves the cookie alone so the next try can succeed.
      if (err instanceof AuthError && err.status === 401) await clearRefreshCookie();
      throw err;
    }
    // Refresh tokens rotate: store the new one before anything else can fail.
    await setRefreshCookie(session.refreshToken);
    let who;
    try {
      who = await caller(session.accessToken);
    } catch (err) {
      // A phone that joined by link whose night is over, or that left or was
      // removed: nothing left to renew, so the phone is signed out.
      if (err instanceof AuthError && err.code === "seat_ended") await clearRefreshCookie();
      throw err;
    }
    return Response.json({
      accessToken: session.accessToken,
      expiresAt: session.expiresAt,
      member: { id: who.id, name: who.display_name, role: who.role, familyId: who.family_id },
      ...(who.kind === "seat" ? { seat: { roomId: who.roomId } } : {}),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
