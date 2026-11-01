// Mr White: everyone gets the same secret word, except one player, Mr White,
// who gets nothing and has to bluff. Around the table, each player says one
// word that fits. Then everyone votes for who they think Mr White is.
//
// Rules for the first family table test (the CEO seat owns the rules and may
// change any of these; each is one place in this file):
//  1. One Mr White, picked at random. Three players at least.
//  2. Clues are said out loud, not typed, so slow readers and spellers are
//     never behind. The app shows whose turn it is. Mr White never goes first.
//  3. After each full round of clues the host chooses another round or the vote.
//  4. Everyone votes for someone else, in secret. Votes are shown at the reveal.
//     A tie goes to one run-off between the tied players; a second tie means
//     Mr White escapes.
//  5. If the vote catches Mr White, they get one guess at the word. Right:
//     Mr White steals the win. Wrong: everyone else wins.
//     If the vote picks the wrong person, Mr White wins.
//  6. Points: Mr White wins 3, otherwise every other player gets 1.
//
// What each phone may see: its own word (or "You are Mr White") lives in that
// player's private state only. The shared state holds nothing secret until
// the game ends, because every phone and the TV can read it.

import { registerGame } from "@/engine/registry";
import { pick, shuffle } from "@/engine/rng";
import { accept, noop, reject, type Action, type GameContext, type GameModule, type TurnResult } from "@/engine/types";
import { MR_WHITE_WORDS } from "./words";

export const MR_WHITE = "mr-white";

type Phase = "reveal" | "clues" | "between" | "vote" | "guess" | "done";

export type Outcome =
  | { winner: "mr_white"; how: "wrong_person" | "tie" | "guessed"; guess?: string }
  | { winner: "players"; how: "caught"; guess: string };

export interface MrWhiteState {
  [key: string]: unknown;
  /** Who has looked at their word (reveal phase). */
  seen: string[];
  /** Speaking order for clues. */
  order: string[];
  /** Index into order of who speaks now (clues phase). */
  turn: number;
  /** Rounds of clues completed. */
  rounds: number;
  /** Who may be voted for: everyone, or the tied players in a run-off. */
  candidates: string[];
  runoff: boolean;
  /** Who has voted, never whom, until the reveal. */
  voted: string[];
  /** The person the vote picked. */
  picked?: string;
  /** Filled in only when the game ends. */
  reveal?: { mrWhite: string; word: string; votes: Record<string, string>; outcome: Outcome };
}

const MAX_GUESS = 40;

function st(ctx: GameContext): MrWhiteState {
  return ctx.room.state as MrWhiteState;
}

function ids(ctx: GameContext): string[] {
  return ctx.players.map((p) => p.id);
}

/** Server-side truth from the private map: who is Mr White and the word. */
function secrets(ctx: GameContext): { mrWhite: string; word: string } {
  let mrWhite = "";
  let word = "";
  for (const [id, s] of Object.entries(ctx.private)) {
    if (!ids(ctx).includes(id)) continue;
    if (s.role === "mr_white") mrWhite = id;
    if (s.role === "player" && typeof s.word === "string") word = s.word;
  }
  return { mrWhite, word };
}

/** Votes are private to each voter until the reveal. */
function votesSoFar(ctx: GameContext): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of ids(ctx)) {
    const v = ctx.private[id]?.vote;
    if (typeof v === "string") out[id] = v;
  }
  return out;
}

/** Forgiving match for a spoken-then-typed word: case, spaces, punctuation and a plural "s". */
export function sameWord(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]/g, "")
      .replace(/(es|s)$/, "");
  return norm(a).length > 0 && norm(a) === norm(b);
}

function finish(ctx: GameContext, s: MrWhiteState, outcome: Outcome, extraPrivate = {}): TurnResult {
  const { mrWhite, word } = secrets(ctx);
  return accept({
    phase: "done",
    state: { ...s, reveal: { mrWhite, word, votes: votesSoFar(ctx), outcome } },
    private: extraPrivate,
    events: [{ type: "mr_white_result", payload: { winner: outcome.winner, how: outcome.how } }],
  });
}

/** Count the votes; a winner, a run-off, or (second tie) Mr White escapes. */
function tally(ctx: GameContext, s: MrWhiteState): TurnResult {
  const votes = votesSoFar(ctx);
  const counts = new Map<string, number>();
  for (const target of Object.values(votes)) counts.set(target, (counts.get(target) ?? 0) + 1);
  const top = Math.max(0, ...counts.values());
  const leaders = [...counts.entries()].filter(([, n]) => n === top).map(([id]) => id);
  const { mrWhite } = secrets(ctx);

  if (leaders.length === 0 || (leaders.length > 1 && s.runoff)) {
    return finish(ctx, s, { winner: "mr_white", how: "tie" });
  }
  if (leaders.length > 1) {
    // One run-off between the tied players. Earlier votes are cleared.
    const cleared: Record<string, Record<string, unknown>> = {};
    for (const id of ids(ctx)) cleared[id] = { ...ctx.private[id], vote: null };
    return accept({
      phase: "vote",
      state: { ...s, candidates: leaders, runoff: true, voted: [] },
      private: cleared,
      events: [{ type: "mr_white_runoff", payload: { between: leaders } }],
    });
  }
  const picked = leaders[0];
  if (picked !== mrWhite) {
    return finish(ctx, { ...s, picked }, { winner: "mr_white", how: "wrong_person" });
  }
  return accept({ phase: "guess", state: { ...s, picked }, events: [{ type: "mr_white_caught" }] });
}

