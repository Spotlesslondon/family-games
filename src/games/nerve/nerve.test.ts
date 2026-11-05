import { describe, expect, it } from "vitest";
import { applyPrivate, applyWrite } from "@/engine/apply";
import { LOBBY, RESULTS, applyRoomAction } from "@/engine/room";
import { seededRng } from "@/engine/rng";
import type { GameContext, Player, PrivateMap, RoomSnapshot } from "@/engine/types";
import { BUST_LAG_MS, COUNT_IN_MS, NERVE, NERVE_LEVELS, bustFrom } from "./index";
import { potAt, type NervePublic } from "./shape";
import "../index";

const everyone: Player[] = [
  { id: "mum", name: "Mum", ageBand: "16+", role: "owner" },
  { id: "kid", name: "Kid", ageBand: "6-8", role: "member" },
  { id: "nan", name: "Nan", ageBand: "16+", role: "adult" },
];

const T0 = Date.parse("2026-11-05T20:00:00.000Z");

/** A fixed secret, so the bust number is known to the test and nobody else. */
const secretFor = (u: number) => () => u;

class Table {
  room: RoomSnapshot;
  priv: PrivateMap = {};
  t = T0;
  rng = seededRng(3);
  constructor(public u = 0.5) {
    this.room = {
      id: "room-1",
      version: 0,
      hostId: "mum",
      status: "open",
      currentGame: null,
      phase: LOBBY,
      phaseEndsAt: null,
      state: {},
      members: everyone.map((p) => ({ id: p.id, connected: true })),
    };
  }
  ctx(secret = true): GameContext {
    return { room: this.room, players: everyone, private: this.priv, now: new Date(this.t).toISOString(), rng: this.rng, secret: secret ? secretFor(this.u) : undefined };
  }
  act(actorId: string, type: string, payload?: Record<string, unknown>, secret = true) {
    const r = applyRoomAction(this.ctx(secret), { type, actorId, payload });
    if (r.ok && !r.noop) {
      this.room = applyWrite(this.room, r.write);
      this.priv = applyPrivate(this.priv, r.write);
    }
    return r;
  }
  get s() {
    return this.room.state as unknown as NervePublic;
  }
  start(options: Record<string, unknown> = {}) {
    const r = this.act("mum", "start_game", { gameId: NERVE, options });
    expect(r.ok).toBe(true);
  }
  allReady() {
    for (const p of everyone) this.act(p.id, "ready", { round: this.s.round });
  }
  /** Move the clock to the moment the pot shows `n`. */
  at(n: number) {
    this.t = Date.parse(this.s.startAt!) + (n - 1) * this.s.settings.beatMs;
  }
}

