// The rulebook as a manual, not an instruction (Joshua, 6 Nov 23:54: "if the
// helper reads out the answer to the fixer what is the point"). A manual is a
// numbered list of rules; the first rule whose condition fits this machine is
// the one to follow. The Helper cannot know which fits without asking the
// Fixer what the machine shows, and the Fixer cannot know what to do without
// the Helper reading the rule that fits. The list carries near-misses (a rule
// about a red lamp that is off when the red lamp is lit) so a vague answer
// sends the table wrong.
//
// Every condition is something the Fixer can see; every instruction is
// something the Fixer can do. The generator builds rules as data, renders
// them to words with the templates here, and the test parses those words back
// to check the answers follow the text.

import { shuffle } from "@/engine/rng";
import { LAMP_COLOURS, PATTERNS, PICTURES, type LampColour, type MachineView, type Pattern, type Picture } from "./shape";

// ---- conditions ------------------------------------------------------------

export type Cond =
  | { kind: "colour"; colour: LampColour; lit: boolean | null } // a {colour} lamp (that is lit / off)
  | { kind: "noColour"; colour: LampColour }
  | { kind: "litCount"; n: number }
  | { kind: "litAtLeast"; n: number }
  | { kind: "edge"; side: "leftmost" | "rightmost"; lit: boolean }
  | { kind: "serial"; parity: "even" | "odd" }
  | { kind: "serialEnds"; digit: number }
  | { kind: "pattern"; pattern: Pattern }
  | { kind: "picture"; picture: Picture; present: boolean };

export function evalCond(c: Cond, v: MachineView): boolean {
  const lamps = v.lamps ?? [];
  switch (c.kind) {
    case "colour": {
      const l = lamps.find((x) => x.colour === c.colour);
      return !!l && (c.lit === null || l.lit === c.lit);
    }
    case "noColour":
      return !lamps.some((x) => x.colour === c.colour);
    case "litCount":
      return lamps.filter((x) => x.lit).length === c.n;
    case "litAtLeast":
      return lamps.filter((x) => x.lit).length >= c.n;
    case "edge": {
      const l = c.side === "leftmost" ? lamps[0] : lamps[lamps.length - 1];
      return !!l && l.lit === c.lit;
    }
    case "serial":
      return v.serial % 2 === (c.parity === "even" ? 0 : 1);
    case "serialEnds":
      return v.serial % 10 === c.digit;
    case "pattern":
      return (v.dial?.patterns ?? []).includes(c.pattern);
    case "picture":
      return (v.pictures ?? []).includes(c.picture) === c.present;
  }
}

export function renderCond(c: Cond): string {
  switch (c.kind) {
    case "colour":
      return c.lit === null ? `there is a ${c.colour} lamp` : `the ${c.colour} lamp is ${c.lit ? "LIT" : "OFF"}`;
    case "noColour":
      return `no lamp is ${c.colour}`;
    case "litCount":
      return `exactly ${c.n} ${c.n === 1 ? "lamp is" : "lamps are"} lit`;
    case "litAtLeast":
      return `${c.n} or more lamps are lit`;
    case "edge":
      return `the ${c.side} lamp is ${c.lit ? "LIT" : "OFF"}`;
    case "serial":
      return `the serial number is ${c.parity}`;
    case "serialEnds":
      return `the serial number ends in ${c.digit}`;
    case "pattern":
      return `the dial shows ${c.pattern}`;
    case "picture":
      return c.present ? `there is a ${c.picture} key` : `there is no ${c.picture} key`;
  }
}

// ---- lamp instructions -----------------------------------------------------

export type LampInstr =
  | { kind: "litFirst" } // lit left to right, then off left to right
  | { kind: "offFirstReverse" } // off right to left, then lit left to right
  | { kind: "allLeft" }
  | { kind: "allRight" }
  | { kind: "litRightThenOffRight" }
  | { kind: "colourFirst"; colour: LampColour } // that lamp first, then the rest left to right
  | { kind: "colourOrder"; order: LampColour[] };

const idx = (lamps: { lit: boolean }[], keep: (l: { lit: boolean }) => boolean) => lamps.map((l, i) => (keep(l) ? i : -1)).filter((i) => i >= 0);

