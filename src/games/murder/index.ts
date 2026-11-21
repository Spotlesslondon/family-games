// Murder at Ashworth Hall (Joshua, 21 Nov 19:05: "Research the murder mystery
// game. Then build your version with the basic images"). Research in
// claude/tech-murder-v0.md.
//
// Rules (the CEO seat owns them; each is one place here or in shape.ts):
//  1. Every player is a guest at the dinner party. One of them is secretly the
//     murderer and is told so, with a cover story. Nobody else knows who.
//  2. The host moves the table through the rounds: introductions (who you
//     are), alibis (where you were), evidence (one clue each), then a secret vote.
//  3. Everyone votes for someone else. If the murderer gets the most votes on
//     their own, they are caught and every innocent player scores 3. If not,
//     the murderer gets away and scores 5.
//
// Fairness, on the server: the case is built from a hidden seed (a keyed hash
// of the case's public nonce). Each phone gets only its own booklet, in
// stages; votes are kept in each voter's own private row until the reveal.

import { registerGame } from "@/engine/registry";
import { shuffle } from "@/engine/rng";
import { accept, noop, reject, type GameContext, type GameModule, type TurnResult } from "@/engine/types";
import { buildMurder, type MurderCase } from "./case";
import { MURDER_CASES, POINTS_CAUGHT, POINTS_ESCAPED, STAGES, type Booklet, type MurderLength, type MurderPublic } from "./shape";

export const MURDER = "murder";
const MIN = 4;
const MAX = 8;

const st = (ctx: GameContext) => ctx.room.state as unknown as MurderPublic;
const pub = (s: MurderPublic) => s as unknown as Record<string, unknown>;

function seedOf(ctx: GameContext, nonce: string): number {
  if (!ctx.secret) throw new Error("murder needs the server secret");
  return Math.floor(ctx.secret(`murder:${nonce}`) * 4294967296);
}
function nonce(rng: () => number): string {
  let out = "";
  for (let i = 0; i < 4; i++) out += Math.floor(rng() * 4294967296).toString(36).padStart(7, "0");
  return out;
}

/** The case and who plays whom, rebuilt from the seed whenever the server needs it. */
export function caseFor(ctx: GameContext, s: MurderPublic): { c: MurderCase; playerOf: Record<string, string> } {
  const c = buildMurder(seedOf(ctx, s.nonce), s.team.length);
  const playerOf: Record<string, string> = {};
  for (const [id, g] of Object.entries(s.cast)) playerOf[g.name] = id;
  return { c, playerOf };
}

function booklet(c: MurderCase, guestName: string, round: number, stage: number): Booklet {
  const g = c.truth.guests.find((x) => x.name === guestName)!;
  const b = c.booklets[guestName];
  return {
    round,
    guest: g,
    murderer: guestName === c.truth.murderer,
    secret: b.secret,
    story: stage >= 1 ? b.story : "",
    clue: stage >= 2 ? b.clue : null,
  };
}

function deal(ctx: GameContext, s: MurderPublic, c: MurderCase, stage: number): Record<string, Record<string, unknown>> {
  const priv: Record<string, Record<string, unknown>> = {};
  for (const [id, g] of Object.entries(s.cast)) priv[id] = booklet(c, g.name, s.round, stage) as unknown as Record<string, unknown>;
  return priv;
}

function openCase(ctx: GameContext, s: MurderPublic, round: number): TurnResult {
  const n = nonce(ctx.rng);
  const c = buildMurder(seedOf(ctx, n), s.team.length);
  const players = shuffle([...s.team], ctx.rng);
  const cast: MurderPublic["cast"] = {};
  c.truth.guests.forEach((g, i) => (cast[players[i]] = g));
  const next: MurderPublic = { ...s, round, nonce: n, cast, story: c.story, voted: [] };
  return accept({ phase: "introductions", phaseEndsAt: null, state: pub(next), private: deal(ctx, next, c, 0) });
}

