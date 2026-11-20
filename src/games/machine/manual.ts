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
// to check the answers follow the text. The wording is the CEO seat's to
// rewrite; the templates are listed in claude/tech-machine-v1.md.

import { shuffle } from "@/engine/rng";
import { KEY_COLOURS, LAMP_COLOURS, PATTERNS, PICTURES, type Key, type KeyColour, type Lamp, type LampColour, type MachineView, type Pattern, type Picture } from "./shape";

// ---- conditions ------------------------------------------------------------

export type Cond =
  | { kind: "colour"; colour: LampColour; state: null | "lit" | "off" | "blinking" }
  | { kind: "noColour"; colour: LampColour }
  | { kind: "litCount"; n: number }
  | { kind: "litAtLeast"; n: number }
  | { kind: "blinkCount"; n: number }
  | { kind: "edge"; side: "leftmost" | "rightmost"; lit: boolean }
  | { kind: "serial"; parity: "even" | "odd" }
  | { kind: "serialEnds"; digit: number }
  | { kind: "pattern"; pattern: Pattern }
  | { kind: "picture"; picture: Picture; present: boolean }
  | { kind: "flipped"; picture: Picture; flipped: boolean }
  | { kind: "flipCount"; n: number }
  | { kind: "keyColour"; picture: Picture; colour: KeyColour }
  | { kind: "anyKeyColour"; colour: KeyColour; present: boolean };

const isLit = (l: Lamp) => l.lit;
const isBlink = (l: Lamp) => l.lit && l.blink === true;

export function evalCond(c: Cond, v: MachineView): boolean {
  const lamps = v.lamps ?? [];
  const keys = v.pictures ?? [];
  switch (c.kind) {
    case "colour": {
      const l = lamps.find((x) => x.colour === c.colour);
      if (!l) return false;
      if (c.state === null) return true;
      if (c.state === "blinking") return isBlink(l);
      return l.lit === (c.state === "lit");
    }
    case "noColour":
      return !lamps.some((x) => x.colour === c.colour);
    case "litCount":
      return lamps.filter(isLit).length === c.n;
    case "litAtLeast":
      return lamps.filter(isLit).length >= c.n;
    case "blinkCount":
      return lamps.filter(isBlink).length === c.n;
    case "edge": {
      const l = c.side === "leftmost" ? lamps[0] : lamps[lamps.length - 1];
      return !!l && l.lit === c.lit;
    }
    case "serial":
      return v.serial % 2 === (c.parity === "even" ? 0 : 1);
    case "serialEnds":
      return v.serial % 10 === c.digit;
    case "pattern":
      return (v.dial?.turns ?? []).some((t) => t.pattern === c.pattern);
    case "picture":
      return keys.some((k) => k.picture === c.picture) === c.present;
    case "flipped": {
      const k = keys.find((x) => x.picture === c.picture);
      return !!k && (k.flipped === true) === c.flipped;
    }
    case "flipCount":
      return keys.filter((k) => k.flipped).length === c.n;
    case "keyColour": {
      const k = keys.find((x) => x.picture === c.picture);
      return !!k && k.colour === c.colour;
    }
    case "anyKeyColour":
      return keys.some((k) => k.colour === c.colour) === c.present;
  }
}

export function renderCond(c: Cond): string {
  switch (c.kind) {
    case "colour":
      return c.state === null ? `there is a ${c.colour} lamp` : `the ${c.colour} lamp is ${c.state.toUpperCase()}`;
    case "noColour":
      return `no lamp is ${c.colour}`;
    case "litCount":
      return `exactly ${c.n} ${c.n === 1 ? "lamp is" : "lamps are"} lit`;
    case "litAtLeast":
      return `${c.n} or more lamps are lit`;
    case "blinkCount":
      return c.n === 0 ? "no lamp is blinking" : `exactly ${c.n} ${c.n === 1 ? "lamp is" : "lamps are"} blinking`;
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
    case "flipped":
      return `the ${c.picture} key is ${c.flipped ? "upside down" : "the right way up"}`;
    case "flipCount":
      return c.n === 0 ? "no key is upside down" : `exactly ${c.n} ${c.n === 1 ? "key is" : "keys are"} upside down`;
    case "keyColour":
      return `the ${c.picture} key is ${c.colour}`;
    case "anyKeyColour":
      return c.present ? `there is a ${c.colour} key` : `there is no ${c.colour} key`;
  }
}

