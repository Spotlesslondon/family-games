import { describe, expect, it } from "vitest";
import { applyPrivate, applyWrite } from "@/engine/apply";
import { LOBBY, RESULTS, applyRoomAction } from "@/engine/room";
import { seededRng } from "@/engine/rng";
import type { GameContext, Player, PrivateMap, RoomSnapshot } from "@/engine/types";
import { buildMurder, type MurderCase } from "./case";
import { MURDER, caseFor } from "./index";
import type { Booklet, MurderPublic } from "./shape";
import "../index";

/**
 * Read the booklets the way a table would, from the words alone, and find who
 * it can be. Assume one player is lying (the murderer says their cover story)
 * and everyone else tells the truth; keep the worlds that hold together and
 * leave the liar unexplained. Your own word never clears you. Written apart
 * from the generator: it never sees the truth, only the text and the outfits.
 */
function solve(c: MurderCase, speakers: string[], assumeLiarAmong: boolean): string[] {
  const names = c.truth.guests.map((g) => g.name);
  const wear = Object.fromEntries(c.truth.guests.map((g) => [g.name, g.colour]));
  const found = Number(c.story.match(/At \d+:(\d\d), Hobbs/)![1]);
  const read = (who: string) => {
    const b = c.booklets[who];
    const places: { who: string; room: string; from: number; to: number; by: string }[] = [];
    let m = b.story.match(/^You were in the (.+?)(?: with (.+?)| on your own) from \d+:(\d\d) until \d+:(\d\d)\.$/);
    if (!m) throw new Error("unreadable story: " + b.story);
    places.push({ who, room: m[1], from: Number(m[3]), to: Number(m[4]), by: who });
    if (m[2]) places.push({ who: m[2], room: m[1], from: Number(m[3]), to: Number(m[4]), by: who });
    let alive: number | null = null;
    let thread: string | null = null;
    const l = b.clue.line;
    if ((m = l.match(/messaged you at \d+:(\d\d)/))) alive = Number(m[1]);
    for (const x of l.matchAll(/Hall camera, \d+:(\d\d): (.+?) walks into the library(?:, and out again at \d+:(\d\d))?\./g)) {
      places.push({ who: x[2], room: "library", from: Number(x[1]), to: Number(x[3] ?? x[1]), by: who });
    }
    if ((m = l.match(/^An? (\w+) wool thread caught on the library armchair\.$/))) thread = m[1];
    return { places, alive, thread };
  };
  const world = (said: string[]) => {
    const r = said.map(read);
    const places = r.flatMap((x) => x.places);
    const alive = r.map((x) => x.alive).find((v) => v !== null) ?? null;
    const thread = r.map((x) => x.thread).find((v) => v !== null) ?? null;
    const clash = places.some((p) => places.some((q) => p.who === q.who && p.room !== q.room && p.from <= q.to && q.from <= p.to));
    const cleared = (x: string) =>
      (thread !== null && wear[x] !== thread) || (alive !== null && places.some((p) => p.who === x && p.by !== x && p.room !== "library" && p.from <= alive && p.to >= found));
    return { clash, cleared };
  };
  if (assumeLiarAmong) {
    return names.filter((liar) => {
      const w = world(speakers.filter((x) => x !== liar));
      return !w.clash && !w.cleared(liar);
    });
  }
  const w = world(speakers);
  return names.filter((x) => !speakers.includes(x) && !w.cleared(x));
}

describe("Murder at Ashworth Hall cases", () => {
  it("for 4 to 8 players, only the murderer's lie fits, and nobody can solve it from their own booklet", () => {
    for (let n = 4; n <= 8; n++) {
      for (let seed = 1; seed <= 300; seed++) {
        const c = buildMurder(seed, n);
        const t = c.truth;
        const names = t.guests.map((g) => g.name);
        expect(names.length).toBe(n);
        expect(buildMurder(seed, n)).toEqual(c);
        // All booklets read out loud: only one world holds, and its liar is the murderer.
        expect(solve(c, names, true), `${n}/${seed}`).toEqual([t.murderer]);
        // One innocent's booklet plus the outfits never narrows it to one person.
        for (const g of names.filter((x) => x !== t.murderer)) expect(solve(c, [g], false).length, `${n}/${seed} ${g} alone`).toBeGreaterThan(1);
        // The murderer's cover story is caught out by the camera.
        expect(c.booklets[t.murderer].story).toContain("on your own");
        const cam = names.find((x) => c.booklets[x].clue.line.includes(`${t.murderer} walks into the library`));
        expect(cam).toBeDefined();
        expect(cam).not.toBe(t.murderer);
        // The thread matches the murderer and at least one innocent, so the thread alone is not enough.
        const colour = t.guests.find((g) => g.name === t.murderer)!.colour;
        expect(t.guests.filter((g) => g.colour === colour).length).toBeGreaterThan(1);
        // Plain words: no "a" before a vowel, no em dash.
        for (const b of Object.values(c.booklets)) for (const line of [b.story, b.clue.line, b.secret]) expect(line).not.toMatch(/—|\ba [aeiou]/i);
        for (const w of c.why) expect(w).not.toMatch(/—|\ba [aeiou]/i);
        expect(c.why[0].startsWith(`${t.murderer} did it.`)).toBe(true);
        expect(c.why.length).toBe(n);
      }
    }
  });
});

