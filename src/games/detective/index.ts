// The Detective game (Joshua, 5 Nov 14:01 concept, 14:26 approved to test;
// 21 Nov 17:37 "Build detective"). Levels 1 and 2 of the approved ladder.
//
// Rules (the CEO seat owns them; each is one place here or in shape.ts):
//  1. Everyone hears the same story and sees the same suspects.
//  2. Each player holds one or more roles (CCTV, Witnesses, Records,
//     Forensics) and sees only that evidence. With fewer than four players some
//     hold two roles; with more, roles are shared. Roles move round each case.
//  3. Anyone can name a suspect. When everyone has agreed, the team has
//     accused. The host can lock the accusation in if a phone has gone quiet.
//  4. A right accusation is 3 points for the team, 1 more without a hint.
//     A wrong one: the culprit gets away. Nobody is out.
//
// Fairness, on the server: the case, answer included, is built from a hidden
// seed (a keyed hash of the case's public nonce), the same way the Machine
// hides its answers. Each phone gets only its own evidence.

import { registerGame } from "@/engine/registry";
import { seededRng, shuffle } from "@/engine/rng";
import { accept, noop, reject, type GameContext, type GameModule, type TurnResult } from "@/engine/types";
import { buildCase, type Case } from "./case";
import { DETECTIVE_CASES, HINTS, POINTS_NO_HINT, POINTS_RIGHT, type DetectiveLength, type DetectiveLevel, type DetectiveMine, type DetectivePublic, type RoleKey } from "./shape";

export const DETECTIVE = "detective";
const ROLES: RoleKey[] = ["cctv", "witness", "records", "forensics"];

const st = (ctx: GameContext) => ctx.room.state as unknown as DetectivePublic;
const pub = (s: DetectivePublic) => s as unknown as Record<string, unknown>;

function seedOf(ctx: GameContext, nonce: string): number {
  if (!ctx.secret) throw new Error("detective needs the server secret");
  return Math.floor(ctx.secret(`detective:${nonce}`) * 4294967296);
}

function nonce(rng: () => number): string {
  let out = "";
  for (let i = 0; i < 4; i++) out += Math.floor(rng() * 4294967296).toString(36).padStart(7, "0");
  return out;
}

/** Hand the four roles round the team: everyone gets at least one, every role is held. */
export function dealRoles(team: string[], rng: () => number): Record<string, RoleKey[]> {
  const people = shuffle([...team], rng);
  const roles = shuffle([...ROLES], rng);
  const out: Record<string, RoleKey[]> = Object.fromEntries(people.map((p) => [p, []]));
  const n = Math.max(people.length, roles.length);
  for (let i = 0; i < n; i++) {
    const who = people[i % people.length];
    const role = roles[i % roles.length];
    if (!out[who].includes(role)) out[who].push(role);
  }
  return out;
}

function openCase(ctx: GameContext, s: DetectivePublic, round: number): TurnResult {
  const n = nonce(ctx.rng);
  const c: Case = buildCase(seedOf(ctx, n), s.settings.level);
  const roles = dealRoles(s.team, seededRng(Math.floor(ctx.rng() * 4294967296)));
  const priv: Record<string, Record<string, unknown>> = {};
  for (const id of s.team) {
    const mine: DetectiveMine = { round, evidence: (roles[id] ?? []).map((r) => c.evidence[r]) };
    priv[id] = mine as unknown as Record<string, unknown>;
  }
  const next: DetectivePublic = {
    ...s,
    round,
    nonce: n,
    roles,
    case: { story: c.story, item: c.truth.theme.item, suspects: [...c.truth.suspects].sort() },
    hintsUsed: 0,
    proposal: null,
  };
  return accept({ phase: "investigating", phaseEndsAt: null, state: pub(next), private: priv });
}

function settle(ctx: GameContext, s: DetectivePublic, accused: string): TurnResult {
  const c = buildCase(seedOf(ctx, s.nonce), s.settings.level);
  const right = accused === c.truth.culprit;
  const points = right ? POINTS_RIGHT + (s.hintsUsed === 0 ? POINTS_NO_HINT : 0) : 0;
  return accept({
    phase: "solved",
    phaseEndsAt: null,
    state: pub({
      ...s,
      proposal: null,
      score: s.score + points,
      tally: { solved: s.tally.solved + (right ? 1 : 0), escaped: s.tally.escaped + (right ? 0 : 1) },
      last: { round: s.round, accused, culprit: c.truth.culprit, right, points, why: c.why },
    }),
  });
}