/**
 * The fact a condition is about. Two conditions in one rule must be about
 * different facts, or the rule reads as nonsense ("if exactly 1 lamp is lit
 * and exactly 2 lamps are lit") or as padding. Seen on the test site, 7 Nov.
 */
export function factOf(c: Cond): string {
  switch (c.kind) {
    case "colour":
    case "noColour":
      return `colour:${c.colour}`;
    case "litCount":
    case "litAtLeast":
      return "lit";
    case "blinkCount":
      return "blink";
    case "edge":
      return `edge:${c.side}`;
    case "serial":
    case "serialEnds":
      return "serial";
    case "pattern":
      return "pattern";
    case "picture":
    case "flipped":
    case "keyColour":
      return `key:${c.picture}`;
    case "flipCount":
      return "flips";
    case "anyKeyColour":
      return `keycolour:${c.colour}`;
  }
}

// ---- lamp instructions -----------------------------------------------------

export type LampInstr =
  | { kind: "litFirst" } // lit left to right, then off left to right
  | { kind: "offFirstReverse" } // off right to left, then lit left to right
  | { kind: "allLeft" }
  | { kind: "allRight" }
  | { kind: "litRightThenOffRight" }
  | { kind: "blinkFirst" } // blinking left to right, then the rest left to right
  | { kind: "colourFirst"; colour: LampColour } // that lamp first, then the rest left to right
  | { kind: "colourOrder"; order: LampColour[] };

const idx = (lamps: Lamp[], keep: (l: Lamp) => boolean) => lamps.map((l, i) => (keep(l) ? i : -1)).filter((i) => i >= 0);

