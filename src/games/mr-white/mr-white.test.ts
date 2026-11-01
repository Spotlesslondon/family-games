import { describe, expect, it } from "vitest";
import { applyPrivate, applyWrite } from "@/engine/apply";
import { LOBBY, RESULTS, applyRoomAction } from "@/engine/room";
import { seededRng } from "@/engine/rng";
import type { GameContext, Player, PrivateMap, RoomSnapshot } from "@/engine/types";
import { MR_WHITE, sameWord, type MrWhiteState } from "./index";
import { MR_WHITE_WORDS } from "./words";

const people: Player[] = [
  { id: "mum", name: "Mum", ageBand: "16+", role: "owner" },
  { id: "kid", name: "Kid", ageBand: "6-8", role: "member" },
  { id: "teen", name: "Teen", ageBand: "12-15", role: "member" },
  { id: "nan", name: "Nan", ageBand: "16+", role: "adult" },
];

/** A table of phones playing through the real room engine. */
class Table {
  room: RoomSnapshot;
  priv: PrivateMap = {};
  private rng: () => number;

  constructor(seed = 1, who = people) {
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
      members: who.map((p) => ({ id: p.id, connected: true })),
    };
  }

  act(actorId: string, type: string, payload?: Record<string, unknown>) {
    const ctx: GameContext = { room: this.room, players: people, private: this.priv, now: "2026-11-01T21:00:00.000Z", rng: this.rng };
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
  get mr() {
    return Object.keys(this.priv).find((id) => this.priv[id].role === "mr_white")!;
  }
  get word() {
    return Object.values(this.priv).find((p) => p.role === "player")!.word as string;
  }
  ids() {
    return this.room.members.map((m) => m.id);
  }

  start() {
    expect(this.act("mum", "start_game", { gameId: MR_WHITE }).ok).toBe(true);
  }
  allSee() {
    for (const id of this.ids()) this.act(id, "seen");
  }
  oneRoundOfClues() {
    for (const id of [...this.s.order]) expect(this.act(id, "clue_done", { turn: this.s.turn }).ok).toBe(true);
  }
  /** Everyone votes for target, except target, who votes for someone else. */
  everyoneVotes(target: string) {
    for (const id of this.ids()) {
      const choice = id === target ? this.ids().find((x) => x !== id)! : target;
      this.act(id, "vote", { memberId: choice });
    }
  }
}

describe("Mr White: the deal", () => {
  it("gives everyone the same word except exactly one Mr White, privately", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const t = new Table(seed);
      t.start();
      expect(t.room.phase).toBe("reveal");
      const roles = t.ids().map((id) => t.priv[id].role);
      expect(roles.filter((r) => r === "mr_white")).toHaveLength(1);
      const words = new Set(t.ids().filter((id) => id !== t.mr).map((id) => t.priv[id].word));
      expect(words.size).toBe(1);
      expect(MR_WHITE_WORDS).toContain(t.word);
      expect(t.priv[t.mr].word).toBeUndefined();
      // Nothing secret in the state every phone and the TV can read.
      expect(JSON.stringify(t.room.state)).not.toContain(`"${t.word}"`);
      expect(JSON.stringify(t.room.state)).not.toContain("mr_white");
    }
  });

  it("never lets Mr White speak first", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const t = new Table(seed);
      t.start();
      expect(t.s.order[0]).not.toBe(t.mr);
      expect([...t.s.order].sort()).toEqual(t.ids().sort());
    }
  });

  it("needs three players", () => {
    const t = new Table(1, people.slice(0, 2));
    expect(t.act("mum", "start_game", { gameId: MR_WHITE })).toEqual({ ok: false, reason: "too_few_players" });
  });
});

describe("Mr White: clues", () => {
  it("moves to clues once everyone has seen their word, or when the host says so", () => {
    const t = new Table();
    t.start();
    t.act("kid", "seen");
    expect(t.room.phase).toBe("reveal");
    expect(t.act("kid", "start_clues")).toEqual({ ok: false, reason: "host_only" });
    expect(t.act("mum", "start_clues").ok).toBe(true);
    expect(t.room.phase).toBe("clues");

    const u = new Table();
    u.start();
    u.allSee();
    expect(u.room.phase).toBe("clues");
  });

  it("goes round in order; only the speaker or the host moves it on; a double tap is ignored", () => {
    const t = new Table(3);
    t.start();
    t.allSee();
    const [first, second] = t.s.order;
    const other = t.s.order.find((id) => id !== first && id !== "mum")!;
    expect(t.act(other, "clue_done", { turn: 0 })).toEqual({ ok: false, reason: "not_your_turn" });
    expect(t.act(first, "clue_done", { turn: 0 }).ok).toBe(true);
    expect(t.s.turn).toBe(1);
    const again = t.act(first, "clue_done", { turn: 0 });
    expect(again.ok && again.noop).toBe(true);
    expect(t.s.turn).toBe(1);
    expect(t.act("mum", "clue_done", { turn: 1 }).ok).toBe(true); // host helps a stuck turn
    expect(t.s.order[t.s.turn]).not.toBe(second);
  });

  it("after a round the host picks another round or the vote", () => {
    const t = new Table();
    t.start();
    t.allSee();
    t.oneRoundOfClues();
    expect(t.room.phase).toBe("between");
    expect(t.s.rounds).toBe(1);
    expect(t.act("kid", "start_vote")).toEqual({ ok: false, reason: "host_only" });
    t.act("mum", "another_round");
    expect(t.room.phase).toBe("clues");
    t.oneRoundOfClues();
    expect(t.s.rounds).toBe(2);
    t.act("mum", "start_vote");
    expect(t.room.phase).toBe("vote");
  });
});

