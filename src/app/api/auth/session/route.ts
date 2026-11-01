// POST /api/auth/session: trade the HttpOnly refresh cookie for a fresh access
// token. Called when the app opens and before the access token expires.
// Refresh tokens rotate, so the cookie is replaced every time.

import { clearRefreshCookie, errorResponse, readRefreshCookie, setRefreshCookie } from "@/lib/auth/http";
import { AuthError, callerMember, refresh } from "@/lib/auth/service";

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
    await setRefreshCookie(session.refreshToken);
    const member = await callerMember(session.accessToken);
    return Response.json({
      accessToken: session.accessToken,
      expiresAt: session.expiresAt,
      member: { id: member.id, name: member.display_name, role: member.role, familyId: member.family_id },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
