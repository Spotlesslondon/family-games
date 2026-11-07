import { describe, expect, it } from "vitest";
import { applyPrivate, applyWrite } from "@/engine/apply";
import { LOBBY, RESULTS, applyRoomAction } from "@/engine/room";
import { seededRng } from "@/engine/rng";
import type { GameContext, Player, PrivateMap, RoomSnapshot } from "@/engine/types";
import { MACHINE, buildMachine, type Machine } from "./index";
import { LAMP_COLOURS, LEVELS, MAX_WOBBLES, PATTERNS, PICTURES, type MachineLevel, type MachinePublic, type MachineView, type Pattern, type Picture } from "./shape";
import "../index";

const everyone: Player[] = [
  { id: "mum", name: "Mum", ageBand: "16+", role: "owner" },
  { id: "kid", name: "Kid", ageBand: "6-8", role: "member" },
  { id: "teen", name: "Teen", ageBand: "12-15", role: "member" },
  { id: "nan", name: "Nan", ageBand: "16+", role: "adult" },
];

/**
 * Read a manual back the way the table would: parse each rule's words, check
 * its conditions against what the Fixer sees, take the first that fits, and
 * carry out its instruction. Written from the words alone, so it proves the
 * text says what the generator meant.
 */
function condFits(text: string, v: MachineView): boolean {
  const lamps = v.lamps!;
  const lit = lamps.filter((l) => l.lit).length;
  let m: RegExpMatchArray | null;
  if ((m = text.match(/^the (leftmost|rightmost) lamp is (LIT|OFF)$/))) return (m[1] === "leftmost" ? lamps[0] : lamps[lamps.length - 1]).lit === (m[2] === "LIT");
  if ((m = text.match(/^the (\w+) lamp is (LIT|OFF)$/))) {
    const l = lamps.find((x) => x.colour === m![1]);
    return !!l && l.lit === (m[2] === "LIT");
  }
  if ((m = text.match(/^there is a (\w+) lamp$/))) return lamps.some((x) => x.colour === m![1]);
  if ((m = text.match(/^no lamp is (\w+)$/))) return !lamps.some((x) => x.colour === m![1]);
  if ((m = text.match(/^exactly (\d+) lamps? (?:is|are) lit$/))) return lit === Number(m[1]);
  if ((m = text.match(/^(\d+) or more lamps are lit$/))) return lit >= Number(m[1]);
  if ((m = text.match(/^the (leftmost|rightmost) lamp is (LIT|OFF)$/))) return (m[1] === "leftmost" ? lamps[0] : lamps[lamps.length - 1]).lit === (m[2] === "LIT");
  if ((m = text.match(/^the serial number is (even|odd)$/))) return v.serial % 2 === (m[1] === "even" ? 0 : 1);
  if ((m = text.match(/^the serial number ends in (\d)$/))) return v.serial % 10 === Number(m[1]);
  if ((m = text.match(/^the dial shows (\w+)$/))) return v.dial!.patterns.includes(m[1] as Pattern);
  if ((m = text.match(/^there is a (\w+) key$/))) return v.pictures!.includes(m[1] as Picture);
  if ((m = text.match(/^there is no (\w+) key$/))) return !v.pictures!.includes(m[1] as Picture);
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

function doLamps(instr: string, v: MachineView): number[] {
  const lamps = v.lamps!;
  const all = lamps.map((_, i) => i);
  const litIdx = all.filter((i) => lamps[i].lit);
  const offIdx = all.filter((i) => !lamps[i].lit);
  let m: RegExpMatchArray | null;
  if (instr === "press the LIT lamps left to right, then the OFF lamps left to right") return [...litIdx, ...offIdx];
  if (instr === "press the OFF lamps right to left, then the LIT lamps left to right") return [...offIdx.reverse(), ...litIdx];
  if (instr === "press every lamp, left to right") return all;
  if (instr === "press every lamp, right to left") return all.reverse();
  if (instr === "press the LIT lamps right to left, then the OFF lamps right to left") return [...litIdx.reverse(), ...offIdx.reverse()];
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

function doPictures(instr: string, v: MachineView): Picture[] {
  const m = instr.match(/^press the keys in this order(, BACKWARDS)?, skipping any key the machine does not have: (.+)$/);
  if (!m) throw new Error("unreadable picture instruction: " + instr);
  const seq = (m[2].split(", ") as Picture[]).filter((p) => v.pictures!.includes(p));
  return m[1] ? seq.reverse() : seq;
}

/**
 * Solve a machine the way the table would: read the cards, look at the
 * machine, work out the dial. Independent of the generator's own arithmetic.
 */
function solveDialFromCards(m: Machine): number[] {
  const dial = m.view.dial!;
  const cards = m.cards.filter((c) => c.part === "dial");
  const tag = cards.find((c) => c.title === "The service tag");
  const manual = tag ? tag.lines[0].match(/Manual ([AB])/)![1] : null;
  const mine = cards.filter((c) => c.title !== "The service tag" && (manual ? c.title.startsWith(`Manual ${manual}`) : true));
  expect(mine.length).toBe(2);
  const lit = m.view.lamps!.filter((l) => l.lit).length;
  const dependency = mine[0].lines.some((l) => l.startsWith("Use the FIRST table"));
  const table: Record<string, string> = {};
  for (const c of mine) {
    let section = dependency ? "first" : "only";
    for (const line of c.lines) {
      if (line === "First table:") section = "first";
      else if (line === "Second table:") section = "second";
      const row = line.match(/^(\w+): (\w+)$/);
      if (!row) continue;
      const want = dependency ? (lit > 2 ? "second" : "first") : "only";
      if (section === want) table[row[1]] = row[2];
    }
  }
  const toPos = (label: string) => (dial.labels === "symbols" ? dial.symbols!.indexOf(label as never) + 1 : Number(label));
  const text = mine[0].lines.join(" ");
  let shift = 0;
  if (text.includes("look at the light")) shift = dial.light === "amber" ? 1 : dial.light === "red" ? -1 : 0;
  if (text.includes("serial number is ODD") && m.view.serial % 2 === 1) shift = 1;
  return dial.patterns.map((p) => ((((toPos(table[p]) - 1 + shift) % 6) + 6) % 6) + 1);
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
  start(options: Record<string, unknown> = {}) {
    const r = this.act("mum", "start_game", { gameId: MACHINE, options });
    expect(r.ok).toBe(true);
  }
  /** What the server knows about this round's machine (the test peeks; phones cannot). */
  truth() {
    const u = this.ctx().secret!(`machine:${this.s.nonce}`);
    return buildMachine(Math.floor(u * 4294967296), this.s.settings.level);
  }
  fixAll(round: number) {
    const f = this.s.fixerId;
    const truth = this.truth();
    for (const part of ["lamps", "pictures", "dial"] as const) this.act(f, "attempt", { round, part, answer: truth.answers[part] });
  }
}

describe("Fix the Machine", () => {
  it("at every level, the same seed gives the same machine and the answers follow the cards", () => {
    for (const level of [1, 2, 3, 4, 5] as MachineLevel[]) {
      const spec = LEVELS[level];
      for (let seed = 1; seed <= 400; seed++) {
        const m = buildMachine(seed, level);
        expect(buildMachine(seed, level)).toEqual(m);
        expect(m.view.lamps!.length).toBe(spec.lamps);
        expect([...m.answers.lamps].sort()).toEqual(m.view.lamps!.map((_, i) => i));
        expect(m.view.lamps!.some((l) => l.lit) && m.view.lamps!.some((l) => !l.lit)).toBe(true);
        // lamps: read the manual (both halves at level 5) and do what the first fitting rule says
        const lampLines = m.cards.filter((c) => c.part === "lamps").flatMap((c) => c.lines);
        expect(m.cards.filter((c) => c.part === "lamps").length).toBe(spec.splitLamps ? 2 : 1);
        expect(readManual(lampLines).length).toBe(spec.lampRules);
        expect(doLamps(firstFitting(lampLines, m.view), m.view)).toEqual(m.answers.lamps);
        // pictures: a plain order, or a manual
        expect(m.view.pictures!.length).toBe(spec.pictures);
        const picCard = m.cards.find((c) => c.part === "pictures")!;
        if (spec.pictureRules <= 1) {
          const cardOrder = picCard.lines[1].replace(".", "").split(", ");
          expect(cardOrder.length).toBe(PICTURES.length);
          expect(m.answers.pictures).toEqual(cardOrder.filter((p) => m.view.pictures!.includes(p as never)));
        } else {
          expect(readManual(picCard.lines).length).toBe(spec.pictureRules);
          expect(doPictures(firstFitting(picCard.lines, m.view), m.view)).toEqual(m.answers.pictures);
        }
        expect(m.view.dial!.patterns.length).toBe(spec.dialTurns);
        expect(m.view.dial!.labels).toBe(spec.dialLabels);
        expect(solveDialFromCards(m)).toEqual(m.answers.dial);
        expect(m.answers.dial.every((p) => p >= 1 && p <= 6)).toBe(true);
        // at level 5 the other manual really is a herring: it gives a different answer somewhere
        if (spec.manuals === 2) expect(m.cards.filter((c) => c.part === "dial").length).toBe(5);
      }
    }
  });

  it("the fitting rule is not always the first, and from level 3 rules look across the machine", () => {
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
        if (level >= 3 && rules.some((r) => r.conds.some((c) => /serial|dial shows|key$/.test(c)))) cross++;
      }
    }
    for (const level of [2, 3, 4, 5] as MachineLevel[]) {
      expect(new Set(where[level]).size).toBeGreaterThan(1);
      expect(where[level].filter((i) => i === 0).length).toBeLessThan(150);
    }
    expect(cross).toBeGreaterThan(400);
    void LAMP_COLOURS;
    void PATTERNS;
  });

  it("level 5's other manual would send the Fixer wrong at least some of the time", () => {
    let differ = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const m = buildMachine(seed, 5);
      const tag = m.cards.find((c) => c.title === "The service tag")!.lines[0];
      const other = tag.includes("Manual A") ? "Manual B" : "Manual A";
      const wrong = m.cards.filter((c) => c.title.startsWith(other)).flatMap((c) => c.lines).filter((l) => /^(\w+): (\w+)$/.test(l));
      const right = m.cards.filter((c) => c.title.startsWith(tag.match(/Manual [AB]/)![0])).flatMap((c) => c.lines).filter((l) => /^(\w+): (\w+)$/.test(l));
      if (wrong.join() !== right.join()) differ++;
    }
    expect(differ).toBeGreaterThan(95);
  });

  it("works with two players: the one Helper holds the whole rulebook", () => {
    const t = new Table(everyone.slice(0, 2));
    t.start({ level: 2 });
    const fixer = t.s.fixerId;
    const helper = fixer === "mum" ? "kid" : "mum";
    const mine = t.priv[helper] as unknown as { role: string; cards: unknown[] };
    expect(mine.role).toBe("helper");
    expect(mine.cards.length).toBe(t.truth().cards.length);
    for (const c of t.s.cards) expect(c.holders).toEqual([helper]);
  });

  it("spreads the rulebook over Helpers, lists every card and its holder for everyone, and never leaks an answer", () => {
    const t = new Table();
    t.start({ level: 4 });
    const truth = t.truth();
    const fixer = t.s.fixerId;
    expect((t.priv[fixer] as unknown as { view: unknown }).view).toEqual(truth.view);
    const helpers = everyone.filter((p) => p.id !== fixer).map((p) => p.id);
    const allCards = helpers.flatMap((h) => (t.priv[h] as unknown as { cards: unknown[] }).cards);
    for (const c of truth.cards) expect(allCards).toContainEqual(c);
    expect(t.s.cards.length).toBe(truth.cards.length);
    for (const c of t.s.cards) {
      expect(c.holders.length).toBeGreaterThan(0);
      for (const h of c.holders) expect((t.priv[h] as unknown as { cards: { title: string }[] }).cards.some((x) => x.title === c.title)).toBe(true);
    }
    const text = JSON.stringify(t.room) + JSON.stringify(t.priv);
    expect(text).not.toContain('"answers"');
    expect(text).not.toContain(JSON.stringify(truth.answers.dial));
  });

  it("fixes parts on the right answer, wobbles on a wrong one, and pops after three", () => {
    const t = new Table();
    t.start({ level: 3 });
    const f = t.s.fixerId;
    const truth = t.truth();
    expect(t.act(f === "nan" ? "mum" : "nan", "attempt", { round: 1, part: "lamps", answer: truth.answers.lamps }).ok).toBe(false);
    t.act(f, "attempt", { round: 1, part: "lamps", answer: [...truth.answers.lamps].reverse() });
    expect(t.s.wobbles).toBe(1);
    t.act(f, "attempt", { round: 1, part: "lamps", answer: truth.answers.lamps });
    expect(t.s.parts.lamps).toBe("fixed");
    // the dial at level 3 is two turns: one turn is not enough
    t.act(f, "attempt", { round: 1, part: "dial", answer: truth.answers.dial.slice(0, 1) });
    t.act(f, "attempt", { round: 1, part: "dial", answer: [] });
    expect(t.room.phase).toBe("round_over");
    expect(t.s.last).toMatchObject({ round: 1, won: false, popped: "wobbles", fixed: 1, wobbles: MAX_WOBBLES, points: 1 });
  });

  it("wins a clean round for a bonus point, rotates the Fixer, ends on the clock, and reaches results", () => {
    const t = new Table();
    t.start({ level: 1, length: "normal" });
    expect(t.s.settings.clockSeconds).toBe(180);
    const f1 = t.s.fixerId;
    t.fixAll(1);
    expect(t.room.phase).toBe("round_over");
    expect(t.s.last).toMatchObject({ won: true, popped: null, wobbles: 0, points: 4 });
    expect(t.act(f1 === "kid" ? "nan" : "kid", "next_round", { round: 1 }).ok).toBe(false);
    t.act("mum", "next_round", { round: 1 });
    expect(t.s.round).toBe(2);
    expect(t.s.fixerId).not.toBe(f1);
    t.t = Date.parse(t.room.phaseEndsAt!) + 1;
    t.act("nan", "advance_if_expired");
    expect(t.s.last).toMatchObject({ round: 2, popped: "time" });
    t.act("mum", "next_round", { round: 2 });
    t.fixAll(3);
    t.act("mum", "next_round", { round: 3 });
    expect(t.room.phase).toBe(RESULTS);
    expect(t.s.score).toBe(8);
  });

  it("level 5 runs a shorter clock and takes the level from the host's choice", () => {
    const t = new Table();
    t.start({ level: 5, pace: "normal" });
    expect(t.s.settings.level).toBe(5);
    expect(t.s.settings.clockSeconds).toBe(135);
    const u = new Table();
    u.start({ level: 9 });
    expect(u.s.settings.level).toBe(1);
  });

  it("needs two players", () => {
    const t = new Table(everyone.slice(0, 1));
    expect(t.act("mum", "start_game", { gameId: MACHINE }).ok).toBe(false);
  });
});
