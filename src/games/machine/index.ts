// Fix the Machine, version 0 (concept claude/co-op-machine-v0.md; Joshua, 6 Nov
// 2026: "lets run first draft for that"). A first draft for the family table.
//
// Rules (the CEO seat owns them; each is one place in this file or shape.ts):
//  1. One player is the Fixer and sees a jammed machine. Everyone else is a
//     Helper and holds part of the rulebook on their own phone. Nobody has the
//     whole book, and the machine is on nobody's phone but the Fixer's.
//  2. The machine has parts: a row of lamps, a row of pictures, and a dial. A
//     Fixer aged 6 to 8 gets two parts (lamps and pictures); 9 to 11 gets all
//     three; 12 and over gets a twist on the dial as well.
//  3. The Fixer fixes a part by pressing the lamps in the right order, tapping
//     the pictures in the right order, or setting the dial. A wrong try is a
//     wobble. Three wobbles and the machine pops. A clock runs; when it runs
//     out the machine pops too.
//  4. Team score only: a point for each part fixed, and one more for fixing
//     the whole machine with no wobble. The Fixer rotates each round.
//  5. The rulebook pieces go to the Helpers round-robin, the picture card to
//     the youngest Helper where there is one. With more Helpers than pieces,
//     two Helpers hold the same piece.
//
// Fairness, decided on the server: the whole machine, answers included, is
// generated from a hidden seed (a keyed hash of the round's public nonce), so
// the answers never leave the server. Each phone gets only its own view.
//
// Not built in v0: the TV view, hints, sounds, the machine popping with
// confetti. Content on screen is placeholder copy for the CEO seat and Joshua.

import { registerGame } from "@/engine/registry";
import { seededRng, shuffle } from "@/engine/rng";
import { accept, noop, reject, type AgeBand, type GameContext, type GameModule, type TurnResult } from "@/engine/types";
import {
  DIAL_SETTINGS,
  LAMP_COLOURS,
  MACHINE_CLOCK,
  MACHINE_ROUNDS,
  MAX_WOBBLES,
  PATTERNS,
  PICTURES,
  type LampColour,
  type MachineLength,
  type MachineMine,
  type MachinePace,
  type MachinePublic,
  type MachineView,
  type PartKey,
  type Pattern,
  type Picture,
  type RuleCard,
} from "./shape";

export const MACHINE = "machine";

type Tier = "A" | "B" | "C";
const tierFor = (age: AgeBand | undefined): Tier => (age === "6-8" ? "A" : age === "9-11" ? "B" : "C");
const AGE_ORDER: Record<string, number> = { "6-8": 0, "9-11": 1, "12-15": 2, "16+": 3 };

/** The machine as the server knows it: the Fixer's view, the cards, and the answers. */
export interface Machine {
  view: MachineView;
  cards: RuleCard[];
  answers: { lamps?: number[]; pictures?: Picture[]; dial?: number };
}

const LAMP_RULES = [
  {
    key: "lit-first",
    lines: ["Press the lamps that are LIT first, left to right.", "Then press the lamps that are OFF, left to right."],
    order: (lamps: { lit: boolean }[]) => [...idx(lamps, (l) => l.lit), ...idx(lamps, (l) => !l.lit)],
  },
  {
    key: "off-first-reverse",
    lines: ["Press the lamps that are OFF first, right to left.", "Then press the lamps that are LIT, left to right."],
    order: (lamps: { lit: boolean }[]) => [...idx(lamps, (l) => !l.lit).reverse(), ...idx(lamps, (l) => l.lit)],
  },
  {
    key: "colour-order",
    lines: [] as string[], // filled per machine
    order: (lamps: { colour: LampColour }[], colours?: LampColour[]) =>
      colours!.map((c) => lamps.findIndex((l) => l.colour === c)).filter((i) => i >= 0),
  },
] as const;

function idx<T>(list: T[], keep: (x: T) => boolean): number[] {
  return list.map((x, i) => (keep(x) ? i : -1)).filter((i) => i >= 0);
}

