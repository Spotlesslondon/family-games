import { describe, expect, it } from "vitest";
import { applyPrivate, applyWrite } from "@/engine/apply";
import { LOBBY, RESULTS, applyRoomAction } from "@/engine/room";
import { seededRng } from "@/engine/rng";
import type { GameContext, Player, PrivateMap, RoomSnapshot } from "@/engine/types";
import { MURDER } from "./index";
import { checkSettings, defaultSettings, type MurderMine, type MurderPublic } from "./shape";
import { THEMES, art } from "./themes";
import "../index";

const names = ["mum", "dad", "kid", "nan", "teen", "gran", "uncle", "aunt", "cousin"];
const make = (n: number): Player[] => names.slice(0, n).map((id, i) => ({ id, name: id, ageBand: "16+", role: i === 0 ? "owner" : "member" }));

class Table {
  room: RoomSnapshot;
  priv: PrivateMap = {};
  rng = seededRng(11);
  clock = Date.parse("2026-11-22T20:00:00.000Z");
  constructor(public players: Player[]) {
    this.room = { id: "room-1", version: 0, hostId: "mum", status: "open", currentGame: null, phase: LOBBY, phaseEndsAt: null, state: {}, members: players.map((p) => ({ id: p.id, connected: true })) };
  }
  ctx(): GameContext {
    return { room: this.room, players: this.players, private: this.priv, now: new Date(this.clock).toISOString(), rng: this.rng };
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
    return this.room.state as unknown as MurderPublic;
  }
  me(id: string) {
    return this.priv[id] as unknown as MurderMine;
  }
  get murderers() {
    return this.players.map((p) => p.id).filter((id) => this.me(id).role === "murderer");
  }
  get targets() {
    return this.me(this.murderers[0]).targets!;
  }
  get plain() {
    // Guests who are not targets, still in the game.
    return this.s.alive.filter((id) => !this.murderers.includes(id) && !this.targets.includes(id));
  }
  start(n: number, options: Record<string, unknown> = {}) {
    const r = this.act("mum", "start_game", { gameId: MURDER, options });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(this.room.phase).toBe("roles");
    this.act("mum", "next", { day: 0 });
    expect(this.room.phase).toBe("night");
    return n;
  }
  /** Everyone still in presses "Ready for morning". */
  dawn() {
    this.clock += 60_000;
    const day = this.s.day;
    for (const id of this.s.alive) if (this.room.phase === "night") this.act(id, "ready", { day });
  }
  /** Everyone makes a night choice; the murderers all choose `pick`; then the night clock runs out. */
  night(pick: Record<string, unknown>) {
    const day = this.s.day;
    const guarding = this.s.settings.cards.guard;
    for (const id of this.s.alive) {
      if (this.murderers.includes(id)) this.act(id, "night_pick", { day, ...pick });
      else this.act(id, "night_pick", { day, action: guarding ? "guard" : "suspect", player: this.s.alive.find((x) => x !== id) });
    }
    this.dawn();
  }
  /** Everyone still in votes for `who` (who votes for someone else). */
  voteOut(who: string) {
    const day = this.s.day;
    for (const id of this.s.alive) {
      const must = this.me(id).mustVote;
      const choice = must && must !== id && this.s.alive.includes(must) ? must : id === who ? this.s.alive.find((x) => x !== id)! : who;
      const r = this.act(id, "vote", { day, player: choice });
      expect(r.ok, `${id} -> ${choice} ${JSON.stringify(r)}`).toBe(true);
    }
  }
}

describe("Ashworth Hall settings", () => {
  it("blocks settings that cannot work and warns on lopsided ones", () => {
    expect(checkSettings(4, defaultSettings(4)).ok).toBe(false);
    expect(checkSettings(5, { ...defaultSettings(5), murderers: 3 }).ok).toBe(false);
    expect(checkSettings(6, { ...defaultSettings(6), targets: 5 }).ok).toBe(false);
    expect(checkSettings(9, { ...defaultSettings(9), murderers: 1, targets: 4 })).toMatchObject({ ok: true, warning: "Very hard for the murderers" });
    expect(checkSettings(8, defaultSettings(8))).toEqual({ ok: true });
    const t = new Table(make(5));
    expect(t.act("mum", "start_game", { gameId: MURDER, options: { murderers: 3 } }).ok).toBe(false);
    expect(new Table(make(4)).act("mum", "start_game", { gameId: MURDER }).ok).toBe(false);
  });
});

