// The room reducer. Owns the lobby, membership, host, timers and the hand-off
// into whichever game module is running. Pure: no I/O, no clock of its own.
//
// Every game runs inside this. A game module only ever sees the players who
// were in the room when the game started (the participants), and the room
// keeps that list under the reserved state key "participants".

import { getGame } from "./registry";
import {
  accept,
  noop,
  reject,
  type Action,
  type GameContext,
  type GameModule,
  type Player,
  type RoomMember,
  type TurnResult,
  type TurnWrite,
} from "./types";

export const LOBBY = "lobby";
export const RESULTS = "results";

export const PARTICIPANTS_KEY = "participants";

const betweenGames = (phase: string) => phase === LOBBY || phase === RESULTS;

function isMember(ctx: GameContext, id: string): boolean {
  return ctx.room.members.some((m) => m.id === id);
}

function memberOf(ctx: GameContext, id: string): RoomMember | undefined {
  return ctx.room.members.find((m) => m.id === id);
}

function playerOf(ctx: GameContext, id: string): Player | undefined {
  return ctx.players.find((p) => p.id === id);
}

function isAdult(ctx: GameContext, id: string): boolean {
  const p = playerOf(ctx, id);
  return p?.role === "owner" || p?.role === "adult";
}

function participants(ctx: GameContext): string[] {
  const raw = ctx.room.state[PARTICIPANTS_KEY];
  return Array.isArray(raw) ? (raw as string[]) : [];
}

function phaseEndsAt(now: string, seconds: number | undefined): string | null {
  if (seconds === undefined) return null;
  return new Date(Date.parse(now) + seconds * 1000).toISOString();
}

/** The context a game module sees: only its participants, in their stored order. */
function gameContext(ctx: GameContext): GameContext {
  const ids = participants(ctx);
  const players = ids
    .map((id) => playerOf(ctx, id))
    .filter((p): p is Player => p !== undefined);
  return { ...ctx, players };
}

/**
 * Takes what a game module wrote and finishes it off: validates the phase,
 * fills in the phase timer, keeps the participants list, and moves the room
 * to results when the game reports itself complete.
 */
function finishGameWrite(
  ctx: GameContext,
  game: GameModule,
  result: TurnResult,
  extraEvents: TurnWrite["events"] = []
): TurnResult {
  if (!result.ok) return result;
  if (result.noop) return result;

  const write = { ...result.write };
  const phase = write.phase ?? ctx.room.phase;
  if (!(phase in game.phases)) {
    return reject(`module_wrote_unknown_phase:${phase}`);
  }

  const nextState = {
    ...(write.state ?? ctx.room.state),
    [PARTICIPANTS_KEY]: participants(ctx),
  };

  const phaseChanged = write.phase !== undefined && write.phase !== ctx.room.phase;
  const ends =
    write.phaseEndsAt !== undefined
      ? write.phaseEndsAt
      : phaseChanged
        ? phaseEndsAt(ctx.now, game.phases[phase].timerSeconds)
        : ctx.room.phaseEndsAt;

  const events = [...extraEvents, ...(write.events ?? [])];

  if (game.isComplete(nextState)) {
    return accept({
      ...write,
      state: nextState,
      phase: RESULTS,
      phaseEndsAt: null,
      scores: game.results(nextState),
      events: [...events, { type: "game_completed", payload: { game: game.id } }],
    });
  }

  return accept({ ...write, state: nextState, phase, phaseEndsAt: ends, events });
}

