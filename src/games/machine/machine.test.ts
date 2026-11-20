import { describe, expect, it } from "vitest";
import { applyPrivate, applyWrite } from "@/engine/apply";
import { LOBBY, RESULTS, applyRoomAction } from "@/engine/room";
import { seededRng } from "@/engine/rng";
import type { GameContext, Player, PrivateMap, RoomSnapshot } from "@/engine/types";
import { MACHINE, buildMachine, type Machine } from "./index";
import { LEVELS, MAX_WOBBLES, PICTURES, type Key, type Lamp, type MachineLevel, type MachinePublic, type MachineView, type Picture } from "./shape";
import "../index";

const everyone: Player[] = [
  { id: "mum", name: "Mum", ageBand: "16+", role: "owner" },
  { id: "kid", name: "Kid", ageBand: "6-8", role: "member" },
  { id: "teen", name: "Teen", ageBand: "12-15", role: "member" },
  { id: "nan", name: "Nan", ageBand: "16+", role: "adult" },
];

/**
 * Read the rulebook back the way the table would: parse each rule's words,
 * check its conditions against what the Fixer sees, take the first that fits,
 * and carry out its instruction. Written from the words alone, so it proves
 * the text says what the generator meant.
 */
function condFits(text: string, v: MachineView): boolean {
  const lamps = v.lamps!;
  const keys = v.pictures!;
  const lit = lamps.filter((l) => l.lit).length;
  const blinking = lamps.filter((l) => l.lit && l.blink).length;
  let m: RegExpMatchArray | null;
  if ((m = text.match(/^the (leftmost|rightmost) lamp is (LIT|OFF)$/))) return (m[1] === "leftmost" ? lamps[0] : lamps[lamps.length - 1]).lit === (m[2] === "LIT");
  if ((m = text.match(/^the (\w+) lamp is (LIT|OFF|BLINKING)$/))) {
    const l = lamps.find((x) => x.colour === m![1]);
    if (!l) return false;
    if (m[2] === "BLINKING") return l.lit && l.blink === true;
    return l.lit === (m[2] === "LIT");
  }
  if ((m = text.match(/^there is a (\w+) lamp$/))) return lamps.some((x) => x.colour === m![1]);
  if (text === "no lamp is blinking") return blinking === 0;
  if ((m = text.match(/^no lamp is (\w+)$/))) return !lamps.some((x) => x.colour === m![1]);
  if ((m = text.match(/^exactly (\d+) lamps? (?:is|are) lit$/))) return lit === Number(m[1]);
  if ((m = text.match(/^(\d+) or more lamps are lit$/))) return lit >= Number(m[1]);
  if (text === "no lamp is blinking") return blinking === 0;
  if ((m = text.match(/^exactly (\d+) lamps? (?:is|are) blinking$/))) return blinking === Number(m[1]);
  if ((m = text.match(/^the serial number is (even|odd)$/))) return v.serial % 2 === (m[1] === "even" ? 0 : 1);
  if ((m = text.match(/^the serial number ends in (\d)$/))) return v.serial % 10 === Number(m[1]);
  if ((m = text.match(/^the dial shows (\w+)$/))) return v.dial!.turns.some((t) => t.pattern === m![1]);
  if ((m = text.match(/^there is a (red|blue|green|yellow) key$/))) return keys.some((k) => k.colour === m![1]);
  if ((m = text.match(/^there is no (red|blue|green|yellow) key$/))) return !keys.some((k) => k.colour === m![1]);
  if ((m = text.match(/^there is a (\w+) key$/))) return keys.some((k) => k.picture === m![1]);
  if ((m = text.match(/^there is no (\w+) key$/))) return !keys.some((k) => k.picture === m![1]);
  if ((m = text.match(/^the (\w+) key is (upside down|the right way up)$/))) {
    const k = keys.find((x) => x.picture === m![1]);
    return !!k && (k.flipped === true) === (m[2] === "upside down");
  }
  if (text === "no key is upside down") return !keys.some((k) => k.flipped);
  if ((m = text.match(/^exactly (\d+) keys? (?:is|are) upside down$/))) return keys.filter((k) => k.flipped).length === Number(m[1]);
  if ((m = text.match(/^the (\w+) key is (red|blue|green|yellow)$/))) {
    const k = keys.find((x) => x.picture === m![1]);
    return !!k && k.colour === m[2];
  }
  throw new Error("unreadable condition: " + text);
}

