"use client";

// Browser-side session. The rules (renew before expiry, one renewal at a time,
// blips are not sign-outs, sign-out beats renewal) live in session-store.ts
// and are tested there.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSessionStore, SessionUnavailable, type ClientSession } from "./session-store";

export { SessionUnavailable, type ClientSession };

// Serialise renewals across tabs on the same phone, where the browser allows it.
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  return locks ? (locks.request("asher-session-renew", fn) as Promise<T>) : fn();
}

const store = createSessionStore({
  fetchSession: () => fetch("/api/auth/session", { method: "POST" }),
  now: () => Date.now(),
  withLock,
});

/** The signed-in member's session, renewed if needed. Null when signed out; throws SessionUnavailable on a blip. */
export const loadSession = (): Promise<ClientSession | null> => store.load();

/** A current access token for a request to our own server. */
export const currentToken = (): Promise<string | null> => store.token();

/** The token in memory right now, for sends that cannot wait (the page being hidden). */
export const cachedToken = (): string | null => store.cachedToken();

/** Drop the in-memory session. Call on sign-in and sign-out so a shared phone never shows the last person. */
export const forgetSession = (): void => store.forget();

let client: SupabaseClient | null = null;

/**
 * The one Supabase client for this page. It reads as the signed-in member,
 * through row level security, and asks the store for a current token on every
 * request and every live-update heartbeat, so it never runs on an expired one.
 */
export function memberClient(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
      { accessToken: async () => (await store.token().catch(() => store.cachedToken())) ?? null }
    );
  }
  return client;
}

/**
 * POST to our own API as the signed-in member, with a current token. If the
 * server says the token is no good, renew once and retry.
 */
export async function postAsMember(path: string, body: unknown, init?: { keepalive?: boolean }): Promise<Response> {
  const send = (token: string | null) =>
    fetch(path, {
      method: "POST",
      keepalive: init?.keepalive,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body ?? {}),
    });
  if (init?.keepalive) return send(store.cachedToken());
  const res = await send(await store.token());
  if (res.status !== 401) return res;
  store.invalidate();
  return send(await store.token());
}

export const AVATAR_COLOURS = ["#FFC93C", "#8FA8FF", "#6FD3B7", "#FF7A66", "#E3A6F2"];

export function avatarColour(index: number): string {
  return AVATAR_COLOURS[index % AVATAR_COLOURS.length];
}

export function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

const MESSAGES: Record<string, string> = {
  invalid_family_name: "Give your family a name.",
  invalid_name: "Type a name, up to 40 letters.",
  invalid_date_of_birth: "Pick a date of birth.",
  invalid_pin: "A PIN is four numbers.",
  invalid_family_code: "A family code is six letters.",
  family_not_found: "No family has that code. Check the letters and try again.",
  wrong_pin: "That PIN is not right.",
  locked: "Too many tries. Wait 15 minutes, or ask the family owner.",
  name_taken: "Someone in the family already has that name.",
  owner_only: "Only the family owner can add people.",
  not_signed_in: "Please sign in again.",
  grown_ups_host: "Only a grown-up can start a game night.",
  room_not_found: "That game night has ended.",
  game_in_progress: "A game is already running. Wait for the next one.",
  busy_try_again: "Lots happening at once. Try again.",
  offline: "Could not reach Asher Games. Check your connection and try again.",
  too_many_requests: "Too many tries from this Wi-Fi. Wait a few minutes and try again.",
  server_busy: "Asher Games is busy. Try again in a moment.",
};

export function message(code: string | undefined, extra?: { attemptsLeft?: number }): string {
  if (code === "wrong_pin" && typeof extra?.attemptsLeft === "number") {
    return `That PIN is not right. ${extra.attemptsLeft} ${extra.attemptsLeft === 1 ? "try" : "tries"} left.`;
  }
  return (code && MESSAGES[code]) || "Something went wrong. Please try again.";
}