describe("Ashworth Hall themes", () => {
  it("stores the chosen theme, falls back to the manor, and keeps house style", () => {
    const t = new Table(make(6));
    t.start(6, { theme: "wizards" });
    expect(t.s.settings.theme).toBe("wizards");
    const u = new Table(make(6));
    u.start(6, { theme: "pirates" });
    expect(u.s.settings.theme).toBe("manor");
    for (const w of Object.values(THEMES)) {
      const text = JSON.stringify(w) + w.killed("Ben", false) + w.silenced("Ben", true);
      expect(text).not.toMatch(/\u2014|\u2013/);
      expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    }
    expect(art("apprentice")).toBe("an apprentice");
    expect(art("guest")).toBe("a guest");
  });
});

describe("Ashworth Hall secrecy", () => {
  it("tells murderers each other and their targets, tells guests nothing, and keeps it all out of public state", () => {
    const t = new Table(make(8));
    t.start(8, { murderers: 2, targets: 2 });
    expect(t.murderers.length).toBe(2);
    for (const m of t.murderers) {
      expect(t.me(m).partners).toEqual(t.murderers.filter((x) => x !== m));
      expect(t.me(m).targets!.length).toBe(2);
      for (const x of t.me(m).targets!) expect(t.murderers).not.toContain(x);
    }
    for (const g of t.s.team.filter((id) => !t.murderers.includes(id))) {
      expect(t.me(g)).toMatchObject({ role: "guest" });
      expect(t.me(g).targets).toBeUndefined();
      expect(t.me(g).partners).toBeUndefined();
    }
    const text = JSON.stringify(t.room.state);
    expect(text).not.toContain("\"role\"");
    expect(text).not.toContain("partners");
    expect(t.s.endReveal).toBeNull();
    // Night readiness is a count, never a list of names.
    t.act(t.plain[0], "night_pick", { day: 1, action: "suspect", player: t.murderers[0] });
    expect(t.s.nightReady).toBe(1);
    expect(JSON.stringify(t.room.state)).not.toContain("suspect");
  });
});

