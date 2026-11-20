// Fix the Machine (concept claude/co-op-machine-v0.md; Joshua, 6 Nov 2026:
// "lets run first draft for that", "we don't think in terms of age, just
// difficulty", "minimum of 2 players", and 23:54 "if the helper reads out the
// answer to the fixer what is the point"; CEO seat review
// claude/machine-review-v1.md, 20 Nov: one rulebook for every Helper, Try it
// on every part, a How to fix it screen, fair Fixer turns, and a level ramp
// where every level adds one idea to every part).
//
// Rules (the CEO seat owns them; each is one place in this file or shape.ts):
//  1. One player is the Fixer and sees a jammed machine. Everyone else is a
//     Helper and sees the whole rulebook on their own phone. The Fixer never
//     sees the rulebook. Nobody fixes twice until everyone has fixed once.
//  2. The machine has parts: a row of lamps, a row of picture keys, a dial.
//     What each part asks for is set by the level the host picked (shape.ts,
//     LEVELS), never by anyone's age.
//  3. The Fixer sets a part up and presses Try it. A wrong try is a wobble.
//     Three wobbles and the machine pops. When the clock runs out it pops too.
//     At the two-stage levels the lamps change after the right order and the
//     Fixer goes again.
//  4. Team score: a point per part fixed, one more for fixing the whole
//     machine with no wobble. "Master mechanics" only when every machine in
//     the game was a clean fix.
//
// Fairness, decided on the server: the whole machine, answers included, is
// generated from a hidden seed (a keyed hash of the machine's public nonce),
// so the answers never leave the server. Each phone gets only its own view.

import { registerGame } from "@/engine/registry";
import { applyLampInstr, applyPictureInstr, buildManual, firstMatch, lampInstrFor, pictureInstrFor, renderLampInstr, renderPictureInstr, renderRule, type PictureInstr, type Scope } from "./manual";
import { seededRng, shuffle } from "@/engine/rng";
import { accept, noop, reject, type GameContext, type GameModule, type TurnResult } from "@/engine/types";
import {
  DIAL_SYMBOLS,
  KEY_COLOURS,
  LAMP_COLOURS,
  LEVELS,
  LIGHTS,
  MACHINE_CLOCK,
  MACHINE_ROUNDS,
  MAX_WOBBLES,
  PART_NAMES,
  PATTERNS,
  PICTURES,
  type Key,
  type Lamp,
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
  type TurnSource,
} from "./shape";

export const MACHINE = "machine";

export interface Answers {
  lamps: number[];
  pictures: Picture[];
  dial: number[];
}

/**
 * The machine as the server knows it: the Fixer's view, the rulebook, and the
 * answers. At the two-stage levels the lamps change after the first right
 * order, and anything that asks about the lamps "right now" (the dial's lamp
 * turn) is answered for the lamps on show, so there is one set of answers per
 * stage.
 */
export interface Machine {
  view: MachineView;
  /** The lamps after the first stage, at the two-stage levels. */
  lamps2: Lamp[] | null;
  cards: RuleCard[];
  answers: Answers[];
}

/** One click on from a position (1 to 6), or back. */
const click = (pos: number, by: number) => ((((pos - 1 + by) % 6) + 6) % 6) + 1;

const ORDINAL = ["first", "second", "third"];
export const HOW = "Check the rules in order. Do the first one that fits. A rule about something the machine does not have never fits.";
export const BLINK_NOTE = "A blinking lamp counts as lit.";

function drawLamps(colours: readonly string[], blink: boolean, rng: () => number, unlike: Lamp[] | null): Lamp[] {
  for (;;) {
    let lit: boolean[];
    do lit = colours.map(() => rng() < 0.5);
    while (!lit.some(Boolean) || lit.every(Boolean));
    const lamps: Lamp[] = colours.map((colour, i) => ({ colour: colour as Lamp["colour"], lit: lit[i] }));
    if (blink) {
      for (const l of lamps) l.blink = l.lit && rng() < 0.5;
      if (!lamps.some((l) => l.blink)) lamps[lamps.findIndex((l) => l.lit)].blink = true;
    }
    if (!unlike || lamps.some((l, i) => l.lit !== unlike[i].lit || (l.blink ?? false) !== (unlike[i].blink ?? false))) return lamps;
  }
}

