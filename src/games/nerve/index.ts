// Nerve, version 0 (approved 1 Nov 2026, claude/nerve-v0.md). Built 5 Nov.
//
// Rules (the CEO seat owns them; each is one place in this file or shape.ts):
//  1. Each round, everyone puts a thumb on the big button. When every phone is
//     down, or the host taps Go, the pot starts at 1 and climbs one step a beat.
//  2. Lift your thumb to bank the pot as it stands. Your points are locked in.
//  3. The round has a hidden bust number. When the pot reaches it, everyone
//     still holding scores nothing that round.
//  4. Phones show who has let go, in order, never what they banked, until the
//     bust. Then every banked number and the bust number show.
//  5. Short is 3 rounds, Normal 5, Long 8. Points add up across rounds.
//
// Fairness, decided on the server:
//  - The bust number comes from a keyed hash of the round's public nonce with a
//    key only the server holds. No phone can work it out, and nothing that is
//    written before the round ends depends on it.
//  - A bank is worth the lower of what the phone saw at the lift and what the
//    server's clock says, so a slow network costs nothing and a fast-forwarded
//    phone gains nothing.
//  - The bust is only declared BUST_LAG_MS after it happens, so a phone that let
//    go just before it, on a slow network, still gets its bank in.
//  - A lift has a half-second grace on the phone: thumb back down within it and
//    nothing happened (a child's slip). Its value is the pot at the lift.
//  - A phone that hides the page (screen off, another app) banks at once, at the
//    pot it last showed. A phone that loses its network stays in and can bust:
//    the server only knows what reaches it.

import { registerGame } from "@/engine/registry";
import { accept, noop, reject, type GameContext, type GameModule, type TurnResult } from "@/engine/types";
import { NERVE_BEAT, NERVE_ROUNDS, potAt, type NerveLength, type NerveLevel, type NerveMine, type NervePace, type NervePublic } from "./shape";

export const NERVE = "nerve";

/** The bust is declared this long after the pot reaches it. */
export const BUST_LAG_MS = 700;
/** Gap between everyone being ready and the pot starting. */
export const COUNT_IN_MS = 1500;

/**
 * How the bust number falls for each Nerve level: at least `min`, then a
 * steady chance of busting at every step, averaging `mean` steps more, never
 * above `cap`. Placeholders until the table test sets them.
 */
export const NERVE_LEVELS: Record<NerveLevel, { min: number; mean: number; cap: number }> = {
  gentle: { min: 4, mean: 7, cap: 20 },
  normal: { min: 2, mean: 9, cap: 30 },
  wild: { min: 2, mean: 14, cap: 45 },
};

export function bustFrom(u: number, level: NerveLevel): number {
  const { min, mean, cap } = NERVE_LEVELS[level];
  return Math.min(cap, min + Math.floor(-Math.log(1 - u) * mean));
}

function bustOf(ctx: GameContext, s: NervePublic): number {
  if (!ctx.secret) throw new Error("nerve needs the server secret");
  return bustFrom(ctx.secret(`nerve:${s.nonce}`), s.settings.level);
}

function nonce(rng: () => number): string {
  let out = "";
  for (let i = 0; i < 4; i++) out += Math.floor(rng() * 4294967296).toString(36).padStart(7, "0");
  return out;
}

const st = (ctx: GameContext) => ctx.room.state as unknown as NervePublic;
const pub = (s: NervePublic) => s as unknown as Record<string, unknown>;

function startClimb(ctx: GameContext, s: NervePublic): TurnResult {
  const startAt = new Date(Date.parse(ctx.now) + COUNT_IN_MS).toISOString();
  const cap = NERVE_LEVELS[s.settings.level].cap;
  // A safety net only: the round normally ends long before this. It shows the
  // cap, which is public anyway, not the bust number.
  const ends = new Date(Date.parse(startAt) + cap * s.settings.beatMs + BUST_LAG_MS + 2000).toISOString();
  return accept({ phase: "climb", phaseEndsAt: ends, state: pub({ ...s, inRound: [...s.ready], startAt, bankedOrder: [] }) });
}

/** End the round: publish the bust number and every bank, add the points. */
function reveal(ctx: GameContext, s: NervePublic, extra?: { id: string; value: number }): TurnResult {
  const bust = bustOf(ctx, s);
  const banked: Record<string, number> = {};
  const busted: string[] = [];
  const scores = { ...s.scores };
  for (const id of s.inRound) {
    const mine = ctx.private[id] as unknown as NerveMine | undefined;
    const value = extra?.id === id ? extra.value : mine?.nonce === s.nonce ? mine.banked : null;
    if (value != null && value < bust) {
      banked[id] = value;
      scores[id] = (scores[id] ?? 0) + value;
    } else busted.push(id);
  }
  const write: Parameters<typeof accept>[0] = {
    phase: "reveal",
    phaseEndsAt: null,
    state: pub({ ...s, scores, last: { round: s.round, bust, banked, busted } }),
  };
  if (extra && extra.value < bust) write.private = { [extra.id]: { nonce: s.nonce, banked: extra.value } };
  return accept(write);
}