function readManual(lines: string[]): { conds: string[]; instr: string }[] {
  const rules: { conds: string[]; instr: string }[] = [];
  for (const line of lines) {
    const m = line.match(/^\d+\. (?:If (.+?)|Otherwise): (.+)\.$/);
    if (!m) continue;
    rules.push({ conds: m[1] ? m[1].split(" and ") : [], instr: m[2] });
  }
  return rules;
}

function firstFitting(lines: string[], v: MachineView): string {
  const rules = readManual(lines);
  expect(rules.length).toBeGreaterThan(0);
  expect(rules[rules.length - 1].conds).toEqual([]);
  for (const r of rules) if (r.conds.every((c) => condFits(c, v))) return r.instr;
  throw new Error("no rule fits");
}

function doLamps(instr: string, lamps: Lamp[]): number[] {
  const all = lamps.map((_, i) => i);
  const litIdx = all.filter((i) => lamps[i].lit);
  const offIdx = all.filter((i) => !lamps[i].lit);
  const blinkIdx = all.filter((i) => lamps[i].lit && lamps[i].blink);
  let m: RegExpMatchArray | null;
  if (instr === "press the LIT lamps left to right, then the OFF lamps left to right") return [...litIdx, ...offIdx];
  if (instr === "press the OFF lamps right to left, then the LIT lamps left to right") return [...offIdx.reverse(), ...litIdx];
  if (instr === "press every lamp, left to right") return all;
  if (instr === "press every lamp, right to left") return all.reverse();
  if (instr === "press the LIT lamps right to left, then the OFF lamps right to left") return [...litIdx.reverse(), ...offIdx.reverse()];
  if (instr === "press the BLINKING lamps left to right, then the rest left to right") return [...blinkIdx, ...all.filter((i) => !blinkIdx.includes(i))];
  if ((m = instr.match(/^press the (\w+) lamp first, then the rest left to right$/))) {
    const first = lamps.findIndex((l) => l.colour === m![1]);
    expect(first).toBeGreaterThanOrEqual(0);
    return [first, ...all.filter((i) => i !== first)];
  }
  if ((m = instr.match(/^press in this colour order, skipping any colour the machine does not have: (.+)$/))) {
    return m[1].split(", ").map((c) => lamps.findIndex((l) => l.colour === c)).filter((i) => i >= 0);
  }
  throw new Error("unreadable lamp instruction: " + instr);
}

function doPictures(instr: string, keys: Key[]): Picture[] {
  let m = instr.match(/^press the keys in this order(, BACKWARDS)?, skipping any key the machine does not have: (.+)$/);
  let head: Picture[] = [];
  if (!m) {
    m = instr.match(/^press (the UPSIDE-DOWN keys|the (\w+) keys) left to right, then the rest in this order(, BACKWARDS)?, skipping any key the machine does not have: (.+)$/);
    if (!m) throw new Error("unreadable picture instruction: " + instr);
    head = keys.filter((k) => (m![2] ? k.colour === m![2] : k.flipped === true)).map((k) => k.picture);
    m = [m[0], m[3], m[4]] as unknown as RegExpMatchArray;
  }
  const seq = (m[2].split(", ") as Picture[]).filter((p) => keys.some((k) => k.picture === p) && !head.includes(p));
  return [...head, ...(m[1] ? seq.reverse() : seq)];
}

/** The manual this machine runs on, from the service tag, or A when there is one manual. */
function manualOf(m: Machine): "A" | "B" {
  const tag = m.cards.find((c) => c.part === "tag");
  return tag ? (tag.lines[0].match(/runs on Manual ([AB])/)![1] as "A" | "B") : "A";
}