/** Build the round's machine from its seed. The same seed always gives the same machine. */
export function buildMachine(seed: number, tier: Tier): Machine {
  const rng = seededRng(seed);
  const view: MachineView = { serial: 100 + Math.floor(rng() * 900) };
  const cards: RuleCard[] = [];
  const answers: Machine["answers"] = {};

  // Lamps: 3 for the youngest Fixer, else 4, with at least one lit and one off.
  const n = tier === "A" ? 3 : 4;
  const colours = shuffle([...LAMP_COLOURS], rng).slice(0, n);
  let lit: boolean[];
  do lit = colours.map(() => rng() < 0.5);
  while (!lit.some(Boolean) || lit.every(Boolean));
  view.lamps = colours.map((colour, i) => ({ colour, lit: lit[i] }));
  const ruleIndex = tier === "A" ? (rng() < 0.5 ? 0 : 2) : Math.floor(rng() * LAMP_RULES.length);
  const rule = LAMP_RULES[ruleIndex];
  if (rule.key === "colour-order") {
    const order = shuffle([...LAMP_COLOURS], rng);
    cards.push({ part: "lamps", title: "The lamps", lines: ["Press the lamps in this colour order:", order.join(", ") + ".", "Skip any colour the machine does not have."] });
    answers.lamps = rule.order(view.lamps, order);
  } else {
    cards.push({ part: "lamps", title: "The lamps", lines: [...rule.lines] });
    answers.lamps = rule.order(view.lamps);
  }

  // Pictures: the card lists every picture in an order; the machine shows some of them.
  const order = shuffle([...PICTURES], rng);
  const shown = shuffle(order.slice(), rng).slice(0, tier === "A" ? 3 : 4);
  view.pictures = shown;
  answers.pictures = order.filter((p) => shown.includes(p));
  cards.push({ part: "pictures", title: "The picture row", lines: ["Tap the pictures in this order:", order.join(", ") + ".", "Skip any picture that is not on the machine."] });

  // Dial: a pattern on the machine, a table on the card. Two halves of the table.
  if (tier !== "A") {
    const settings = shuffle([...DIAL_SETTINGS], rng);
    const table = PATTERNS.map((pattern, i) => ({ pattern, setting: settings[i] }));
    const pattern: Pattern = PATTERNS[Math.floor(rng() * PATTERNS.length)];
    view.dial = { pattern };
    let setting = table.find((t) => t.pattern === pattern)!.setting;
    const twist = tier === "C";
    if (twist && view.serial % 2 === 1) setting = (setting % 6) + 1;
    answers.dial = setting;
    const twistLine = "If the serial number is ODD, turn the dial one more click. 6 goes round to 1.";
    cards.push({ part: "dial", title: "The dial, part 1 of 2", lines: ["Set the dial by the pattern:", ...table.slice(0, 3).map((t) => `${t.pattern}: ${t.setting}`), ...(twist ? [twistLine] : [])] });
    cards.push({ part: "dial", title: "The dial, part 2 of 2", lines: ["Set the dial by the pattern:", ...table.slice(3).map((t) => `${t.pattern}: ${t.setting}`), ...(twist ? [twistLine] : [])] });
  }
  return { view, cards, answers };
}

function seedOf(ctx: GameContext, s: MachinePublic): number {
  if (!ctx.secret) throw new Error("machine needs the server secret");
  return Math.floor(ctx.secret(`machine:${s.nonce}`) * 4294967296);
}

function nonce(rng: () => number): string {
  let out = "";
  for (let i = 0; i < 4; i++) out += Math.floor(rng() * 4294967296).toString(36).padStart(7, "0");
  return out;
}

const st = (ctx: GameContext) => ctx.room.state as unknown as MachinePublic;
const pub = (s: MachinePublic) => s as unknown as Record<string, unknown>;

/** Deal a round: pick the Fixer, build the machine, hand out the views. */
function dealRound(ctx: GameContext, s: MachinePublic, round: number): TurnResult {
  const fixerId = s.team[(s.fixerStart + round - 1) % s.team.length];
  const fixer = ctx.players.find((p) => p.id === fixerId);
  const next: MachinePublic = { ...s, round, nonce: nonce(ctx.rng), fixerId, parts: {}, wobbles: 0, holders: {}, last: s.last };
  const m = buildMachine(seedOf(ctx, next), tierFor(fixer?.ageBand));
  for (const c of m.cards) next.parts[c.part] = "open";
  // Helpers, youngest first, so the picture card lands with a young reader.
  const helpers = ctx.players.filter((p) => p.id !== fixerId).sort((a, b) => (AGE_ORDER[a.ageBand ?? "16+"] ?? 3) - (AGE_ORDER[b.ageBand ?? "16+"] ?? 3));
  const pieces = [...m.cards].sort((a, b) => (a.part === "pictures" ? -1 : b.part === "pictures" ? 1 : 0));
  const priv: Record<string, Record<string, unknown>> = {};
  const held: Record<string, RuleCard[]> = {};
  for (const h of helpers) held[h.id] = [];
  const count = Math.max(pieces.length, helpers.length);
  for (let i = 0; i < count; i++) held[helpers[i % helpers.length].id].push(pieces[i % pieces.length]);
  for (const h of helpers) {
    const mine: MachineMine = { round, role: "helper", cards: held[h.id] };
    priv[h.id] = mine as unknown as Record<string, unknown>;
    next.holders[h.id] = [...new Set(held[h.id].map((c) => c.part))];
  }
  const fixerMine: MachineMine = { round, role: "fixer", view: m.view };
  priv[fixerId] = fixerMine as unknown as Record<string, unknown>;
  const ends = new Date(Date.parse(ctx.now) + s.settings.clockSeconds * 1000).toISOString();
  return accept({ phase: "fixing", phaseEndsAt: ends, state: pub(next), private: priv });
}

