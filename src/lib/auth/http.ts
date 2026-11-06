// Shared bits for the auth Route Handlers.

import { cookies } from "next/headers";
import { serviceClient } from "@/lib/supabase/server";
import { AuthError } from "./service";

export const REFRESH_COOKIE = "fg_refresh";
const SIXTY_DAYS = 60 * 24 * 60 * 60;

export async function setRefreshCookie(token: string): Promise<void> {
  (await cookies()).set(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: SIXTY_DAYS,
  });
}

export async function readRefreshCookie(): Promise<string | null> {
  return (await cookies()).get(REFRESH_COOKIE)?.value ?? null;
}

export async function clearRefreshCookie(): Promise<void> {
  (await cookies()).set(REFRESH_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 0,
  });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

/** Turns any thrown error into a JSON response. Database and server error text stays in the server log. */
export function errorResponse(err: unknown): Response {
  if (err instanceof AuthError) {
    const { reason, ...safe } = err.detail;
    if (reason) console.error(err.code, reason);
    return Response.json({ error: err.code, ...safe }, { status: err.status });
  }
  console.error(err);
  return Response.json({ error: "server_error" }, { status: 500 });
}

/**
 * The visitor's address. Vercel overwrites these headers at its edge, so a
 * visitor cannot fake them (Vercel request headers documentation, checked
 * 1 Nov 2026). A whole family at home shares one address, so limits keyed on
 * it must allow a full table of phones.
 */
export function clientIp(request: Request): string {
  const h = request.headers;
  const raw = h.get("x-vercel-forwarded-for") ?? h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "";
  return raw.split(",")[0].trim() || "unknown";
}

/** Limits per visitor address: [max requests, window in seconds]. */
export const LIMITS = {
  pinSignIn: [60, 600], // a table of phones signing in, with typos, is well under this
  familyLookup: [60, 600],
  familyCreate: [10, 3600],
  // A whole table opening the link at once, with reloads. Guessing one live
  // code among a million at this rate would take years from one address.
  joinLookup: [60, 600],
  joinClaim: [30, 600],
  // A phone reporting trouble: plenty for a bad night, not enough to flood.
  phoneLog: [60, 600],
} as const satisfies Record<string, readonly [number, number]>;

/** Counts one request against a limit; throws 429 once it is used up. */
export async function rateLimit(request: Request, name: keyof typeof LIMITS): Promise<void> {
  const [limit, windowSeconds] = LIMITS[name];
  const { data, error } = await serviceClient().rpc("rate_hit", {
    p_key: `${name}:${clientIp(request)}`,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  // If the counter itself is unreachable, let the request through: the PIN
  // lock still protects each person, and a database outage fails the request
  // anyway a moment later.
  if (error) {
    console.error("rate_hit", error.message);
    return;
  }
  if (data === false) throw new AuthError("too_many_requests", 429);
}
