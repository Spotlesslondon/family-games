import { beforeEach, describe, expect, it } from "vitest";
import { applyPrivate, applyWrite } from "./apply";
import { clearGames, registerGame } from "./registry";
import { LOBBY, PARTICIPANTS_KEY, RESULTS, applyRoomAction } from "./room";
import { seededRng } from "./rng";
import {
  accept,
  type Action,
  type GameContext,
  type GameModule,
  type Player,
  type PrivateMap,
  type RoomSnapshot,
  type TurnResult,
} from "./types";

// A tiny game used only to exercise the room: everyone taps, three taps each
// finishes it, the timer finishes it early with whatever was collected.
const tapGame: GameModule = {
  id: "tap",
  name: "Tap",
  minPlayers: 2,
  maxPlayers: 4,
  phases: {
    tapping: { timerSeconds: 30, waitsFor: "all" },
  },
  setup(ctx) {
    const taps: Record<string, number> = {};
    for (const p of ctx.players) taps[p.id] = 0;
    const priv: PrivateMap = {};
    for (const p of ctx.players) priv[p.id] = { secret: `s-${p.id}` };
    return accept({ phase: "tapping", state: { taps }, private: priv });
  },
  reduce(ctx, action) {
    if (action.type !== "tap") return { ok: false, reason: "unknown_action" };
    const taps = { ...(ctx.room.state.taps as Record<string, number>) };
    taps[action.actorId] = Math.min(3, (taps[action.actorId] ?? 0) + 1);
    return accept({ state: { ...ctx.room.state, taps } });
  },
  onPhaseExpired(ctx) {
    return accept({ state: { ...ctx.room.state, expired: true } });
  },
  isComplete(state) {
    if (state.expired === true) return true;
    const taps = state.taps as Record<string, number>;
    return Object.values(taps).every((n) => n >= 3);
  },
  results(state) {
    const taps = state.taps as Record<string, number>;
    return Object.entries(taps).map(([memberId, n]) => ({ memberId, rawPoints: n }));
  },
};

const players: Player[] = [
  { id: "mum", name: "Mum", ageBand: "16+", role: "owner" },
  { id: "dad", name: "Dad", ageBand: "16+", role: "adult" },
  { id: "kid", name: "Kid", ageBand: "6-8", role: "member" },
  { id: "teen", name: "Teen", ageBand: "12-15", role: "member" },
  { id: "nan", name: "Nan", ageBand: "16+", role: "adult" },
];

const T0 = "2026-10-30T20:00:00.000Z";
const plus = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000).toISOString();

function freshRoom(): RoomSnapshot {
  return {
    id: "room-1",
    version: 0,
    hostId: "mum",
    status: "open",
    currentGame: null,
    phase: LOBBY,
    phaseEndsAt: null,
    state: {},
    members: [{ id: "mum", connected: true }],
  };
}

/** A small harness that keeps the room and private state current across actions. */
class Table {
  room = freshRoom();
  priv: PrivateMap = {};
  now = T0;
  rng = seededRng(42);
  last!: TurnResult;

  ctx(): GameContext {
    return { room: this.room, players, private: this.priv, now: this.now, rng: this.rng };
  }

  act(type: string, actorId: string, payload?: Record<string, unknown>): TurnResult {
    const action: Action = { type, actorId, payload };
    const result = applyRoomAction(this.ctx(), action);
    this.last = result;
    if (result.ok && !result.noop) {
      this.room = applyWrite(this.room, result.write);
      this.priv = applyPrivate(this.priv, result.write);
    }
    return result;
  }

  ok(type: string, actorId: string, payload?: Record<string, unknown>) {
    const r = this.act(type, actorId, payload);
    if (!r.ok) throw new Error(`expected ok, got ${r.reason} for ${type} by ${actorId}`);
    return r;
  }

  rejected(type: string, actorId: string, payload?: Record<string, unknown>): string {
    const r = this.act(type, actorId, payload);
    if (r.ok) throw new Error(`expected rejection for ${type} by ${actorId}`);
    return r.reason;
  }

  events(): string[] {
    const r = this.last;
    return r.ok ? (r.write.events ?? []).map((e) => e.type) : [];
  }
}

beforeEach(() => {
  clearGames();
  registerGame(tapGame);
});

