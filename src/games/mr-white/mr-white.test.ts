import { describe, expect, it } from "vitest";
import { applyPrivate, applyWrite } from "@/engine/apply";
import { LOBBY, RESULTS, applyRoomAction } from "@/engine/room";
import { seededRng } from "@/engine/rng";
import type { GameContext, Player, PrivateMap, RoomSnapshot } from "@/engine/types";
import { MR_WHITE, hiddenCounts, sameWord, tooClose, type MrWhiteState, type Side } from "./index";
import { MR_WHITE_PAIRS } from "./words";

const everyone: Player[] = [
  { id: "mum", name: "Mum", ageBand: "16+", role: "owner" },
  { id: "kid", name: "Kid", ageBand: "6-8", role: "member" },
  { id: "teen", name: "Teen", ageBand: "12-15", role: "member" },
  { id: "nan", name: "Nan", ageBand: "16+", role: "adult" },
  { id: "dad", name: "Dad", ageBand: "16+", role: "adult" },
  { id: "aunt", name: "Aunt", ageBand: "16+", role: "adult" },
  { id: "cous", name: "Cousin", ageBand: "9-11", role: "member" },
];

/** A table of phones playing through the real room engine. */
class Table {
  room: RoomSnapshot;
  priv: PrivateMap = {};
  private rng: () => number;

  constructor(seed = 1, size = 5) {
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
    const ctx: GameContext = { room: this.room, players: everyone, private: this.priv, now: "2026-11-01T21:00:00.000Z", rng: this.rng };
    const r = applyRoomAction(ctx, { type, actorId, payload });
    if (r.ok && !r.noop) {
      this.room = applyWrite(this.room, r.write);
      this.priv = applyPrivate(this.priv, r.write);
    }
    return r;
  }

  get s() {
    return this.room.state as MrWhiteState;
  }
  ids() {
    return this.room.members.map((m) => m.id);
  }
  stillIn() {
    const out = new Set(this.s.out.map((o) => o.id));
    return this.s.order.filter((id) => !out.has(id));
  }
  /** The test knows the truth by counting words, the same way the server does. */
  sides(): Record<string, Side> {
    const counts = new Map<string, number>();
    for (const id of this.ids()) {
      const w = this.priv[id].word as string | undefined;
      if (w) counts.set(w, (counts.get(w) ?? 0) + 1);
    }
    const civ = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const out: Record<string, Side> = {};
    for (const id of this.ids()) out[id] = this.priv[id].mrWhite ? "mr_white" : this.priv[id].word === civ ? "villager" : "wolf";
    return out;
  }
  villagerWord() {
    const civ = this.ids().find((id) => this.sides()[id] === "villager")!;
    return this.priv[civ].word as string;
  }
  of(side: Side) {
    return this.ids().filter((id) => this.sides()[id] === side);
  }

  start(options?: Record<string, unknown>) {
    expect(this.act("mum", "start_game", { gameId: MR_WHITE, options }).ok).toBe(true);
  }
  allSee() {
    for (const id of this.ids()) this.act(id, "seen");
  }
  /** One round of typed clues: each player types a fresh made-up word. */
  typedRound() {
    for (const id of this.stillIn()) {
      const r = this.act(id, "clue", { turn: this.s.turn, text: `clue${this.s.clues.length}x` });
      expect(r.ok, JSON.stringify(r)).toBe(true);
    }
  }
  /** Everyone still in votes for target, except target, who votes for someone else. */
  voteOut(target: string) {
    for (const id of this.stillIn()) {
      const choice = id === target ? this.stillIn().find((x) => x !== id)! : target;
      expect(this.act(id, "vote", { memberId: choice }).ok).toBe(true);
    }
  }
  /** Clues, vote someone out, and on to the next round if the game goes on. */
  roundVotingOut(target: string) {
    this.typedRound();
    expect(this.act("mum", "start_vote").ok).toBe(true);
    this.voteOut(target);
  }
}