/** Build the machine from its seed. The same seed and level always give the same machine. */
export function buildMachine(seed: number, level: MachineLevel): Machine {
  const spec: LevelSpec = LEVELS[level];
  const rng = seededRng(seed);
  const view: MachineView = { serial: 100 + Math.floor(rng() * 900) };
  const cards: RuleCard[] = [];

  // The machine first, all of it, because a rule may ask about any part of it.
  const colours = shuffle([...LAMP_COLOURS], rng).slice(0, spec.lamps);
  view.lamps = drawLamps(colours, spec.blink, rng, null);
  const lamps2 = spec.stages === 2 ? drawLamps(colours, spec.blink, rng, view.lamps) : null;

  const pics = shuffle([...PICTURES], rng).slice(0, spec.pictures);
  const keys: Key[] = pics.map((picture) => ({ picture }));
  if (spec.flip) {
    for (const k of keys) k.flipped = rng() < 0.4;
    if (!keys.some((k) => k.flipped)) keys[Math.floor(rng() * keys.length)].flipped = true;
  }
  if (spec.keyColours) {
    for (const k of keys) k.colour = KEY_COLOURS[Math.floor(rng() * KEY_COLOURS.length)];
    if (keys.every((k) => k.colour === keys[0].colour)) keys[1].colour = KEY_COLOURS.find((c) => c !== keys[0].colour)!;
  }
  view.pictures = keys;

  const symbols = spec.dialLabels === "symbols" ? shuffle([...DIAL_SYMBOLS], rng) : undefined;
  const labelOf = (pos: number) => (symbols ? symbols[pos - 1] : String(pos));
  const patterns: Pattern[] = shuffle([...PATTERNS], rng);
  let p = 0;
  const turns = spec.turns.map((source): { source: TurnSource; pattern?: Pattern } => (source === "pattern" ? { source, pattern: patterns[p++] } : { source }));
  const light = spec.modifier === "light" ? LIGHTS[Math.floor(rng() * LIGHTS.length)] : undefined;
  view.dial = { turns, labels: spec.dialLabels, symbols, light };

  // Lamps: a manual of rules; the first that fits the lamps on show is the one to follow.
  const lampScope: Scope = { lamps: true, keys: spec.lampCross, serial: spec.lampCross, dial: spec.lampCross };
  const lampRules = buildManual(view, spec.lampRules, lampScope, rng, (conds) => lampInstrFor(view, conds, rng));
  const lampLines = lampRules.map((r, i) => renderRule(r, i + 1, renderLampInstr));
  cards.push({ part: "lamps", title: "Lamps", lines: [spec.blink ? `${HOW} ${BLINK_NOTE}` : HOW, ...lampLines] });

  // Pictures: a plain order at level 1, a manual of orders above. Two manuals at the top.
  const current = spec.manuals === 2 ? (rng() < 0.5 ? "A" : "B") : "A";
  const manuals = (spec.manuals === 2 ? ["A", "B"] : ["A"]) as ("A" | "B")[];
  const picScope: Scope = { lamps: spec.stages === 1, keys: true, serial: level >= 4, dial: level >= 4 };
  let picturesAnswer: Picture[] = [];
  for (const manual of manuals) {
    const title = spec.manuals === 2 ? `Pictures, Manual ${manual}` : "Pictures";
    if (spec.pictureRules <= 1) {
      const order = shuffle([...PICTURES], rng);
      if (manual === current) picturesAnswer = applyPictureInstr({ order, reversed: false }, keys);
      cards.push({ part: "pictures", title, lines: ["Press the picture keys in this order:", order.join(", ") + ".", "Skip any key that is not on the machine."] });
    } else {
      const picRules = buildManual<PictureInstr>(view, spec.pictureRules, picScope, rng, () => pictureInstrFor(view, rng));
      if (manual === current) picturesAnswer = applyPictureInstr(firstMatch(picRules, view), keys);
      cards.push({ part: "pictures", title, lines: [HOW, ...picRules.map((r, i) => renderRule(r, i + 1, renderPictureInstr))] });
    }
  }

  // The dial: one table per turn, by what the turn is read from.
  type Table = Record<string, number>;
  const makePatternTable = (): Table => {
    const settings = shuffle([1, 2, 3, 4, 5, 6], rng);
    return Object.fromEntries(PATTERNS.map((pattern, i) => [pattern, settings[i]]));
  };
  const makeLampsTable = (): Table => Object.fromEntries(Array.from({ length: spec.lamps - 1 }, (_, i) => [String(i + 1), 1 + Math.floor(rng() * 6)]));
  const SERIAL_ROWS = ["0 or 1", "2 or 3", "4 or 5", "6 or 7", "8 or 9"];
  const makeSerialTable = (): Table => Object.fromEntries(SERIAL_ROWS.map((row) => [row, 1 + Math.floor(rng() * 6)]));
  const modLine =
    spec.modifier === "light"
      ? "Then look at the light under the dial: green, leave it; amber, one click on; red, one click back. The last position and the first are neighbours."
      : spec.modifier === "serial"
        ? "Then if the serial number is ODD, one click on. The last position and the first are neighbours."
        : null;
  let answerTables: Table[] = [];
  for (const manual of manuals) {
    const tables = turns.map((t) => (t.source === "pattern" ? makePatternTable() : t.source === "lamps" ? makeLampsTable() : makeSerialTable()));
    if (manual === current) answerTables = tables;
    turns.forEach((t, i) => {
      const prefix = turns.length === 1 ? "Set the dial" : `${ORDINAL[i][0].toUpperCase()}${ORDINAL[i].slice(1)} turn: set the dial`;
      const head =
        t.source === "pattern"
          ? `${prefix} by the pattern shown${turns.length === 1 ? "" : " for this turn"}:`
          : t.source === "lamps"
            ? `${prefix} by how many lamps are lit right now${spec.blink ? " (a blinking lamp counts as lit)" : ""}:`
            : `${prefix} by the last digit of the serial number:`;
      const rows = Object.entries(tables[i]).map(([k, pos]) => `${t.source === "lamps" ? `${k} lit` : t.source === "serial" ? `ends in ${k}` : k}: ${labelOf(pos)}`);
      const lines = [head, ...rows];
      if (modLine && i === turns.length - 1) lines.push(modLine);
      const title = turns.length === 1 ? "Dial" : `Dial, ${ORDINAL[i]} turn`;
      cards.push({ part: "dial", title: spec.manuals === 2 ? `${title}, Manual ${manual}` : title, lines });
    });
  }
  if (spec.manuals === 2) cards.push({ part: "tag", title: "Which manual", lines: [`This machine runs on Manual ${current}. Ignore Manual ${current === "A" ? "B" : "A"}.`] });

  const shift = spec.modifier === "light" ? (light === "amber" ? 1 : light === "red" ? -1 : 0) : 0;
  const serialRow = SERIAL_ROWS[Math.floor((view.serial % 10) / 2)];
  const dialFor = (lamps: Lamp[]): number[] => {
    const odd = spec.modifier === "serial" && view.serial % 2 === 1 ? 1 : 0;
    const lit = lamps.filter((l) => l.lit).length;
    return turns.map((t, i) => {
      const table = answerTables[i];
      const pos = t.source === "pattern" ? table[t.pattern!] : t.source === "lamps" ? table[String(lit)] : table[serialRow];
      // The light or the odd click is written after the last turn's table and moves that turn only.
      return i === turns.length - 1 ? click(pos, shift + odd) : pos;
    });
  };

  const answers: Answers[] = [{ lamps: applyLampInstr(firstMatch(lampRules, view), view.lamps), pictures: picturesAnswer, dial: dialFor(view.lamps) }];
  if (lamps2) {
    const view2 = { ...view, lamps: lamps2 };
    answers.push({ lamps: applyLampInstr(firstMatch(lampRules, view2), lamps2), pictures: picturesAnswer, dial: dialFor(lamps2) });
  }
  return { view, lamps2, cards, answers };
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

/** Which lamps the Fixer sees right now: the first set, or the second after stage one. */
function stageShown(s: MachinePublic): number {
  return s.parts.lamps === "open" ? 0 : 1;
}

/** The next Fixer: someone who has not fixed yet this run; once everyone has, start over. */
function pickFixer(rng: () => number, team: string[], fixedOnce: string[]): { fixerId: string; fixedOnce: string[] } {
  let pool = team.filter((id) => !fixedOnce.includes(id));
  let done = fixedOnce.filter((id) => team.includes(id));
  if (pool.length === 0) {
    pool = team;
    done = [];
  }
  const fixerId = pool[Math.floor(rng() * pool.length)];
  return { fixerId, fixedOnce: [...done, fixerId] };
}

/** Deal a machine: the Fixer was chosen when the last one ended, build it, hand out the views. */
function dealRound(ctx: GameContext, s: MachinePublic, round: number): TurnResult {
  const fixerId = s.nextFixerId ?? s.team[0];
  const next: MachinePublic = { ...s, round, nonce: nonce(ctx.rng), fixerId, nextFixerId: null, parts: { lamps: "open", pictures: "open", dial: "open" }, wobbles: 0, flash: null };
  const m = buildMachine(seedOf(ctx, next), s.settings.level);
  const priv: Record<string, Record<string, unknown>> = {};
  for (const h of s.team) {
    if (h === fixerId) continue;
    const mine: MachineMine = { round, role: "helper", cards: m.cards };
    priv[h] = mine as unknown as Record<string, unknown>;
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
  const clean = won && s.wobbles === 0;
  const points = fixed + (clean ? 1 : 0);
  const more = s.round < s.settings.rounds;
  const pickNext = more ? pickFixer(ctx.rng, s.team, s.fixedOnce) : null;
  return accept({
    phase: "round_over",
    phaseEndsAt: null,
    state: pub({
      ...s,
      score: s.score + points,
      tally: { fixed: s.tally.fixed + (won ? 1 : 0), popped: s.tally.popped + (won ? 0 : 1) },
      allClean: s.allClean && clean,
      last: { round: s.round, won, popped, fixed, wobbles: s.wobbles, points },
      flash: null,
      nextFixerId: pickNext?.fixerId ?? null,
      fixedOnce: pickNext?.fixedOnce ?? s.fixedOnce,
    }),
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
    briefing: { waitsFor: "host" },
    fixing: { waitsFor: "one" },
    round_over: { waitsFor: "host" },
  },

  setup(ctx, options) {
    if (ctx.players.length < 2) return reject("too_few_players");
    if (!ctx.secret) return reject("server_error");
    const pace = pick<MachinePace>(options?.pace, ["relaxed", "normal", "quick"], "relaxed");
    const length = pick<MachineLength>(options?.length, ["short", "normal", "long"], "normal");
    const level = ([1, 2, 3, 4, 5] as const).includes(options?.level as MachineLevel) ? (options!.level as MachineLevel) : 1;
    const team = ctx.players.map((p) => p.id);
    // Play again carries who has fixed already, so turns stay fair across games.
    const carried = Array.isArray(options?.fixedOnce) ? (options!.fixedOnce as unknown[]).filter((id): id is string => typeof id === "string" && team.includes(id)) : [];
    const first = pickFixer(ctx.rng, team, carried);
    const base: MachinePublic = {
      settings: { pace, length, level, clockSeconds: Math.round(MACHINE_CLOCK[pace] * LEVELS[level].clock), rounds: MACHINE_ROUNDS[length] },
      round: 0,
      team,
      fixedOnce: first.fixedOnce,
      nonce: "",
      fixerId: "",
      nextFixerId: first.fixerId,
      parts: {},
      wobbles: 0,
      score: 0,
      tally: { fixed: 0, popped: 0 },
      allClean: true,
      last: null,
      flash: null,
      finished: false,
    };
    // The clock does not start until the host deals the first machine.
    return accept({ phase: "briefing", phaseEndsAt: null, state: pub(base), private: {} });
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
        const a = m.answers[Math.min(stageShown(s), m.answers.length - 1)];
        const right = part === "lamps" ? sameList(payload.answer, a.lamps) : part === "pictures" ? sameList(payload.answer, a.pictures) : sameList(payload.answer, a.dial);
        const flashN = (s.flash?.n ?? 0) + 1;
        if (right) {
          if (part === "lamps" && m.lamps2 && s.parts.lamps === "open") {
            // Stage one right: the lamps change and the Fixer goes again.
            const next: MachinePublic = { ...s, parts: { ...s.parts, lamps: "stage2" }, flash: { n: flashN, text: "The lamps changed! Go again." } };
            const mine: MachineMine = { round: s.round, role: "fixer", view: { ...m.view, lamps: m.lamps2 } };
            return accept({ state: pub(next), private: { [s.fixerId]: mine as unknown as Record<string, unknown> } });
          }
          const next: MachinePublic = { ...s, parts: { ...s.parts, [part]: "fixed" }, flash: { n: flashN, text: `${PART_NAMES[part]} fixed!` } };
          if (Object.values(next.parts).every((v) => v === "fixed")) return endRound(ctx, next, null);
          return accept({ state: pub(next) });
        }
        const wobbles = s.wobbles + 1;
        const left = MAX_WOBBLES - wobbles;
        const next: MachinePublic = { ...s, wobbles, flash: { n: flashN, text: left === 1 ? "Wobble! 1 left. Careful now." : `Wobble! ${left} left.` } };
        if (wobbles >= MAX_WOBBLES) return endRound(ctx, next, "wobbles");
        return accept({ state: pub(next) });
      }

      case "deal": {
        if (phase !== "briefing" && phase !== "round_over") return noop();
        if (phase === "round_over" && payload.round !== s.round) return noop();
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