describe("joining and leaving", () => {
  it("lets a family member join an open lobby once", () => {
    const t = new Table();
    t.ok("join", "dad");
    expect(t.room.members.map((m) => m.id)).toEqual(["mum", "dad"]);
    expect(t.events()).toEqual(["member_joined"]);
    const again = t.act("join", "dad");
    expect(again.ok && again.noop).toBe(true);
    expect(t.room.version).toBe(1);
  });

  it("refuses someone who is not in the family", () => {
    const t = new Table();
    expect(t.rejected("join", "stranger")).toBe("not_in_family");
  });

  it("refuses new players mid-game but lets a dropped player rejoin", () => {
    const t = new Table();
    t.ok("join", "dad");
    t.ok("start_game", "mum", { gameId: "tap" });
    expect(t.rejected("join", "kid")).toBe("game_in_progress");

    t.ok("presence", "dad", { connected: false });
    expect(t.room.members.find((m) => m.id === "dad")?.connected).toBe(false);
    t.ok("join", "dad");
    expect(t.room.members.find((m) => m.id === "dad")?.connected).toBe(true);
    expect(t.events()).toEqual(["member_reconnected"]);
  });

  it("closes the room when the last member leaves", () => {
    const t = new Table();
    t.ok("leave", "mum");
    expect(t.room.status).toBe("closed");
    expect(t.rejected("join", "dad")).toBe("room_closed");
  });

  it("hands the host to a connected adult when the host leaves the lobby", () => {
    const t = new Table();
    t.ok("join", "kid");
    t.ok("join", "dad");
    t.ok("leave", "mum");
    expect(t.room.hostId).toBe("dad");
    expect(t.events()).toEqual(["member_left", "host_changed"]);
  });

  it("falls back to any member as host when no adult is left", () => {
    const t = new Table();
    t.ok("join", "kid");
    t.ok("leave", "mum");
    expect(t.room.hostId).toBe("kid");
  });

  it("treats leaving mid-game as a disconnect, keeping the participant list", () => {
    const t = new Table();
    t.ok("join", "dad");
    t.ok("start_game", "mum", { gameId: "tap" });
    t.ok("leave", "dad");
    expect(t.room.members.map((m) => m.id)).toEqual(["mum", "dad"]);
    expect(t.room.state[PARTICIPANTS_KEY]).toEqual(["mum", "dad"]);
  });
});

describe("removing a player", () => {
  it("lets the host remove someone from the lobby", () => {
    const t = new Table();
    t.ok("join", "dad");
    t.ok("join", "kid");
    t.ok("remove_player", "mum", { memberId: "kid" });
    expect(t.room.members.map((m) => m.id)).toEqual(["mum", "dad"]);
    expect(t.events()).toEqual(["member_removed"]);
  });

  it("is host only, never the host themselves, and only people in the room", () => {
    const t = new Table();
    t.ok("join", "dad");
    expect(t.rejected("remove_player", "dad", { memberId: "mum" })).toBe("host_only");
    expect(t.rejected("remove_player", "mum", { memberId: "mum" })).toBe("cannot_remove_self");
    expect(t.rejected("remove_player", "mum", { memberId: "nan" })).toBe("target_not_in_room");
  });

  it("is refused mid-game, so no game is left half-played", () => {
    const t = new Table();
    t.ok("join", "dad");
    t.ok("start_game", "mum", { gameId: "tap" });
    expect(t.rejected("remove_player", "mum", { memberId: "dad" })).toBe("game_in_progress");
  });
});

describe("starting a game", () => {
  it("is host only, needs a known game and enough players in the room", () => {
    const t = new Table();
    t.ok("join", "dad");
    expect(t.rejected("start_game", "dad", { gameId: "tap" })).toBe("host_only");
    expect(t.rejected("start_game", "mum", { gameId: "nope" })).toBe("unknown_game");
    t.ok("leave", "dad");
    expect(t.rejected("start_game", "mum", { gameId: "tap" })).toBe("too_few_players");
  });

  it("refuses more players than the game allows", () => {
    const t = new Table();
    for (const id of ["dad", "kid", "teen", "nan"]) t.ok("join", id);
    expect(t.rejected("start_game", "mum", { gameId: "tap" })).toBe("too_many_players");
  });

  it("sets up the game, the participants, the timer and private state", () => {
    const t = new Table();
    t.ok("join", "dad");
    t.ok("join", "kid");
    t.ok("start_game", "mum", { gameId: "tap" });

    expect(t.room.currentGame).toBe("tap");
    expect(t.room.phase).toBe("tapping");
    expect(t.room.phaseEndsAt).toBe(plus(30));
    expect(t.room.state[PARTICIPANTS_KEY]).toEqual(["mum", "dad", "kid"]);
    expect(t.room.state.taps).toEqual({ mum: 0, dad: 0, kid: 0 });
    expect(t.priv).toEqual({ mum: { secret: "s-mum" }, dad: { secret: "s-dad" }, kid: { secret: "s-kid" } });
    expect(t.events()).toEqual(["game_started"]);
  });

  it("deals in everyone in the room, including phones marked away, but not people who left", () => {
    const t = new Table();
    t.ok("join", "dad");
    t.ok("join", "kid");
    t.ok("join", "teen");
    t.ok("presence", "kid", { connected: false });
    t.ok("leave", "teen");
    t.ok("start_game", "mum", { gameId: "tap" });
    expect(t.room.state[PARTICIPANTS_KEY]).toEqual(["mum", "dad", "kid"]);
    expect(t.priv.kid).toEqual({ secret: "s-kid" });
  });

  it("cannot start while a game is running", () => {
    const t = new Table();
    t.ok("join", "dad");
    t.ok("start_game", "mum", { gameId: "tap" });
    expect(t.rejected("start_game", "mum", { gameId: "tap" })).toBe("game_in_progress");
  });
});

