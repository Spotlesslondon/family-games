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

// A phone that joined by link remembers which night, so that when the night
// ends (or the host removes it) the screen can say so instead of asking a
// guest for a family code they never had.
const SEAT_KEY = "asher-seat-room";

export function rememberSeat(roomId: string): void {
  try {
    localStorage.setItem(SEAT_KEY, roomId);
  } catch {}
}

export function wasSeatIn(roomId: string): boolean {
  try {
    return localStorage.getItem(SEAT_KEY) === roomId;
  } catch {
    return false;
  }
}

export function forgetSeat(): void {
  try {
    localStorage.removeItem(SEAT_KEY);
  } catch {}
}

/**
 * A new anonymous Supabase session made by this phone, for joining a night by
 * link. Its refresh token goes straight to our server, which keeps it in the
 * HttpOnly cookie; nothing is stored in the browser.
 */
export async function newPhoneSession(): Promise<string | null> {
  const auth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  ).auth;
  const { data, error } = await auth.signInAnonymously().catch(() => ({ data: null, error: true }));
  if (error || !data?.session) return null;
  return data.session.refresh_token;
}

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
  invalid_family_code: "A family code is six letters. A game night code is six numbers.",
  family_not_found: "No family has that code. Check the letters and try again.",
  wrong_pin: "That PIN is not right.",
  locked: "Too many tries. Wait 15 minutes, or ask the family owner.",
  name_taken: "Someone here already has that name. Try adding an initial.",
  owner_only: "Only the family owner can add people.",
  not_signed_in: "Please sign in again.",
  grown_ups_host: "Only a grown-up can start a game night.",
  room_not_found: "That game night has ended.",
  game_in_progress: "A game is already running. Wait for the next one.",
  busy_try_again: "Lots happening at once. Try again.",
  offline: "Could not reach Asher Games. Check your connection and try again.",
  too_many_requests: "Too many tries from this Wi-Fi. Wait a few minutes and try again.",
  server_busy: "Asher Games is busy. Try again in a moment.",
  invalid_join_code: "A game night code is six numbers.",
  night_not_found: "This game night is not taking players. Ask the host for the link again.",
  invalid_age_band: "Pick an age.",
  not_on_the_list: "That name is not on tonight's list.",
  already_seated: "This phone is already in tonight's game as someone else.",
  host_only: "Only the host can do that.",
  cannot_remove_self: "The host cannot remove themselves.",
  seat_ended: "You are no longer in this game night.",
  phone_session_needed: "Could not set up this phone. Try again.",
  screens_only_watch: "The TV shows the game. Play on your phone.",
  screen_failed: "Could not set up the TV. Try again.",
  invalid_list_name: "Give the list a name, up to 40 letters.",
  list_name_taken: "You already have a list with that name.",
  too_many_lists: "That is the most lists you can keep. Delete one first.",
  list_full: "That list is full (30 people).",
  list_not_found: "That list has gone. It may have been deleted on another phone.",
  person_not_found: "That person has gone. They may have been removed on another phone.",
};

export function message(code: string | undefined, extra?: { attemptsLeft?: number }): string {
  if (code === "wrong_pin" && typeof extra?.attemptsLeft === "number") {
    return `That PIN is not right. ${extra.attemptsLeft} ${extra.attemptsLeft === 1 ? "try" : "tries"} left.`;
  }
  return (code && MESSAGES[code]) || "Something went wrong. Please try again.";
}
