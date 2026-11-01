// Shared bits for the auth Route Handlers.

import { cookies } from "next/headers";
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

/** Turns any thrown error into a JSON response. Unknown errors never leak detail. */
export function errorResponse(err: unknown): Response {
  if (err instanceof AuthError) {
    return Response.json({ error: err.code, ...err.detail }, { status: err.status });
  }
  console.error(err);
  return Response.json({ error: "server_error" }, { status: 500 });
}
