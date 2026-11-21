import { describe, expect, it } from "vitest";
import { applyPrivate, applyWrite } from "@/engine/apply";
import { LOBBY, RESULTS, applyRoomAction } from "@/engine/room";
import { seededRng } from "@/engine/rng";
import type { GameContext, Player, PrivateMap, RoomSnapshot } from "@/engine/types";
import { buildCase, type Case } from "./case";
import { DETECTIVE, dealRoles } from "./index";
import { LEVELS, type DetectiveLevel, type DetectiveMine, type DetectivePublic, type Evidence, type RoleKey } from "./shape";
import "../index";

/**
 * Solve a case the way a table would, from the words alone. Read every line
 * the given roles hold into facts, then rule suspects out the only two ways
 * the game allows. Returns who is left. Independent of the generator: it
 * never sees the truth, only the text.
 */
function solveFromText(suspects: string[], evidence: Evidence[]): string[] {
  const mins = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const seen: number[] = [];
  const gone: number[] = [];
  const stays: { who: string; from: number; to: number }[] = [];
  const wear: Record<string, string> = {};
  let thread: string | null = null;
  let m: RegExpMatchArray | null;
  for (const e of evidence) {
    for (const line of e.lines) {
      if ((m = line.match(/^Photo, (\d+:\d\d): the .+ is on the .+\.$/))) seen.push(mins(m[1]));
      else if ((m = line.match(/^Photo, (\d+:\d\d): the .+ is empty\.$/))) gone.push(mins(m[1]));
      else if ((m = line.match(/^The garage has no other door\. (.+)'s key fob opened it at (\d+:\d\d), and (.+) left at (\d+:\d\d)\.$/))) {
        expect(m[3]).toBe(m[1]);
        stays.push({ who: m[1], from: mins(m[2]), to: mins(m[4]) });
      } else if ((m = line.match(/^The neighbour watched the garden: (.+) was in the garden from (\d+:\d\d) until (\d+:\d\d)\.$/))) stays.push({ who: m[1], from: mins(m[2]), to: mins(m[3]) });
      else if ((m = line.match(/^(.+) says: I was (?:upstairs|in the loft) from (\d+:\d\d) until (\d+:\d\d)\.$/))) stays.push({ who: m[1], from: mins(m[2]), to: mins(m[3]) });
      else if ((m = line.match(/^(.+) is wearing a (\w+) (scarf|hat|jumper|cardigan)\.$/))) wear[m[1]] = m[2];
      else if ((m = line.match(/^A (\w+) wool thread caught on the .+\.$/))) thread = m[1];
      // Everything else is flavour: who walked where, marks at the scene.
    }
  }
  const window = seen.length && gone.length ? { from: Math.max(...seen.filter((t) => t < Math.min(...gone))), to: Math.min(...gone) } : null;
  return suspects.filter((s) => {
    const alibi = window !== null && stays.some((x) => x.who === s && x.from <= window.from && x.to >= window.to);
    const wrongColour = thread !== null && wear[s] !== undefined && wear[s] !== thread;
    return !alibi && !wrongColour;
  });
}

const ROLES: RoleKey[] = ["cctv", "witness", "records", "forensics"];
const all = (c: Case) => ROLES.map((r) => c.evidence[r]);

describe("Detective cases", () => {
  it("at both levels, every case names exactly the culprit from the words, and no one role names them alone", () => {
    for (const level of [1, 2] as DetectiveLevel[]) {
      for (let seed = 1; seed <= 1000; seed++) {
        const c = buildCase(seed, level);
        const t = c.truth;
        expect(buildCase(seed, level)).toEqual(c);
        expect(t.suspects.length).toBe(LEVELS[level].suspects);
        // Together: only the culprit is left.
        expect(solveFromText(t.suspects, all(c)), `${level}/${seed}`).toEqual([t.culprit]);
        // Alone: no role narrows it to one person.
        for (const r of ROLES) expect(solveFromText(t.suspects, [c.evidence[r]]).length, `${level}/${seed} ${r} alone`).toBeGreaterThan(1);
        // Every innocent is ruled out by a stated fact of the kind the reveal says.
        for (const s of t.suspects.filter((x) => x !== t.culprit)) {
          const without = solveFromText(t.suspects, all(c).map((e) => (t.ruledOut[s] === "alibi" ? (e.role === "forensics" ? { ...e, lines: [] } : e) : e.role === "records" || e.role === "witness" ? { ...e, lines: [] } : e)));
          // Clearing by one route alone still clears them.
          expect(without, `${level}/${seed} ${s} by ${t.ruledOut[s]}`).not.toContain(s);
        }
        // Both ways of ruling out are used in every case, so the table needs every role.
        expect(Object.values(t.ruledOut)).toContain("alibi");
        expect(Object.values(t.ruledOut)).toContain("thread");
        // The reveal names the culprit first and has a line per suspect.
        expect(c.why[0].startsWith(`${t.culprit} did it.`)).toBe(true);
        expect(c.why.length).toBe(t.suspects.length);
        // The trap: someone else is seen going into the room, before it went.
        const herring = t.visits.find((v) => v.who !== t.culprit)!;
        expect(herring.out!).toBeLessThan(t.lastSeen);
        expect(c.evidence.cctv.lines.filter((l) => l.includes(`walks into the ${t.theme.room}`)).length).toBeGreaterThanOrEqual(2);
        // Every line is plain: no "n of m", no em dash.
        for (const e of all(c)) for (const l of e.lines) expect(l).not.toMatch(/—/);
      }
    }
  });

  it("at level 2 the culprit has an alibi that stops inside the window, so the times matter", () => {
    let nearMiss = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const t = buildCase(seed, 2).truth;
      const stay = t.stays.find((s) => s.who === t.culprit);
      expect(stay).toBeDefined();
      expect(stay!.to).toBeGreaterThan(t.lastSeen);
      expect(stay!.to).toBeLessThan(t.goneBy);
      nearMiss++;
    }
    expect(nearMiss).toBe(200);
  });

  it("deals every role to someone and every player at least one role, for 2 to 8 players", () => {
    for (let n = 2; n <= 8; n++) {
      const team = Array.from({ length: n }, (_, i) => `p${i}`);
      const roles = dealRoles(team, seededRng(n));
      expect(Object.keys(roles).sort()).toEqual([...team].sort());
      for (const id of team) expect(roles[id].length).toBeGreaterThan(0);
      expect(new Set(Object.values(roles).flat())).toEqual(new Set(ROLES));
    }
  });
});

const everyone: Player[] = [
  { id: "mum", name: "Mum", ageBand: "16+", role: "owner" },
  { id: "kid", name: "Kid", ageBand: "6-8", role: "member" },
  { id: "teen", name: "Teen", ageBand: "12-15", role: "member" },
];

class Table {
  room: RoomSnapshot;
  priv: PrivateMap = {};
  rng = seededRng(5);
  constructor(public players = everyone) {
    this.room = { id: "room-1", version: 0, hostId: "mum", status: "open", currentGame: null, phase: LOBBY, phaseEndsAt: null, state: {}, members: players.map((p) => ({ id: p.id, connected: true })) };
  }
  ctx(): GameContext {
    const secret = (label: string) => {
      let h = 0;
      for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      return (h % 100000) / 100001;
    };
    return { room: this.room, players: this.players, private: this.priv, now: "2026-11-21T18:00:00.000Z", rng: this.rng, secret };
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
    return this.room.state as unknown as DetectivePublic;
  }
  truth() {
    const u = this.ctx().secret!(`detective:${this.s.nonce}`);
    return buildCase(Math.floor(u * 4294967296), this.s.settings.level);
  }
}

describe("Detective game", () => {
  it("opens on a briefing, deals each player only their own evidence, and never leaks the culprit", () => {
    const t = new Table();
    expect(t.act("mum", "start_game", { gameId: DETECTIVE, options: { level: 1 } }).ok).toBe(true);
    expect(t.room.phase).toBe("briefing");
    expect(t.act("kid", "open").ok).toBe(false);
    t.act("mum", "open");
    expect(t.room.phase).toBe("investigating");
    const c = t.truth();
    const held = new Set<string>();
    for (const p of everyone) {
      const mine = t.priv[p.id] as unknown as DetectiveMine;
      expect(mine.evidence.length).toBeGreaterThan(0);
      expect(mine.evidence.map((e) => e.role)).toEqual(t.s.roles[p.id]);
      for (const e of mine.evidence) {
        expect(e).toEqual(c.evidence[e.role]);
        held.add(e.role);
      }
    }
    expect(held.size).toBe(4);
    // The public state has the suspects in name order and nothing that marks the culprit.
    expect(t.s.case!.suspects).toEqual([...c.truth.suspects].sort());
    const text = JSON.stringify(t.room.state);
    expect(text).not.toContain("culprit");
    expect(text).not.toContain("wool thread");
  });

  it("settles when everyone agrees, scores a right accusation with the no-hint point, and moves to the next case", () => {
    const t = new Table();
    t.act("mum", "start_game", { gameId: DETECTIVE, options: { level: 2, length: "normal" } });
    t.act("mum", "open");
    const culprit = t.truth().truth.culprit;
    t.act("kid", "propose", { round: 1, suspect: culprit });
    expect(t.s.proposal).toMatchObject({ suspect: culprit, by: "kid", agreed: ["kid"] });
    expect(t.act("teen", "agree", { round: 1, suspect: "Someone Else" }).ok).toBe(false);
    t.act("teen", "agree", { round: 1, suspect: culprit });
    expect(t.room.phase).toBe("investigating");
    t.act("mum", "agree", { round: 1, suspect: culprit });
    expect(t.room.phase).toBe("solved");
    expect(t.s.last).toMatchObject({ right: true, points: 4, culprit, accused: culprit });
    expect(t.s.last!.why.length).toBe(4);
    t.act("mum", "open", { round: 1 });
    expect(t.s.round).toBe(2);
    expect(t.room.phase).toBe("investigating");
  });

  it("a hint costs the bonus point; a wrong accusation scores nothing; the host can lock in for a quiet phone; three cases end the game", () => {
    const t = new Table();
    t.act("mum", "start_game", { gameId: DETECTIVE, options: { level: 1, length: "normal" } });
    t.act("mum", "open");
    t.act("teen", "hint", { round: 1 });
    expect(t.s.hintsUsed).toBe(1);
    let c = t.truth().truth;
    t.act("mum", "propose", { round: 1, suspect: c.culprit });
    t.act("kid", "agree", { round: 1, suspect: c.culprit });
    expect(t.act("kid", "lock_in", { round: 1 }).ok).toBe(false);
    t.act("mum", "lock_in", { round: 1 });
    expect(t.s.last).toMatchObject({ right: true, points: 3 });
    t.act("mum", "open", { round: 1 });
    c = t.truth().truth;
    const wrong = c.suspects.find((x) => x !== c.culprit)!;
    t.act("kid", "propose", { round: 2, suspect: wrong });
    t.act("teen", "agree", { round: 2, suspect: wrong });
    t.act("mum", "agree", { round: 2, suspect: wrong });
    expect(t.s.last).toMatchObject({ right: false, points: 0, culprit: c.culprit });
    t.act("mum", "open", { round: 2 });
    c = t.truth().truth;
    t.act("mum", "propose", { round: 3, suspect: c.culprit });
    t.act("mum", "lock_in", { round: 3 });
    t.act("mum", "open", { round: 3 });
    expect(t.room.phase).toBe(RESULTS);
    expect(t.s.score).toBe(7);
    expect(t.s.tally).toEqual({ solved: 2, escaped: 1 });
  });

  it("works with two players, each holding two roles", () => {
    const t = new Table(everyone.slice(0, 2));
    t.act("mum", "start_game", { gameId: DETECTIVE });
    t.act("mum", "open");
    for (const id of ["mum", "kid"]) expect((t.priv[id] as unknown as DetectiveMine).evidence.length).toBe(2);
  });
});
