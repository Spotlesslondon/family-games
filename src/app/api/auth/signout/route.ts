// POST /api/auth/signout: forget this phone's session.

import { clearRefreshCookie } from "@/lib/auth/http";

export async function POST() {
  await clearRefreshCookie();
  return Response.json({ ok: true });
}
