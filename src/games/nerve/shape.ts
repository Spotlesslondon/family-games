// What every phone may see of Nerve. Shared by the server module and the phone
// screens. The bust number is never in here until the round is over.

export type NervePace = "relaxed" | "normal" | "quick";
export type NerveLength = "short" | "normal" | "long";
export type NerveLevel = "gentle" | "normal" | "wild";

/** Milliseconds per step of the pot. */
export const NERVE_BEAT: Record<NervePace, number> = { relaxed: 900, normal: 650, quick: 450 };
export const NERVE_ROUNDS: Record<NerveLength, number> = { short: 3, normal: 5, long: 8 };

/** The pot at a moment: 0 before the climb starts, then 1, 2, 3 at each beat. */
export function potAt(nowMs: number, startAt: string | null, beatMs: number): number {
  if (!startAt) return 0;
  const start = Date.parse(startAt);
  if (nowMs < start) return 0;
  return 1 + Math.floor((nowMs - start) / beatMs);
}

export interface NerveLast {
  round: number;
  bust: number;
  /** What each player banked, for the players who let go in time. */
  banked: Record<string, number>;
  /** Still holding when the pot hit the bust number. */
  busted: string[];
}

export interface NervePublic {
  settings: { pace: NervePace; length: NerveLength; level: NerveLevel; beatMs: number; rounds: number };
  round: number;
  /** Random per round. The server turns it into the bust number with its key. */
  nonce: string;
  /** Phones with a thumb down, waiting for the climb. */
  ready: string[];
  /** Who is in this round: everyone ready when the climb started. */
  inRound: string[];
  /** When the pot starts at 1. Every phone counts from this. */
  startAt: string | null;
  /** Who has let go, in the order they let go. Not what they banked. */
  bankedOrder: string[];
  scores: Record<string, number>;
  last: NerveLast | null;
  finished: boolean;
}

/** A phone's own row: what it banked this round, seen only by itself. */
export interface NerveMine {
  /** The round's nonce, so a row left from an earlier round or game never counts. */
  nonce: string;
  banked: number;
}
