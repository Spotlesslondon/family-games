// What phones may see of Fix the Machine. Shared by the server module and the
// phone screens. Nothing here holds an answer: a Fixer's view says what the
// machine shows, a Helper's rulebook says what the rules say, and only the
// server knows which taps fix a part.

export type MachinePace = "relaxed" | "normal" | "quick";
export type MachineLength = "short" | "normal" | "long";
export type MachineLevel = 1 | 2 | 3 | 4 | 5;
export type PartKey = "lamps" | "pictures" | "dial";

/** Seconds on the clock per machine, before the level's multiplier. */
export const MACHINE_CLOCK: Record<MachinePace, number> = { relaxed: 240, normal: 180, quick: 120 };
export const MACHINE_ROUNDS: Record<MachineLength, number> = { short: 1, normal: 3, long: 5 };
/** Wrong tries before the machine pops. */
export const MAX_WOBBLES = 3;

export const LAMP_COLOURS = ["red", "blue", "green", "yellow", "purple", "white"] as const;
export type LampColour = (typeof LAMP_COLOURS)[number];
export const PICTURES = ["sun", "star", "moon", "fish", "hat", "heart", "bell", "boot"] as const;
export type Picture = (typeof PICTURES)[number];
/** The colour of a picture key's cap at the levels with coloured keys. */
export const KEY_COLOURS = ["red", "blue", "green", "yellow"] as const;
export type KeyColour = (typeof KEY_COLOURS)[number];
export const PATTERNS = ["stripes", "dots", "waves", "checks", "zigzags", "rings"] as const;
export type Pattern = (typeof PATTERNS)[number];
/** What the knob's six positions can be labelled with at the harder levels. */
export const DIAL_SYMBOLS = ["anchor", "bolt", "cog", "flag", "leaf", "drop"] as const;
export type DialSymbol = (typeof DIAL_SYMBOLS)[number];
export const LIGHTS = ["green", "amber", "red"] as const;
export type Light = (typeof LIGHTS)[number];

export const PART_NAMES: Record<PartKey, string> = { lamps: "Lamps", pictures: "Pictures", dial: "Dial" };

/**
 * Where a turn of the dial's combination comes from: a pattern shown on the
 * machine (looked up in the rulebook's table), how many lamps are lit right
 * now, or the serial number's last digit.
 */
export type TurnSource = "pattern" | "lamps" | "serial";

/**
 * Difficulty, not age (Joshua, 6 Nov 2026 19:28). The host picks the level;
 * each level is one row here, so a step between two levels is a new row, not
 * new code. The ramp is the CEO seat's (claude/machine-review-v1.md, change
 * 10, 20 Nov): every level adds one new idea to every part. Clock and wobbles
 * are placeholders until the table has played them.
 */
export interface LevelSpec {
  lamps: number;
  /** How many rules the lamp manual holds (first match wins; the last is "Otherwise"). */
  lampRules: number;
  /** Some lit lamps blink, and rules may ask about it. */
  blink: boolean;
  /** After the right order the lamps change and the Fixer goes again. */
  stages: 1 | 2;
  /** Lamp rules may ask about the serial, the dial and the keys. */
  lampCross: boolean;
  pictures: number;
  /** How many rules the picture manual holds (1 means a plain order, no rules). */
  pictureRules: number;
  /** Some picture keys are upside down, and rules may ask about it. */
  flip: boolean;
  /** Picture keys have coloured caps, and rules may use the colour. */
  keyColours: boolean;
  /** Where each turn of the dial's combination comes from, in order. */
  turns: TurnSource[];
  /** What the knob's positions are labelled with. */
  dialLabels: "numbers" | "symbols";
  /** What moves the dial after the tables: nothing, the coloured light, or an odd serial number. */
  modifier: "none" | "light" | "serial";
  /** Two manuals in play (dial tables and picture rules), and a service tag says which one this machine runs. */
  manuals: 1 | 2;
  clock: number;
  /** Whether each part shows a line of help under its title. */
  hints: boolean;
}