describe("Ashworth Hall nights", () => {
  it("waits for the murderers to agree, then kills; a target cannot be killed; kills run out", () => {
    const t = new Table(make(8));
    t.start(8, { murderers: 2, targets: 2, killsEach: 1 });
    const [a, b] = t.murderers;
    const victim = t.plain[0];
    expect(t.act(a, "night_pick", { day: 1, action: "kill", player: t.targets[0] }).ok).toBe(false);
    expect(t.act(a, "night_pick", { day: 1, action: "kill", player: b }).ok).toBe(false);
    expect(t.act(t.plain[1], "night_pick", { day: 1, action: "kill", player: victim }).ok).toBe(false);
    for (const id of t.s.alive.filter((x) => x !== a && x !== b)) t.act(id, "night_pick", { day: 1, action: "suspect", player: a });
    t.act(a, "night_pick", { day: 1, action: "kill", player: victim });
    t.act(b, "night_pick", { day: 1, action: "silence", player: victim });
    expect(t.room.phase).toBe("night");
    expect(t.me(a).partnerPicks![b]).toMatchObject({ action: "silence" });
    t.act(b, "night_pick", { day: 1, action: "kill", player: victim });
    // Everyone has chosen, but morning waits for the night clock.
    expect(t.room.phase).toBe("night");
    t.dawn();
    expect(t.room.phase).toBe("day");
    expect(t.s.morning).toEqual({ killed: victim, silenced: null, blackmail: false, guarded: null });
    expect(t.s.alive).not.toContain(victim);
    expect(t.s.killsLeft).toBe(1);
    // Day 1 vote: a tie sends nobody away.
    t.act("mum", "next", { day: 1 });
    expect(t.room.phase).toBe("vote");
    const alive = t.s.alive;
    alive.forEach((id, i) => t.act(id, "vote", { day: 1, player: alive[(i + 1) % alive.length] }));
    expect(t.room.phase).toBe("reveal");
    expect(t.s.votes[0].out).toBeNull();
    expect(t.s.votes[0].entries.length).toBe(alive.length);
    t.act("mum", "next", { day: 1 });
    t.night({ action: "kill", player: t.plain[0] });
    expect(t.s.killsLeft).toBe(0);
    t.act("mum", "next", { day: 2 });
    if (t.room.phase === "election") {
      for (const id of t.s.alive) t.act(id, "elect", { round: 1, player: t.s.alive.find((x) => x !== id) });
      if (t.room.phase === "election") for (const id of t.s.alive) t.act(id, "elect", { round: 2, player: t.s.election!.candidates!.find((x) => x !== id) });
      t.act("mum", "next", { day: 2 });
    }
    expect(t.room.phase).toBe("vote");
    t.act("mum", "count_votes", { day: 2 });
  });

  it("silences and blackmails in the open; a blackmailed guest must vote as told", () => {
    const t = new Table(make(6));
    t.start(6, { murderers: 1, targets: 1, cards: { pardon: false, showdown: false } });
    const [m] = t.murderers;
    t.night({ action: "silence", player: t.plain[0] });
    expect(t.s.morning).toEqual({ killed: null, silenced: t.plain[0], blackmail: false, guarded: null });
    expect(t.s.silenced).toBe(t.plain[0]);
    t.act("mum", "next", { day: 1 });
    const sent = t.plain[1];
    t.voteOut(sent);
    expect(t.s.votes[0]).toMatchObject({ out: sent, role: "guest" });
    t.act("mum", "next", { day: 1 });
    expect(t.s.silenced).toBeNull();
    const victim = t.plain[0];
    const forced = t.targets[0];
    t.night({ action: "blackmail", player: victim, voteFor: forced });
    expect(t.s.morning).toMatchObject({ blackmail: true });
    expect(t.s.blackmailToday).toBe(true);
    expect(t.me(victim).mustVote).toBe(forced);
    expect(JSON.stringify(t.room.state)).not.toContain(victim + "\",\"mustVote");
    t.act("mum", "next", { day: 2 });
    expect(t.act(victim, "vote", { day: 2, player: m }).ok).toBe(false);
    expect(t.act(victim, "vote", { day: 2, player: forced }).ok).toBe(true);
  });
});