export function applyLampInstr(ins: LampInstr, v: MachineView): number[] {
  const lamps = v.lamps ?? [];
  switch (ins.kind) {
    case "litFirst":
      return [...idx(lamps, (l) => l.lit), ...idx(lamps, (l) => !l.lit)];
    case "offFirstReverse":
      return [...idx(lamps, (l) => !l.lit).reverse(), ...idx(lamps, (l) => l.lit)];
    case "allLeft":
      return lamps.map((_, i) => i);
    case "allRight":
      return lamps.map((_, i) => i).reverse();
    case "litRightThenOffRight":
      return [...idx(lamps, (l) => l.lit).reverse(), ...idx(lamps, (l) => !l.lit).reverse()];
    case "colourFirst": {
      const first = lamps.findIndex((l) => l.colour === ins.colour);
      return [first, ...lamps.map((_, i) => i).filter((i) => i !== first)];
    }
    case "colourOrder":
      return ins.order.map((c) => lamps.findIndex((l) => l.colour === c)).filter((i) => i >= 0);
  }
}

export function renderLampInstr(ins: LampInstr): string {
  switch (ins.kind) {
    case "litFirst":
      return "press the LIT lamps left to right, then the OFF lamps left to right";
    case "offFirstReverse":
      return "press the OFF lamps right to left, then the LIT lamps left to right";
    case "allLeft":
      return "press every lamp, left to right";
    case "allRight":
      return "press every lamp, right to left";
    case "litRightThenOffRight":
      return "press the LIT lamps right to left, then the OFF lamps right to left";
    case "colourFirst":
      return `press the ${ins.colour} lamp first, then the rest left to right`;
    case "colourOrder":
      return `press in this colour order, skipping any colour the machine does not have: ${ins.order.join(", ")}`;
  }
}

// ---- picture instructions --------------------------------------------------

export interface PictureInstr {
  order: Picture[];
  reversed: boolean;
}

export function applyPictureInstr(ins: PictureInstr, v: MachineView): Picture[] {
  const shown = v.pictures ?? [];
  const seq = ins.order.filter((p) => shown.includes(p));
  return ins.reversed ? seq.reverse() : seq;
}

export function renderPictureInstr(ins: PictureInstr): string {
  return `press the keys in this order${ins.reversed ? ", BACKWARDS" : ""}, skipping any key the machine does not have: ${ins.order.join(", ")}`;
}

// ---- rules and manuals -----------------------------------------------------

export interface Rule<I> {
  /** Empty means "Otherwise". Two conditions mean both must hold. */
  conds: Cond[];
  instr: I;
}

export function renderRule<I>(r: Rule<I>, n: number, renderInstr: (i: I) => string): string {
  const head = r.conds.length === 0 ? "Otherwise" : "If " + r.conds.map(renderCond).join(" and ");
  return `${n}. ${head}: ${renderInstr(r.instr)}.`;
}

export function firstMatch<I>(rules: Rule<I>[], v: MachineView): I {
  for (const r of rules) if (r.conds.every((c) => evalCond(c, v))) return r.instr;
  return rules[rules.length - 1].instr;
}

/**
 * A condition drawn from this machine, true or false as asked. False ones are
 * near-misses: the same facts, slightly wrong, so the Helper has to ask
 * precisely. `cross` allows conditions about the serial, the dial and the keys.
 */
export function drawCond(v: MachineView, want: boolean, cross: boolean, rng: () => number): Cond {
  const lamps = v.lamps ?? [];
  const lit = lamps.filter((l) => l.lit).length;
  const makers: (() => Cond)[] = [
    () => {
      const l = lamps[Math.floor(rng() * lamps.length)];
      return want ? { kind: "colour", colour: l.colour, lit: rng() < 0.5 ? null : l.lit } : { kind: "colour", colour: l.colour, lit: !l.lit };
    },
    () => {
      const absent = LAMP_COLOURS.filter((c) => !lamps.some((l) => l.colour === c));
      const present = lamps.map((l) => l.colour);
      return want ? (rng() < 0.5 ? { kind: "noColour", colour: pick(absent, rng) } : { kind: "colour", colour: pick(present, rng), lit: null }) : rng() < 0.5 ? { kind: "noColour", colour: pick(present, rng) } : { kind: "colour", colour: pick(absent, rng), lit: null };
    },
    () => (want ? { kind: "litCount", n: lit } : { kind: "litCount", n: lit + (lit > 1 && rng() < 0.5 ? -1 : 1) }),
    () => (want ? { kind: "litAtLeast", n: Math.max(1, lit - (rng() < 0.5 ? 1 : 0)) } : { kind: "litAtLeast", n: lit + 1 }),
    () => {
      const side = rng() < 0.5 ? "leftmost" : "rightmost";
      const l = side === "leftmost" ? lamps[0] : lamps[lamps.length - 1];
      return { kind: "edge", side, lit: want ? l.lit : !l.lit };
    },
  ];
  if (cross) {
    makers.push(
      () => ({ kind: "serial", parity: (v.serial % 2 === 0) === want ? "even" : "odd" }),
      () => ({ kind: "serialEnds", digit: want ? v.serial % 10 : (v.serial % 10 + 1 + Math.floor(rng() * 8)) % 10 }),
      () => {
        const shown = v.dial?.patterns ?? [];
        const other = PATTERNS.filter((p) => !shown.includes(p));
        return { kind: "pattern", pattern: want ? pick(shown, rng) : pick(other, rng) };
      },
      () => {
        const shown = v.pictures ?? [];
        const other = PICTURES.filter((p) => !shown.includes(p));
        return rng() < 0.5 ? { kind: "picture", picture: pick(shown, rng), present: want } : { kind: "picture", picture: pick(other, rng), present: !want };
      }
    );
  }
  return pick(makers, rng)();
}

