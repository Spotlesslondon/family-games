// Mr White, version 2: two words, two sides, and a player with no word.
//
// Rules (Joshua's calls of 1 November 2026; the CEO seat owns the rules and
// may change any of these, each is one place in this file):
//  1. Most players (the Villagers) get one word of a pair, for example shark.
//     A few (the Wolves) get the other word, dolphin. Nobody is told
//     which side they are on: a Wolf only finds out by listening.
//  2. Mr White is on by default (the host can switch him off) from 5 players
//     up. Mr White gets no word and knows it.
//     How many are hidden: 3 to 4 players, 1; 5 to 6, 2; 7 to 10, 3; 11 to
//     12, 4. Mr White, when in, is one of them; the rest are Wolves.
//  3. Clues are typed by default: in turn, each player types one word that
//     fits their word, and every phone and the TV shows it at once. Not their
//     own word, nothing anyone has already said. The other side's word is
//     allowed: typing it gives that player away. Mr White never goes first.
//     The host can choose "Say clues out loud" instead, for tables with
//     children who cannot type yet: then the app only shows whose turn it is.
//  4. After a round of clues the host chooses another round or the vote. In
//     the vote everyone still in votes for someone else, in secret. The most
//     votes is out, and everyone sees which side they were on, never their
//     word. A tie gets one run-off; a second tie means nobody is out.
//  5. If the person voted out is Mr White, he gets one guess at the Villagers'
//     word. Right: Mr White wins on his own. Wrong: he is out, play goes on.
//  6. The Villagers win when every Wolf and Mr White is out. The hidden
//     players win when only one Villager is left.
//  7. Points (not saved yet): Villagers win, 2 each. Hidden players win: 4 to
//     each Wolf, 6 to Mr White if still in. Mr White guesses: 6 to him.
//
// What each phone may see: its own word, or that it is Mr White, lives in that
// player's private state only, with nothing that tells the side. Nobody's
// private state holds the side either: the server works it out each turn,
// because the Villagers' word is the one most players hold. The shared state
// holds sides only of players already out, and both words only at the end.

import { registerGame } from "@/engine/registry";
import { pick, shuffle } from "@/engine/rng";
import { accept, noop, reject, type Action, type GameContext, type GameModule, type TurnResult } from "@/engine/types";
import { MR_WHITE_PAIRS } from "./words";

export const MR_WHITE = "mr-white";

type Phase = "reveal" | "clues" | "between" | "vote" | "guess" | "out" | "done";
export type Side = "villager" | "wolf" | "mr_white";

export type Outcome =
  | { winner: "villagers"; how: "all_found" }
  | { winner: "hidden"; how: "survived" }
  | { winner: "mr_white"; how: "guessed"; guess: string };

export interface Settings {
  /** How many Wolves (not counting Mr White). */
  wolves: number;
  mrWhite: boolean;
  /** True when clues are said out loud instead of typed. */
  spoken: boolean;
  /** What the host chose, kept for "Play again" (Mr White needs 5 players). */
  mrWhiteChosen: boolean;
}

export interface Clue {
  id: string;
  round: number;
  /** Null when the host moved a stuck turn on. */
  text: string | null;
}

export interface OutPlayer {
  id: string;
  side: Side;
  round: number;
  /** Mr White's guess, when he was voted out. */
  guess?: string;
}

export interface MrWhiteState {
  [key: string]: unknown;
  settings: Settings;
  /** Who has looked at their word (reveal phase). */
  seen: string[];
  /** Everyone in the game, in speaking order. Players who are out are skipped. */
  order: string[];
  out: OutPlayer[];
  /** The round of clues now being played, from 1. */
  round: number;
  /** Index into the players still in of who gives a clue now. */
  turn: number;
  /** Typed clues, every round, in order. Empty when clues are spoken. */
  clues: Clue[];
  candidates: string[];
  runoff: boolean;
  /** Who has voted, never whom, until the count. */
  voted: string[];
  /** The last count, shown to everyone: all votes, and who went out, or a tie. */
  lastVote?: { round: number; votes: Record<string, string>; outId?: string; tie?: boolean };
  /** Filled in only when the game ends. */
  reveal?: { villagerWord: string; wolfWord: string; sides: Record<string, Side>; outcome: Outcome };
}

const MAX_GUESS = 40;
const MAX_CLUE = 20;

/** How many are hidden among the players, and whether Mr White is one of them. */
export function hiddenCounts(players: number, mrWhiteOn: boolean): { wolves: number; mrWhite: boolean } {
  const hidden = players <= 4 ? 1 : players <= 6 ? 2 : players <= 10 ? 3 : 4;
  const mrWhite = mrWhiteOn && players >= 5;
  return { wolves: hidden - (mrWhite ? 1 : 0), mrWhite };
}

