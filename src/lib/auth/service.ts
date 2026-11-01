// Server-only sign-in service. Every function here runs inside a Route
// Handler with the secret key; nothing in this file may reach the browser.

import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/supabase/server";
import {
  cleanName,
  familyCode,
  hashPin,
  isValidDate,
  isValidPin,
  memberEmail,
  memberPassword,
  normaliseFamilyCode,
  verifyPin,
} from "./crypto";

// PIN attempts and lockouts are counted in the database: see
// pin_attempt_start and pin_attempt_finish in migration 0009.

export class AuthError extends Error {
  constructor(
    public code: string,
    public status: number,
    public detail: Record<string, unknown> = {}
  ) {
    super(code);
  }
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
}

export interface SignedIn extends Session {
  member: { id: string; name: string; role: string };
  family: { id: string; name: string; code: string };
}

function publicAuthClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function passwordFor(memberId: string): string {
  return memberPassword(memberId, process.env.MEMBER_PASSWORD_KEY ?? "");
}

/** Creates the hidden Supabase Auth user for a member and returns its id. */
async function createHiddenUser(memberId: string): Promise<string> {
  const { data, error } = await serviceClient().auth.admin.createUser({
    email: memberEmail(memberId),
    password: passwordFor(memberId),
    email_confirm: true,
  });
  if (error || !data.user) throw new AuthError("auth_user_create_failed", 500, { reason: error?.message });
  return data.user.id;
}

async function deleteHiddenUser(authUserId: string): Promise<void> {
  await serviceClient().auth.admin.deleteUser(authUserId);
}

interface NewMemberInput {
  name: unknown;
  dateOfBirth: unknown;
  pin: unknown;
}

function validateMember(input: NewMemberInput) {
  const name = cleanName(input.name);
  if (!name) throw new AuthError("invalid_name", 400);
  if (!isValidDate(input.dateOfBirth)) throw new AuthError("invalid_date_of_birth", 400);
  if (!isValidPin(input.pin)) throw new AuthError("invalid_pin", 400);
  return { name, dateOfBirth: input.dateOfBirth, pin: input.pin };
}

// ---------------------------------------------------------------------------
// Create a family and its owner, then sign the owner in.
// ---------------------------------------------------------------------------

export async function createFamily(input: NewMemberInput & { familyName: unknown }): Promise<SignedIn> {
  const familyName = cleanName(input.familyName);
  if (!familyName) throw new AuthError("invalid_family_name", 400);
  const owner = validateMember(input);

  const db = serviceClient();
  const familyId = randomUUID();
  const memberId = randomUUID();
  const authUserId = await createHiddenUser(memberId);

  let code = "";
  try {
    for (let attempt = 0; ; attempt++) {
      code = familyCode();
      const { error } = await db.from("families").insert({
        id: familyId,
        name: familyName,
        code,
        owner_user_id: authUserId,
      });
      if (!error) break;
      if (error.code !== "23505" || attempt >= 4) throw new AuthError("family_create_failed", 500, { reason: error.message });
    }

    const { error } = await db.from("members").insert({
      id: memberId,
      family_id: familyId,
      display_name: owner.name,
      date_of_birth: owner.dateOfBirth,
      role: "owner",
      pin_hash: hashPin(owner.pin),
      auth_user_id: authUserId,
    });
    if (error) throw new AuthError("member_create_failed", 500, { reason: error.message });
  } catch (err) {
    await db.from("families").delete().eq("id", familyId);
    await deleteHiddenUser(authUserId);
    throw err;
  }

  return signInWithPin(code, memberId, owner.pin);
}

// ---------------------------------------------------------------------------
// The owner adds a member.
// ---------------------------------------------------------------------------

export async function callerMember(accessToken: string) {
  const db = serviceClient();
  const { data, error } = await db.auth.getUser(accessToken);
  if (error || !data.user) throw new AuthError("not_signed_in", 401);
  const { data: member } = await db
    .from("members")
    .select("id, family_id, role, display_name")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  if (!member) throw new AuthError("not_a_member", 403);
  // A PIN lockout stops new PIN sign-ins only; someone already signed in keeps playing (0009).
  return member as { id: string; family_id: string; role: string; display_name: string };
}

