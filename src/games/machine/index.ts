// Fix the Machine, version 0 (concept claude/co-op-machine-v0.md; Joshua, 6 Nov
// 2026: "lets run first draft for that", then "we don't think in terms of age,
// just difficulty" and "minimum of 2 players"). A first draft for the table.
//
// Rules (the CEO seat owns them; each is one place in this file or shape.ts):
//  1. One player is the Fixer and sees a jammed machine. Everyone else is a
//     Helper and holds part of the rulebook on their own phone. With one
//     Helper, they hold all of it. Every Helper sees the rulebook's index
//     (every card and who holds it); only the holder sees the words.
//  2. The machine has parts: a row of lamps, a row of pictures, a dial. What
//     each part asks for is set by the level the host picked (shape.ts,
//     LEVELS), never by anyone's age.
//  3. The Fixer fixes a part by pressing the lamps in the right order, pressing
//     the picture keys in the right order, or turning the dial to the right
//     number (or numbers, at the combination levels). A wrong try is a wobble.
//     Three wobbles and the machine pops. When the clock runs out it pops too.
//  4. Team score: a point per part fixed, one more for fixing the whole
//     machine with no wobble. The Fixer rotates each round.
//
// Fairness, decided on the server: the whole machine, answers included, is
// generated from a hidden seed (a keyed hash of the round's public nonce), so
// the answers never leave the server. Each phone gets only its own view.

