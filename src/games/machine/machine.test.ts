import { describe, expect, it } from "vitest";
import { applyPrivate, applyWrite } from "@/engine/apply";
import { LOBBY, RESULTS, applyRoomAction } from "@/engine/room";
import { seededRng } from "@/engine/rng";
import type { GameContext, Player, PrivateMap, RoomSnapshot } from "@/engine/types";
import { MACHINE, buildMachine, type Machine } from "./index";
import { LEVELS, MAX_WOBBLES, PICTURES, type MachineLevel, type MachinePublic } from "./shape";
import "../index";

const everyone: Player[] = [
  { id: "mum", name: "Mum", ageBand: "16+", role: "owner" },
  { id: "kid", name: "Kid", ageBand: "6-8", role: "member" },
  { id: "teen", name: "Teen", ageBand: "12-15", role: "member" },
  { id: "nan", name: "Nan", ageBand: "16+", role: "adult" },
];

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
        const cardOrder = m.cards.find((c) => c.part === "pictures")!.lines[1].replace(".", "").split(", ");
        expect(cardOrder.length).toBe(PICTURES.length);
        expect(m.view.pictures!.length).toBe(spec.pictures);
        expect(m.answers.pictures).toEqual(cardOrder.filter((p) => m.view.pictures!.includes(p as never)));
        expect(m.view.dial!.patterns.length).toBe(spec.dialTurns);
        expect(m.view.dial!.labels).toBe(spec.dialLabels);
        expect(solveDialFromCards(m)).toEqual(m.answers.dial);
        expect(m.answers.dial.every((p) => p >= 1 && p <= 6)).toBe(true);
        // at level 5 the other manual really is a herring: it gives a different answer somewhere
        if (spec.manuals === 2) expect(m.cards.filter((c) => c.part === "dial").length).toBe(5);
      }
    }
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