export function applyRoomAction(ctx: GameContext, action: Action): TurnResult {
  const { room } = ctx;
  if (room.status === "closed") return reject("room_closed");

  const actor = action.actorId;
  const payload = action.payload ?? {};

  // ---- membership ---------------------------------------------------------

  if (action.type === "join") {
    const existing = memberOf(ctx, actor);
    if (existing) {
      if (existing.connected) return noop();
      return accept({
        members: room.members.map((m) => (m.id === actor ? { ...m, connected: true } : m)),
        events: [{ memberId: actor, type: "member_reconnected" }],
      });
    }
    if (!playerOf(ctx, actor)) return reject("not_in_family");
    if (!betweenGames(room.phase)) return reject("game_in_progress");
    return accept({
      members: [...room.members, { id: actor, connected: true }],
      events: [{ memberId: actor, type: "member_joined" }],
    });
  }

  if (!isMember(ctx, actor)) return reject("not_in_room");

  if (action.type === "presence") {
    const connected = payload.connected === true;
    const me = memberOf(ctx, actor)!;
    if (me.connected === connected) return noop();
    return accept({
      members: room.members.map((m) => (m.id === actor ? { ...m, connected } : m)),
      events: [{ memberId: actor, type: connected ? "member_reconnected" : "member_disconnected" }],
    });
  }

  if (action.type === "leave") {
    if (!betweenGames(room.phase)) {
      // Leaving mid-game is a disconnect; the game keeps its participants.
      return applyRoomAction(ctx, { type: "presence", actorId: actor, payload: { connected: false } });
    }
    const remaining = room.members.filter((m) => m.id !== actor);
    if (remaining.length === 0) {
      return accept({
        members: remaining,
        status: "closed",
        events: [{ memberId: actor, type: "member_left" }, { type: "room_closed" }],
      });
    }
    const write: TurnWrite = {
      members: remaining,
      events: [{ memberId: actor, type: "member_left" }],
    };
    if (room.hostId === actor) {
      const next = pickNewHost(ctx, remaining);
      write.hostId = next;
      write.events!.push({ memberId: next, type: "host_changed", payload: { from: actor } });
    }
    return accept(write);
  }

  // ---- host controls ------------------------------------------------------

  if (action.type === "transfer_host") {
    const to = String(payload.toMemberId ?? "");
    if (!isMember(ctx, to)) return reject("target_not_in_room");
    if (to === room.hostId) return noop();
    const hostGone = memberOf(ctx, room.hostId)?.connected === false;
    const allowed = actor === room.hostId || (hostGone && isAdult(ctx, actor));
    if (!allowed) return reject("not_allowed");
    return accept({
      hostId: to,
      events: [{ memberId: to, type: "host_changed", payload: { from: room.hostId, by: actor } }],
    });
  }

  if (action.type === "close_room") {
    if (actor !== room.hostId) return reject("host_only");
    return accept({ status: "closed", events: [{ memberId: actor, type: "room_closed" }] });
  }

  if (action.type === "start_game") {
    if (actor !== room.hostId) return reject("host_only");
    if (!betweenGames(room.phase)) return reject("game_in_progress");
    const gameId = String(payload.gameId ?? "");
    const game = getGame(gameId);
    if (!game) return reject("unknown_game");

    const ids = room.members.filter((m) => m.connected).map((m) => m.id);
    if (ids.length < game.minPlayers) return reject("too_few_players");
    if (ids.length > game.maxPlayers) return reject("too_many_players");

    const startCtx: GameContext = {
      ...ctx,
      room: { ...room, currentGame: gameId, state: { [PARTICIPANTS_KEY]: ids } },
    };
    const options =
      payload.options && typeof payload.options === "object"
        ? (payload.options as Record<string, unknown>)
        : undefined;
    const setup = game.setup(gameContext(startCtx), options);
    if (!setup.ok) return setup;
    if (setup.noop || setup.write.phase === undefined) {
      return reject("module_setup_must_set_phase");
    }
    const finished = finishGameWrite(startCtx, game, setup, [
      { memberId: actor, type: "game_started", payload: { game: gameId, players: ids } },
    ]);
    if (!finished.ok || finished.noop) return finished;
    return accept({ ...finished.write, currentGame: gameId });
  }

  if (action.type === "end_game") {
    if (actor !== room.hostId) return reject("host_only");
    if (room.currentGame === null || betweenGames(room.phase)) return reject("no_game_running");
    return accept({
      currentGame: null,
      phase: LOBBY,
      phaseEndsAt: null,
      state: {},
      events: [{ memberId: actor, type: "game_abandoned", payload: { game: room.currentGame } }],
    });
  }

  if (action.type === "back_to_lobby") {
    if (actor !== room.hostId) return reject("host_only");
    if (room.phase !== RESULTS) return reject("not_in_results");
    return accept({ currentGame: null, phase: LOBBY, phaseEndsAt: null, state: {} });
  }

  // ---- timers -------------------------------------------------------------

  if (action.type === "advance_if_expired") {
    if (room.phaseEndsAt === null) return noop();
    if (Date.parse(ctx.now) < Date.parse(room.phaseEndsAt)) return noop();
    if (room.currentGame === null) return noop();
    const game = getGame(room.currentGame);
    if (!game) return reject("unknown_game");
    return finishGameWrite(ctx, game, game.onPhaseExpired(gameContext(ctx)), [
      { memberId: actor, type: "phase_expired", payload: { phase: room.phase } },
    ]);
  }

  // ---- everything else belongs to the running game -------------------------

  if (room.currentGame === null || betweenGames(room.phase)) return reject("unknown_action");
  if (!participants(ctx).includes(actor)) return reject("not_a_participant");
  const game = getGame(room.currentGame);
  if (!game) return reject("unknown_game");
  return finishGameWrite(ctx, game, game.reduce(gameContext(ctx), action));
}

/** Prefer a connected adult, then any connected member, then anyone left. */
function pickNewHost(ctx: GameContext, remaining: RoomMember[]): string {
  const connectedAdult = remaining.find((m) => m.connected && isAdult(ctx, m.id));
  if (connectedAdult) return connectedAdult.id;
  const connected = remaining.find((m) => m.connected);
  if (connected) return connected.id;
  return remaining[0].id;
}