export const LEVELS: Record<MachineLevel, LevelSpec> = {
  1: { lamps: 3, lampRules: 2, blink: false, stages: 1, lampCross: false, pictures: 3, pictureRules: 1, flip: false, keyColours: false, turns: ["pattern"], dialLabels: "numbers", modifier: "none", manuals: 1, clock: 1, hints: true },
  2: { lamps: 4, lampRules: 3, blink: false, stages: 1, lampCross: false, pictures: 4, pictureRules: 2, flip: false, keyColours: false, turns: ["pattern"], dialLabels: "numbers", modifier: "light", manuals: 1, clock: 1, hints: true },
  3: { lamps: 4, lampRules: 4, blink: true, stages: 1, lampCross: false, pictures: 4, pictureRules: 3, flip: true, keyColours: false, turns: ["pattern", "lamps"], dialLabels: "numbers", modifier: "light", manuals: 1, clock: 1, hints: true },
  4: { lamps: 4, lampRules: 4, blink: true, stages: 2, lampCross: false, pictures: 5, pictureRules: 3, flip: false, keyColours: true, turns: ["pattern", "lamps", "serial"], dialLabels: "symbols", modifier: "none", manuals: 1, clock: 1, hints: true },
  5: { lamps: 6, lampRules: 5, blink: true, stages: 2, lampCross: true, pictures: 5, pictureRules: 3, flip: true, keyColours: true, turns: ["pattern", "lamps", "serial"], dialLabels: "symbols", modifier: "serial", manuals: 2, clock: 0.75, hints: false },
};

/** The level picker's lines (CEO seat, claude/machine-review-v1.md). */
export const LEVEL_NAMES: Record<MachineLevel, string> = {
  1: "Start here. Three lamps, three pictures, one turn of the dial.",
  2: "Rules with conditions, and a light under the dial.",
  3: "Blinking lamps, upside-down pictures, two turns.",
  4: "Lamps in two stages, coloured pictures, three turns.",
  5: "All of it, two manuals, less time, no hints.",
};

export interface Lamp {
  colour: LampColour;
  lit: boolean;
  /** A blinking lamp is lit. */
  blink?: boolean;
}

export interface Key {
  picture: Picture;
  flipped?: boolean;
  colour?: KeyColour;
}

/** The Fixer's view of the machine. What is on the screen, never the answer. */
export interface MachineView {
  serial: number;
  lamps?: Lamp[];
  pictures?: Key[];
  dial?: {
    /** The combination's turns, in order. A pattern turn shows its pattern. */
    turns: { source: TurnSource; pattern?: Pattern }[];
    labels: "numbers" | "symbols";
    /** The symbol at each of the six positions, clockwise from the top. */
    symbols?: DialSymbol[];
    light?: Light;
  };
}

/** One section of the rulebook, as every Helper reads it. "tag" is the service tag at level 5. */
export interface RuleCard {
  part: PartKey | "tag";
  title: string;
  lines: string[];
}

export type PartState = "open" | "stage2" | "fixed";

export interface MachinePublic {
  settings: { pace: MachinePace; length: MachineLength; level: MachineLevel; clockSeconds: number; rounds: number };
  /** Which machine this is, 1 up. 0 before the first is dealt. */
  round: number;
  /** Everyone who was in the room when the game started: the team. */
  team: string[];
  /** Who has fixed once already, this game and the ones before it (Play again carries it). */
  fixedOnce: string[];
  /** The server turns this into the machine with its key. */
  nonce: string;
  fixerId: string;
  /** Who fixes the next machine, shown between machines. */
  nextFixerId: string | null;
  /** Which parts this machine has, and where each stands. */
  parts: Partial<Record<PartKey, PartState>>;
  wobbles: number;
  /** Team points so far. */
  score: number;
  /** How many machines were fixed and how many popped, this game. */
  tally: { fixed: number; popped: number };
  /** Every machine so far was a clean fix (all parts, no wobbles). */
  allClean: boolean;
  /** The last thing that happened, for every phone to show. */
  last: { round: number; won: boolean; popped: "wobbles" | "time" | null; fixed: number; wobbles: number; points: number } | null;
  /** A short line every phone shows for a moment: a part fixed, a wobble. */
  flash: { n: number; text: string } | null;
  finished: boolean;
}

export type MachineMine =
  | { round: number; role: "fixer"; view: MachineView }
  | { round: number; role: "helper"; cards: RuleCard[] };
