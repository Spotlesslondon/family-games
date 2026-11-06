// What phones may see of Fix the Machine. Shared by the server module and the
// phone screens. Nothing here holds an answer: a Fixer's view says what the
// machine shows, a Helper's card says what the rulebook says, and only the
// server knows which taps fix a part.

export type MachinePace = "relaxed" | "normal" | "quick";
export type MachineLength = "short" | "normal" | "long";
export type PartKey = "lamps" | "pictures" | "dial";

/** Seconds on the clock per round. */
export const MACHINE_CLOCK: Record<MachinePace, number> = { relaxed: 240, normal: 180, quick: 120 };
export const MACHINE_ROUNDS: Record<MachineLength, number> = { short: 1, normal: 3, long: 5 };
/** Wrong tries before the machine pops. */
export const MAX_WOBBLES = 3;

export const LAMP_COLOURS = ["red", "blue", "green", "yellow", "purple", "white"] as const;
export type LampColour = (typeof LAMP_COLOURS)[number];
export const PICTURES = ["sun", "star", "moon", "fish", "hat", "key", "bell", "boot"] as const;
export type Picture = (typeof PICTURES)[number];
export const PATTERNS = ["stripes", "dots", "waves", "checks", "zigzags", "rings"] as const;
export type Pattern = (typeof PATTERNS)[number];
export const DIAL_SETTINGS = [1, 2, 3, 4, 5, 6] as const;

export const PART_NAMES: Record<PartKey, string> = { lamps: "The lamps", pictures: "The picture row", dial: "The dial" };

/** The Fixer's view of the machine. What is on the screen, never the answer. */
export interface MachineView {
  serial: number;
  lamps?: { colour: LampColour; lit: boolean }[];
  pictures?: Picture[];
  dial?: { pattern: Pattern };
}

/** One piece of the rulebook, as a Helper reads it. */
export interface RuleCard {
  part: PartKey;
  title: string;
  lines: string[];
}

export interface MachinePublic {
  settings: { pace: MachinePace; length: MachineLength; clockSeconds: number; rounds: number };
  round: number;
  /** Everyone who was in the room when the game started: the team. */
  team: string[];
  /** Where the Fixer rotation starts in the team list. */
  fixerStart: number;
  /** The server turns this into the machine with its key. */
  nonce: string;
  fixerId: string;
  /** Which parts this round has, and which are fixed. */
  parts: Partial<Record<PartKey, "open" | "fixed">>;
  wobbles: number;
  /** Who holds which rulebook pieces, by part, so the Fixer knows who to ask. */
  holders: Record<string, PartKey[]>;
  /** Team points so far. */
  score: number;
  last: { round: number; won: boolean; popped: "wobbles" | "time" | null; fixed: number; wobbles: number; points: number } | null;
  finished: boolean;
}

export type MachineMine =
  | { round: number; role: "fixer"; view: MachineView }
  | { round: number; role: "helper"; cards: RuleCard[] };