function pictureCard(m: Machine) {
  const manual = manualOf(m);
  return m.cards.find((c) => c.part === "pictures" && (c.title === "Pictures" || c.title.endsWith(`Manual ${manual}`)))!;
}

/**
 * Solve the dial the way the table would: read each turn's table, look at the
 * machine (the lamps on show), work out the position. Independent of the
 * generator's own arithmetic.
 */
function solveDialFromCards(m: Machine, lamps: Lamp[]): number[] {
  const dial = m.view.dial!;
  const manual = manualOf(m);
  const cards = m.cards.filter((c) => c.part === "dial" && (m.cards.some((x) => x.part === "tag") ? c.title.endsWith(`Manual ${manual}`) : true));
  expect(cards.length).toBe(dial.turns.length);
  const lit = lamps.filter((l) => l.lit).length;
  const toPos = (label: string) => (dial.labels === "symbols" ? dial.symbols!.indexOf(label as never) + 1 : Number(label));
  return dial.turns.map((t, i) => {
    const c = cards[i];
    const head = c.lines[0];
    const rows: Record<string, string> = {};
    for (const line of c.lines.slice(1)) {
      const row = line.match(/^(.+?): (\w+)$/);
      if (row) rows[row[1]] = row[2];
    }
    let label: string;
    if (/by the pattern shown/.test(head)) label = rows[t.pattern!];
    else if (/by how many lamps are lit right now/.test(head)) label = rows[`${lit} lit`];
    else if (/by the last digit of the serial number/.test(head)) {
      const d = m.view.serial % 10;
      const key = Object.keys(rows).find((k) => k.match(/^ends in (\d) or (\d)$/) && (Number(RegExp.$1) === d || Number(RegExp.$2) === d))!;
      label = rows[key];
    } else throw new Error("unreadable dial card: " + head);
    expect(label, `${c.title}: ${head}`).toBeTruthy();
    let shift = 0;
    const text = c.lines.join(" ");
    if (text.includes("look at the light")) shift += dial.light === "amber" ? 1 : dial.light === "red" ? -1 : 0;
    if (text.includes("serial number is ODD") && m.view.serial % 2 === 1) shift += 1;
    return ((((toPos(label) - 1 + shift) % 6) + 6) % 6) + 1;
  });
}

class Table {
  room: RoomSnapshot;
  priv: PrivateMap = {};
  t = Date.parse("2026-11-06T19:00:00.000Z");
  rng = seededRng(11);
  constructor(public players = everyone, public secretSeed = 0.42) {
    this.room = {
      id: "room-1",
      version: 0,
      hostId: "mum",
      status: "open",
      currentGame: null,
      phase: LOBBY,
      phaseEndsAt: null,
      state: {},
      members: players.map((p) => ({ id: p.id, connected: true })),
    };
  }
  ctx(): GameContext {
    const secret = (label: string) => {
      let h = 0;
      for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      return ((h % 100000) + this.secretSeed) / 100001;
    };
    return { room: this.room, players: this.players, private: this.priv, now: new Date(this.t).toISOString(), rng: this.rng, secret };
  }
  act(actorId: string, type: string, payload?: Record<string, unknown>) {
    const r = applyRoomAction(this.ctx(), { type, actorId, payload });
    if (r.ok && !r.noop) {
      this.room = applyWrite(this.room, r.write);
      this.priv = applyPrivate(this.priv, r.write);
    }
    return r;
  }
  get s() {
    return this.room.state as unknown as MachinePublic;
  }
  /** Start the game and deal the first machine. */
  start(options: Record<string, unknown> = {}) {
    const r = this.act("mum", "start_game", { gameId: MACHINE, options });
    expect(r.ok).toBe(true);
    expect(this.room.phase).toBe("briefing");
    expect(this.room.phaseEndsAt).toBeNull();
    expect(this.act("mum", "deal").ok).toBe(true);
    expect(this.room.phase).toBe("fixing");
  }
  /** What the server knows about this machine (the test peeks; phones cannot). */
  truth() {
    const u = this.ctx().secret!(`machine:${this.s.nonce}`);
    return buildMachine(Math.floor(u * 4294967296), this.s.settings.level);
  }
  fixAll(round: number) {
    const f = this.s.fixerId;
    const truth = this.truth();
    const stages = truth.answers.length;
    for (let stage = 0; stage < stages; stage++) this.act(f, "attempt", { round, part: "lamps", answer: truth.answers[stage].lamps });
    const a = truth.answers[stages - 1];
    this.act(f, "attempt", { round, part: "pictures", answer: a.pictures });
    this.act(f, "attempt", { round, part: "dial", answer: a.dial });
  }
}