function st(ctx: GameContext): MrWhiteState {
  return ctx.room.state as MrWhiteState;
}

function stillIn(s: MrWhiteState): string[] {
  const out = new Set(s.out.map((o) => o.id));
  return s.order.filter((id) => !out.has(id));
}

/**
 * Server-side truth from the private map. The Villagers' word is the one most
 * players hold: there are always more Villagers than Wolves.
 */
function secrets(ctx: GameContext, s: MrWhiteState): { villagerWord: string; wolfWord: string; sides: Record<string, Side> } {
  const counts = new Map<string, number>();
  for (const id of s.order) {
    const w = ctx.private[id]?.word;
    if (typeof w === "string") counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const villagerWord = ranked[0]?.[0] ?? "";
  const wolfWord = ranked[1]?.[0] ?? "";
  const sides: Record<string, Side> = {};
  for (const id of s.order) {
    const p = ctx.private[id] ?? {};
    sides[id] = p.mrWhite === true ? "mr_white" : p.word === villagerWord ? "villager" : "wolf";
  }
  return { villagerWord, wolfWord, sides };
}

/** Votes are private to each voter until the count. */
function votesSoFar(ctx: GameContext, s: MrWhiteState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of stillIn(s)) {
    const v = ctx.private[id]?.vote;
    if (typeof v === "string") out[id] = v;
  }
  return out;
}

/** Lower case, letters and digits only: "Ice-Cream" is "icecream". */
function norm(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
}

/** The word and its possible singulars: "horses" gives horses, horse, hors; "boxes" gives box. */
function stems(s: string): string[] {
  const n = norm(s);
  return [n, n.replace(/s$/, ""), n.replace(/es$/, "")].filter((x) => x.length > 0);
}

/** Forgiving match for a typed word: case, spaces, punctuation and a plural "s" or "es". */
export function sameWord(a: string, b: string): boolean {
  const bs = stems(b);
  return stems(a).some((x) => bs.includes(x));
}

/** A clue may not be the player's own word, or contain a long part of it (shark in sharky). */
export function tooClose(clue: string, word: string): boolean {
  if (sameWord(clue, word)) return true;
  const c = norm(clue);
  const parts = [norm(word), ...word.split(/\s+/).map(norm)];
  return parts.some((part) => (part.length >= 4 ? c.includes(part) : part.length > 0 && c === part));
}

/** Clear every vote, for a run-off or a new round. */
function clearedVotes(ctx: GameContext, s: MrWhiteState): Record<string, Record<string, unknown>> {
  const cleared: Record<string, Record<string, unknown>> = {};
  for (const id of s.order) cleared[id] = { ...ctx.private[id], vote: null };
  return cleared;
}

function finish(ctx: GameContext, s: MrWhiteState, outcome: Outcome, extra: { private?: Record<string, Record<string, unknown>> } = {}): TurnResult {
  const { villagerWord, wolfWord, sides } = secrets(ctx, s);
  return accept({
    phase: "done",
    state: { ...s, reveal: { villagerWord, wolfWord, sides, outcome } },
    private: extra.private,
    events: [{ type: "mr_white_result", payload: { winner: outcome.winner, how: outcome.how } }],
  });
}

/** After someone goes out: has a side won? */
function winner(ctx: GameContext, s: MrWhiteState): Outcome | null {
  const { sides } = secrets(ctx, s);
  const left = stillIn(s);
  const hidden = left.filter((id) => sides[id] !== "villager").length;
  const villagers = left.length - hidden;
  if (hidden === 0) return { winner: "villagers", how: "all_found" };
  if (villagers <= 1) return { winner: "hidden", how: "survived" };
  return null;
}

/** The next round of clues starts, with fresh votes. */
function nextRound(ctx: GameContext, s: MrWhiteState, phase: Phase = "clues"): TurnResult {
  return accept({
    phase,
    state: { ...s, round: s.round + 1, turn: 0, candidates: [], runoff: false, voted: [] },
    private: clearedVotes(ctx, s),
  });
}