describe("Ashworth Hall guarding", () => {
  it("two guards on the victim stop the kill and the kill is not used up; one guard does not", () => {
    const t = new Table(make(7));
    t.start(7, { murderers: 1, targets: 1, killsEach: 1, cards: { guard: true } });
    const [m] = t.murderers;
    const [victim, g1, g2, g3] = t.plain;
    const guests = t.s.alive.filter((id) => id !== m);
    // Guests cannot pick the murderers' action, guard themselves, or use the old decoy while guarding is on.
    expect(t.act(g1, "night_pick", { day: 1, action: "guard", player: g1 }).ok).toBe(false);
    expect(t.act(g1, "night_pick", { day: 1, action: "suspect", player: m }).ok).toBe(false);
    for (const id of guests) t.act(id, "night_pick", { day: 1, action: "guard", player: id === g1 || id === g2 ? victim : id === victim ? g3 : m });
    t.act(m, "night_pick", { day: 1, action: "kill", player: victim });
    t.dawn();
    expect(t.room.phase).toBe("day");
    expect(t.s.morning).toEqual({ killed: null, silenced: null, blackmail: false, guarded: victim });
    expect(t.s.alive).toContain(victim);
    expect(t.s.killsLeft).toBe(1);
    t.act("mum", "next", { day: 1 });
    // A tied day: nobody leaves, so the same victim is there tomorrow night.
    const [p0, p1] = t.s.alive;
    t.act(p0, "vote", { day: 1, player: p1 });
    t.act(p1, "vote", { day: 1, player: p0 });
    t.act("mum", "count_votes", { day: 1 });
    expect(t.s.votes[0].out).toBeNull();
    t.act("mum", "next", { day: 1 });
    expect(t.room.phase).toBe("night");
    // Night 2: only one guard on the victim, so the kill goes through.
    for (const id of t.s.alive.filter((x) => x !== m)) t.act(id, "night_pick", { day: 2, action: "guard", player: id === g1 ? victim : id === victim ? g1 : m });
    t.act(m, "night_pick", { day: 2, action: "kill", player: victim });
    t.dawn();
    expect(t.s.morning).toMatchObject({ killed: victim, guarded: null });
    expect(t.s.killsLeft).toBe(0);
  });

  it("with guarding switched off, guests make the old suspect choice and nothing is blocked", () => {
    const t = new Table(make(6));
    t.start(6, { murderers: 1, targets: 1, cards: { guard: false } });
    const [m] = t.murderers;
    const victim = t.plain[0];
    expect(t.act(t.plain[1], "night_pick", { day: 1, action: "guard", player: victim }).ok).toBe(false);
    for (const id of t.s.alive.filter((x) => x !== m)) t.act(id, "night_pick", { day: 1, action: "suspect", player: id === victim ? m : victim });
    t.act(m, "night_pick", { day: 1, action: "kill", player: victim });
    t.dawn();
    expect(t.s.morning).toMatchObject({ killed: victim, guarded: null });
  });

  it("moves on when more than half are ready (and the murderers agree), with no timer, and logs how long each took", () => {
    const t = new Table(make(6));
    t.start(6, { murderers: 2, targets: 1 });
    const [a, b] = t.murderers;
    const guests = t.s.alive.filter((x) => x !== a && x !== b);
    expect(t.room.phaseEndsAt).toBeNull();
    // Murderers disagree, and everyone is ready: still night.
    t.act(a, "night_pick", { day: 1, action: "nothing" });
    t.act(b, "night_pick", { day: 1, action: "silence", player: guests[0] });
    t.clock += 95_000;
    for (const id of t.s.alive) t.act(id, "ready", { day: 1 });
    expect(t.room.phase).toBe("night");
    // They agree: morning comes at once, and the night's length is logged.
    t.act(b, "night_pick", { day: 1, action: "nothing" });
    expect(t.room.phase).toBe("day");
    expect(t.s.timings).toEqual([{ phase: "night", day: 1, seconds: 95 }]);
    // Day: exactly half ready is not enough; one more opens the vote.
    t.clock += 240_000;
    for (const id of t.s.alive.slice(0, 3)) t.act(id, "ready", { day: 1 });
    expect(t.room.phase).toBe("day");
    // Pressing again takes it back.
    t.act(t.s.alive[0], "ready", { day: 1, ready: false });
    expect(t.s.ready.length).toBe(2);
    t.act(t.s.alive[0], "ready", { day: 1 });
    t.act(t.s.alive[3], "ready", { day: 1 });
    expect(t.room.phase).toBe("vote");
    expect(t.s.timings[1]).toEqual({ phase: "day", day: 1, seconds: 240 });
    expect(t.s.ready).toEqual([]);
    // Night 2: murderers agree first, then the majority readies.
    const [p0, p1] = t.s.alive;
    t.act(p0, "vote", { day: 1, player: p1 });
    t.act(p1, "vote", { day: 1, player: p0 });
    t.act("mum", "count_votes", { day: 1 });
    t.act("mum", "next", { day: 1 });
    expect(t.room.phase).toBe("night");
    t.act(a, "night_pick", { day: 2, action: "nothing" });
    t.act(b, "night_pick", { day: 2, action: "nothing" });
    expect(t.room.phase).toBe("night");
    for (const id of t.s.alive.slice(0, 4)) t.act(id, "ready", { day: 2 });
    expect(t.room.phase).toBe("day");
    // Players who are out cannot press ready.
    expect(t.act("mum", "ready", { day: 2 }).ok === false || t.s.alive.includes("mum")).toBe(true);
  });
});