describe("Nerve", () => {
  const bustNormal = bustFrom(0.5, "normal"); // 2 + floor(ln 2 * 9) = 8

  it("needs the server secret to start", () => {
    const t = new Table();
    const r = t.act("mum", "start_game", { gameId: NERVE }, false);
    expect(r.ok).toBe(false);
  });

  it("starts the climb only when every phone is down, after a count-in", () => {
    const t = new Table();
    t.start();
    expect(t.room.phase).toBe("ready");
    t.act("mum", "ready", { round: 1 });
    t.act("kid", "ready", { round: 1 });
    expect(t.room.phase).toBe("ready");
    t.act("nan", "ready", { round: 1 });
    expect(t.room.phase).toBe("climb");
    expect(Date.parse(t.s.startAt!) - t.t).toBe(COUNT_IN_MS);
    expect(t.s.inRound).toEqual(["mum", "kid", "nan"]);
  });

  it("never puts the bust number in what phones can read before the round ends", () => {
    const t = new Table(0.987654);
    t.start();
    t.allReady();
    const bust = bustFrom(0.987654, "normal");
    const text = JSON.stringify(t.room) + JSON.stringify(t.priv);
    expect(text).not.toContain(`"bust"`);
    expect(t.s.last).toBeNull();
    expect(bust).toBeGreaterThan(2);
  });

  it("lets the host go with the phones that are ready; the rest sit the round out", () => {
    const t = new Table();
    t.start();
    t.act("mum", "ready", { round: 1 });
    expect(t.act("kid", "go", { round: 1 }).ok).toBe(false);
    t.act("mum", "go", { round: 1 });
    expect(t.room.phase).toBe("climb");
    expect(t.s.inRound).toEqual(["mum"]);
  });

  it("banks the lower of the phone's claim and the server's pot, keeps it private, then reveals", () => {
    const t = new Table();
    t.start();
    t.allReady();
    t.at(3);
    t.act("kid", "bank", { round: 1, claim: 3 });
    t.at(5);
    t.act("nan", "bank", { round: 1, claim: 9 }); // a phone ahead of the clock gets the server's 5
    expect(t.s.bankedOrder).toEqual(["kid", "nan"]);
    expect(JSON.stringify(t.room.state)).not.toMatch(/"banked"/);
    expect(t.priv.kid).toMatchObject({ banked: 3 });
    expect(t.priv.nan).toMatchObject({ banked: 5 });
    // Mum holds past the bust; the next check after the lag ends the round.
    t.at(bustNormal);
    expect(t.act("kid", "check", { round: 1 }).ok).toBe(true);
    expect(t.room.phase).toBe("climb");
    t.t += BUST_LAG_MS;
    t.act("kid", "check", { round: 1 });
    expect(t.room.phase).toBe("reveal");
    expect(t.s.last).toEqual({ round: 1, bust: bustNormal, banked: { kid: 3, nan: 5 }, busted: ["mum"] });
    expect(t.s.scores).toEqual({ mum: 0, kid: 3, nan: 5 });
  });

  it("honours a lift just before the bust that arrives late, and busts a lift at the bust", () => {
    const t = new Table();
    t.start();
    t.allReady();
    t.at(bustNormal);
    t.t += 300; // the network was slow
    t.act("kid", "bank", { round: 1, claim: bustNormal - 1 });
    t.act("nan", "bank", { round: 1, claim: bustNormal });
    expect(t.room.phase).toBe("reveal");
    expect(t.s.last!.banked).toEqual({ kid: bustNormal - 1 });
    expect(t.s.last!.busted.sort()).toEqual(["mum", "nan"]);
  });

  it("ends the round when the last player lets go", () => {
    const t = new Table();
    t.start();
    t.allReady();
    t.at(2);
    for (const p of everyone) t.act(p.id, "bank", { round: 1, claim: 2 });
    expect(t.room.phase).toBe("reveal");
    expect(t.s.scores).toEqual({ mum: 2, kid: 2, nan: 2 });
  });

  it("counts a lift before the pot starts as 0, and ignores a bank after the round", () => {
    const t = new Table();
    t.start();
    t.allReady();
    t.act("kid", "bank", { round: 1, claim: 0 });
    expect(t.priv.kid).toMatchObject({ banked: 0 });
    t.at(bustNormal);
    t.t += BUST_LAG_MS;
    t.act("mum", "check", { round: 1 });
    const v = t.room.version;
    expect(t.act("nan", "bank", { round: 1, claim: 2 }).ok).toBe(true);
    expect(t.room.version).toBe(v);
  });

  it("plays the set number of rounds, then shows results with the scores", () => {
    const t = new Table();
    t.start({ length: "short" });
    for (let r = 1; r <= 3; r++) {
      expect(t.s.round).toBe(r);
      t.allReady();
      t.at(2);
      for (const p of everyone) t.act(p.id, "bank", { round: r, claim: 2 });
      t.act("mum", "next", { round: r });
      t.act("mum", "next", { round: r }); // a double tap does nothing
    }
    expect(t.room.phase).toBe(RESULTS);
    expect(t.s.scores).toEqual({ mum: 6, kid: 6, nan: 6 });
  });

  it("gives each round a fresh nonce, so an old bank never counts again", () => {
    const t = new Table();
    t.start();
    const first = t.s.nonce;
    t.allReady();
    t.at(2);
    for (const p of everyone) t.act(p.id, "bank", { round: 1, claim: 2 });
    t.act("mum", "next", { round: 1 });
    expect(t.s.nonce).not.toBe(first);
    t.allReady();
    t.at(bustNormal);
    t.t += BUST_LAG_MS;
    t.act("mum", "check", { round: 2 });
    expect(t.s.last!.busted.sort()).toEqual(["kid", "mum", "nan"]);
  });

  it("keeps bust numbers within each level's floor and cap", () => {
    for (const level of ["gentle", "normal", "wild"] as const) {
      const { min, cap } = NERVE_LEVELS[level];
      for (const u of [0, 0.1, 0.5, 0.9, 0.999999]) {
        const b = bustFrom(u, level);
        expect(b).toBeGreaterThanOrEqual(min);
        expect(b).toBeLessThanOrEqual(cap);
      }
    }
  });

  it("counts the pot from the start time", () => {
    const start = new Date(T0).toISOString();
    expect(potAt(T0 - 1, start, 650)).toBe(0);
    expect(potAt(T0, start, 650)).toBe(1);
    expect(potAt(T0 + 649, start, 650)).toBe(1);
    expect(potAt(T0 + 650, start, 650)).toBe(2);
  });
});