export const mrWhite: GameModule = {
  id: MR_WHITE,
  name: "Mr White",
  minPlayers: 3,
  maxPlayers: 12,
  phases: {
    reveal: { waitsFor: "all" },
    clues: { waitsFor: "one" },
    between: { waitsFor: "host" },
    vote: { waitsFor: "all" },
    guess: { waitsFor: "one" },
    done: { waitsFor: "none" },
  },

  setup(ctx) {
    const players = ids(ctx);
    if (players.length < 3) return reject("too_few_players");
    const mr = pick(players, ctx.rng);
    const word = pick(MR_WHITE_WORDS, ctx.rng);
    // Mr White never speaks first: they would have nothing to copy.
    let order = shuffle(players, ctx.rng);
    if (order[0] === mr) order = [...order.slice(1), mr];

    const priv: Record<string, Record<string, unknown>> = {};
    for (const id of players) priv[id] = id === mr ? { role: "mr_white", vote: null } : { role: "player", word, vote: null };

    const state: MrWhiteState = { seen: [], order, turn: 0, rounds: 0, candidates: players, runoff: false, voted: [] };
    return accept({ phase: "reveal", state, private: priv });
  },

  reduce(ctx, action: Action) {
    const s = st(ctx);
    const phase = ctx.room.phase as Phase;
    const actor = action.actorId;
    const isHost = actor === ctx.room.hostId;
    const payload = action.payload ?? {};

    switch (action.type) {
      case "seen": {
        if (phase !== "reveal") return reject("wrong_phase");
        if (s.seen.includes(actor)) return noop();
        const seen = [...s.seen, actor];
        if (seen.length === ids(ctx).length) return accept({ phase: "clues", state: { ...s, seen, turn: 0 } });
        return accept({ state: { ...s, seen } });
      }

      case "start_clues": {
        // The host starts the clues without waiting for a phone that has gone
        // to sleep; that player can still open their word later.
        if (phase !== "reveal") return reject("wrong_phase");
        if (!isHost) return reject("host_only");
        return accept({ phase: "clues", state: { ...s, turn: 0 } });
      }

      case "clue_done": {
        // The speaker taps when they have said their word; the host can move a
        // stuck turn on (a phone gone to sleep, a child who needs a hand).
        if (phase !== "clues") return reject("wrong_phase");
        // A tap meant for a turn that has already moved on (a double tap, or
        // speaker and host tapping together) changes nothing.
        if (typeof payload.turn === "number" && payload.turn !== s.turn) return noop();
        const speaker = s.order[s.turn];
        if (actor !== speaker && !isHost) return reject("not_your_turn");
        const turn = s.turn + 1;
        if (turn < s.order.length) return accept({ state: { ...s, turn } });
        return accept({ phase: "between", state: { ...s, turn: 0, rounds: s.rounds + 1 } });
      }

      case "another_round": {
        if (phase !== "between") return reject("wrong_phase");
        if (!isHost) return reject("host_only");
        return accept({ phase: "clues", state: { ...s, turn: 0 } });
      }

      case "start_vote": {
        if (phase !== "between") return reject("wrong_phase");
        if (!isHost) return reject("host_only");
        return accept({ phase: "vote", state: { ...s, candidates: ids(ctx), runoff: false, voted: [] } });
      }

      case "vote": {
        if (phase !== "vote") return reject("wrong_phase");
        const target = String(payload.memberId ?? "");
        if (target === actor) return reject("cannot_vote_for_self");
        if (!s.candidates.includes(target)) return reject("not_a_candidate");
        const voted = s.voted.includes(actor) ? s.voted : [...s.voted, actor];
        const priv = { [actor]: { ...ctx.private[actor], vote: target } };
        // A tied player in a run-off still votes, for the other tied player.
        const next: MrWhiteState = { ...s, voted };
        if (voted.length < ids(ctx).length) return accept({ state: next, private: priv });
        return tally({ ...ctx, private: { ...ctx.private, ...priv } }, next);
      }

      case "count_votes": {
        // The host counts the votes in now (someone's phone has died).
        if (phase !== "vote") return reject("wrong_phase");
        if (!isHost) return reject("host_only");
        if (s.voted.length === 0) return reject("no_votes_yet");
        return tally(ctx, s);
      }

      case "guess": {
        if (phase !== "guess") return reject("wrong_phase");
        const { mrWhite: mr, word } = secrets(ctx);
        if (actor !== mr) return reject("not_mr_white");
        const guess = String(payload.word ?? "").trim().slice(0, MAX_GUESS);
        if (!guess) return reject("empty_guess");
        if (sameWord(guess, word)) return finish(ctx, s, { winner: "mr_white", how: "guessed", guess });
        return finish(ctx, s, { winner: "players", how: "caught", guess });
      }

      default:
        return reject("unknown_action");
    }
  },

  onPhaseExpired() {
    return noop(); // Mr White has no timers: nobody is rushed at the table.
  },

  isComplete(state) {
    return !!(state as MrWhiteState).reveal;
  },

  results(state) {
    const s = state as MrWhiteState;
    if (!s.reveal) return [];
    const players = s.order;
    if (s.reveal.outcome.winner === "mr_white") return [{ memberId: s.reveal.mrWhite, rawPoints: 3 }];
    return players.filter((id) => id !== s.reveal!.mrWhite).map((id) => ({ memberId: id, rawPoints: 1 }));
  },
};

registerGame(mrWhite);
