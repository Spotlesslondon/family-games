// What may be said in a game night's chat (plan: claude/chat-room-plan-v0.md,
// Joshua's ruling 2 Nov 22:30). Pure, so the server and the tests share it.
// The quick replies and the word filter are things a child sees the effect
// of: Joshua approves both lists (plan, question 3).

export type ChatMode = "typed" | "quick" | "off";

export const MAX_CHAT = 120;

/** One tap each, for anyone who cannot type. Words, not emojis (house rule). */
export const QUICK_REPLIES = {
  ha: "Ha!",
  nooo: "Nooo",
  well_done: "Well done",
  good_one: "Good one",
  hurry: "Hurry up",
  knew_it: "I knew it",
  not_me: "It's not me",
  wait: "Wait for me",
} as const;

export type QuickKey = keyof typeof QUICK_REPLIES;

export function isQuickKey(x: unknown): x is QuickKey {
  return typeof x === "string" && Object.prototype.hasOwnProperty.call(QUICK_REPLIES, x);
}

/**
 * The night's chat setting. Unset means automatic: quick replies only while a
 * child is in the room, typing otherwise. The host can choose any setting.
 */
export function effectiveMode(chosen: ChatMode | null, childInRoom: boolean): ChatMode {
  return chosen ?? (childInRoom ? "quick" : "typed");
}

// Swearing and slurs, matched as whole words after undoing common letter
// swaps (0 for o, 3 for e and so on). Kept short on purpose: it stops the
// obvious, the host's switches and the night's people handle the rest.
const BLOCKED = [
  "fuck", "fucks", "fucking", "fucker", "fuckin", "motherfucker", "shit", "shits", "shitty", "bullshit",
  "cunt", "cunts", "twat", "twats", "wanker", "wankers", "wank", "bastard", "bastards", "bitch", "bitches",
  "dick", "dickhead", "cock", "prick", "pussy", "slut", "sluts", "whore", "whores", "arsehole", "asshole",
  "bollocks", "piss", "pissed", "tosser", "knob", "knobhead", "bellend", "porn", "sex", "sexy", "nude", "nudes",
  "nigger", "niggers", "nigga", "paki", "pakis", "faggot", "faggots", "fag", "fags", "retard", "retards",
  "spastic", "spaz", "tranny", "kike", "chink", "gook", "wog", "coon", "dyke",
];
const BLOCKED_SET = new Set(BLOCKED);

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[0@4]/g, (c) => (c === "0" ? "o" : "a"))
    .replace(/[1!|]/g, "i")
    .replace(/3/g, "e")
    .replace(/[5$]/g, "s")
    .replace(/7/g, "t");
}

export type ChatRefusal = "chat_empty" | "chat_too_long" | "chat_link" | "chat_contact" | "chat_word";

/** Checks a typed message. Returns the cleaned text, or why it is refused. */
export function checkTyped(raw: unknown): { ok: true; text: string } | { ok: false; reason: ChatRefusal } {
  if (typeof raw !== "string") return { ok: false, reason: "chat_empty" };
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, reason: "chat_empty" };
  if (text.length > MAX_CHAT) return { ok: false, reason: "chat_too_long" };
  // No phone numbers or email addresses: nobody swaps contact details here.
  if (/\S+@\S+\.\S+/.test(text) || /(\d[\s-]?){7,}/.test(text)) return { ok: false, reason: "chat_contact" };
  // No links: nothing in chat takes a child somewhere else.
  if (/(https?:|www\.|\b[a-z0-9-]+\s*(\.|dot)\s*(com|co|uk|net|org|io|me|ly|gg|app|tv|be|to)\b)/i.test(text)) {
    return { ok: false, reason: "chat_link" };
  }
  const words = normalise(text).split(/[^a-z]+/).filter(Boolean);
  if (words.some((w) => BLOCKED_SET.has(w))) return { ok: false, reason: "chat_word" };
  // Letters spaced out to slip past: "f u c k".
  const joined = normalise(text).replace(/[^a-z]/g, "");
  if (joined.length <= 12 && BLOCKED_SET.has(joined)) return { ok: false, reason: "chat_word" };
  return { ok: true, text };
}
