// What phones may see of Fix the Machine. Shared by the server module and the
// phone screens. Nothing here holds an answer: a Fixer's view says what the
// machine shows, a Helper's card says what the rulebook says, and only the
// server knows which taps fix a part.

export type MachinePace = "relaxed" | "normal" | "quick";
export type MachineLength = "short" | "normal" | "long";
export type MachineLevel = 1 | 2 | 3 | 4 | 5;
export type PartKey = "lamps" | "pictures" | "dial";

/** Seconds on the clock per round, before the level's multiplier. */
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
/** What the knob's six positions can be labelled with at the harder levels. */
export const DIAL_SYMBOLS = ["anchor", "bolt", "cog", "flag", "leaf", "drop"] as const;
export type DialSymbol = (typeof DIAL_SYMBOLS)[number];
export const LIGHTS = ["green", "amber", "red"] as const;
export type Light = (typeof LIGHTS)[number];

export const PART_NAMES: Record<PartKey, string> = { lamps: "The lamps", pictures: "The picture row", dial: "The dial" };

/**
 * Difficulty, not age (Joshua, 6 Nov 2026 19:28). The host picks the level;
 * each level is one row here, so a step between two levels is a new row, not
 * new code. Clock and wobbles are placeholders until the table has played them.
 */
export interface LevelSpec {
  lamps: number;
  /** Which lamp rules may be drawn: 0 lit first, 1 off first reversed, 2 colour order. */
  lampRules: number[];
  pictures: number;
  /** How many turns the dial's combination has. */
  dialTurns: number;
  /** What the knob's positions are labelled with. */
  dialLabels: "numbers" | "symbols";
  /** What changes the number the table gives: nothing, a coloured light, or the serial number. */
  modifier: "none" | "light" | "serial";
  /** Two rulebook tables, and the lamps decide which applies. */
  dependency: boolean;
  /** Two manuals in play, and a service tag says which one this machine runs. */
  manuals: 1 | 2;
  clock: number;
  /** Whether each part shows a line of help under its title. */
  hints: boolean;
}

export const LEVELS: Record<MachineLevel, LevelSpec> = {
  1: { lamps: 3, lampRules: [0, 2], pictures: 3, dialTurns: 1, dialLabels: "numbers", modifier: "none", dependency: false, manuals: 1, clock: 1, hints: true },
  2: { lamps: 4, lampRules: [0, 1, 2], pictures: 4, dialTurns: 1, dialLabels: "numbers", modifier: "light", dependency: false, manuals: 1, clock: 1, hints: true },
  3: { lamps: 4, lampRules: [0, 1, 2], pictures: 4, dialTurns: 2, dialLabels: "numbers", modifier: "none", dependency: true, manuals: 1, clock: 1, hints: true },
  4: { lamps: 4, lampRules: [0, 1, 2], pictures: 4, dialTurns: 3, dialLabels: "symbols", modifier: "serial", dependency: true, manuals: 1, clock: 1, hints: true },
  5: { lamps: 4, lampRules: [0, 1, 2], pictures: 4, dialTurns: 3, dialLabels: "symbols", modifier: "serial", dependency: false, manuals: 2, clock: 0.75, hints: false },
};

export const LEVEL_NAMES: Record<MachineLevel, string> = {
  1: "Level 1: one turn",
  2: "Level 2: mind the light",
  3: "Level 3: two turns, check the lamps",
  4: "Level 4: three turns, symbols",
  5: "Level 5: two manuals, tight clock",
};

/** The Fixer's view of the machine. What is on the screen, never the answer. */
export interface MachineView {
  serial: number;
  lamps?: { colour: LampColour; lit: boolean }[];
  pictures?: Picture[];
  dial?: {
    /** One pattern per turn of the combination. */
    patterns: Pattern[];
    labels: "numbers" | "symbols";
    /** The symbol at each of the six positions, clockwise from the top. */
    symbols?: DialSymbol[];
    light?: Light;
  };
}

/** One piece of the rulebook, as a Helper reads it. */
export interface RuleCard {
  part: PartKey;
  title: string;
  lines: string[];
}

export interface MachinePublic {
  settings: { pace: MachinePace; length: MachineLength; level: MachineLevel; clockSeconds: number; rounds: number };
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
  /** The rulebook's index: every card, and who holds it. Everyone sees this; only holders see the words. */
  cards: { title: string; part: PartKey; holders: string[] }[];
  /** Team points so far. */
  score: number;
  last: { round: number; won: boolean; popped: "wobbles" | "time" | null; fixed: number; wobbles: number; points: number } | null;
  finished: boolean;
}

export type MachineMine =
  | { round: number; role: "fixer"; view: MachineView }
  | { round: number; role: "helper"; cards: RuleCard[] };
