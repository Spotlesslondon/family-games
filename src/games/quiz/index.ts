// The balanced quiz, Classic, version 1 (built 2 Nov 2026 for a remote night).
//
// Rules (the CEO seat owns the rules and may change any of these, each is one
// place in this file):
//  1. The app is the game master. Every round, every player gets a question on
//     their own phone, at their own level: the age band decides the bank
//     (6 to 8: A, 9 to 11: B, 12 and over: C). Players in the same band get
//     the same question, each with the four answers in their own order.
//  2. Rounds go from easy to hard, with never more hard rounds than easy:
//     8 rounds are 3 easy, 3 medium, 2 hard. Short is 5 rounds, Normal 8, Long 12. No question repeats in a
//     game, and "Play again" avoids the last game's questions where it can.
//  3. One tap answers and locks. When everyone has answered, the answers show
//     on every phone. The host can show them early for a phone gone quiet.
//     No timer on answering: nobody is rushed, which suits a slow reader.
//  3b. The answers stay up for REVEAL_SECONDS, the same on every phone, then
//     the next question deals itself. Nobody taps Next (Joshua, 6 Nov: a host
//     who presses Next has an edge, because they know when it is coming).
//  3c. Topic: the host picks Mixed (default) or one topic. Only Animals has a
//     full set at every level; a thin topic borrows from the mix where it
//     runs short, nearest level first.
//  4. One point for each right answer, whatever the level, because the level
//     already matches the player. Scores are not saved yet.
//  5. The final screen shows the top places and each player's own score. No
//     screen singles out last place (CEO rule, 17:32 on 1 Nov).
//
// Not built yet, on purpose: confidence bets for spectators, a rating
// adjusted from results, declared expertise.
//
// What each phone may see: its own question and its own four answers, never
// which one is right. The right answer exists only in this server file until
// the round is shown, when it goes into the shared state for everyone.

import { registerGame } from "@/engine/registry";
import { pick, shuffle } from "@/engine/rng";
import { accept, noop, reject, type Action, type AgeBand, type GameContext, type GameModule, type TurnResult } from "@/engine/types";
import { QUIZ_BANK, type QuizBand, type QuizLevel, type QuizQuestion } from "./bank";
import { QUIZ_TOPICS, type QuizMine, type QuizPublic, type QuizShown, type QuizTopic } from "./shape";

export const QUIZ = "quiz";
export const QUIZ_LENGTHS = { short: 5, normal: 8, long: 12 } as const;
/** How long the answers stay up before the next question deals itself. */
export const REVEAL_SECONDS = 10;

type Phase = "question" | "reveal";

const BY_ID = new Map(QUIZ_BANK.map((q) => [q.id, q]));

export function bandFor(age: AgeBand | undefined): QuizBand {
  if (age === "6-8") return "A";
  if (age === "9-11") return "B";
  return "C";
}

/** Easy first, then medium, then hard; never more hard rounds than easy ones. */
export function levelsFor(rounds: number): QuizLevel[] {
  const hard = Math.floor(rounds / 3);
  const easy = Math.ceil((rounds - hard) / 2);
  const medium = rounds - hard - easy;
  return Array.from({ length: rounds }, (_, i) => (i < easy ? "easy" : i < easy + medium ? "medium" : "hard"));
}

function chooseQuestion(band: QuizBand, level: QuizLevel, topic: QuizTopic, used: Set<string>, avoid: Set<string>, rng: () => number): QuizQuestion {
  const all = QUIZ_BANK.filter((q) => q.band === band);
  const onTopic = topic === "mixed" ? all : all.filter((q) => q.category === topic);
  const fresh = (list: QuizQuestion[]) => list.filter((q) => !used.has(q.id));
  // The order of preference: on topic at this level (not asked last game), on
  // topic at this level, on topic at the nearest level, then the mix at this
  // level, then anything unasked, then anything at all.
  const near = NEAR_LEVELS[level];
  const tiers = [
    fresh(onTopic).filter((q) => q.level === level && !avoid.has(q.id)),
    fresh(onTopic).filter((q) => q.level === level),
    ...near.map((l) => fresh(onTopic).filter((q) => q.level === l)),
    fresh(all).filter((q) => q.level === level && !avoid.has(q.id)),
    fresh(all).filter((q) => q.level === level),
    fresh(all),
    all,
  ];
  return pick(tiers.find((t) => t.length > 0)!, rng);
}

const NEAR_LEVELS: Record<QuizLevel, QuizLevel[]> = { easy: ["medium", "hard"], medium: ["easy", "hard"], hard: ["medium", "easy"] };

/** Deal round `round` (1-based): a question per band, a private row per player. */
function deal(ctx: GameContext, s: QuizPublic, round: number, avoid: Set<string>): { state: QuizPublic; priv: Record<string, Record<string, unknown>> } {
  const used = new Set(s.asked);
  const level = s.levels[round - 1];
  const current: Partial<Record<QuizBand, string>> = {};
  for (const band of new Set(Object.values(s.bandOf))) {
    const q = chooseQuestion(band, level, s.settings.topic ?? "mixed", used, avoid, ctx.rng);
    used.add(q.id);
    current[band] = q.id;
  }
  const priv: Record<string, Record<string, unknown>> = {};
  for (const [id, band] of Object.entries(s.bandOf)) {
    const q = BY_ID.get(current[band]!)!;
    const mine: QuizMine = { round, text: q.text, options: shuffle([q.correct, ...q.wrong], ctx.rng), choice: null };
    priv[id] = mine as unknown as Record<string, unknown>;
  }
  return {
    state: { ...s, round, current, asked: [...used], answered: [], last: null },
    priv,
  };
}

