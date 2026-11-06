import { describe, expect, it } from "vitest";
import { applyPrivate, applyWrite } from "@/engine/apply";
import { LOBBY, RESULTS, applyRoomAction } from "@/engine/room";
import { seededRng } from "@/engine/rng";
import type { GameContext, Player, PrivateMap, RoomSnapshot } from "@/engine/types";
import { MACHINE, buildMachine } from "./index";
import { MAX_WOBBLES, PICTURES, type MachineMine, type MachinePublic } from "./shape";
import "../index";

const everyone: Player[] = [
  { id: "mum", name: "Mum", ageBand: "16+", role: "owner" },
  { id: "kid", name: "Kid", ageBand: "6-8", role: "member" },
  { id: "teen", name: "Teen", ageBand: "12-15", role: "member" },
  { id: "nan", name: "Nan", ageBand: "16+", role: "adult" },
];

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
    // The secret differs by label, like the real keyed hash, but is fixed for a test.
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
    const fixer = this.players.find((p) => p.id === this.s.fixerId)!;
    const tier = fixer.ageBand === "6-8" ? "A" : fixer.ageBand === "9-11" ? "B" : "C";
    const u = this.ctx().secret!(`machine:${this.s.nonce}`);
    return buildMachine(Math.floor(u * 4294967296), tier);
  }
}