describe("playing", () => {
  it("routes game actions to the module and keeps participants in state", () => {
    const t = new Table();
    t.ok("join", "dad");
    t.ok("start_game", "mum", { gameId: "tap" });
    t.ok("tap", "mum");
    expect((t.room.state.taps as Record<string, number>).mum).toBe(1);
    expect(t.room.state[PARTICIPANTS_KEY]).toEqual(["mum", "dad"]);
  });

  it("moves to results with scores when the module reports completion", () => {
    const t = new Table();
    t.ok("join", "dad");
    t.ok("start_game", "mum", { gameId: "tap" });
    for (let i = 0; i < 3; i++) {
      t.ok("tap", "mum");
      t.ok("tap", "dad");
    }
    expect(t.room.phase).toBe(RESULTS);
    expect(t.room.phaseEndsAt).toBeNull();
    const r = t.last;
    expect(r.ok && !r.noop && r.write.scores).toEqual([
      { memberId: "mum", rawPoints: 3 },
      { memberId: "dad", rawPoints: 3 },
    ]);
    expect(t.events()).toEqual(["game_completed"]);
    expect(t.rejected("tap", "mum")).toBe("unknown_action");
  });

  it("rejects game actions when no game is running", () => {
    const t = new Table();
    expect(t.rejected("tap", "mum")).toBe("unknown_action");
  });

  it("lets the host abandon a game and return to the lobby", () => {
    const t = new Table();
    t.ok("join", "dad");
    t.ok("start_game", "mum", { gameId: "tap" });
    expect(t.rejected("end_game", "dad")).toBe("host_only");
    t.ok("end_game", "mum");
    expect(t.room.phase).toBe(LOBBY);
    expect(t.room.currentGame).toBeNull();
    expect(t.room.state).toEqual({});
  });

  it("lets a new player in during results and goes back to the lobby", () => {
    const t = new Table();
    t.ok("join", "dad");
    t.ok("start_game", "mum", { gameId: "tap" });
    t.now = plus(31);
    t.ok("advance_if_expired", "mum");
    expect(t.room.phase).toBe(RESULTS);
    t.ok("join", "kid");
    expect(t.room.members).toHaveLength(3);
    expect(t.rejected("back_to_lobby", "dad")).toBe("host_only");
    t.ok("back_to_lobby", "mum");
    expect(t.room.phase).toBe(LOBBY);
    expect(t.room.currentGame).toBeNull();
  });
});

describe("timers", () => {
  it("does nothing before the deadline, from any member", () => {
    const t = new Table();
    t.ok("join", "dad");
    t.ok("start_game", "mum", { gameId: "tap" });
    t.now = plus(29);
    const r = t.act("advance_if_expired", "dad");
    expect(r.ok && r.noop).toBe(true);
    expect(t.room.phase).toBe("tapping");
  });

  it("advances exactly once however many phones send it", () => {
    const t = new Table();
    t.ok("join", "dad");
    t.ok("start_game", "mum", { gameId: "tap" });
    const v = t.room.version;
    t.now = plus(31);

    t.ok("advance_if_expired", "mum");
    expect(t.room.phase).toBe(RESULTS);
    expect(t.room.version).toBe(v + 1);
    expect(t.events()).toEqual(["phase_expired", "game_completed"]);

    // The stragglers.
    for (const id of ["dad", "mum", "dad"]) {
      const r = t.act("advance_if_expired", id);
      expect(r.ok && r.noop).toBe(true);
    }
    expect(t.room.version).toBe(v + 1);
  });

  it("is a no-op in the lobby, where there is no timer", () => {
    const t = new Table();
    const r = t.act("advance_if_expired", "mum");
    expect(r.ok && r.noop).toBe(true);
  });
});