function endRound(ctx: GameContext, s: MachinePublic, popped: "wobbles" | "time" | null): TurnResult {
  const fixed = Object.values(s.parts).filter((v) => v === "fixed").length;
  const total = Object.keys(s.parts).length;
  const won = fixed === total && popped === null;
  const points = fixed + (won && s.wobbles === 0 ? 1 : 0);
  return accept({
    phase: "round_over",
    phaseEndsAt: null,
    state: pub({ ...s, score: s.score + points, last: { round: s.round, won, popped, fixed, wobbles: s.wobbles, points } }),
  });
}

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

function sameList(a: unknown, b: unknown[]): boolean {
  return Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);
}

export const machine: GameModule = {
  id: MACHINE,
  name: "Fix the Machine",
  minPlayers: 3,
  maxPlayers: 12,
  phases: {
    fixing: { waitsFor: "one" },
    round_over: { waitsFor: "host" },
  },

  setup(ctx, options) {
    if (ctx.players.length < 3) return reject("too_few_players");
    if (!ctx.secret) return reject("server_error");
    const pace = pick<MachinePace>(options?.pace, ["relaxed", "normal", "quick"], "normal");
    const length = pick<MachineLength>(options?.length, ["short", "normal", "long"], "normal");
    const base: MachinePublic = {
      settings: { pace, length, clockSeconds: MACHINE_CLOCK[pace], rounds: MACHINE_ROUNDS[length] },
      round: 0,
      team: ctx.players.map((p) => p.id),
      fixerStart: Math.floor(ctx.rng() * ctx.players.length),
      nonce: "",
      fixerId: "",
      parts: {},
      wobbles: 0,
      holders: {},
      score: 0,
      last: null,
      finished: false,
    };
    return dealRound(ctx, base, 1);
  },

  reduce(ctx, action) {
    const s = st(ctx);
    const phase = ctx.room.phase;
    const actor = action.actorId;
    const payload = action.payload ?? {};
    const isHost = actor === ctx.room.hostId;

    switch (action.type) {
      case "attempt": {
        if (phase !== "fixing" || payload.round !== s.round) return noop();
        if (actor !== s.fixerId) return reject("not_the_fixer");
        const part = payload.part as PartKey;
        if (!(part in s.parts)) return reject("unknown_part");
        if (s.parts[part] === "fixed") return noop();
        const fixer = ctx.players.find((p) => p.id === s.fixerId);
        const m = buildMachine(seedOf(ctx, s), tierFor(fixer?.ageBand));
        const right =
          part === "lamps" ? sameList(payload.answer, m.answers.lamps!) : part === "pictures" ? sameList(payload.answer, m.answers.pictures!) : payload.answer === m.answers.dial;
        if (right) {
          const next = { ...s, parts: { ...s.parts, [part]: "fixed" as const } };
          if (Object.values(next.parts).every((v) => v === "fixed")) return endRound(ctx, next, null);
          return accept({ state: pub(next) });
        }
        const next = { ...s, wobbles: s.wobbles + 1 };
        if (next.wobbles >= MAX_WOBBLES) return endRound(ctx, next, "wobbles");
        return accept({ state: pub(next) });
      }

      case "next_round": {
        if (phase !== "round_over" || payload.round !== s.round) return noop();
        if (!isHost) return reject("host_only");
        if (s.round >= s.settings.rounds) return accept({ state: pub({ ...s, finished: true }) });
        return dealRound(ctx, s, s.round + 1);
      }

      default:
        return reject("unknown_action");
    }
  },

  onPhaseExpired(ctx) {
    if (ctx.room.phase !== "fixing") return noop();
    return endRound(ctx, st(ctx), "time");
  },

  isComplete(state) {
    return (state as unknown as MachinePublic).finished === true;
  },

  // A team game: the same points to everyone who played.
  results(state) {
    const s = state as unknown as MachinePublic;
    return (s.team ?? []).map((memberId) => ({ memberId, rawPoints: s.score }));
  },
};

registerGame(machine);
