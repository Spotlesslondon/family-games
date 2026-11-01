"use client";

// Browser-side session: the access token lives in memory only. The refresh
// token never reaches JavaScript; it stays in an HttpOnly cookie.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface ClientSession {
  accessToken: string;
  expiresAt: number | null;
  member: { id: string; name: string; role: string; familyId: string };
}

export async function loadSession(): Promise<ClientSession | null> {
  const res = await fetch("/api/auth/session", { method: "POST" });
  if (!res.ok) return null;
  return (await res.json()) as ClientSession;
}

/** A Supabase client that reads as the signed-in member, through row level security. */
export function memberClient(accessToken: string): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
    { accessToken: async () => accessToken }
  );
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
};

export function message(code: string | undefined, extra?: { attemptsLeft?: number }): string {
  if (code === "wrong_pin" && typeof extra?.attemptsLeft === "number") {
    return `That PIN is not right. ${extra.attemptsLeft} ${extra.attemptsLeft === 1 ? "try" : "tries"} left.`;
  }
  return (code && MESSAGES[code]) || "Something went wrong. Please try again.";
}