describe("Ashworth Hall night messages", () => {
  it("delivers a named ready-made line to one player only, at night only, and keeps it out of public state", () => {
    const t = new Table(make(6));
    t.start(6, { murderers: 1, targets: 1 });
    const [m] = t.murderers;
    const [a, b, c] = t.plain;
    // A line that names a second player.
    expect(t.act(a, "whisper", { day: 1, to: b, line: 0, about: c }).ok).toBe(true);
    expect(t.me(b).inbox).toEqual([{ day: 1, from: a, to: b, line: 0, about: c }]);
    expect(t.me(a).sent).toEqual([{ day: 1, from: a, to: b, line: 0, about: c }]);
    expect(t.me(c).inbox ?? []).toEqual([]);
    expect(t.me(m).inbox ?? []).toEqual([]);
    // A plain line, from the murderer.
    expect(t.act(m, "whisper", { day: 1, to: a, line: 4 }).ok).toBe(true);
    expect(t.me(a).inbox).toEqual([{ day: 1, from: m, to: a, line: 4, about: null }]);
    const text = JSON.stringify(t.room.state);
    expect(text).not.toContain("inbox");
    expect(text).not.toContain("whisper");
    // Rules: no free text, no unknown lines, no missing or extra names, not to yourself.
    expect(t.act(a, "whisper", { day: 1, to: b, line: 0 }).ok).toBe(false);
    expect(t.act(a, "whisper", { day: 1, to: b, line: 4, about: c }).ok).toBe(false);
    expect(t.act(a, "whisper", { day: 1, to: b, line: 99 }).ok).toBe(false);
    expect(t.act(a, "whisper", { day: 1, to: b, line: "you are the murderer" }).ok).toBe(false);
    expect(t.act(a, "whisper", { day: 1, to: a, line: 4 }).ok).toBe(false);
    // Up to ten a night.
    for (let i = 0; i < 9; i++) expect(t.act(a, "whisper", { day: 1, to: c, line: 5 }).ok).toBe(true);
    expect(t.act(a, "whisper", { day: 1, to: c, line: 5 }).ok).toBe(false);
    // Messages survive into the day, and cannot be sent by day.
    t.night({ action: "nothing" });
    expect(t.room.phase).toBe("day");
    expect(t.me(b).inbox!.length).toBe(1);
    // b has sent nothing, so only the night rule can stop this.
    expect(t.act(b, "whisper", { day: 1, to: a, line: 4 })).toMatchObject({ ok: false, reason: "night_only" });
    // A new night resets the count.
    t.act("mum", "next", { day: 1 });
    const [p0, p1] = t.s.alive;
    t.act(p0, "vote", { day: 1, player: p1 });
    t.act(p1, "vote", { day: 1, player: p0 });
    t.act("mum", "count_votes", { day: 1 });
    t.act("mum", "next", { day: 1 });
    expect(t.act(a, "whisper", { day: 2, to: c, line: 5 }).ok).toBe(true);
    expect(t.me(b).inbox!.length).toBe(1);
  });
});

describe("Ashworth Hall winning", () => {
  it("murderers win when every target is framed; votes are revealed name by name", () => {
    const t = new Table(make(6));
    t.start(6, { murderers: 1, targets: 1, cards: { pardon: false, showdown: false } });
    const [m] = t.murderers;
    t.night({ action: "nothing" });
    expect(t.s.morning).toEqual({ killed: null, silenced: null, blackmail: false, guarded: null });
    t.act("mum", "next", { day: 1 });
    const target = t.targets[0];
    t.voteOut(target);
    expect(t.room.phase).toBe("reveal");
    expect(t.s.votes[0]).toMatchObject({ out: target, role: "guest", target: true });
    expect(t.s.winner).toBe("murderers");
    expect(t.s.endReveal).toEqual({ murderers: [m], targets: [target] });
    expect(t.s.scores[m]).toBe(5);
    t.act("mum", "next", { day: 1 });
    expect(t.room.phase).toBe(RESULTS);
  });

  it("guests win when the murderer is sent away", () => {
    const t = new Table(make(6));
    t.start(6, { murderers: 1, targets: 1, cards: { pardon: false, showdown: false } });
    const [m] = t.murderers;
    t.night({ action: "nothing" });
    t.act("mum", "next", { day: 1 });
    t.voteOut(m);
    expect(t.s.votes[0]).toMatchObject({ out: m, role: "murderer", target: false });
    expect(t.s.winner).toBe("guests");
    for (const id of t.s.team) expect(t.s.scores[id]).toBe(id === m ? 0 : 3);
  });
});

