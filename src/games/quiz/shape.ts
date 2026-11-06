// The shapes of the quiz's shared and private state. Safe for client
// components: nothing here holds an answer. (The answers live in bank.ts,
// which is server only.)

export type QuizBandKey = "A" | "B" | "C";
export type QuizLength = "short" | "normal" | "long";

/** The topics a host can pick. "mixed" draws from every topic. The others
 *  match the category field in the bank. Only Animals has a full set. */
export const QUIZ_TOPICS = [
  { key: "mixed", label: "Mixed", full: true },
  { key: "animals", label: "Animals", full: true },
  { key: "christmas", label: "Christmas", full: false },
  { key: "food", label: "Food", full: false },
  { key: "geography", label: "Places", full: false },
  { key: "space", label: "Space", full: false },
] as const;
export type QuizTopic = (typeof QUIZ_TOPICS)[number]["key"];

export interface QuizShown {
  text: string;
  correct: string;
}

export interface QuizPublic {
  settings: { rounds: number; length: QuizLength; topic?: QuizTopic };
  levels: ("easy" | "medium" | "hard")[];
  /** 1-based. */
  round: number;
  bandOf: Record<string, QuizBandKey>;
  /** Question id per band this round. Ids say nothing about the answer. */
  current: Partial<Record<QuizBandKey, string>>;
  /** Every question id asked so far in this game. */
  asked: string[];
  /** Who has answered this round. */
  answered: string[];
  scores: Record<string, number>;
  /** Filled when a round's answers are shown. */
  last: { round: number; right: string[]; questions: Partial<Record<QuizBandKey, QuizShown>> } | null;
  finished: boolean;
}

/** One player's private row. */
export interface QuizMine {
  round: number;
  text: string;
  options: string[];
  choice: number | null;
}