describe("Fix the Machine", () => {
  it("at every level, the same seed gives the same machine and the answers follow the rulebook", () => {
    for (const level of [1, 2, 3, 4, 5] as MachineLevel[]) {
      const spec = LEVELS[level];
      for (let seed = 1; seed <= 400; seed++) {
        const m = buildMachine(seed, level);
        expect(buildMachine(seed, level)).toEqual(m);
        expect(m.view.lamps!.length).toBe(spec.lamps);
        expect(m.view.lamps!.some((l) => l.lit) && m.view.lamps!.some((l) => !l.lit)).toBe(true);
        expect(m.answers.length).toBe(spec.stages);
        if (spec.blink) expect(m.view.lamps!.some((l) => l.blink)).toBe(true);
        else expect(m.view.lamps!.every((l) => l.blink === undefined)).toBe(true);
        // lamps: one manual; read it for each stage's lamps and do what the first fitting rule says
        const lampCards = m.cards.filter((c) => c.part === "lamps");
        expect(lampCards.length).toBe(1);
        expect(readManual(lampCards[0].lines).length).toBe(spec.lampRules);
        const stages = [m.view.lamps!, ...(m.lamps2 ? [m.lamps2] : [])];
        stages.forEach((lamps, i) => {
          const view = { ...m.view, lamps };
          expect([...m.answers[i].lamps].sort()).toEqual(lamps.map((_, j) => j));
          const instr = firstFitting(lampCards[0].lines, view);
          expect(doLamps(instr, lamps), `${level}/${seed} stage ${i}: ${instr} on ${JSON.stringify(lamps)}`).toEqual(m.answers[i].lamps);
        });
        if (m.lamps2) expect(m.lamps2.map((l) => l.colour)).toEqual(m.view.lamps!.map((l) => l.colour));
        // pictures: a plain order, or a manual (the tagged one at level 5)
        expect(m.view.pictures!.length).toBe(spec.pictures);
        if (spec.flip) expect(m.view.pictures!.some((k) => k.flipped)).toBe(true);
        if (spec.keyColours) expect(new Set(m.view.pictures!.map((k) => k.colour)).size).toBeGreaterThan(1);
        const picCard = pictureCard(m);
        const keys = m.view.pictures!;
        if (spec.pictureRules <= 1) {
          const cardOrder = picCard.lines[1].replace(".", "").split(", ");
          expect(cardOrder.length).toBe(PICTURES.length);
          expect(m.answers[0].pictures).toEqual(cardOrder.filter((p) => keys.some((k) => k.picture === p)));
        } else {
          expect(readManual(picCard.lines).length).toBe(spec.pictureRules);
          const instr = firstFitting(picCard.lines, m.view);
          expect(doPictures(instr, keys), `${level}/${seed}: ${instr} on ${JSON.stringify(keys)}`).toEqual(m.answers[0].pictures);
        }
        expect([...m.answers[0].pictures].sort()).toEqual(keys.map((k) => k.picture).sort());
        // the dial, for the lamps on show at each stage
        expect(m.view.dial!.turns.map((t) => t.source)).toEqual(spec.turns);
        expect(m.view.dial!.labels).toBe(spec.dialLabels);
        stages.forEach((lamps, i) => {
          expect(solveDialFromCards(m, lamps), `${level}/${seed} stage ${i} dial`).toEqual(m.answers[i].dial);
          expect(m.answers[i].dial.every((p) => p >= 1 && p <= 6)).toBe(true);
        });
        // no "n of m" anywhere in the rulebook (CEO seat, change 2)
        for (const c of m.cards) expect(c.title + c.lines.join(" ")).not.toMatch(/\d of \d/);
      }
    }
  });

  it("the fitting rule is not always the first, and the harder levels ask about other parts", () => {
    const where: Record<number, number[]> = {};
    let cross = 0;
    for (const level of [1, 2, 3, 4, 5] as MachineLevel[]) {
      where[level] = [];
      for (let seed = 1; seed <= 200; seed++) {
        const m = buildMachine(seed, level);
        const lines = m.cards.filter((c) => c.part === "lamps").flatMap((c) => c.lines);
        const rules = readManual(lines);
        const at = rules.findIndex((r) => r.conds.every((c) => condFits(c, m.view)));
        where[level].push(at);
        if (level >= 5 && rules.some((r) => r.conds.some((c) => /serial|dial shows|key$/.test(c)))) cross++;
      }
    }
    for (const level of [2, 3, 4, 5] as MachineLevel[]) {
      expect(new Set(where[level]).size).toBeGreaterThan(1);
      expect(where[level].filter((i) => i === 0).length).toBeLessThan(150);
    }
    expect(cross).toBeGreaterThan(100);
  });

  it("never pairs two conditions about the same fact in one rule", () => {
    // "If exactly 1 lamp is lit and exactly 2 lamps are lit" was dealt on the
    // test site on 7 Nov. The two halves of a rule must be about different
    // things.
    const fact = (c: string): string => {
      if (/lamps? (is|are) lit/.test(c)) return "lit";
      if (/blinking$/.test(c) && /lamps? (is|are)|no lamp/.test(c) && !/the \w+ lamp is/.test(c)) return "blink";
      if (/serial/.test(c)) return "serial";
      if (/dial shows/.test(c)) return "pattern";
      if (/upside down$|right way up$/.test(c)) {
        const k = c.match(/^the (\w+) key/);
        return k ? `key:${k[1]}` : "flips";
      }
      const edge = c.match(/^the (leftmost|rightmost) lamp/);
      if (edge) return `edge:${edge[1]}`;
      const keyColour = c.match(/^the (\w+) key is (red|blue|green|yellow)$/);
      if (keyColour) return `key:${keyColour[1]}`;
      const anyColour = c.match(/there is (?:a|no) (red|blue|green|yellow) key$/);
      if (anyColour) return `keycolour:${anyColour[1]}`;
      const key = c.match(/(\w+) key$/);
      if (key) return `key:${key[1]}`;
      const colour = c.match(/(red|green|blue|yellow|purple|white) lamp/) ?? c.match(/no lamp is (red|green|blue|yellow|purple|white)/);
      if (colour) return `colour:${colour[1]}`;
      throw new Error(`unreadable condition: ${c}`);
    };
    let pairs = 0;
    for (const level of [1, 2, 3, 4, 5] as MachineLevel[]) {
      for (let seed = 1; seed <= 400; seed++) {
        const m = buildMachine(seed, level);
        for (const r of readManual(m.cards.flatMap((c) => c.lines))) {
          if (r.conds.length < 2) continue;
          pairs++;
          expect(new Set(r.conds.map(fact)).size, `${level}/${seed}: ${r.conds.join(" and ")}`).toBe(r.conds.length);
        }
      }
    }
    expect(pairs).toBeGreaterThan(500);
  });

  it("level 5's other manual would send the Fixer wrong at least some of the time", () => {
    let differ = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const m = buildMachine(seed, 5);
      const right = manualOf(m);
      const other = right === "A" ? "B" : "A";
      const rows = (manual: string) => m.cards.filter((c) => c.part === "dial" && c.title.endsWith(`Manual ${manual}`)).flatMap((c) => c.lines).join("\n");
      if (rows(other) !== rows(right)) differ++;
    }
    expect(differ).toBeGreaterThan(95);
  });

  it("works with two players: the one Helper sees the whole rulebook", () => {
    const t = new Table(everyone.slice(0, 2));
    t.start({ level: 2 });
    const fixer = t.s.fixerId;
    const helper = fixer === "mum" ? "kid" : "mum";
    const mine = t.priv[helper] as unknown as { role: string; cards: unknown[] };
    expect(mine.role).toBe("helper");
    expect(mine.cards).toEqual(t.truth().cards);
  });

  it("gives every Helper the whole rulebook and never leaks an answer", () => {
    const t = new Table();
    t.start({ level: 4 });
    const truth = t.truth();
    const fixer = t.s.fixerId;
    expect((t.priv[fixer] as unknown as { view: unknown }).view).toEqual(truth.view);
    for (const h of everyone.filter((p) => p.id !== fixer)) expect((t.priv[h.id] as unknown as { cards: unknown[] }).cards).toEqual(truth.cards);
    const text = JSON.stringify(t.room) + JSON.stringify(t.priv);
    expect(text).not.toContain('"answers"');
    expect(text).not.toContain('"lamps2"');
    for (const a of truth.answers) expect(text).not.toContain(JSON.stringify(a.dial));
  });

  it("fixes parts on the right answer, wobbles on a wrong one, flashes it, and pops after three", () => {
    const t = new Table();
    t.start({ level: 3 });
    const f = t.s.fixerId;
    const truth = t.truth();
    expect(t.act(f === "nan" ? "mum" : "nan", "attempt", { round: 1, part: "lamps", answer: truth.answers[0].lamps }).ok).toBe(false);
    t.act(f, "attempt", { round: 1, part: "lamps", answer: [...truth.answers[0].lamps].reverse() });
    expect(t.s.wobbles).toBe(1);
    expect(t.s.flash?.text).toBe("Wobble! 2 left.");
    t.act(f, "attempt", { round: 1, part: "lamps", answer: truth.answers[0].lamps });
    expect(t.s.parts.lamps).toBe("fixed");
    expect(t.s.flash?.text).toBe("Lamps fixed!");
    // the dial at level 3 is two turns: one turn is not enough
    t.act(f, "attempt", { round: 1, part: "dial", answer: truth.answers[0].dial.slice(0, 1) });
    expect(t.s.flash?.text).toBe("Wobble! 1 left. Careful now.");
    t.act(f, "attempt", { round: 1, part: "dial", answer: [] });
    expect(t.room.phase).toBe("round_over");
    expect(t.s.last).toMatchObject({ round: 1, won: false, popped: "wobbles", fixed: 1, wobbles: MAX_WOBBLES, points: 1 });
    expect(t.s.tally).toEqual({ fixed: 0, popped: 1 });
    expect(t.s.allClean).toBe(false);
  });

  it("at level 4 the lamps change after the first right order and the Fixer goes again", () => {
    const t = new Table();
    t.start({ level: 4 });
    const f = t.s.fixerId;
    const truth = t.truth();
    expect(truth.lamps2).not.toBeNull();
    const before = (t.priv[f] as unknown as { view: MachineView }).view;
    expect(before.lamps).toEqual(truth.view.lamps);
    t.act(f, "attempt", { round: 1, part: "lamps", answer: truth.answers[0].lamps });
    expect(t.s.parts.lamps).toBe("stage2");
    expect(t.s.flash?.text).toBe("The lamps changed! Go again.");
    const after = (t.priv[f] as unknown as { view: MachineView }).view;
    expect(after.lamps).toEqual(truth.lamps2);
    expect(after.pictures).toEqual(truth.view.pictures);
    // the dial's lamp turn is read from the lamps on show now
    if (truth.answers[0].dial.join() !== truth.answers[1].dial.join()) {
      t.act(f, "attempt", { round: 1, part: "dial", answer: truth.answers[0].dial });
      expect(t.s.wobbles).toBe(1);
    }
    t.act(f, "attempt", { round: 1, part: "dial", answer: truth.answers[1].dial });
    expect(t.s.parts.dial).toBe("fixed");
    // the stage one order again is a wobble, the stage two order fixes it
    if (truth.answers[0].lamps.join() !== truth.answers[1].lamps.join()) {
      t.act(f, "attempt", { round: 1, part: "lamps", answer: truth.answers[0].lamps });
      expect(t.s.parts.lamps).toBe("stage2");
    }
    t.act(f, "attempt", { round: 1, part: "lamps", answer: truth.answers[1].lamps });
    expect(t.s.parts.lamps).toBe("fixed");
  });

  it("wins a clean machine for a bonus point, deals the next to a new Fixer, ends on the clock, and reaches results", () => {
    const t = new Table();
    t.start({ level: 1, length: "normal", pace: "normal" });
    expect(t.s.settings.clockSeconds).toBe(180);
    const f1 = t.s.fixerId;
    t.fixAll(1);
    expect(t.room.phase).toBe("round_over");
    expect(t.s.last).toMatchObject({ won: true, popped: null, wobbles: 0, points: 4 });
    expect(t.s.nextFixerId).not.toBe(f1);
    expect(t.act(f1 === "kid" ? "nan" : "kid", "deal", { round: 1 }).ok).toBe(false);
    t.act("mum", "deal", { round: 1 });
    expect(t.s.round).toBe(2);
    expect(t.s.fixerId).not.toBe(f1);
    t.t = Date.parse(t.room.phaseEndsAt!) + 1;
    t.act("nan", "advance_if_expired");
    expect(t.s.last).toMatchObject({ round: 2, popped: "time" });
    t.act("mum", "deal", { round: 2 });
    t.fixAll(3);
    t.act("mum", "deal", { round: 3 });
    expect(t.room.phase).toBe(RESULTS);
    expect(t.s.score).toBe(8);
    expect(t.s.tally).toEqual({ fixed: 2, popped: 1 });
    expect(t.s.allClean).toBe(false);
  });

  it("nobody fixes twice until everyone has fixed once, across Play again", () => {
    const t = new Table();
    t.start({ level: 1, length: "long" });
    const fixers: string[] = [t.s.fixerId];
    for (let round = 1; round < 5; round++) {
      t.fixAll(round);
      t.act("mum", "deal", { round });
      fixers.push(t.s.fixerId);
    }
    expect(new Set(fixers.slice(0, 4)).size).toBe(4);
    expect(fixers.slice(0, 4)).toContain(fixers[4]);
    t.fixAll(5);
    t.act("mum", "deal", { round: 5 });
    expect(t.room.phase).toBe(RESULTS);
    expect(t.s.allClean).toBe(true);
    // Play again with the carried list: the two who have not fixed in this run go first
    const carried = t.s.fixedOnce;
    expect(carried.length).toBe(1);
    t.act("mum", "start_game", { gameId: MACHINE, options: { level: 1, length: "normal", fixedOnce: carried } });
    expect(t.s.nextFixerId).not.toBe(carried[0]);
  });

  it("defaults to level 1 and Relaxed, runs level 5 on a shorter clock, and takes the level from the host's choice", () => {
    const t = new Table();
    t.start();
    expect(t.s.settings.level).toBe(1);
    expect(t.s.settings.pace).toBe("relaxed");
    expect(t.s.settings.clockSeconds).toBe(240);
    const u = new Table();
    u.start({ level: 5, pace: "normal" });
    expect(u.s.settings.level).toBe(5);
    expect(u.s.settings.clockSeconds).toBe(135);
    const w = new Table();
    w.start({ level: 9 });
    expect(w.s.settings.level).toBe(1);
  });

  it("needs two players", () => {
    const t = new Table(everyone.slice(0, 1));
    expect(t.act("mum", "start_game", { gameId: MACHINE }).ok).toBe(false);
  });
});