describe("host handover", () => {
  it("lets the host hand over to any member", () => {
    const t = new Table();
    t.ok("join", "kid");
    t.ok("transfer_host", "mum", { toMemberId: "kid" });
    expect(t.room.hostId).toBe("kid");
    expect(t.rejected("transfer_host", "mum", { toMemberId: "mum" })).toBe("not_allowed");
  });

  it("lets an adult take over only when the host has dropped", () => {
    const t = new Table();
    t.ok("join", "dad");
    t.ok("join", "kid");
    expect(t.rejected("transfer_host", "dad", { toMemberId: "dad" })).toBe("not_allowed");

    t.ok("presence", "mum", { connected: false });
    expect(t.rejected("transfer_host", "kid", { toMemberId: "kid" })).toBe("not_allowed");
    t.ok("transfer_host", "dad", { toMemberId: "dad" });
    expect(t.room.hostId).toBe("dad");
  });

  it("refuses a target who is not in the room", () => {
    const t = new Table();
    expect(t.rejected("transfer_host", "mum", { toMemberId: "nan" })).toBe("target_not_in_room");
  });

  it("the new host can run the game after a handover mid-game", () => {
    const t = new Table();
    t.ok("join", "dad");
    t.ok("start_game", "mum", { gameId: "tap" });
    t.ok("presence", "mum", { connected: false });
    t.ok("transfer_host", "dad", { toMemberId: "dad" });
    t.ok("end_game", "dad");
    expect(t.room.phase).toBe(LOBBY);
  });
});

describe("closing", () => {
  it("is host only and makes every later action fail", () => {
    const t = new Table();
    t.ok("join", "dad");
    expect(t.rejected("close_room", "dad")).toBe("host_only");
    t.ok("close_room", "mum");
    expect(t.room.status).toBe("closed");
    expect(t.rejected("join", "kid")).toBe("room_closed");
    expect(t.rejected("tap", "mum")).toBe("room_closed");
  });
});

describe("the stand-in while the host's phone is away", () => {
  it("hands the host's buttons to a connected adult in the game, and back when the host returns", () => {
    const t = new Table();
    t.ok("join", "kid");
    t.ok("join", "dad");
    t.ok("start_game", "mum", { gameId: "tap" });
    expect(t.room.state.inCharge ?? null).toBeNull();
    t.ok("presence", "mum", { connected: false });
    // Dad, not Kid: adults first, even though Kid joined first.
    expect(t.room.state.inCharge).toBe("dad");
    // Not before the host has been away a whole minute: a quick look at WhatsApp hands nothing over.
    expect(t.rejected("end_game", "dad")).toBe("host_only");
    t.now = plus(59);
    expect(t.rejected("end_game", "dad")).toBe("host_only");
    t.now = plus(60);
    expect(t.rejected("end_game", "kid")).toBe("host_only");
    t.ok("presence", "mum", { connected: true });
    expect(t.room.state.inCharge).toBeNull();
    expect(t.room.state.inChargeFrom).toBeNull();
    expect(t.rejected("end_game", "dad")).toBe("host_only");
  });

  it("lets the stand-in end the game while the host is away", () => {
    const t = new Table();
    t.ok("join", "dad");
    t.ok("start_game", "mum", { gameId: "tap" });
    t.ok("presence", "mum", { connected: false });
    t.now = plus(60);
    t.ok("end_game", "dad");
    expect(t.room.phase).toBe(LOBBY);
  });

  it("falls back to a child when no adult's phone is here, and to nobody when no phone is", () => {
    const t = new Table();
    t.ok("join", "kid");
    t.ok("start_game", "mum", { gameId: "tap" });
    t.ok("presence", "mum", { connected: false });
    expect(t.room.state.inCharge).toBe("kid");
    t.ok("presence", "kid", { connected: false });
    expect(t.room.state.inCharge).toBeNull();
  });

  it("never applies in the lobby", () => {
    const t = new Table();
    t.ok("join", "dad");
    t.ok("presence", "mum", { connected: false });
    expect(t.room.state.inCharge).toBeUndefined();
  });
});