/** Count the votes: someone goes out, a run-off, or (second tie) nobody. */
function tally(ctx: GameContext, s: MrWhiteState): TurnResult {
  const votes = votesSoFar(ctx, s);
  const counts = new Map<string, number>();
  for (const target of Object.values(votes)) counts.set(target, (counts.get(target) ?? 0) + 1);
  const top = Math.max(0, ...counts.values());
  const leaders = [...counts.entries()].filter(([, n]) => n === top).map(([id]) => id);

  if (leaders.length > 1 && !s.runoff) {
    // One run-off between the tied players. Earlier votes are cleared.
    return accept({
      phase: "vote",
      state: { ...s, candidates: leaders, runoff: true, voted: [], lastVote: { round: s.round, votes, tie: true } },
      private: clearedVotes(ctx, s),
      events: [{ type: "mr_white_runoff", payload: { between: leaders } }],
    });
  }
  if (leaders.length !== 1) {
    // A second tie (or no votes at all): nobody is out this round.
    return nextRound(ctx, { ...s, lastVote: { round: s.round, votes, tie: true } }, "out");
  }

  const outId = leaders[0];
  const { sides } = secrets(ctx, s);
  const side = sides[outId];
  const next: MrWhiteState = { ...s, out: [...s.out, { id: outId, side, round: s.round }], lastVote: { round: s.round, votes, outId } };
  if (side === "mr_white") {
    return accept({ phase: "guess", state: next, events: [{ type: "mr_white_caught", memberId: outId }] });
  }
  const won = winner(ctx, next);
  if (won) return finish(ctx, next, won);
  return nextRound(ctx, next, "out");
}

