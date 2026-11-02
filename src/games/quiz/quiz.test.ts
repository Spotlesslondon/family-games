import { describe, expect, it } from "vitest";
import { applyPrivate, applyWrite } from "@/engine/apply";
import { LOBBY, RESULTS, applyRoomAction } from "@/engine/room";
import { seededRng } from "@/engine/rng";
import type { GameContext, Player, PrivateMap, RoomSnapshot } from "@/engine/types";
import { QUIZ, bandFor, levelsFor } from "./index";
import { QUIZ_BANK } from "./bank";
import type { QuizMine, QuizPublic } from "./shape";
import "../index";

const everyone: Player[] = [
  { id: "mum", name: "Mum", ageBand: "16+", role: "owner" },
  { id: "kid", name: "Kid", ageBand: "6-8", role: "member" },
  { id: "cous", name: "Cousin", ageBand: "9-11", role: "member" },
  { id: "nan", name: "Nan", ageBand: "16+", role: "adult" },
];

class Table {
  room: RoomSnapshot;
  priv: PrivateMap = {};
  private rng: () => number;

  constructor(seed = 1, size = 4) {
    this.rng = seededRng(seed);
    this.room = {
      id: "room-1",
      version: 0,
      hostId: "mum",
      status: "open",
      currentGame: null,
      phase: LOBBY,
      phaseEndsAt: null,
      state: {},
      members: everyone.slice(0, size).map((p) => ({ id: p.id, connected: true })),
    };
  }

  act(actorId: string, type: string, payload?: Record<string, unknown>) {
    const ctx: GameContext = { room: this.room, players: everyone, private: this.priv, now: "2026-11-02T20:00:00.000Z", rng: this.rng };
    const r = applyRoomAction(ctx, { type, actorId, payload });
    if (r.ok && !r.noop) {
      this.room = applyWrite(this.room, r.write);
      this.priv = applyPrivate(this.priv, r.write);
    }
    return r;
  }

  get s() {
    return this.room.state as unknown as QuizPublic;
  }

  mine(id: string) {
    return this.priv[id] as unknown as QuizMine;
  }

  /** The index of the right (or a wrong) answer on this player's phone. */
  pickFor(id: string, right: boolean) {
    const m = this.mine(id);
    const q = QUIZ_BANK.find((x) => x.text === m.text)!;
    return m.options.findIndex((o) => (right ? o === q.correct : o !== q.correct));
  }

  start(options: Record<string, unknown> = {}) {
    return this.act("mum", "start_game", { gameId: QUIZ, options });
  }
}

