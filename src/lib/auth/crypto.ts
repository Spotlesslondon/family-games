// Pure helpers for sign-in. No I/O, so they are unit tested directly.

import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// PINs: four digits, stored only as a salted scrypt hash.
// Format: scrypt$<N>$<salt b64>$<hash b64>
// ---------------------------------------------------------------------------

const SCRYPT_N = 16384;
const KEY_LEN = 32;

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === "string" && /^[0-9]{4}$/.test(pin);
}

export function hashPin(pin: string): string {
  if (!isValidPin(pin)) throw new Error("PIN must be four digits");
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, KEY_LEN, { N: SCRYPT_N });
  return `scrypt$${SCRYPT_N}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPin(pin: string, stored: string | null | undefined): boolean {
  // People who only ever join by link have no PIN and can never sign in.
  if (!stored || !isValidPin(pin)) return false;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  if (!Number.isInteger(n) || n < 1024) return false;
  const salt = Buffer.from(parts[2], "base64");
  const expected = Buffer.from(parts[3], "base64");
  const actual = scryptSync(pin, salt, expected.length, { N: n });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// ---------------------------------------------------------------------------
// Hidden member passwords: derived, never stored.
// ---------------------------------------------------------------------------

export function memberPassword(authUserId: string, key: string): string {
  if (!key || key.length < 32) throw new Error("MEMBER_PASSWORD_KEY is missing or too short");
  return createHmac("sha256", key).update(`member-password:${authUserId}`).digest("base64url");
}

/** The hidden Auth user's email. Never shown, never mailed: the .invalid
 *  top-level domain is reserved and can never receive mail. */
export function memberEmail(memberId: string): string {
  return `member-${memberId}@members.family-games.invalid`;
}

// ---------------------------------------------------------------------------
// Codes
// ---------------------------------------------------------------------------

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function familyCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += LETTERS[randomInt(0, LETTERS.length)];
  return out;
}

export function normaliseFamilyCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.trim().toUpperCase();
  return /^[A-Z]{6}$/.test(code) ? code : null;
}

// ---------------------------------------------------------------------------
// Age bands, from date of birth. Today is passed in so tests are fixed.
// ---------------------------------------------------------------------------

export type AgeBand = "6-8" | "9-11" | "12-15" | "16+";

export function ageOn(dateOfBirth: string, today: string): number {
  const [by, bm, bd] = dateOfBirth.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

export function ageBand(dateOfBirth: string, today: string): AgeBand {
  const age = ageOn(dateOfBirth, today);
  if (age <= 8) return "6-8";
  if (age <= 11) return "9-11";
  if (age <= 15) return "12-15";
  return "16+";
}

export function isValidDate(input: unknown): input is string {
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return false;
  const d = new Date(`${input}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === input;
}

export function cleanName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= 40 ? name : null;
}
