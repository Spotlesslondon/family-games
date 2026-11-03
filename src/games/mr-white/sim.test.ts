// Simulation of the "table chooses" rule (Joshua, 3 Nov), through the real engine.
// Not a test of correctness: it plays many games with scripted players and prints
// what happens. Behaviour assumptions are stated below; they are guesses about
// people, not measurements.

import { it } from "vitest";
import { applyPrivate, applyWrite } from "@/engine/apply";
import { LOBBY, RESULTS, applyRoomAction } from "@/engine/room";
import { seededRng } from "@/engine/rng";
import type { GameContext, Player, PrivateMap, RoomSnapshot } from "@/engine/types";
import { MR_WHITE, type MrWhiteState, type Side } from "./index";
import "../index";

// ---- Assumptions about players --------------------------------------------
// Chance a player who has a word (Villager or Wolf: neither knows which) picks
// "vote now", by how many rounds of clues have been heard since the last vote.
const WORD_HOLDER_VOTE = [0.35, 0.65, 0.9];
// Mr White knows he has no word and wants to hear more clues.
const MR_WHITE_VOTE = 0.2;
// Chance a player picks a hidden player in the vote: grows with clues heard.
const SPOT = (rounds: number) => Math.min(0.75, 0.2 + 0.2 * rounds);
const MR_WHITE_GUESS_RIGHT = 0.25;

type How = "majority_vote" | "majority_more" | "tie_to_vote" | "cap_to_vote" | "host_needed";

function makePlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, ageBand: i % 3 === 0 ? "6-8" : "16+", role: i === 0 ? "owner" : "member" }) as Player);
}

function playOne(n: number, away: number, seed: number) {
  const players = makePlayers(n);
  const rng = seededRng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rng() * xs.length)];
  let room: RoomSnapshot = {
    id: "r", version: 0, hostId: "p0", status: "open", currentGame: null, phase: LOBBY, phaseEndsAt: null, state: {},
    members: players.map((p) => ({ id: p.id, connected: true })),
  };
  let priv: PrivateMap = {};
  const act = (actorId: string, type: string, payload?: Record<string, unknown>) => {
    const ctx: GameContext = { room, players, private: priv, now: "2026-11-03T20:00:00.000Z", rng };
    const r = applyRoomAction(ctx, { type, actorId, payload });
    if (r.ok && !r.noop) {
      room = applyWrite(room, r.write);
      priv = applyPrivate(priv, r.write);
    }
    return r;
  };
  const s = () => room.state as MrWhiteState;
  const sides = (): Record<string, Side> => {
    const counts = new Map<string, number>();
    for (const p of players) {
      const w = priv[p.id].word as string | undefined;
      if (w) counts.set(w, (counts.get(w) ?? 0) + 1);
    }
    const civ = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return Object.fromEntries(players.map((p) => [p.id, priv[p.id].mrWhite ? "mr_white" : priv[p.id].word === civ ? "villager" : "wolf"]));
  };
  const stillIn = () => {
    const out = new Set(s().out.map((o) => o.id));
    return s().order.filter((id) => !out.has(id));
  };

  act("p0", "start_game", { gameId: MR_WHITE, options: { mrWhite: true } });
  for (const p of players) act(p.id, "seen");
  const truth = sides();
  const hows: How[] = [];
  const cluesBeforeVote: number[] = [];
  let mrWhiteSwung = 0;
  let clueN = 0;
  let guard = 0;

  while (room.phase !== RESULTS && guard++ < 500) {
    const phase = room.phase;
    if (phase === "clues") {
      const left = stillIn();
      const speaker = left[s().turn];
      act(speaker, "clue", { turn: s().turn, text: `c${clueN++}x` });
    } else if (phase === "between") {
      const round = s().cluesThisVote ?? 1;
      const left = stillIn();
      const here = left.filter(() => rng() >= away);
      // Players who wandered off: their phones report themselves away.
      for (const id of left) if (!here.includes(id)) act(id, "presence", { connected: false });
      const before = s().round;
      let choicesMade = 0;
      const mrWhite = left.find((id) => truth[id] === "mr_white");
      let mrWhiteChoice: string | null = null;
      for (const id of here) {
        const pv = truth[id] === "mr_white" ? MR_WHITE_VOTE : WORD_HOLDER_VOTE[Math.min(round, 3) - 1];
        const choice = rng() < pv ? "vote" : "more";
        if (id === mrWhite) mrWhiteChoice = choice;
        const wantVoteBefore = s().wantVote ?? 0;
        const wantMoreBefore = s().wantMore ?? 0;
        act(id, "choose", { choice });
        choicesMade++;
        if (room.phase !== "between") {
          // Decided by this choice: was it Mr White's that tipped it?
          if (id === mrWhite) mrWhiteSwung++;
          const majority = Math.floor(here.length / 2) + 1;
          const v = wantVoteBefore + (choice === "vote" ? 1 : 0);
          const m = wantMoreBefore + (choice === "more" ? 1 : 0);
          if (room.phase === "vote") hows.push(v >= majority ? "majority_vote" : "tie_to_vote");
          else hows.push("majority_more");
          void m;
          break;
        }
      }
      for (const id of left) if (!here.includes(id)) act(id, "presence", { connected: true });
      if (room.phase === "between") {
        // Not enough phones here to decide: the host's fallback.
        hows.push("host_needed");
        act("p0", "start_vote");
      }
      void choicesMade; void mrWhiteChoice; void before;
    } else if (phase === "vote") {
      if (!(room.phase === "vote" && (s().voted ?? []).length === 0 && !s().runoff)) {
        // fall through
      }
      const left = stillIn();
      const cands = s().candidates?.length ? s().candidates : left;
      const rounds = s().cluesThisVote ?? 1;
      if (!s().runoff && (s().voted ?? []).length === 0) cluesBeforeVote.push(rounds);
      for (const id of left) {
        const choices = cands.filter((c) => c !== id);
        const hidden = choices.filter((c) => truth[c] !== "villager");
        const target = truth[id] === "villager" && hidden.length && rng() < SPOT(rounds) ? pick(hidden) : pick(choices);
        act(id, "vote", { memberId: target });
        if (room.phase !== "vote") break;
      }
      if (room.phase === "vote") act("p0", "count_votes");
    } else if (phase === "between" || phase === "out") {
      act("p0", "next_round");
    } else if (phase === "guess") {
      const mr = s().out[s().out.length - 1].id;
      const villagerWord = priv[players.find((p) => truth[p.id] === "villager")!.id].word as string;
      act(mr, "guess", { word: rng() < MR_WHITE_GUESS_RIGHT ? villagerWord : "zzzz" });
    } else if (phase === "reveal") {
      act("p0", "start_clues");
    } else {
      break;
    }
  }
  // Reached the cap: votes with no "between" before them count as cap_to_vote.
  const caps = cluesBeforeVote.filter((r) => r >= 3).length - hows.filter((h) => h !== "majority_more").length + hows.filter((h) => h !== "majority_more").length;
  void caps;
  return { hows, cluesBeforeVote, winner: s().reveal?.outcome.winner ?? "unfinished", mrWhiteSwung, steps: guard };
}

