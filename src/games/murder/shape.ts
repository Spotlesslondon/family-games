// Murder at Ashworth Hall, rebuilt 22 Nov 2026 as a hidden-murderer game the
// players drive (Joshua, 22 Nov: "The aim of the game is to frame someone").
// Rules are in claude/ashworth-hall-rebuild-v0.md. Copy is a tech lead draft
// for the CEO seat to rewrite.

import type { ThemeKey } from "./themes";

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 12;
/** Guards needed on one player to stop a kill (Joshua, 22 Nov 13:35: guests need a reason to tap at night). */
export const GUARDS_TO_SAVE = 2;
// No timers in this game (Joshua, 22 Nov 18:42): night and day move on when more
// than half the players still in have pressed ready (and, at night, the
// murderers have agreed). How long each took is logged for the table test.

/** Night messages (Joshua, 22 Nov 14:05): named, ready-made lines only, so every
 * phone is busy at night and nobody can type free text to anyone else. A line
 * with {about} names a second player. */
export const QUICK_LINES: { text: string; about: boolean }[] = [
  { text: "I suspect {about}", about: true },
  { text: "Watch {about} tomorrow", about: true },
  { text: "Vote {about} with me", about: true },
  { text: "{about} is innocent, I am sure", about: true },
  { text: "Trust me tomorrow", about: false },
  { text: "I am innocent", about: false },
  { text: "Who do you suspect?", about: false },
  { text: "I have my eye on you", about: false },
  { text: "Back me up tomorrow", about: false },
  { text: "Keep this between us", about: false },
];
export const MAX_MESSAGES_PER_NIGHT = 10;

export interface Whisper {
  day: number;
  from: string;
  to: string;
  line: number;
  about: string | null;
}
export const POINTS_MURDERER_WIN = 5;
export const POINTS_GUEST_WIN = 3;

export type CardKey = "kill" | "silence" | "blackmail" | "pardon" | "showdown" | "guard";
export const MURDERER_CARDS: CardKey[] = ["kill", "silence", "blackmail"];
export const GUEST_CARDS: CardKey[] = ["pardon", "showdown"];

export interface MurderSettings {
  /** Words and colours only; the rules are the same in every theme. */
  theme: ThemeKey;
  murderers: number;
  targets: number;
  /** Kills each murderer brings to the game, pooled. */
  killsEach: number;
  cards: Record<CardKey, boolean>;
}

/** A night choice. Guests make one too (who they guard), so every phone is busy at night and every guest has a reason to choose. */
export interface NightPick {
  action: "kill" | "silence" | "blackmail" | "nothing" | "suspect" | "guard";
  player: string | null;
  /** Blackmail only: who the blackmailed guest must vote for tomorrow. */
  voteFor?: string | null;
}

export interface VoteDay {
  day: number;
  showdown: { caller: string; opponent: string } | null;
  /** Revealed only after everyone has voted. */
  entries: { voter: string; vote: string }[];
  out: string | null;
  pardoned: boolean;
  /** Role of who left, shown at the reveal. */
  role: "murderer" | "guest" | null;
  target: boolean;
  blackmail: boolean;
}

export interface Departure {
  id: string;
  how: "killed" | "sent_away";
  day: number;
  role: "murderer" | "guest";
}

export interface MurderPublic {
  settings: MurderSettings;
  team: string[];
  alive: string[];
  departed: Departure[];
  day: number;
  /** How many phones have made tonight's choice. Shown to the host only. */
  nightReady: number;
  /** Who has pressed "ready" in this night or day. Everyone has the button, murderers included. */
  ready: string[];
  phaseStartedAt: string | null;
  /** How long each night and day took, for the table test. */
  timings: { phase: "night" | "day"; day: number; seconds: number }[];
  killsLeft: number;
  /** What the morning brought. */
  morning: { killed: string | null; silenced: string | null; blackmail: boolean; guarded?: string | null } | null;
  silenced: string | null;
  blackmailToday: boolean;
  election: { round: 1 | 2; candidates: string[] | null; voted: string[]; firstRound: Record<string, number> | null } | null;
  cardHolder: string | null;
  electionDone: boolean;
  pardonUsed: boolean;
  showdownUsed: boolean;
  /** A card holder who has left must hand the card on. */
  passing: string | null;
  voted: string[];
  votes: VoteDay[];
  framed: number;
  winner: "murderers" | "guests" | null;
  /** Revealed at the end: who the murderers were and who they had to frame. */
  endReveal: { murderers: string[]; targets: string[] } | null;
  scores: Record<string, number>;
  finished: boolean;
}

export interface MurderMine {
  role: "murderer" | "guest";
  /** Murderers only. */
  partners?: string[];
  targets?: string[];
  pick?: NightPick | null;
  partnerPicks?: Record<string, NightPick | null>;
  /** Guests only, while blackmailed: the vote they must cast today. */
  mustVote?: string | null;
  /** Private until everyone has voted. */
  vote?: string | null;
  elect?: string | null;
  /** Night messages to and from this phone. Private: never in public state. */
  inbox?: Whisper[];
  sent?: Whisper[];
}

/** Plain rules check for the host's settings. Blocks what cannot work, warns on what is lopsided. */
export function checkSettings(n: number, s: MurderSettings): { ok: boolean; reason?: string; warning?: string } {
  if (n < MIN_PLAYERS) return { ok: false, reason: `Needs ${MIN_PLAYERS} players` };
  if (n > MAX_PLAYERS) return { ok: false, reason: `Up to ${MAX_PLAYERS} players` };
  if (s.murderers < 1) return { ok: false, reason: "Needs at least 1 murderer" };
  if (s.targets < 1) return { ok: false, reason: "Needs at least 1 target" };
  const guests = n - s.murderers;
  if (guests <= s.murderers) return { ok: false, reason: "Too many murderers for this many players" };
  if (s.targets > guests - 1) return { ok: false, reason: "Too many targets for this many guests" };
  // Warnings from the 22 Nov simulation: lopsided settings, still playable.
  if (s.targets > 2 * s.murderers) return { ok: true, warning: "Very hard for the murderers" };
  if (s.murderers * 3 > n) return { ok: true, warning: "Very hard for the guests" };
  return { ok: true };
}

export function defaultSettings(n: number): MurderSettings {
  const m = n >= 8 ? 2 : 1;
  return {
    theme: "manor",
    murderers: m,
    targets: m,
    killsEach: 1,
    cards: { kill: true, silence: true, blackmail: true, pardon: true, showdown: false, guard: false },
  };
}