describe("Ashworth Hall guest cards", () => {
  it("elects a holder in two rounds on day 2, who can pardon once and must pass the card on leaving", () => {
    const t = new Table(make(8));
    t.start(8, { murderers: 2, targets: 2, cards: { kill: false, pardon: true, showdown: false } });
    t.night({ action: "nothing" });
    t.act("mum", "next", { day: 1 });
    expect(t.room.phase).toBe("vote");
    t.act("mum", "count_votes", { day: 1 });
    expect(t.act("mum", "count_votes", { day: 1 }).ok).toBe(false);
    t.voteOut(t.plain[0]);
    t.act("mum", "next", { day: 1 });
    t.night({ action: "nothing" });
    t.act("mum", "next", { day: 2 });
    expect(t.room.phase).toBe("election");
    // Round 1: votes split three ways, so the top two go to a run-off.
    const alive = t.s.alive;
    const [x, y, z] = alive;
    alive.forEach((id, i) => t.act(id, "elect", { round: 1, player: i < 3 ? (id === x ? y : x) : i < 5 ? (id === y ? z : y) : z === id ? x : z }));
    expect(t.s.election!.round).toBe(2);
    expect(t.s.election!.candidates!.length).toBeGreaterThanOrEqual(2);
    const cands = t.s.election!.candidates!;
    for (const id of alive) t.act(id, "elect", { round: 2, player: cands[0] === id ? cands[1] : cands[0] });
    expect(t.room.phase).toBe("day");
    const holder = t.s.cardHolder!;
    expect(cands).toContain(holder);
    // Pardon: the house votes someone out, the holder pardons them.
    t.act("mum", "next", { day: 2 });
    const accused = t.s.alive.find((id) => id !== holder)!;
    t.voteOut(accused);
    expect(t.room.phase).toBe("pardon");
    expect(t.s.votes[t.s.votes.length - 1].role).toBeNull();
    expect(t.act(accused, "pardon", { day: 2, use: true }).ok).toBe(false);
    t.act(holder, "pardon", { day: 2, use: true });
    expect(t.room.phase).toBe("reveal");
    expect(t.s.alive).toContain(accused);
    expect(t.s.votes[t.s.votes.length - 1]).toMatchObject({ pardoned: true, role: null });
    expect(t.s.pardonUsed).toBe(true);
    if (t.s.winner) return;
    // The holder is sent away next day and must hand the card on before the game moves.
    t.act("mum", "next", { day: 2 });
    t.night({ action: "nothing" });
    t.act("mum", "next", { day: 3 });
    t.voteOut(holder);
    expect(t.room.phase).toBe("reveal");
    if (t.s.winner) return;
    expect(t.s.passing).toBe(holder);
    expect(t.act("mum", "next", { day: 3 }).ok).toBe(false);
    t.act(holder, "pass_card", { player: t.s.alive[0] });
    expect(t.s.cardHolder).toBe(t.s.alive[0]);
    expect(t.act("mum", "next", { day: 3 }).ok).toBe(true);
  });

  it("showdown limits the vote to the holder and the player they name", () => {
    const t = new Table(make(6));
    t.start(6, { murderers: 1, targets: 1, cards: { kill: false, pardon: false, showdown: true } });
    t.night({ action: "nothing" });
    t.act("mum", "next", { day: 1 });
    t.act("mum", "count_votes", { day: 1 });
    t.voteOut(t.plain[0]);
    if (t.s.winner) return;
    t.act("mum", "next", { day: 1 });
    t.night({ action: "nothing" });
    t.act("mum", "next", { day: 2 });
    for (const id of t.s.alive) t.act(id, "elect", { round: 1, player: t.s.alive.find((x) => x !== id && x !== "mum") ?? "mum" });
    if (t.room.phase === "election") for (const id of t.s.alive) t.act(id, "elect", { round: 2, player: t.s.election!.candidates!.find((x) => x !== id) });
    expect(t.room.phase).toBe("day");
    const holder = t.s.cardHolder!;
    const opp = t.s.alive.find((x) => x !== holder)!;
    const other = t.s.alive.find((x) => x !== holder && x !== opp)!;
    expect(t.act(other, "showdown", { day: 2, player: opp }).ok).toBe(false);
    t.act(holder, "showdown", { day: 2, player: opp });
    expect(t.room.phase).toBe("vote");
    expect(t.s.votes[t.s.votes.length - 1].showdown).toEqual({ caller: holder, opponent: opp });
    expect(t.act(other, "vote", { day: 2, player: t.s.alive.find((x) => x !== holder && x !== opp && x !== other) }).ok).toBe(false);
    expect(t.act(other, "vote", { day: 2, player: opp }).ok).toBe(true);
    const before = t.room.version;
    t.act(holder, "showdown", { day: 2, player: opp });
    expect(t.room.version).toBe(before);
    expect(t.s.showdownUsed).toBe(true);
  });
});