describe("Mr White: how many are hidden", () => {
  it("follows the table: 1, then 2, then 3, then 4, with Mr White from 5 players", () => {
    expect(hiddenCounts(3, true)).toEqual({ wolves: 1, mrWhite: false });
    expect(hiddenCounts(4, true)).toEqual({ wolves: 1, mrWhite: false });
    expect(hiddenCounts(5, true)).toEqual({ wolves: 1, mrWhite: true });
    expect(hiddenCounts(5, false)).toEqual({ wolves: 2, mrWhite: false });
    expect(hiddenCounts(6, true)).toEqual({ wolves: 1, mrWhite: true });
    expect(hiddenCounts(7, true)).toEqual({ wolves: 2, mrWhite: true });
    expect(hiddenCounts(10, false)).toEqual({ wolves: 3, mrWhite: false });
    expect(hiddenCounts(12, true)).toEqual({ wolves: 3, mrWhite: true });
    // Villagers always outnumber everyone hidden, so the majority word is theirs.
    for (let n = 3; n <= 12; n++) {
      for (const on of [true, false]) {
        const c = hiddenCounts(n, on);
        expect(n - c.wolves - (c.mrWhite ? 1 : 0)).toBeGreaterThan(c.wolves + (c.mrWhite ? 1 : 0));
      }
    }
  });
});

describe("Mr White: the deal", () => {
  it("deals one pair, the right counts, and nothing that tells anyone their side", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const t = new Table(seed, 7);
      t.start();
      expect(t.room.phase).toBe("reveal");
      expect(t.of("mr_white")).toHaveLength(1);
      expect(t.of("wolf")).toHaveLength(2);
      expect(t.of("villager")).toHaveLength(4);
      const words = [...new Set(t.ids().map((id) => t.priv[id].word).filter(Boolean))].sort();
      expect(MR_WHITE_PAIRS.some((p) => [...p].sort().join() === words.join())).toBe(true);
      for (const id of t.ids()) {
        const keys = Object.keys(t.priv[id]).sort().join();
        // A Villager and a Wolf hold exactly the same fields.
        expect(keys).toBe(t.sides()[id] === "mr_white" ? "mrWhite,vote" : "vote,word");
      }
      // Nothing secret in the state every phone and the TV can read.
      const shared = JSON.stringify(t.room.state);
      for (const w of words) expect(shared).not.toContain(`"${w}"`);
      expect(shared).not.toMatch(/wolf"|villager"|"mr_white"/);
      expect(t.s.settings).toEqual({ wolves: 2, mrWhite: true, spoken: false, mrWhiteChosen: true });
    }
  });

  it("puts each word of a pair on the majority side some of the time", () => {
    let first = 0;
    let second = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const t = new Table(seed, 5);
      t.start();
      const w = t.villagerWord();
      if (MR_WHITE_PAIRS.some((p) => p[0] === w)) first++;
      if (MR_WHITE_PAIRS.some((p) => p[1] === w)) second++;
    }
    expect(first).toBeGreaterThan(10);
    expect(second).toBeGreaterThan(10);
  });

  it("never lets Mr White give the first clue, and switches him off when asked", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const t = new Table(seed, 6);
      t.start();
      expect(t.s.order[0]).not.toBe(t.of("mr_white")[0]);
      const off = new Table(seed, 6);
      off.start({ mrWhite: false });
      expect(off.of("mr_white")).toHaveLength(0);
      expect(off.of("wolf")).toHaveLength(2);
      expect(off.s.settings.mrWhite).toBe(false);
    }
  });

  it("has no Mr White under 5 players even when switched on", () => {
    const t = new Table(3, 4);
    t.start();
    expect(t.of("mr_white")).toHaveLength(0);
    expect(t.of("wolf")).toHaveLength(1);
  });
});