describe("quiz", () => {
  it("maps age bands to the CEO's banks", () => {
    expect(bandFor("6-8")).toBe("A");
    expect(bandFor("9-11")).toBe("B");
    expect(bandFor("12-15")).toBe("C");
    expect(bandFor("16+")).toBe("C");
  });

  it("goes from easy to hard", () => {
    expect(levelsFor(8)).toEqual(["easy", "easy", "easy", "medium", "medium", "medium", "hard", "hard"]);
    expect(levelsFor(5).filter((l) => l === "hard").length).toBeGreaterThan(0);
    expect(levelsFor(12).filter((l) => l === "easy").length).toBe(4);
  });

  it("gives each player a question at their own level, with no answer on any phone", () => {
    const t = new Table();
    expect(t.start().ok).toBe(true);
    expect(t.room.phase).toBe("question");
    for (const p of everyone) {
      const m = t.mine(p.id);
      const q = QUIZ_BANK.find((x) => x.text === m.text)!;
      expect(q.band).toBe(bandFor(p.ageBand));
      expect(q.level).toBe("easy");
      expect(m.options).toHaveLength(4);
      expect(m.options).toContain(q.correct);
      expect(m.choice).toBeNull();
      expect(JSON.stringify(m)).not.toMatch(/correct/);
    }
    // Same band, same question; nothing in the shared state says which answer is right.
    expect(t.mine("mum").text).toBe(t.mine("nan").text);
    expect(t.s.last).toBeNull();
    const shared = JSON.stringify(t.room.state);
    for (const q of QUIZ_BANK.filter((x) => Object.values(t.s.current).includes(x.id))) expect(shared).not.toContain(q.correct);
  });

  it("locks an answer on one tap and shows the answers when everyone has answered", () => {
    const t = new Table();
    t.start();
    expect(t.act("mum", "answer", { round: 1, choice: t.pickFor("mum", true) }).ok).toBe(true);
    const changed = t.act("mum", "answer", { round: 1, choice: t.pickFor("mum", false) });
    expect(changed.ok && changed.noop).toBe(true);
    t.act("kid", "answer", { round: 1, choice: t.pickFor("kid", true) });
    t.act("cous", "answer", { round: 1, choice: t.pickFor("cous", false) });
    expect(t.room.phase).toBe("question");
    t.act("nan", "answer", { round: 1, choice: t.pickFor("nan", true) });
    expect(t.room.phase).toBe("reveal");
    expect(new Set(t.s.last!.right)).toEqual(new Set(["mum", "kid", "nan"]));
    expect(t.s.scores).toEqual({ mum: 1, kid: 1, cous: 0, nan: 1 });
    expect(t.mine("nan").choice).not.toBeNull();
    expect(Object.keys(t.s.last!.questions).sort()).toEqual(["A", "B", "C"]);
  });

  it("lets only the host show the answers early, and counts a missing answer as wrong", () => {
    const t = new Table();
    t.start();
    t.act("kid", "answer", { round: 1, choice: t.pickFor("kid", true) });
    expect(t.act("kid", "show_answers")).toEqual({ ok: false, reason: "host_only" });
    expect(t.act("mum", "show_answers").ok).toBe(true);
    expect(t.room.phase).toBe("reveal");
    expect(t.s.last!.right).toEqual(["kid"]);
    expect(t.act("nan", "answer", { round: 1, choice: 0 }).ok).toBe(false);
  });

  it("refuses bad answers", () => {
    const t = new Table();
    t.start();
    expect(t.act("mum", "answer", { round: 2, choice: 0 })).toEqual({ ok: false, reason: "wrong_round" });
    expect(t.act("mum", "answer", { round: 1, choice: 4 })).toEqual({ ok: false, reason: "bad_choice" });
    expect(t.act("mum", "answer", { round: 1, choice: "1" })).toEqual({ ok: false, reason: "bad_choice" });
  });

  it("plays a whole game with no repeated question, then reaches results with the scores", () => {
    const t = new Table(7);
    t.start();
    const seen = new Set<string>();
    for (let round = 1; round <= 8; round++) {
      for (const id of Object.values(t.s.current)) {
        expect(seen.has(id!)).toBe(false);
        seen.add(id!);
      }
      for (const p of everyone) t.act(p.id, "answer", { round, choice: t.pickFor(p.id, p.id !== "cous") });
      expect(t.room.phase).toBe("reveal");
      expect(t.act("kid", "next_question", { round }).ok).toBe(false);
      t.act("mum", "next_question", { round });
      // A double tap on Next does not skip a round.
      const roundNow = t.s.round;
      t.act("mum", "next_question", { round });
      expect(t.s.round).toBe(roundNow);
      if (round < 8) expect(t.room.phase).toBe("question");
    }
    expect(t.room.phase).toBe(RESULTS);
    expect(t.s.scores).toEqual({ mum: 8, kid: 8, cous: 0, nan: 8 });
  });

  it("Play again avoids the last game's questions", () => {
    const t = new Table(3);
    t.start({ length: "short" });
    expect(t.s.settings.rounds).toBe(5);
    const first = Object.values(t.s.current) as string[];
    t.act("mum", "end_game");
    t.act("mum", "back_to_lobby");
    t.start({ length: "short", avoid: first });
    for (const id of Object.values(t.s.current)) expect(first).not.toContain(id);
  });
});