it.skipIf(!process.env.SIM)("simulates the table choosing between rounds (run with SIM=1)", () => {
  const lines: string[] = [];
  for (const away of [0, 0.2]) {
    for (const n of [4, 5, 6, 8, 10, 12]) {
      const games = 400;
      const tally: Record<string, number> = { majority_vote: 0, majority_more: 0, tie_to_vote: 0, host_needed: 0 };
      const rounds: number[] = [];
      const winners: Record<string, number> = {};
      let swung = 0;
      let decisions = 0;
      let unfinished = 0;
      let capVotes = 0;
      let votes = 0;
      for (let g = 0; g < games; g++) {
        const r = playOne(n, away, 1000 * n + g + (away ? 77777 : 0));
        for (const h of r.hows) tally[h]++;
        decisions += r.hows.length;
        rounds.push(...r.cluesBeforeVote);
        votes += r.cluesBeforeVote.length;
        capVotes += r.cluesBeforeVote.filter((x) => x >= 3).length;
        winners[r.winner] = (winners[r.winner] ?? 0) + 1;
        swung += r.mrWhiteSwung;
        if (r.winner === "unfinished") unfinished++;
      }
      const pct = (x: number, of: number) => `${Math.round((100 * x) / Math.max(1, of))}%`;
      const avg = rounds.reduce((a, b) => a + b, 0) / Math.max(1, rounds.length);
      lines.push(
        [
          `players ${String(n).padStart(2)} | away ${away ? "20%" : " 0%"}`,
          `choices: vote by majority ${pct(tally.majority_vote, decisions)}, more by majority ${pct(tally.majority_more, decisions)}, tie->vote ${pct(tally.tie_to_vote, decisions)}, host needed ${pct(tally.host_needed, decisions)}`,
          `votes after 3 rounds (cap reached) ${pct(capVotes, votes)} | avg clue rounds before a vote ${avg.toFixed(2)}`,
          `Mr White's choice tipped it ${pct(swung, decisions)}`,
          `winners: ${Object.entries(winners).map(([k, v]) => `${k} ${pct(v, games)}`).join(", ")}`,
        ].join("\n   "),
      );
    }
  }
  require("fs").writeFileSync("/tmp/sim.txt", lines.join("\n") + "\n");
}, 120_000);