describe("Fix the Machine", () => {
  it("builds the same machine from the same seed, and its answers follow its own cards", () => {
    for (let seed = 1; seed < 400; seed++) {
      for (const tier of ["A", "B", "C"] as const) {
        const m = buildMachine(seed, tier);
        expect(buildMachine(seed, tier)).toEqual(m);
        // lamps: the answer presses every lamp exactly once
        expect([...m.answers.lamps!].sort()).toEqual(m.view.lamps!.map((_, i) => i));
        expect(m.view.lamps!.some((l) => l.lit) && m.view.lamps!.some((l) => !l.lit)).toBe(true);
        // pictures: the answer is the shown pictures in the card's order
        const cardOrder = m.cards.find((c) => c.part === "pictures")!.lines[1].replace(".", "").split(", ");
        expect(cardOrder.length).toBe(PICTURES.length);
        expect(m.answers.pictures).toEqual(cardOrder.filter((p) => m.view.pictures!.includes(p as never)));
        // dial: the two card halves together give one setting per pattern
        if (tier === "A") {
          expect(m.view.dial).toBeUndefined();
          expect(m.cards.map((c) => c.part)).toEqual(["lamps", "pictures"]);
        } else {
          const rows = m.cards.filter((c) => c.part === "dial").flatMap((c) => c.lines.filter((l) => /^\w+: \d$/.test(l)));
          expect(rows.length).toBe(6);
          const table = Object.fromEntries(rows.map((r) => r.split(": ")));
          let expected = Number(table[m.view.dial!.pattern]);
          if (tier === "C" && m.view.serial % 2 === 1) expected = (expected % 6) + 1;
          expect(m.answers.dial).toBe(expected);
          expect(m.cards.some((c) => c.lines.some((l) => l.startsWith("If the serial"))) ).toBe(tier === "C");
        }
      }
    }
  });

  it("gives the Fixer the machine and the Helpers the cards, and never writes an answer anywhere a phone reads", () => {
    const t = new Table();
    t.start();
    expect(t.room.phase).toBe("fixing");
    const fixer = t.s.fixerId;
    const mine = t.priv[fixer] as unknown as MachineMine;
    expect(mine.role).toBe("fixer");
    const truth = t.truth();
    expect((mine as { view: unknown }).view).toEqual(truth.view);
    const helpers = everyone.filter((p) => p.id !== fixer);
    const allCards = helpers.flatMap((h) => (t.priv[h.id] as unknown as { cards: unknown[] }).cards);
    expect(allCards.length).toBeGreaterThanOrEqual(truth.cards.length);
    for (const c of truth.cards) expect(allCards).toContainEqual(c);
    const text = JSON.stringify(t.room) + JSON.stringify(t.priv);
    expect(text).not.toContain('"answers"');
    expect(text).not.toContain(JSON.stringify(truth.answers.pictures));
    // the picture card goes to the youngest helper
    const youngest = helpers.sort((a, b) => a.ageBand.localeCompare(b.ageBand))[0];
    if (youngest.ageBand === "6-8") expect(t.s.holders[youngest.id]).toContain("pictures");
  });

  it("fixes parts on the right answer, wobbles on a wrong one, and pops after three", () => {
    const t = new Table();
    t.start();
    const f = t.s.fixerId;
    const truth = t.truth();
    expect(t.act("nan" === f ? "mum" : "nan", "attempt", { round: 1, part: "lamps", answer: truth.answers.lamps }).ok).toBe(false);
    t.act(f, "attempt", { round: 1, part: "lamps", answer: [...truth.answers.lamps!].reverse() });
    expect(t.s.wobbles).toBe(1);
    t.act(f, "attempt", { round: 1, part: "lamps", answer: truth.answers.lamps });
    expect(t.s.parts.lamps).toBe("fixed");
    t.act(f, "attempt", { round: 1, part: "pictures", answer: [] });
    t.act(f, "attempt", { round: 1, part: "pictures", answer: [] });
    expect(t.room.phase).toBe("round_over");
    expect(t.s.last).toMatchObject({ round: 1, won: false, popped: "wobbles", fixed: 1, wobbles: MAX_WOBBLES, points: 1 });
    expect(t.s.score).toBe(1);
  });

  it("wins a clean round for a bonus point, rotates the Fixer, and ends on the clock", () => {
    const t = new Table();
    t.start({ length: "normal" });
    const f1 = t.s.fixerId;
    const truth = t.truth();
    for (const part of Object.keys(t.s.parts) as (keyof typeof truth.answers)[]) t.act(f1, "attempt", { round: 1, part, answer: truth.answers[part] });
    expect(t.room.phase).toBe("round_over");
    expect(t.s.last).toMatchObject({ won: true, popped: null, wobbles: 0, points: Object.keys(t.s.parts).length + 1 });
    expect(t.act("kid" === f1 ? "nan" : "kid", "next_round", { round: 1 }).ok).toBe(false);
    t.act("mum", "next_round", { round: 1 });
    expect(t.room.phase).toBe("fixing");
    expect(t.s.round).toBe(2);
    expect(t.s.fixerId).not.toBe(f1);
    expect(t.s.nonce).not.toBe("");
    // the clock runs out
    t.t = Date.parse(t.room.phaseEndsAt!) + 1;
    t.act("nan", "advance_if_expired");
    expect(t.room.phase).toBe("round_over");
    expect(t.s.last).toMatchObject({ round: 2, popped: "time" });
    t.act("mum", "next_round", { round: 2 });
    const f3 = t.s.fixerId;
    const truth3 = t.truth();
    for (const part of Object.keys(t.s.parts) as (keyof typeof truth3.answers)[]) t.act(f3, "attempt", { round: 3, part, answer: truth3.answers[part] });
    t.act("mum", "next_round", { round: 3 });
    expect(t.room.phase).toBe(RESULTS);
  });

  it("gives a 6 to 8 year old Fixer two parts and an older one three", () => {
    const t = new Table();
    t.start({ length: "long" });
    const seen: Record<string, number> = {};
    for (let round = 1; round <= 5; round++) {
      const fixer = everyone.find((p) => p.id === t.s.fixerId)!;
      seen[fixer.ageBand] = Object.keys(t.s.parts).length;
      t.t = Date.parse(t.room.phaseEndsAt!) + 1;
      t.act("mum", "advance_if_expired");
      t.act("mum", "next_round", { round });
    }
    expect(seen["6-8"]).toBe(2);
    expect(seen["16+"]).toBe(3);
  });

  it("needs three players and the server secret", () => {
    const t = new Table(everyone.slice(0, 2));
    expect(t.act("mum", "start_game", { gameId: MACHINE }).ok).toBe(false);
  });
});