function reveal(ctx: GameContext, s: MurderPublic): TurnResult {
  const { c, playerOf } = caseFor(ctx, s);
  const tally: Record<string, number> = {};
  for (const id of s.team) {
    const v = (ctx.private[id] as unknown as { vote?: string } | undefined)?.vote;
    if (v) tally[v] = (tally[v] ?? 0) + 1;
  }
  const top = Math.max(0, ...Object.values(tally));
  const leaders = Object.keys(tally).filter((k) => tally[k] === top);
  const accusedId = leaders.length === 1 ? leaders[0] : null;
  const murdererId = playerOf[c.truth.murderer];
  const caught = accusedId === murdererId;
  const scores = { ...s.scores };
  for (const id of s.team) {
    if (caught && id !== murdererId) scores[id] = (scores[id] ?? 0) + POINTS_CAUGHT;
    if (!caught && id === murdererId) scores[id] = (scores[id] ?? 0) + POINTS_ESCAPED;
  }
  return accept({
    phase: "reveal",
    phaseEndsAt: null,
    state: pub({ ...s, scores, last: { round: s.round, murdererId, murderer: c.truth.murderer, accusedId, caught, tally, why: c.why } }),
  });
}

export const murder: GameModule = {
  id: MURDER,
  name: "Murder at Ashworth Hall",
  minPlayers: MIN,
  maxPlayers: MAX,
  phases: {
    briefing: { waitsFor: "host" },
    introductions: { waitsFor: "host" },
    alibis: { waitsFor: "host" },
    evidence: { waitsFor: "host" },
    vote: { waitsFor: "all" },
    reveal: { waitsFor: "host" },
  },

  setup(ctx, options) {
    if (ctx.players.length < MIN) return reject("too_few_players");
    if (ctx.players.length > MAX) return reject("too_many_players");
    if (!ctx.secret) return reject("server_error");
    const length: MurderLength = options?.length === "normal" ? "normal" : "short";
    const team = ctx.players.map((p) => p.id);
    const s: MurderPublic = {
      settings: { length, cases: MURDER_CASES[length] },
      round: 0,
      team,
      nonce: "",
      cast: {},
      story: null,
      voted: [],
      scores: Object.fromEntries(team.map((id) => [id, 0])),
      last: null,
      finished: false,
    };
    return accept({ phase: "briefing", phaseEndsAt: null, state: pub(s), private: {} });
  },

  reduce(ctx, action) {
    const s = st(ctx);
    const phase = ctx.room.phase;
    const actor = action.actorId;
    const payload = action.payload ?? {};
    const isHost = actor === ctx.room.hostId;

    switch (action.type) {
      case "next": {
        if (!isHost) return reject("host_only");
        if (phase === "briefing") return openCase(ctx, s, 1);
        if (phase === "reveal") {
          if (payload.round !== s.round) return noop();
          if (s.round >= s.settings.cases) return accept({ state: pub({ ...s, finished: true }) });
          return openCase(ctx, s, s.round + 1);
        }
        const i = STAGES.indexOf(phase as (typeof STAGES)[number]);
        if (i < 0 || i >= STAGES.length - 1 || payload.round !== s.round) return noop();
        const to = STAGES[i + 1];
        if (to === "vote") return accept({ phase: "vote", phaseEndsAt: null, state: pub({ ...s, voted: [] }) });
        const { c } = caseFor(ctx, s);
        return accept({ phase: to, phaseEndsAt: null, state: pub(s), private: deal(ctx, s, c, i + 1) });
      }

      case "vote": {
        if (phase !== "vote" || payload.round !== s.round) return noop();
        if (!s.team.includes(actor)) return reject("not_in_game");
        const target = payload.player;
        if (typeof target !== "string" || !s.team.includes(target)) return reject("unknown_player");
        if (target === actor) return reject("self_vote");
        const mine = { ...(ctx.private[actor] ?? {}), vote: target };
        const voted = s.voted.includes(actor) ? s.voted : [...s.voted, actor];
        const next = { ...s, voted };
        if (s.team.every((id) => voted.includes(id))) {
          const priv = { ...ctx.private, [actor]: mine };
          return reveal({ ...ctx, private: priv }, next);
        }
        return accept({ state: pub(next), private: { [actor]: mine } });
      }

      case "count_votes": {
        // The host counts the votes in if a phone has gone quiet.
        if (phase !== "vote" || payload.round !== s.round) return noop();
        if (!isHost) return reject("host_only");
        if (s.voted.length === 0) return reject("no_votes");
        return reveal(ctx, s);
      }

      default:
        return reject("unknown_action");
    }
  },

  onPhaseExpired() {
    return noop();
  },

  isComplete(state) {
    return (state as unknown as MurderPublic).finished === true;
  },

  results(state) {
    const s = state as unknown as MurderPublic;
    return (s.team ?? []).map((memberId) => ({ memberId, rawPoints: s.scores?.[memberId] ?? 0 }));
  },
};

registerGame(murder);