describe("Mr White: typed clues", () => {
  it("shows each clue to everyone, in turn, and checks it", () => {
    const t = new Table(4, 5);
    t.start();
    t.allSee();
    expect(t.room.phase).toBe("clues");
    const first = t.s.order[0];
    const second = t.s.order[1];
    expect(t.act(second, "clue", { turn: 0, text: "fins" })).toEqual({ ok: false, reason: "not_your_turn" });
    expect(t.act(first, "clue", { turn: 0, text: "two words" })).toEqual({ ok: false, reason: "one_word_only" });
    expect(t.act(first, "clue", { turn: 0, text: "   " })).toEqual({ ok: false, reason: "empty_clue" });
    expect(t.act(first, "clue", { turn: 0, text: "a".repeat(21) })).toEqual({ ok: false, reason: "clue_too_long" });
    const own = t.priv[first].word as string;
    const ownClue = own.includes(" ") ? own.split(" ")[1] + "s" : own.toUpperCase() + "S";
    expect(t.act(first, "clue", { turn: 0, text: ownClue })).toEqual({ ok: false, reason: "clue_is_your_word" });
    expect(t.act(first, "clue", { turn: 0, text: "Splash" }).ok).toBe(true);
    expect(t.s.clues).toEqual([{ id: first, round: 1, text: "Splash" }]);
    expect(t.s.turn).toBe(1);
    // A double tap for the turn just gone changes nothing.
    expect(t.act(first, "clue", { turn: 0, text: "again" })).toMatchObject({ ok: true, noop: true });
    // Nobody may repeat a clue, however it is spelt.
    expect(t.act(second, "clue", { turn: 1, text: "splashes" })).toEqual({ ok: false, reason: "clue_already_said" });
    // Typed mode: tapping "said it" is not a clue.
    expect(t.act(second, "clue_done", { turn: 1 })).toEqual({ ok: false, reason: "type_your_clue" });
  });

  it("lets the host move a stuck turn on, leaving a gap in the clues", () => {
    const t = new Table(5, 5);
    t.start();
    t.act("mum", "start_clues");
    const speaker = t.s.order[0];
    const mover = speaker === "mum" ? t.s.order[1] : speaker;
    if (speaker === "mum") t.act("mum", "clue", { turn: 0, text: "first" });
    const turn = t.s.turn;
    expect(t.act("mum", "clue_done", { turn }).ok).toBe(true);
    expect(t.s.clues[t.s.clues.length - 1]).toEqual({ id: mover, round: 1, text: null });
  });

  it("does not check Mr White's clue against a word he does not have", () => {
    const t = new Table(6, 6);
    t.start();
    t.allSee();
    while (t.room.phase === "clues") {
      const id = t.stillIn()[t.s.turn];
      expect(t.act(id, "clue", { turn: t.s.turn, text: `w${t.s.turn}` }).ok).toBe(true);
    }
    expect(t.room.phase).toBe("between");
    expect(t.s.clues).toHaveLength(6);
  });
});

describe("Mr White: spoken clues", () => {
  it("uses taps, keeps no clue text, and refuses typed clues", () => {
    const t = new Table(7, 5);
    t.start({ spoken: true });
    t.allSee();
    const first = t.s.order[0];
    expect(t.act(first, "clue", { turn: 0, text: "fins" })).toEqual({ ok: false, reason: "clues_are_spoken" });
    for (const id of t.stillIn()) expect(t.act(id, "clue_done", { turn: t.s.turn }).ok).toBe(true);
    expect(t.room.phase).toBe("between");
    expect(t.s.clues).toEqual([]);
  });
});

describe("Mr White: voting people out", () => {
  it("puts the most-voted player out, shows their side and never their word", () => {
    const t = new Table(8, 6);
    t.start();
    t.allSee();
    const civ = t.of("villager")[0];
    t.roundVotingOut(civ);
    expect(t.room.phase).toBe("out");
    expect(t.s.out).toEqual([{ id: civ, side: "villager", round: 1 }]);
    expect(t.s.lastVote?.outId).toBe(civ);
    expect(JSON.stringify(t.room.state)).not.toContain(`"${t.villagerWord()}"`);
    // Votes are cleared for the next round.
    for (const id of t.ids()) expect(t.priv[id].vote).toBeNull();
    expect(t.act("kid", "next_round")).toEqual({ ok: false, reason: "host_only" });
    expect(t.act("mum", "next_round").ok).toBe(true);
    expect(t.room.phase).toBe("clues");
    expect(t.s.round).toBe(2);
    // The player who is out gives no clue and cannot vote.
    expect(t.stillIn()).not.toContain(civ);
    t.typedRound();
    t.act("mum", "start_vote");
    expect(t.act(civ, "vote", { memberId: t.stillIn()[0] })).toEqual({ ok: false, reason: "you_are_out" });
    expect(t.act(t.stillIn()[0], "vote", { memberId: civ })).toEqual({ ok: false, reason: "not_a_candidate" });
  });

  it("goes to one run-off on a tie, and nobody is out on a second tie", () => {
    const t = new Table(9, 4); // 3 Villagers and 1 Wolf
    t.start();
    t.allSee();
    t.typedRound();
    t.act("mum", "start_vote");
    const [a, b, c, d] = t.stillIn();
    t.act(a, "vote", { memberId: b });
    t.act(b, "vote", { memberId: a });
    t.act(c, "vote", { memberId: a });
    t.act(d, "vote", { memberId: b });
    expect(t.room.phase).toBe("vote");
    expect(t.s.runoff).toBe(true);
    expect([...t.s.candidates].sort()).toEqual([a, b].sort());
    t.act(a, "vote", { memberId: b });
    t.act(b, "vote", { memberId: a });
    t.act(c, "vote", { memberId: a });
    t.act(d, "vote", { memberId: b });
    expect(t.room.phase).toBe("out");
    expect(t.s.out).toEqual([]);
    expect(t.s.lastVote?.tie).toBe(true);
    // The last vote of the count was saved, not lost.
    expect(t.s.lastVote?.votes[d]).toBe(b);
  });
});