function pick<T>(list: readonly T[], rng: () => number): T {
  return list[Math.floor(rng() * list.length)];
}

/**
 * The fact a condition is about. Two conditions in one rule must be about
 * different facts, or the rule reads as nonsense ("if exactly 1 lamp is lit
 * and exactly 2 lamps are lit") or as padding ("if exactly 2 lamps are lit
 * and 1 or more lamps are lit"). Seen on the test site, 7 Nov.
 */
export function factOf(c: Cond): string {
  switch (c.kind) {
    case "colour":
    case "noColour":
      return `colour:${c.colour}`;
    case "litCount":
    case "litAtLeast":
      return "lit";
    case "edge":
      return `edge:${c.side}`;
    case "serial":
    case "serialEnds":
      return "serial";
    case "pattern":
      return "pattern";
    case "picture":
      return `picture:${c.picture}`;
  }
}

/** Two conditions about different facts; the second is redrawn until it is. */
function drawPair(v: MachineView, wantA: boolean, wantB: boolean, cross: boolean, rng: () => number): Cond[] {
  const a = drawCond(v, wantA, cross, rng);
  let b = drawCond(v, wantB, cross, rng);
  for (let tries = 0; tries < 12 && factOf(b) === factOf(a); tries++) b = drawCond(v, wantB, cross, rng);
  // A machine with few facts can still collide; one condition is then enough
  // (a false one keeps the rule false, a true one keeps it true).
  if (factOf(b) === factOf(a)) return [wantA === wantB || !wantA ? a : b];
  return [a, b];
}

/**
 * Build a manual of `count` rules where the first fitting rule sits at a
 * random place. Rules before it do not fit (near-misses); rules after it may
 * fit or not, which punishes reading past the first match. The last rule is
 * "Otherwise".
 */
export function buildManual<I>(v: MachineView, count: number, cross: boolean, rng: () => number, instrFor: (conds: Cond[]) => I): Rule<I>[] {
  const target = Math.floor(rng() * count); // may be the Otherwise rule
  const rules: Rule<I>[] = [];
  for (let i = 0; i < count; i++) {
    let conds: Cond[];
    if (i === count - 1) conds = [];
    else if (i < target) {
      // must not fit: one false condition, sometimes joined with a true one
      conds = rng() < 0.4 ? drawPair(v, true, false, cross, rng) : [drawCond(v, false, cross, rng)];
      if (rng() < 0.5) conds.reverse();
    } else if (i === target) {
      conds = rng() < 0.4 ? drawPair(v, true, true, cross, rng) : [drawCond(v, true, cross, rng)];
    } else {
      conds = [drawCond(v, rng() < 0.5, cross, rng)];
    }
    rules.push({ conds, instr: instrFor(conds) });
  }
  // Make sure the manual really has a first match at `target`: it does by
  // construction, but a drawn "true" pair could be contradictory only if the
  // machine changed, which it cannot.
  return rules;
}

/** A lamp instruction the Fixer can always carry out given these conditions. */
export function lampInstrFor(v: MachineView, conds: Cond[], rng: () => number): LampInstr {
  const lamps = v.lamps ?? [];
  const named = conds.find((c): c is Extract<Cond, { kind: "colour" }> => c.kind === "colour");
  const kinds: LampInstr[] = [{ kind: "litFirst" }, { kind: "offFirstReverse" }, { kind: "allLeft" }, { kind: "allRight" }, { kind: "litRightThenOffRight" }, { kind: "colourOrder", order: shuffle([...LAMP_COLOURS], rng) }];
  // "Press the X lamp first" only where the rule itself guarantees an X lamp.
  if (named) kinds.push({ kind: "colourFirst", colour: named.colour });
  else if (lamps.length) kinds.push({ kind: "colourFirst", colour: pick(lamps, rng).colour });
  return pick(kinds, rng);
}