function bustDue(ctx: GameContext, s: NervePublic): boolean {
  if (!s.startAt) return false;
  const bustTime = Date.parse(s.startAt) + (bustOf(ctx, s) - 1) * s.settings.beatMs;
  return Date.parse(ctx.now) >= bustTime + BUST_LAG_MS;
}

function newRound(ctx: GameContext, s: NervePublic, round: number): NervePublic {
  return { ...s, round, nonce: nonce(ctx.rng), ready: [], inRound: [], startAt: null, bankedOrder: [] };
}

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

export const nerve: GameModule = {
  id: NERVE,
  name: "Nerve",
  minPlayers: 2,
  maxPlayers: 12,
  phases: {
    ready: { waitsFor: "all" },
    climb: { waitsFor: "none" },
    reveal: { waitsFor: "host" },
  },

  setup(ctx, options) {
    if (ctx.players.length < 2) return reject("too_few_players");
    if (!ctx.secret) return reject("server_error");
    const pace = pick<NervePace>(options?.pace, ["relaxed", "normal", "quick"], "normal");
    const length = pick<NerveLength>(options?.length, ["short", "normal", "long"], "normal");
    const level = pick<NerveLevel>(options?.level, ["gentle", "normal", "wild"], "normal");
    const scores: Record<string, number> = {};
    for (const p of ctx.players) scores[p.id] = 0;
    const base: NervePublic = {
      settings: { pace, length, level, beatMs: NERVE_BEAT[pace], rounds: NERVE_ROUNDS[length] },
      round: 0,
      nonce: "",
      ready: [],
      inRound: [],
      startAt: null,
      bankedOrder: [],
      scores,
      last: null,
      finished: false,
    };
    return accept({ phase: "ready", phaseEndsAt: null, state: pub(newRound(ctx, base, 1)) });
  },

  reduce(ctx, action) {
    const s = st(ctx);
    const phase = ctx.room.phase;
    const actor = action.actorId;
    const payload = action.payload ?? {};
    const isHost = actor === ctx.room.hostId;
    const playing = actor in s.scores;

    switch (action.type) {
      case "ready": {
        if (phase !== "ready" || payload.round !== s.round) return noop();
        if (!playing) return reject("not_playing");
        if (s.ready.includes(actor)) return noop();
        const next = { ...s, ready: [...s.ready, actor] };
        if (next.ready.length >= Object.keys(s.scores).length) return startClimb(ctx, next);
        return accept({ state: pub(next) });
      }

      case "go": {
        if (phase !== "ready" || payload.round !== s.round) return noop();
        if (!isHost) return reject("host_only");
        if (s.ready.length === 0) return reject("nobody_ready");
        return startClimb(ctx, s);
      }

      case "bank": {
        if (phase !== "climb" || payload.round !== s.round) return noop(); // too late: the round is over
        if (!s.inRound.includes(actor)) return reject("not_in_round");
        if (s.bankedOrder.includes(actor)) return noop();
        const claim = payload.claim;
        if (typeof claim !== "number" || !Number.isInteger(claim) || claim < 0) return reject("bad_claim");
        const value = Math.min(claim, potAt(Date.parse(ctx.now), s.startAt, s.settings.beatMs));
        const after = { ...s, bankedOrder: [...s.bankedOrder, actor] };
        // Banked at or past the bust, or the last one out: the round ends now.
        if (value >= bustOf(ctx, s) || after.bankedOrder.length >= s.inRound.length || bustDue(ctx, s)) return reveal(ctx, after, { id: actor, value });
        return accept({ state: pub(after), private: { [actor]: { nonce: s.nonce, banked: value } } });
      }

      case "check": {
        if (phase !== "climb" || payload.round !== s.round) return noop();
        return bustDue(ctx, s) ? reveal(ctx, s) : noop();
      }

      case "next": {
        if (phase !== "reveal" || payload.round !== s.round) return noop(); // a double tap
        if (!isHost) return reject("host_only");
        if (s.round >= s.settings.rounds) return accept({ state: pub({ ...s, finished: true }) });
        return accept({ phase: "ready", phaseEndsAt: null, state: pub(newRound(ctx, s, s.round + 1)) });
      }

      default:
        return reject("unknown_action");
    }
  },

  onPhaseExpired(ctx) {
    if (ctx.room.phase !== "climb") return noop();
    return reveal(ctx, st(ctx));
  },

  isComplete(state) {
    return (state as unknown as NervePublic).finished === true;
  },

  results(state) {
    return Object.entries((state as unknown as NervePublic).scores ?? {}).map(([memberId, rawPoints]) => ({ memberId, rawPoints }));
  },
};

registerGame(nerve);