const people: Player[] = ["mum", "dad", "kid", "nan", "teen"].map((id, i) => ({ id, name: id, ageBand: "16+", role: i === 0 ? "owner" : "member" }));

class Table {
  room: RoomSnapshot;
  priv: PrivateMap = {};
  rng = seededRng(9);
  constructor(public players = people) {
    this.room = { id: "room-1", version: 0, hostId: "mum", status: "open", currentGame: null, phase: LOBBY, phaseEndsAt: null, state: {}, members: players.map((p) => ({ id: p.id, connected: true })) };
  }
  ctx(): GameContext {
    const secret = (label: string) => {
      let h = 0;
      for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      return (h % 100000) / 100001;
    };
    return { room: this.room, players: this.players, private: this.priv, now: "2026-11-21T20:00:00.000Z", rng: this.rng, secret };
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
  b(id: string) {
    return this.priv[id] as unknown as Booklet & { vote?: string };
  }
  murdererId() {
    const { c, playerOf } = caseFor(this.ctx(), this.s);
    return playerOf[c.truth.murderer];
  }
}

describe("Murder at Ashworth Hall game", () => {
  it("needs four players", () => {
    const t = new Table(people.slice(0, 3));
    expect(t.act("mum", "start_game", { gameId: MURDER }).ok).toBe(false);
  });

  it("deals booklets in stages, tells only the murderer, and never puts who in the public state", () => {
    const t = new Table();
    t.act("mum", "start_game", { gameId: MURDER });
    expect(t.room.phase).toBe("briefing");
    expect(t.act("kid", "next").ok).toBe(false);
    t.act("mum", "next");
    expect(t.room.phase).toBe("introductions");
    const m = t.murdererId();
    for (const p of people) {
      expect(t.b(p.id).murderer).toBe(p.id === m);
      expect(t.b(p.id).story).toBe("");
      expect(t.b(p.id).clue).toBeNull();
    }
    expect(Object.keys(t.s.cast).sort()).toEqual(people.map((p) => p.id).sort());
    const text = JSON.stringify(t.room.state);
    expect(text).not.toContain("murderer\":true");
    expect(text).not.toContain("wool thread");
    t.act("mum", "next", { round: 1 });
    expect(t.room.phase).toBe("alibis");
    for (const p of people) expect(t.b(p.id).story).toMatch(/^You were in the /);
    expect(t.b(people[1].id).clue).toBeNull();
    t.act("mum", "next", { round: 1 });
    expect(t.room.phase).toBe("evidence");
    for (const p of people) expect(t.b(p.id).clue).not.toBeNull();
    t.act("mum", "next", { round: 1 });
    expect(t.room.phase).toBe("vote");
  });

  it("catches the murderer on a clear vote and scores the innocents; a split vote lets them get away", () => {
    const t = new Table();
    t.act("mum", "start_game", { gameId: MURDER, options: { length: "normal" } });
    for (let i = 0; i < 4; i++) t.act("mum", "next", { round: 1 });
    expect(t.room.phase).toBe("vote");
    const m = t.murdererId();
    const someone = people.find((p) => p.id !== m)!.id;
    expect(t.act(m, "vote", { round: 1, player: m }).ok).toBe(false);
    for (const p of people) t.act(p.id, "vote", { round: 1, player: p.id === m ? someone : m });
    expect(t.room.phase).toBe("reveal");
    expect(t.s.last).toMatchObject({ caught: true, murdererId: m, accusedId: m });
    for (const p of people) expect(t.s.scores[p.id]).toBe(p.id === m ? 0 : 3);
    // Case 2: everyone votes for the next person round the table, a five-way tie.
    t.act("mum", "next", { round: 1 });
    for (let i = 0; i < 4; i++) t.act("mum", "next", { round: 2 });
    const m2 = t.murdererId();
    people.forEach((p, i) => t.act(p.id, "vote", { round: 2, player: people[(i + 1) % people.length].id }));
    expect(t.s.last).toMatchObject({ caught: false, accusedId: null, murdererId: m2 });
    expect(t.s.scores[m2]).toBe((m2 === m ? 0 : 3) + 5);
  });

  it("lets the host count the votes in for a quiet phone, and ends after the last case", () => {
    const t = new Table();
    t.act("mum", "start_game", { gameId: MURDER });
    for (let i = 0; i < 4; i++) t.act("mum", "next", { round: 1 });
    const m = t.murdererId();
    for (const p of people.slice(0, 3)) t.act(p.id, "vote", { round: 1, player: p.id === m ? people.find((x) => x.id !== m)!.id : m });
    expect(t.act("kid", "count_votes", { round: 1 }).ok).toBe(false);
    t.act("mum", "count_votes", { round: 1 });
    expect(t.room.phase).toBe("reveal");
    t.act("mum", "next", { round: 1 });
    expect(t.room.phase).toBe(RESULTS);
  });
});
