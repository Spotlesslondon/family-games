// What phones may see of the Detective game. Shared by the server module and
// the phone screens. Nothing public holds the answer: every player sees the
// story and the suspects, each player sees only their own evidence, and only
// the server knows who did it until the team accuses.

export type DetectiveLevel = 1 | 2;
export type DetectiveLength = "short" | "normal";
export type RoleKey = "cctv" | "witness" | "records" | "forensics";

export const DETECTIVE_CASES: Record<DetectiveLength, number> = { short: 1, normal: 3 };

export const ROLE_NAMES: Record<RoleKey, string> = {
  cctv: "CCTV",
  witness: "Witnesses",
  records: "Records",
  forensics: "Forensics",
};

/** One line on what each role holds, shown on that player's phone. */
export const ROLE_LINES: Record<RoleKey, string> = {
  cctv: "The hall camera. It sees who walks where and what they are wearing. It cannot see inside rooms.",
  witness: "What people saw and said. Everyone tells the truth at this level.",
  records: "Photos with times on them, and the key fob log.",
  forensics: "What was left behind at the scene.",
};

/**
 * Levels from the approved ladder (Joshua, 5 Nov; difficulty, not age, 6 Nov).
 * Only the first two are built. Each level is one row, read by the generator.
 */
export interface LevelSpec {
  suspects: number;
  /** Innocents shown going into the room outside the time it went missing. */
  herrings: number;
  /** An alibi that covers only part of the window, given to the culprit or a ruled-out innocent. */
  nearMiss: boolean;
  /** Suspects say where they were, as well as the neighbour. */
  statements: boolean;
}

export const LEVELS: Record<DetectiveLevel, LevelSpec> = {
  1: { suspects: 3, herrings: 1, nearMiss: false, statements: false },
  2: { suspects: 4, herrings: 1, nearMiss: true, statements: true },
};

export const LEVEL_NAMES: Record<DetectiveLevel, string> = {
  1: "Explorer. Three suspects, one clue each.",
  2: "Adventurer. Four suspects, tighter times, people say where they were.",
};

/** Points for the team: a right accusation, and one more for solving it without a hint. */
export const POINTS_RIGHT = 3;
export const POINTS_NO_HINT = 1;

export interface Evidence {
  role: RoleKey;
  title: string;
  lines: string[];
}

export interface CasePublic {
  /** The story everyone hears. */
  story: string;
  /** What went missing, for the hint lines. */
  item: string;
  suspects: string[];
}

export interface DetectivePublic {
  settings: { level: DetectiveLevel; length: DetectiveLength; cases: number };
  /** Which case this is, 1 up. 0 before the first is opened. */
  round: number;
  team: string[];
  nonce: string;
  /** Who holds which role this case. */
  roles: Record<string, RoleKey[]>;
  case: CasePublic | null;
  hintsUsed: number;
  /** The accusation on the table: who is named, who proposed it, who has agreed. */
  proposal: { suspect: string; by: string; agreed: string[] } | null;
  score: number;
  tally: { solved: number; escaped: number };
  /** The last case's answer, shown once the team has accused. */
  last: {
    round: number;
    accused: string;
    culprit: string;
    right: boolean;
    points: number;
    /** Why each person did or did not do it, in plain words. */
    why: string[];
  } | null;
  finished: boolean;
}

export interface DetectiveMine {
  round: number;
  evidence: Evidence[];
}

export const HINTS = (item: string): string[] => [
  `Records: when did the ${item} go? Find the two photos.`,
  "Who was somewhere else the whole time it went? Which two players' clues prove it?",
  "Forensics found a thread. CCTV: what is everyone wearing?",
];