/** Show the answers: who was right, and each band's question and answer. */
function reveal(ctx: GameContext, s: QuizPublic, lastAnswer?: { id: string; choice: number }): TurnResult {
  const right: string[] = [];
  const scores = { ...s.scores };
  for (const id of Object.keys(s.bandOf)) {
    const mine = ctx.private[id] as unknown as QuizMine | undefined;
    const choice = lastAnswer?.id === id ? lastAnswer.choice : mine?.choice;
    const q = BY_ID.get(s.current[s.bandOf[id]] ?? "");
    if (!mine || mine.round !== s.round || choice == null || !q) continue;
    if (mine.options[choice] === q.correct) {
      right.push(id);
      scores[id] = (scores[id] ?? 0) + 1;
    }
  }
  const questions: Partial<Record<QuizBand, QuizShown>> = {};
  for (const [band, qid] of Object.entries(s.current) as [QuizBand, string][]) {
    const q = BY_ID.get(qid)!;
    questions[band] = { text: q.text, correct: q.correct };
  }
  const write: Parameters<typeof accept>[0] = {
    phase: "reveal",
    phaseEndsAt: new Date(Date.parse(ctx.now) + REVEAL_SECONDS * 1000).toISOString(),
    state: { ...s, scores, answered: lastAnswer ? [...s.answered, lastAnswer.id] : s.answered, last: { round: s.round, right, questions } },
  };
  if (lastAnswer) {
    const mine = ctx.private[lastAnswer.id] as unknown as QuizMine;
    write.private = { [lastAnswer.id]: { ...mine, choice: lastAnswer.choice } as unknown as Record<string, unknown> };
  }
  return accept(write);
}

function st(ctx: GameContext): QuizPublic {
  return ctx.room.state as unknown as QuizPublic;
}

export const quiz: GameModule = {
  id: QUIZ,
  name: "The quiz",
  minPlayers: 2,
  maxPlayers: 12,
  phases: {
    question: { waitsFor: "all" },
    reveal: { waitsFor: "none", timerSeconds: REVEAL_SECONDS },
  },

  setup(ctx, options) {
    if (ctx.players.length < 2) return reject("too_few_players");
    const length = options?.length;
    const rounds = length === "short" || length === "long" ? QUIZ_LENGTHS[length] : QUIZ_LENGTHS.normal;
    const topic: QuizTopic = QUIZ_TOPICS.some((t) => t.key === options?.topic) ? (options!.topic as QuizTopic) : "mixed";
    const avoid = new Set(Array.isArray(options?.avoid) ? (options.avoid as unknown[]).filter((x): x is string => typeof x === "string") : []);
    const bandOf: Record<string, QuizBand> = {};
    const scores: Record<string, number> = {};
    for (const p of ctx.players) {
      bandOf[p.id] = bandFor(p.ageBand);
      scores[p.id] = 0;
    }
    const base: QuizPublic = {
      settings: { rounds, length: rounds === 5 ? "short" : rounds === 12 ? "long" : "normal", topic },
      levels: levelsFor(rounds),
      round: 0,
      bandOf,
      current: {},
      asked: [],
      answered: [],
      scores,
      last: null,
      finished: false,
    };
    const { state, priv } = deal(ctx, base, 1, avoid);
    return accept({ phase: "question", state: state as unknown as Record<string, unknown>, private: priv });
  },

  reduce(ctx, action: Action) {
    const s = st(ctx);
    const phase = ctx.room.phase as Phase;
    const actor = action.actorId;
    const isHost = actor === ctx.room.hostId;
    const payload = action.payload ?? {};

    switch (action.type) {
      case "answer": {
        if (phase !== "question") return reject("wrong_phase");
        if (!(actor in s.bandOf)) return reject("not_playing");
        if (payload.round !== s.round) return reject("wrong_round");
        const choice = payload.choice;
        if (typeof choice !== "number" || !Number.isInteger(choice) || choice < 0 || choice > 3) return reject("bad_choice");
        const mine = ctx.private[actor] as unknown as QuizMine | undefined;
        if (!mine || mine.round !== s.round) return reject("no_question");
        if (mine.choice != null || s.answered.includes(actor)) return noop();
        if (s.answered.length + 1 >= Object.keys(s.bandOf).length) return reveal(ctx, s, { id: actor, choice });
        return accept({
          state: { ...s, answered: [...s.answered, actor] } as unknown as Record<string, unknown>,
          private: { [actor]: { ...mine, choice } as unknown as Record<string, unknown> },
        });
      }

      case "show_answers": {
        if (phase !== "question") return noop();
        if (!isHost) return reject("host_only");
        return reveal(ctx, s);
      }

      default:
        return reject("unknown_action");
    }
  },

  // The answers have been up for REVEAL_SECONDS: everyone moves on together.
  onPhaseExpired(ctx) {
    if (ctx.room.phase !== "reveal") return noop();
    const s = st(ctx);
    if (s.round >= s.settings.rounds) return accept({ phaseEndsAt: null, state: { ...s, finished: true } as unknown as Record<string, unknown> });
    const { state, priv } = deal(ctx, s, s.round + 1, new Set());
    return accept({ phase: "question", phaseEndsAt: null, state: state as unknown as Record<string, unknown>, private: priv });
  },

  isComplete(state) {
    return (state as unknown as QuizPublic).finished === true;
  },

  results(state) {
    const s = state as unknown as QuizPublic;
    return Object.entries(s.scores ?? {}).map(([memberId, rawPoints]) => ({ memberId, rawPoints }));
  },
};

registerGame(quiz);