export async function addMember(
  accessToken: string,
  input: NewMemberInput & { role?: unknown }
): Promise<{ id: string; name: string; role: string }> {
  const caller = await callerMember(accessToken);
  if (caller.role !== "owner") throw new AuthError("owner_only", 403);
  const member = validateMember(input);
  const role = input.role === "adult" ? "adult" : "member";

  const db = serviceClient();
  const memberId = randomUUID();
  const authUserId = await createHiddenUser(memberId);
  const { error } = await db.from("members").insert({
    id: memberId,
    family_id: caller.family_id,
    display_name: member.name,
    date_of_birth: member.dateOfBirth,
    role,
    pin_hash: hashPin(member.pin),
    auth_user_id: authUserId,
  });
  if (error) {
    await deleteHiddenUser(authUserId);
    if (error.code === "23505") throw new AuthError("name_taken", 409);
    throw new AuthError("member_create_failed", 500, { reason: error.message });
  }
  return { id: memberId, name: member.name, role };
}

// ---------------------------------------------------------------------------
// Who is in a family, for the "who is playing" screen. Names only.
// ---------------------------------------------------------------------------

export async function listMembers(rawCode: unknown) {
  const code = normaliseFamilyCode(rawCode);
  if (!code) throw new AuthError("invalid_family_code", 400);
  const db = serviceClient();
  const { data: family } = await db.from("families").select("id, name").eq("code", code).maybeSingle();
  if (!family) throw new AuthError("family_not_found", 404);
  const { data: members } = await db
    .from("members")
    .select("id, display_name, avatar")
    .eq("family_id", family.id)
    .not("pin_hash", "is", null) // only people who sign in; players join by link
    .order("created_at");
  return {
    family: { name: family.name as string, code },
    members: (members ?? []).map((m) => ({ id: m.id as string, name: m.display_name as string, avatar: m.avatar as string })),
  };
}

// ---------------------------------------------------------------------------
// PIN sign-in. The PIN is checked before Supabase Auth is touched.
// ---------------------------------------------------------------------------

export async function signInWithPin(rawCode: unknown, memberId: unknown, pin: unknown): Promise<SignedIn> {
  const code = normaliseFamilyCode(rawCode);
  if (!code || typeof memberId !== "string") throw new AuthError("invalid_request", 400);

  const db = serviceClient();
  const { data: family } = await db.from("families").select("id, name").eq("code", code).maybeSingle();
  if (!family) throw new AuthError("family_not_found", 404);

  // The attempt is counted in the database BEFORE the PIN is checked, in one
  // statement, so parallel guesses cannot slip past the lock (0009).
  const { data: started, error: startError } = await db.rpc("pin_attempt_start", {
    p_member: memberId,
    p_family: family.id,
  });
  if (startError) throw new AuthError("server_busy", 503, { reason: startError.message });
  const attempt = started as { status: string; pin_hash?: string; name?: string; role?: string; until?: string };
  // Same answer for "no such person" and "wrong PIN", so guessing reveals nothing.
  if (attempt.status === "no_member") throw new AuthError("wrong_pin", 401);
  if (attempt.status === "locked") throw new AuthError("locked", 423, { until: attempt.until });

  const correct = typeof pin === "string" && verifyPin(pin, attempt.pin_hash);
  const { data: finished } = await db.rpc("pin_attempt_finish", { p_member: memberId, p_correct: correct });
  if (!correct) {
    const result = (finished ?? {}) as { status?: string; until?: string; attempts_left?: number };
    if (result.status === "locked") throw new AuthError("locked", 423, { until: result.until });
    throw new AuthError("wrong_pin", 401, { attemptsLeft: result.attempts_left });
  }
  const member = { id: memberId, display_name: attempt.name as string, role: attempt.role as string };

  const { data, error } = await publicAuthClient().auth.signInWithPassword({
    email: memberEmail(member.id),
    password: passwordFor(member.id),
  });
  if (error || !data.session) throw new AuthError("sign_in_failed", 500, { reason: error?.message });

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? null,
    member: { id: member.id, name: member.display_name, role: member.role },
    family: { id: family.id, name: family.name, code },
  };
}

// ---------------------------------------------------------------------------
// Refresh: swaps the cookie's refresh token for a new access token.
// ---------------------------------------------------------------------------

/**
 * True for a network failure or a Supabase outage, as opposed to a refresh
 * token that is genuinely invalid. Only the latter may sign someone out.
 */
export function isTransient(error: { status?: number; name?: string }): boolean {
  if (error.name === "AuthRetryableFetchError") return true;
  const status = error.status ?? 0;
  return status === 0 || status === 429 || status >= 500;
}

export async function refresh(refreshToken: string): Promise<Session> {
  const { data, error } = await publicAuthClient().auth.refreshSession({ refresh_token: refreshToken });
  if (error && isTransient(error)) throw new AuthError("auth_unavailable", 503);
  if (error || !data.session) throw new AuthError("session_expired", 401);
  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? null,
  };
}