/** Move the clue turn on after a clue (typed, spoken or skipped). */
function nextTurn(s: MrWhiteState, clues: Clue[]): TurnResult {
  const turn = s.turn + 1;
  if (turn < stillIn(s).length) return accept({ state: { ...s, clues, turn } });
  return accept({ phase: "between", state: { ...s, clues, turn: 0 } });
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
    out: { waitsFor: "host" },
    done: { waitsFor: "none" },
  },

  setup(ctx, options) {
    const players = ctx.players.map((p) => p.id);
    if (players.length < 3) return reject("too_few_players");
    const mrWhiteOn = options?.mrWhite !== false;
    const spoken = options?.spoken === true;
    const counts = hiddenCounts(players.length, mrWhiteOn);

    const pair = pick(MR_WHITE_PAIRS, ctx.rng);
    const [villagerWord, wolfWord] = ctx.rng() < 0.5 ? [pair[0], pair[1]] : [pair[1], pair[0]];
    const dealt = shuffle(players, ctx.rng);
    const mr = counts.mrWhite ? dealt[0] : null;
    const wolves = new Set(dealt.slice(counts.mrWhite ? 1 : 0, (counts.mrWhite ? 1 : 0) + counts.wolves));

    // Mr White never gives the first clue: he would have nothing to go on.
    let order = shuffle(players, ctx.rng);
    if (mr && order[0] === mr) order = [...order.slice(1), mr];

    // Wolves and Villagers get exactly the same shape: only the word differs.
    const priv: Record<string, Record<string, unknown>> = {};
    for (const id of players) {
      priv[id] = id === mr ? { mrWhite: true, vote: null } : { word: wolves.has(id) ? wolfWord : villagerWord, vote: null };
    }

    const state: MrWhiteState = {
      settings: { wolves: counts.wolves, mrWhite: counts.mrWhite, spoken, mrWhiteChosen: mrWhiteOn },
      seen: [],
      order,
      out: [],
      round: 1,
      turn: 0,
      clues: [],
      candidates: [],
      runoff: false,
      voted: [],
    };
    return accept({ phase: "reveal", state, private: priv });
  },

  reduce(ctx, action: Action) {
    const s = st(ctx);
    const phase = ctx.room.phase as Phase;
    const actor = action.actorId;
    const isHost = actor === ctx.room.hostId;
    const payload = action.payload ?? {};
    const left = stillIn(s);
    const actorIn = left.includes(actor);

    switch (action.type) {
      case "seen": {
        if (phase !== "reveal") return reject("wrong_phase");
        if (s.seen.includes(actor)) return noop();
        const seen = [...s.seen, actor];
        if (seen.length === s.order.length) return accept({ phase: "clues", state: { ...s, seen, turn: 0 } });
        return accept({ state: { ...s, seen } });
      }

      case "start_clues": {
        // The host starts without waiting for a phone that has gone to sleep;
        // that player can still open their word later.
        if (phase !== "reveal") return reject("wrong_phase");
        if (!isHost) return reject("host_only");
        return accept({ phase: "clues", state: { ...s, turn: 0 } });
      }

      case "clue": {
        // A typed clue from the player whose turn it is.
        if (phase !== "clues") return reject("wrong_phase");
        if (s.settings.spoken) return reject("clues_are_spoken");
        // A clue meant for a turn that has already moved on changes nothing.
        if (typeof payload.turn === "number" && payload.turn !== s.turn) return noop();
        if (actor !== left[s.turn]) return reject("not_your_turn");
        const text = String(payload.text ?? "").trim().replace(/\s+/g, " ");
        if (!text || !norm(text)) return reject("empty_clue");
        if (text.length > MAX_CLUE) return reject("clue_too_long");
        if (/\s/.test(text)) return reject("one_word_only");
        // Only your own word is refused: you know it already, so the refusal
        // tells you nothing. The other side's word is allowed and shown, like
        // saying it out loud at the table: it gives that player away (Joshua's
        // ruling, 1 Nov). Refusing it would tell the player it is a secret word.
        const word = ctx.private[actor]?.word;
        if (typeof word === "string" && tooClose(text, word)) return reject("clue_not_allowed");
        if (s.clues.some((c) => c.text && sameWord(c.text, text))) return reject("clue_already_said");
        return nextTurn(s, [...s.clues, { id: actor, round: s.round, text }]);
      }

      case "clue_done": {
        // Spoken clues: the speaker taps when they have said it. The host can
        // also move any stuck turn on, spoken or typed (a phone gone to sleep,
        // a child who needs a hand).
        if (phase !== "clues") return reject("wrong_phase");
        if (typeof payload.turn === "number" && payload.turn !== s.turn) return noop();
        const speaker = left[s.turn];
        if (isHost && actor !== speaker) {
          return nextTurn(s, s.settings.spoken ? s.clues : [...s.clues, { id: speaker, round: s.round, text: null }]);
        }
        if (actor !== speaker) return reject("not_your_turn");
        if (!s.settings.spoken) return reject("type_your_clue");
        return nextTurn(s, s.clues);
      }

      case "another_round": {
        if (phase !== "between") return reject("wrong_phase");
        if (!isHost) return reject("host_only");
        return accept({ phase: "clues", state: { ...s, round: s.round + 1, turn: 0 } });
      }

      case "start_vote": {
        if (phase !== "between") return reject("wrong_phase");
        if (!isHost) return reject("host_only");
        return accept({ phase: "vote", state: { ...s, candidates: left, runoff: false, voted: [] } });
      }

      case "vote": {
        if (phase !== "vote") return reject("wrong_phase");
        if (!actorIn) return reject("you_are_out");
        const target = String(payload.memberId ?? "");
        if (target === actor) return reject("cannot_vote_for_self");
        if (!s.candidates.includes(target)) return reject("not_a_candidate");
        const voted = s.voted.includes(actor) ? s.voted : [...s.voted, actor];
        const priv = { [actor]: { ...ctx.private[actor], vote: target } };
        // A tied player in a run-off still votes, for the other tied player.
        const next: MrWhiteState = { ...s, voted };
        if (voted.length < left.length) return accept({ state: next, private: priv });
        // The last vote both counts and must be saved: keep it in the write
        // unless the count itself rewrote that player's private state.
        const counted = tally({ ...ctx, private: { ...ctx.private, ...priv } }, next);
        if (!counted.ok || counted.noop) return counted;
        return accept({ ...counted.write, private: { ...priv, ...(counted.write.private ?? {}) } });
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
        const caught = s.out[s.out.length - 1];
        if (!caught || caught.side !== "mr_white" || actor !== caught.id) return reject("not_mr_white");
        if (caught.guess !== undefined) return noop();
        const guess = String(payload.word ?? "").trim().slice(0, MAX_GUESS);
        if (!guess) return reject("empty_guess");
        const { villagerWord } = secrets(ctx, s);
        const next: MrWhiteState = { ...s, out: [...s.out.slice(0, -1), { ...caught, guess }] };
        if (sameWord(guess, villagerWord)) return finish(ctx, next, { winner: "mr_white", how: "guessed", guess });
        const won = winner(ctx, next);
        if (won) return finish(ctx, next, won);
        return nextRound(ctx, next, "out");
      }

      case "skip_guess": {
        // Mr White's phone has gone (2 Nov review: nothing could move the game
        // on). The host, or the stand-in, moves on as if the guess was wrong.
        if (phase !== "guess") return noop();
        if (!isHost) return reject("host_only");
        const caught = s.out[s.out.length - 1];
        if (!caught || caught.guess !== undefined) return noop();
        const won = winner(ctx, s);
        if (won) return finish(ctx, s, won);
        return nextRound(ctx, s, "out");
      }

      case "next_round": {
        // After someone goes out the host starts the next round of clues.
        if (phase !== "out") return reject("wrong_phase");
        if (!isHost) return reject("host_only");
        return accept({ phase: "clues", state: { ...s, turn: 0 } });
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
    const { sides, outcome } = s.reveal;
    const outIds = new Set(s.out.map((o) => o.id));
    const ids = s.order;
    if (outcome.winner === "villagers") return ids.filter((id) => sides[id] === "villager").map((id) => ({ memberId: id, rawPoints: 2 }));
    if (outcome.winner === "mr_white") return ids.filter((id) => sides[id] === "mr_white").map((id) => ({ memberId: id, rawPoints: 6 }));
    return ids
      .filter((id) => sides[id] === "wolf" || (sides[id] === "mr_white" && !outIds.has(id)))
      .map((id) => ({ memberId: id, rawPoints: sides[id] === "wolf" ? 4 : 6 }));
  },
};

registerGame(mrWhite);
