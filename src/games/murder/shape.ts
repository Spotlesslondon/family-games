// What phones may see of Murder at Ashworth Hall (Joshua, 21 Nov 19:05:
// "Research the murder mystery game. Then build your version with the basic
// images"). The players are the suspects; one of them did it and knows. The
// public state never holds who; each phone gets only its own booklet.

import type { Exhibit } from "@/games/detective/shape";

export type MurderLength = "short" | "normal";
export const MURDER_CASES: Record<MurderLength, number> = { short: 1, normal: 3 };

/** Points: every innocent player when the murderer is caught; the murderer when they get away. */
export const POINTS_CAUGHT = 3;
export const POINTS_ESCAPED = 5;

/** The guests at the dinner party. Invented, not from any other game. */
export const GUESTS = ["Major Ashby", "Dr Penrose", "Lady Vane", "Chef Rossi", "Miss Lark", "Mr Finch", "Professor Quill", "Madame Orla"] as const;

export interface Guest {
  name: string;
  colour: string;
  clothes: string;
  /** What they say about themselves in round 1. */
  intro: string;
}

/** A player's booklet. Stage 1 at the introductions, stage 2 at "where were you", stage 3 adds the clue. */
export interface Booklet {
  round: number;
  guest: Guest;
  murderer: boolean;
  secret: string;
  /** What they say in round 2: the truth, or the murderer's cover story. */
  story: string;
  /** Round 3: one clue, in words and as a picture where it has one. */
  clue: { line: string; exhibit: Exhibit | null } | null;
}

export interface MurderPublic {
  settings: { length: MurderLength; cases: number };
  round: number;
  team: string[];
  nonce: string;
  /** Which player plays which guest (the outfits are public: everyone sees what everyone wears). */
  cast: Record<string, Guest>;
  story: string | null;
  /** Who has voted, never for whom, until the reveal. */
  voted: string[];
  scores: Record<string, number>;
  last: {
    round: number;
    murdererId: string;
    murderer: string;
    accusedId: string | null;
    caught: boolean;
    tally: Record<string, number>;
    why: string[];
  } | null;
  finished: boolean;
}

/** The order of a case: phases the host moves the table through. */
export const STAGES = ["introductions", "alibis", "evidence", "vote"] as const;