export const detective: GameModule = {
  id: DETECTIVE,
  name: "Detective",
  minPlayers: 2,
  maxPlayers: 12,
  phases: {
    briefing: { waitsFor: "host" },
    investigating: { waitsFor: "all" },
    solved: { waitsFor: "host" },
  },

  setup(ctx, options) {
    if (ctx.players.length < 2) return reject("too_few_players");
    if (!ctx.secret) return reject("server_error");
    const level: DetectiveLevel = options?.level === 2 ? 2 : 1;
    const length: DetectiveLength = options?.length === "normal" ? "normal" : "short";
    const s: DetectivePublic = {
      settings: { level, length, cases: DETECTIVE_CASES[length] },
      round: 0,
      team: ctx.players.map((p) => p.id),
      nonce: "",
      roles: {},
      case: null,
      hintsUsed: 0,
      proposal: null,
      score: 0,
      tally: { solved: 0, escaped: 0 },
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
    const onTeam = s.team.includes(actor);

    switch (action.type) {
      case "open": {
        if (phase !== "briefing" && phase !== "solved") return noop();
        if (phase === "solved" && payload.round !== s.round) return noop();
        if (!isHost) return reject("host_only");
        if (s.round >= s.settings.cases) return accept({ state: pub({ ...s, finished: true }) });
        return openCase(ctx, s, s.round + 1);
      }

      case "propose": {
        if (phase !== "investigating" || payload.round !== s.round) return noop();
        if (!onTeam) return reject("not_in_game");
        const suspect = payload.suspect;
        if (typeof suspect !== "string" || !s.case?.suspects.includes(suspect)) return reject("unknown_suspect");
        const next: DetectivePublic = { ...s, proposal: { suspect, by: actor, agreed: [actor] } };
        if (s.team.every((id) => next.proposal!.agreed.includes(id))) return settle(ctx, next, suspect);
        return accept({ state: pub(next) });
      }

      case "agree": {
        if (phase !== "investigating" || payload.round !== s.round || !s.proposal) return noop();
        if (!onTeam) return reject("not_in_game");
        if (payload.suspect !== s.proposal.suspect) return reject("proposal_changed");
        if (s.proposal.agreed.includes(actor)) return noop();
        const proposal = { ...s.proposal, agreed: [...s.proposal.agreed, actor] };
        if (s.team.every((id) => proposal.agreed.includes(id))) return settle(ctx, { ...s, proposal }, proposal.suspect);
        return accept({ state: pub({ ...s, proposal }) });
      }

      case "withdraw": {
        if (phase !== "investigating" || payload.round !== s.round || !s.proposal) return noop();
        if (!onTeam) return reject("not_in_game");
        return accept({ state: pub({ ...s, proposal: null }) });
      }

      case "lock_in": {
        // The host settles the accusation on the table when a phone has gone quiet.
        if (phase !== "investigating" || payload.round !== s.round || !s.proposal) return noop();
        if (!isHost) return reject("host_only");
        return settle(ctx, s, s.proposal.suspect);
      }

      case "hint": {
        if (phase !== "investigating" || payload.round !== s.round || !s.case) return noop();
        if (!onTeam) return reject("not_in_game");
        if (s.hintsUsed >= HINTS(s.case.item).length) return noop();
        return accept({ state: pub({ ...s, hintsUsed: s.hintsUsed + 1 }) });
      }

      default:
        return reject("unknown_action");
    }
  },

  // No clock at these levels (the paper case has none).
  onPhaseExpired() {
    return noop();
  },

  isComplete(state) {
    return (state as unknown as DetectivePublic).finished === true;
  },

  // A team game: the same points to everyone who played.
  results(state) {
    const s = state as unknown as DetectivePublic;
    return (s.team ?? []).map((memberId) => ({ memberId, rawPoints: s.score }));
  },
};

registerGame(detective);
