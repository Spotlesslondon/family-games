// POST /api/auth/signout: end this phone's session on the server, then forget
// the cookie. Without the server step, a copied refresh token would keep
// working until it expired.

import { bearer, clearRefreshCookie } from "@/lib/auth/http";
import { serviceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const token = bearer(request);
  if (token) {
    const { error } = await serviceClient().auth.admin.signOut(token, "local");
    if (error) console.error("signout", error.message);
  }
  await clearRefreshCookie();
  return Response.json({ ok: true });
}