export function applyLampInstr(ins: LampInstr, lamps: Lamp[]): number[] {
  switch (ins.kind) {
    case "litFirst":
      return [...idx(lamps, isLit), ...idx(lamps, (l) => !l.lit)];
    case "offFirstReverse":
      return [...idx(lamps, (l) => !l.lit).reverse(), ...idx(lamps, isLit)];
    case "allLeft":
      return lamps.map((_, i) => i);
    case "allRight":
      return lamps.map((_, i) => i).reverse();
    case "litRightThenOffRight":
      return [...idx(lamps, isLit).reverse(), ...idx(lamps, (l) => !l.lit).reverse()];
    case "blinkFirst":
      return [...idx(lamps, isBlink), ...idx(lamps, (l) => !isBlink(l))];
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
    case "blinkFirst":
      return "press the BLINKING lamps left to right, then the rest left to right";
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
  /** Some keys go first, left to right as they sit on the machine; then the rest in the order. */
  first?: "flipped" | { colour: KeyColour };
}

export function applyPictureInstr(ins: PictureInstr, keys: Key[]): Picture[] {
  const head = ins.first === undefined ? [] : keys.filter((k) => (ins.first === "flipped" ? k.flipped === true : k.colour === ins.first!.colour)).map((k) => k.picture);
  const rest = ins.order.filter((p) => keys.some((k) => k.picture === p) && !head.includes(p));
  return [...head, ...(ins.reversed ? rest.reverse() : rest)];
}

export function renderPictureInstr(ins: PictureInstr): string {
  const list = `${ins.order.join(", ")}`;
  if (ins.first === undefined) return `press the keys in this order${ins.reversed ? ", BACKWARDS" : ""}, skipping any key the machine does not have: ${list}`;
  const who = ins.first === "flipped" ? "the UPSIDE-DOWN keys" : `the ${ins.first.colour} keys`;
  return `press ${who} left to right, then the rest in this order${ins.reversed ? ", BACKWARDS" : ""}, skipping any key the machine does not have: ${list}`;
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

/** Which parts of the machine a manual's conditions may ask about. */
export interface Scope {
  lamps: boolean;
  keys: boolean;
  serial: boolean;
  dial: boolean;
}

function pick<T>(list: readonly T[], rng: () => number): T {
  return list[Math.floor(rng() * list.length)];
}

/**
 * A condition drawn from this machine, true or false as asked. False ones are
 * near-misses: the same facts, slightly wrong, so the Helper has to ask
 * precisely. The scope says which parts the condition may be about.
 */
export function drawCond(v: MachineView, want: boolean, scope: Scope, rng: () => number): Cond {
  const lamps = v.lamps ?? [];
  const keys = v.pictures ?? [];
  const lit = lamps.filter(isLit).length;
  const blinking = lamps.filter(isBlink).length;
  const hasBlink = lamps.some((l) => l.blink !== undefined);
  const hasFlip = keys.some((k) => k.flipped !== undefined);
  const hasColour = keys.some((k) => k.colour !== undefined);
  const makers: (() => Cond)[] = [];
  if (scope.lamps && lamps.length) {
    makers.push(
      () => {
        const l = pick(lamps, rng);
        if (want) {
          const r = rng();
          const state = r < 0.4 ? null : isBlink(l) && r < 0.7 ? "blinking" : l.lit ? "lit" : "off";
          return { kind: "colour", colour: l.colour, state };
        }
        // Wrong about its state: off when lit, lit when off, blinking when steady.
        const wrong: ("lit" | "off" | "blinking")[] = l.lit ? ["off"] : ["lit"];
        if (hasBlink && !isBlink(l)) wrong.push("blinking");
        return { kind: "colour", colour: l.colour, state: pick(wrong, rng) };
      },
      () => {
        const absent = LAMP_COLOURS.filter((c) => !lamps.some((l) => l.colour === c));
        const present = lamps.map((l) => l.colour);
        // With every colour on the machine (six lamps) only the present-colour forms exist.
        const useAbsent = absent.length > 0 && rng() < 0.5;
        if (want) return useAbsent ? { kind: "noColour", colour: pick(absent, rng) } : { kind: "colour", colour: pick(present, rng), state: null };
        return useAbsent ? { kind: "colour", colour: pick(absent, rng), state: null } : { kind: "noColour", colour: pick(present, rng) };
      },
      () => (want ? { kind: "litCount", n: lit } : { kind: "litCount", n: lit + (lit > 1 && rng() < 0.5 ? -1 : 1) }),
      () => (want ? { kind: "litAtLeast", n: Math.max(1, lit - (rng() < 0.5 ? 1 : 0)) } : { kind: "litAtLeast", n: lit + 1 }),
      () => {
        const side = rng() < 0.5 ? "leftmost" : "rightmost";
        const l = side === "leftmost" ? lamps[0] : lamps[lamps.length - 1];
        return { kind: "edge", side, lit: want ? l.lit : !l.lit };
      }
    );
    if (hasBlink) makers.push(() => (want ? { kind: "blinkCount", n: blinking } : { kind: "blinkCount", n: blinking + (blinking > 0 && rng() < 0.5 ? -1 : 1) }));
  }
  if (scope.keys && keys.length) {
    makers.push(() => {
      const shown = keys.map((k) => k.picture);
      const other = PICTURES.filter((p) => !shown.includes(p));
      return rng() < 0.5 ? { kind: "picture", picture: pick(shown, rng), present: want } : { kind: "picture", picture: pick(other, rng), present: !want };
    });
    if (hasFlip) {
      const flips = keys.filter((k) => k.flipped).length;
      makers.push(
        () => {
          const k = pick(keys, rng);
          return { kind: "flipped", picture: k.picture, flipped: want ? k.flipped === true : k.flipped !== true };
        },
        () => (want ? { kind: "flipCount", n: flips } : { kind: "flipCount", n: flips + (flips > 0 && rng() < 0.5 ? -1 : 1) })
      );
    }
    if (hasColour) {
      makers.push(
        () => {
          const k = pick(keys, rng);
          const others = KEY_COLOURS.filter((c) => c !== k.colour);
          return { kind: "keyColour", picture: k.picture, colour: want ? k.colour! : pick(others, rng) };
        },
        () => {
          const used = KEY_COLOURS.filter((c) => keys.some((k) => k.colour === c));
          const unused = KEY_COLOURS.filter((c) => !used.includes(c));
          if (unused.length === 0 || rng() < 0.5) return { kind: "anyKeyColour", colour: pick(used, rng), present: want };
          return { kind: "anyKeyColour", colour: pick(unused, rng), present: !want };
        }
      );
    }
  }
  if (scope.serial) {
    makers.push(
      () => ({ kind: "serial", parity: (v.serial % 2 === 0) === want ? "even" : "odd" }),
      () => ({ kind: "serialEnds", digit: want ? v.serial % 10 : (v.serial % 10 + 1 + Math.floor(rng() * 8)) % 10 })
    );
  }
  if (scope.dial) {
    makers.push(() => {
      const shown = (v.dial?.turns ?? []).map((t) => t.pattern).filter((p): p is Pattern => p !== undefined);
      const other = PATTERNS.filter((p) => !shown.includes(p));
      return { kind: "pattern", pattern: want && shown.length ? pick(shown, rng) : pick(other, rng) };
    });
  }
  if (makers.length === 0) throw new Error("no conditions in scope");
  return pick(makers, rng)();
}

/** Two conditions about different facts; the second is redrawn until it is. */
function drawPair(v: MachineView, wantA: boolean, wantB: boolean, scope: Scope, rng: () => number): Cond[] {
  const a = drawCond(v, wantA, scope, rng);
  let b = drawCond(v, wantB, scope, rng);
  for (let tries = 0; tries < 12 && factOf(b) === factOf(a); tries++) b = drawCond(v, wantB, scope, rng);
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
export function buildManual<I>(v: MachineView, count: number, scope: Scope, rng: () => number, instrFor: (conds: Cond[]) => I): Rule<I>[] {
  const target = Math.floor(rng() * count); // may be the Otherwise rule
  const rules: Rule<I>[] = [];
  for (let i = 0; i < count; i++) {
    let conds: Cond[];
    if (i === count - 1) conds = [];
    else if (i < target) {
      // must not fit: one false condition, sometimes joined with a true one
      conds = rng() < 0.4 ? drawPair(v, true, false, scope, rng) : [drawCond(v, false, scope, rng)];
      if (rng() < 0.5) conds.reverse();
    } else if (i === target) {
      conds = rng() < 0.4 ? drawPair(v, true, true, scope, rng) : [drawCond(v, true, scope, rng)];
    } else {
      conds = [drawCond(v, rng() < 0.5, scope, rng)];
    }
    rules.push({ conds, instr: instrFor(conds) });
  }
  return rules;
}

/** A lamp instruction the Fixer can always carry out given these conditions. */
export function lampInstrFor(v: MachineView, conds: Cond[], rng: () => number): LampInstr {
  const lamps = v.lamps ?? [];
  const named = conds.find((c): c is Extract<Cond, { kind: "colour" }> => c.kind === "colour");
  const kinds: LampInstr[] = [{ kind: "litFirst" }, { kind: "offFirstReverse" }, { kind: "allLeft" }, { kind: "allRight" }, { kind: "litRightThenOffRight" }, { kind: "colourOrder", order: shuffle([...LAMP_COLOURS], rng) }];
  if (lamps.some((l) => l.blink !== undefined)) kinds.push({ kind: "blinkFirst" }, { kind: "blinkFirst" });
  // "Press the X lamp first" only where the rule itself guarantees an X lamp.
  if (named) kinds.push({ kind: "colourFirst", colour: named.colour });
  else if (lamps.length) kinds.push({ kind: "colourFirst", colour: pick(lamps, rng).colour });
  return pick(kinds, rng);
}

/** A picture instruction for this machine: an order, and at the harder levels some keys first. */
export function pictureInstrFor(v: MachineView, rng: () => number): PictureInstr {
  const keys = v.pictures ?? [];
  const hasFlip = keys.some((k) => k.flipped !== undefined);
  const hasColour = keys.some((k) => k.colour !== undefined);
  const base: PictureInstr = { order: shuffle([...PICTURES], rng), reversed: rng() < 0.3 };
  // A colour the machine really has, so "the red keys first" always means something.
  const used = KEY_COLOURS.filter((c) => keys.some((k) => k.colour === c));
  const byColour = (): PictureInstr => ({ ...base, first: { colour: pick(used, rng) } });
  const r = rng();
  if (hasFlip && hasColour && used.length) {
    if (r < 0.35) return { ...base, first: "flipped" };
    if (r < 0.7) return byColour();
    return base;
  }
  if (hasFlip && r < 0.5) return { ...base, first: "flipped" };
  if (hasColour && used.length && r < 0.5) return byColour();
  return base;
}
