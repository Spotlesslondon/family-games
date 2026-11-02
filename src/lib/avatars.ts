// The six starter character keys (approved by Joshua, 2 Nov 2026, 00:33).
// Shared by the server (which checks a pick) and the screens (which draw it).
// A member's avatar column defaults to "star", which means not picked yet.

export const AVATAR_KEYS = ["dome", "brick", "pip", "puff", "beam", "egg"] as const;
export type AvatarKey = (typeof AVATAR_KEYS)[number];

export function isAvatarKey(v: unknown): v is AvatarKey {
  return typeof v === "string" && (AVATAR_KEYS as readonly string[]).includes(v);
}

/**
 * Whether a person may take this character tonight: it is free, or every
 * character is already taken by someone else in the room (from the seventh
 * player on, duplicates are allowed; Joshua, 2 Nov 00:33).
 */
export function mayTake(avatar: AvatarKey, takenByOthers: readonly string[]): boolean {
  if (!takenByOthers.includes(avatar)) return true;
  return AVATAR_KEYS.every((k) => takenByOthers.includes(k));
}