function toVote(seed = 1) {
  const t = new Table(seed);
  t.start();
  t.allSee();
  t.oneRoundOfClues();
  t.act("mum", "start_vote");
  return t;
}

describe("Mr White: the vote", () => {
  it("keeps votes secret until the end, and refuses voting for yourself", () => {
    const t = toVote();
    expect(t.act("kid", "vote", { memberId: "kid" })).toEqual({ ok: false, reason: "cannot_vote_for_self" });
    t.act("kid", "vote", { memberId: "nan" });
    expect(t.s.voted).toEqual(["kid"]);
    expect(JSON.stringify(t.room.state)).not.toContain("nan\"}");
    expect(t.priv.kid.vote).toBe("nan");
  });

  it("caught Mr White guesses right and steals the win", () => {
    const t = toVote(5);
    t.everyoneVotes(t.mr);
    expect(t.room.phase).toBe("guess");
    const someoneElse = t.ids().find((id) => id !== t.mr)!;
    expect(t.act(someoneElse, "guess", { word: t.word })).toEqual({ ok: false, reason: "not_mr_white" });
    const word = t.word;
    t.act(t.mr, "guess", { word: `  ${word.toUpperCase()}s ` });
    expect(t.room.phase).toBe(RESULTS);
    expect(t.s.reveal?.outcome).toMatchObject({ winner: "mr_white", how: "guessed" });
    expect(t.s.reveal?.word).toBe(word);
    expect(t.s.reveal?.mrWhite).toBe(t.mr);
  });

  it("caught Mr White guesses wrong: everyone else wins", () => {
    const t = toVote(6);
    t.everyoneVotes(t.mr);
    t.act(t.mr, "guess", { word: "definitely not it" });
    expect(t.s.reveal?.outcome).toMatchObject({ winner: "players", how: "caught" });
  });

  it("picking the wrong person lets Mr White win", () => {
    const t = toVote(7);
    const innocent = t.ids().find((id) => id !== t.mr)!;
    t.everyoneVotes(innocent);
    expect(t.room.phase).toBe(RESULTS);
    expect(t.s.reveal?.outcome).toMatchObject({ winner: "mr_white", how: "wrong_person" });
    expect(t.s.picked).toBe(innocent);
  });

  it("a tie goes to one run-off; a second tie lets Mr White escape", () => {
    const t = toVote(8);
    const [a, b, c, d] = t.ids();
    // 2 votes each for a and b
    t.act(a, "vote", { memberId: b });
    t.act(b, "vote", { memberId: a });
    t.act(c, "vote", { memberId: a });
    t.act(d, "vote", { memberId: b });
    expect(t.room.phase).toBe("vote");
    expect(t.s.runoff).toBe(true);
    expect([...t.s.candidates].sort()).toEqual([a, b].sort());
    expect(t.s.voted).toEqual([]);
    expect(t.act(c, "vote", { memberId: d })).toEqual({ ok: false, reason: "not_a_candidate" });
    t.act(a, "vote", { memberId: b });
    t.act(b, "vote", { memberId: a });
    t.act(c, "vote", { memberId: a });
    t.act(d, "vote", { memberId: b });
    expect(t.room.phase).toBe(RESULTS);
    expect(t.s.reveal?.outcome).toMatchObject({ winner: "mr_white", how: "tie" });
  });

  it("the host can count the votes in without a phone that has died", () => {
    const t = toVote(9);
    const voters = t.ids().filter((id) => id !== "teen");
    for (const id of voters) t.act(id, "vote", { memberId: id === t.mr ? voters.find((x) => x !== id)! : t.mr });
    expect(t.room.phase).toBe("vote");
    expect(t.act("kid", "count_votes")).toEqual({ ok: false, reason: "host_only" });
    t.act("mum", "count_votes");
    expect(["guess", RESULTS]).toContain(t.room.phase);
  });
});

describe("Mr White: points", () => {
  it("Mr White wins 3; otherwise every other player gets 1", () => {
    const t = toVote(11);
    const innocent = t.ids().find((id) => id !== t.mr)!;
    const r = t.act(t.ids().find((id) => id !== innocent)!, "vote", { memberId: innocent }); // keep it going
    expect(r.ok).toBe(true);
    for (const id of t.ids()) if (!t.s.voted.includes(id)) t.act(id, "vote", { memberId: id === innocent ? t.mr : innocent });
    expect(t.s.reveal?.outcome.winner).toBe("mr_white");

    const u = toVote(12);
    u.everyoneVotes(u.mr);
    const res = (() => {
      const before = u.room;
      const rr = applyRoomAction(
        { room: before, players: people, private: u.priv, now: "2026-11-01T21:00:00.000Z", rng: seededRng(1) },
        { type: "guess", actorId: u.mr, payload: { word: "nope" } }
      );
      return rr.ok ? rr.write.scores : undefined;
    })();
    const byId = (a: { memberId: string }, b: { memberId: string }) => a.memberId.localeCompare(b.memberId);
    expect([...(res ?? [])].sort(byId)).toEqual(u.ids().filter((id) => id !== u.mr).map((id) => ({ memberId: id, rawPoints: 1 })).sort(byId));
  });
});

describe("matching a typed guess", () => {
  it("forgives case, spaces, punctuation and a plural", () => {
    expect(sameWord("Teddy Bear", "teddy bear")).toBe(true);
    expect(sameWord("teddybears", "teddy bear")).toBe(true);
    expect(sameWord("ice-cream!", "ice cream")).toBe(true);
    expect(sameWord("dogs", "dog")).toBe(true);
    expect(sameWord("cat", "dog")).toBe(false);
    expect(sameWord("", "dog")).toBe(false);
    expect(sameWord("!!!", "dog")).toBe(false);
  });
});