import { registerGame } from "@/engine/registry";
import { applyLampInstr, applyPictureInstr, buildManual, firstMatch, lampInstrFor, renderLampInstr, renderPictureInstr, renderRule, type PictureInstr } from "./manual";
import { seededRng, shuffle } from "@/engine/rng";
import { accept, noop, reject, type GameContext, type GameModule, type TurnResult } from "@/engine/types";
import {
  DIAL_SYMBOLS,
  LAMP_COLOURS,
  LEVELS,
  LIGHTS,
  MACHINE_CLOCK,
  MACHINE_ROUNDS,
  MAX_WOBBLES,
  PATTERNS,
  PICTURES,

  type LevelSpec,
  type MachineLength,
  type MachineLevel,
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

/** The machine as the server knows it: the Fixer's view, the cards, and the answers. */
export interface Machine {
  view: MachineView;
  cards: RuleCard[];
  answers: { lamps: number[]; pictures: Picture[]; dial: number[] };
}

/** One click on from a position (1 to 6), or back. */
const click = (pos: number, by: number) => ((((pos - 1 + by) % 6) + 6) % 6) + 1;

/** Build the round's machine from its seed. The same seed and level always give the same machine. */
export function buildMachine(seed: number, level: MachineLevel): Machine {
  const spec: LevelSpec = LEVELS[level];
  const rng = seededRng(seed);
  const view: MachineView = { serial: 100 + Math.floor(rng() * 900) };
  const cards: RuleCard[] = [];

  // The machine first, all of it, because a rule may ask about any part of it.
  const colours = shuffle([...LAMP_COLOURS], rng).slice(0, spec.lamps);
  let lit: boolean[];
  do lit = colours.map(() => rng() < 0.5);
  while (!lit.some(Boolean) || lit.every(Boolean));
  view.lamps = colours.map((colour, i) => ({ colour, lit: lit[i] }));
  view.pictures = shuffle([...PICTURES], rng).slice(0, spec.pictures);
  const symbols = spec.dialLabels === "symbols" ? shuffle([...DIAL_SYMBOLS], rng) : undefined;
  const labelOf = (pos: number) => (symbols ? symbols[pos - 1] : String(pos));
  const patterns: Pattern[] = shuffle([...PATTERNS], rng).slice(0, spec.dialTurns);
  const light = spec.modifier === "light" ? LIGHTS[Math.floor(rng() * LIGHTS.length)] : undefined;
  view.dial = { patterns, labels: spec.dialLabels, symbols, light };

  // Lamps: a manual of rules; the first that fits this machine is the one to follow.
  const lampRules = buildManual(view, spec.lampRules, spec.crossParts, rng, (conds) => lampInstrFor(view, conds, rng));
  const lampsAnswer = applyLampInstr(firstMatch(lampRules, view), view);
  const lampLines = lampRules.map((r, i) => renderRule(r, i + 1, renderLampInstr));
  const HOW = "Find the FIRST rule that fits this machine, checking them in order, and do what it says. A rule about a lamp or key the machine does not have never fits.";
  if (spec.splitLamps) {
    const k = Math.ceil(lampLines.length / 2);
    cards.push({ part: "lamps", title: "The lamps, part 1 of 2", lines: [HOW, ...lampLines.slice(0, k), "If none of these fits, the rule is in part 2."] });
    cards.push({ part: "lamps", title: "The lamps, part 2 of 2", lines: ["Only if no rule in part 1 fits:", ...lampLines.slice(k)] });
  } else {
    cards.push({ part: "lamps", title: "The lamps", lines: [HOW, ...lampLines] });
  }

  // Pictures: a plain order at the low levels, a manual of orders above.
  let picturesAnswer: Picture[];
  if (spec.pictureRules <= 1) {
    const order = shuffle([...PICTURES], rng);
    picturesAnswer = applyPictureInstr({ order, reversed: false }, view);
    cards.push({ part: "pictures", title: "The picture row", lines: ["Press the picture keys in this order:", order.join(", ") + ".", "Skip any key that is not on the machine."] });
  } else {
    const picRules = buildManual<PictureInstr>(view, spec.pictureRules, spec.crossParts, rng, () => ({ order: shuffle([...PICTURES], rng), reversed: rng() < 0.3 }));
    picturesAnswer = applyPictureInstr(firstMatch(picRules, view), view);
    cards.push({ part: "pictures", title: "The picture row", lines: [HOW, ...picRules.map((r, i) => renderRule(r, i + 1, renderPictureInstr))] });
  }
  const litCount = lit.filter(Boolean).length;
  const makeTable = () => {
    const settings = shuffle([1, 2, 3, 4, 5, 6], rng);
    return PATTERNS.map((pattern, i) => ({ pattern, pos: settings[i] }));
  };
  // Which tables exist, and which one this machine really uses.
  const current = spec.manuals === 2 ? (rng() < 0.5 ? "A" : "B") : "A";
  const manuals = (spec.manuals === 2 ? ["A", "B"] : ["A"]) as ("A" | "B")[];
  const useSecond = spec.dependency && litCount > 2;
  let answerTable: { pattern: Pattern; pos: number }[] | null = null;
  const modLines: string[] = [];
  if (spec.modifier === "light") modLines.push("Then look at the light under the dial: green, leave it; amber, one click on; red, one click back. The last position and the first are neighbours.");
  if (spec.modifier === "serial") modLines.push("Then if the serial number is ODD, one click on. The last position and the first are neighbours.");
  for (const manual of manuals) {
    const tables = spec.dependency ? [makeTable(), makeTable()] : [makeTable()];
    if (manual === current) answerTable = tables[useSecond ? 1 : 0];
    const manualName = spec.manuals === 2 ? `Manual ${manual}` : "The dial";
    const head = spec.dependency ? ["Use the FIRST table unless more than two lamps are lit; then use the SECOND table."] : [];
    const rows = (t: { pattern: Pattern; pos: number }[], from: number, to: number) => t.slice(from, to).map((r) => `${r.pattern}: ${labelOf(r.pos)}`);
    const halves: [number, number][] = [
      [0, 3],
      [3, 6],
    ];
    halves.forEach(([from, to], h) => {
      const lines = [...head];
      if (spec.dependency) {
        lines.push("First table:", ...rows(tables[0], from, to), "Second table:", ...rows(tables[1], from, to));
      } else {
        lines.push("Set the dial by the pattern:", ...rows(tables[0], from, to));
      }
      lines.push(...modLines);
      cards.push({ part: "dial", title: `${manualName}, part ${h + 1} of 2`, lines });
    });
  }
  if (spec.manuals === 2) cards.push({ part: "dial", title: "The service tag", lines: [`This machine runs on Manual ${current}. Ignore the other manual.`] });
  const shift = spec.modifier === "light" ? (light === "amber" ? 1 : light === "red" ? -1 : 0) : spec.modifier === "serial" && view.serial % 2 === 1 ? 1 : 0;
  const dialAnswer = patterns.map((p) => click(answerTable!.find((r) => r.pattern === p)!.pos, shift));

  return { view, cards, answers: { lamps: lampsAnswer, pictures: picturesAnswer, dial: dialAnswer } };
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
  const next: MachinePublic = { ...s, round, nonce: nonce(ctx.rng), fixerId, parts: { lamps: "open", pictures: "open", dial: "open" }, wobbles: 0, cards: [], last: s.last };
  const m = buildMachine(seedOf(ctx, next), s.settings.level);
  // The rulebook goes round the Helpers in a fresh order each round. With one
  // Helper they hold all of it; with more Helpers than cards, some cards are
  // held twice.
  const helpers = shuffle(
    s.team.filter((id) => id !== fixerId),
    ctx.rng
  );
  const held: Record<string, RuleCard[]> = {};
  for (const h of helpers) held[h] = [];
  const count = Math.max(m.cards.length, helpers.length);
  for (let i = 0; i < count; i++) held[helpers[i % helpers.length]].push(m.cards[i % m.cards.length]);
  const priv: Record<string, Record<string, unknown>> = {};
  for (const h of helpers) {
    const mine: MachineMine = { round, role: "helper", cards: held[h] };
    priv[h] = mine as unknown as Record<string, unknown>;
  }
  next.cards = m.cards.map((c) => ({ title: c.title, part: c.part, holders: helpers.filter((h) => held[h].includes(c)) }));
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
  minPlayers: 2,
  maxPlayers: 12,
  phases: {
    fixing: { waitsFor: "one" },
    round_over: { waitsFor: "host" },
  },

  setup(ctx, options) {
    if (ctx.players.length < 2) return reject("too_few_players");
    if (!ctx.secret) return reject("server_error");
    const pace = pick<MachinePace>(options?.pace, ["relaxed", "normal", "quick"], "normal");
    const length = pick<MachineLength>(options?.length, ["short", "normal", "long"], "normal");
    const level = ([1, 2, 3, 4, 5] as const).includes(options?.level as MachineLevel) ? (options!.level as MachineLevel) : 1;
    const base: MachinePublic = {
      settings: { pace, length, level, clockSeconds: Math.round(MACHINE_CLOCK[pace] * LEVELS[level].clock), rounds: MACHINE_ROUNDS[length] },
      round: 0,
      team: ctx.players.map((p) => p.id),
      fixerStart: Math.floor(ctx.rng() * ctx.players.length),
      nonce: "",
      fixerId: "",
      parts: {},
      wobbles: 0,
      cards: [],
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
        const m = buildMachine(seedOf(ctx, s), s.settings.level);
        const right = part === "lamps" ? sameList(payload.answer, m.answers.lamps) : part === "pictures" ? sameList(payload.answer, m.answers.pictures) : sameList(payload.answer, m.answers.dial);
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