describe("Mr White: who wins", () => {
  it("Villagers win when every hidden player is out", () => {
    const t = new Table(10, 5); // 3 Villagers, 1 Wolf, Mr White
    t.start();
    t.allSee();
    const uc = t.of("wolf")[0];
    const mr = t.of("mr_white")[0];
    t.roundVotingOut(uc);
    expect(t.room.phase).toBe("out");
    t.act("mum", "next_round");
    t.roundVotingOut(mr);
    expect(t.room.phase).toBe("guess");
    expect(t.act(uc, "guess", { word: "x" })).toEqual({ ok: false, reason: "not_mr_white" });
    expect(t.act(mr, "guess", { word: "definitely not it" }).ok).toBe(true);
    expect(t.room.phase).toBe(RESULTS);
    const r = t.s.reveal!;
    expect(r.outcome).toEqual({ winner: "villagers", how: "all_found" });
    expect(r.villagerWord).toBe(t.villagerWord());
    expect(r.sides).toEqual(t.sides());
    expect(t.s.out[1].guess).toBe("definitely not it");
  });

  it("Mr White steals the win with the right word, forgiving case and plurals", () => {
    const t = new Table(11, 5);
    t.start();
    t.allSee();
    const mr = t.of("mr_white")[0];
    t.roundVotingOut(mr);
    expect(t.room.phase).toBe("guess");
    expect(t.act(mr, "guess", { word: ` ${t.villagerWord().toUpperCase()}S ` }).ok).toBe(true);
    expect(t.s.reveal?.outcome.winner).toBe("mr_white");
    // Guessing the Wolves' word does not count.
    const t2 = new Table(11, 5);
    t2.start();
    t2.allSee();
    t2.roundVotingOut(t2.of("mr_white")[0]);
    const ucWord = t2.priv[t2.of("wolf")[0]].word as string;
    t2.act(t2.of("mr_white")[0], "guess", { word: ucWord });
    expect(t2.room.phase).toBe("out");
  });

  it("the hidden players win when only one Villager is left", () => {
    const t = new Table(12, 5); // 3 Villagers, 1 Wolf, Mr White
    t.start();
    t.allSee();
    const [c1, c2] = t.of("villager");
    t.roundVotingOut(c1);
    t.act("mum", "next_round");
    t.roundVotingOut(c2);
    expect(t.room.phase).toBe(RESULTS);
    expect(t.s.reveal?.outcome).toEqual({ winner: "hidden", how: "survived" });
  });

  it("plays to the end from the lobby and back, through the room engine", () => {
    const t = new Table(13, 3); // 2 Villagers, 1 Wolf, no Mr White
    t.start();
    t.allSee();
    t.roundVotingOut(t.of("wolf")[0]);
    expect(t.room.phase).toBe(RESULTS);
    expect(t.s.reveal?.outcome.winner).toBe("villagers");
    expect(t.act("mum", "back_to_lobby").ok).toBe(true);
    expect(t.room.phase).toBe(LOBBY);
    t.start();
    expect(t.room.phase).toBe("reveal");
  });
});

describe("Mr White: word checks", () => {
  it("matches words forgivingly and spots clues too close to a word", () => {
    expect(sameWord("Shark", "sharks")).toBe(true);
    expect(sameWord("ice-cream", "Ice Cream")).toBe(true);
    expect(sameWord("", "")).toBe(false);
    expect(tooClose("sharky", "shark")).toBe(true);
    expect(tooClose("cream", "ice cream")).toBe(true);
    expect(tooClose("catch", "cat")).toBe(false);
    expect(tooClose("fins", "shark")).toBe(false);
  });

  it("has a clean, unique word list", () => {
    const all = MR_WHITE_PAIRS.flat();
    expect(MR_WHITE_PAIRS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(all.map((w) => w.toLowerCase())).size).toBe(all.length);
    for (const [a, b] of MR_WHITE_PAIRS) expect(sameWord(a, b)).toBe(false);
  });
});
