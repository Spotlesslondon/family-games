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
  type RoomSnapshot,
  type TurnResult,
  type TurnWrite,
} from "./types";


/** What a closed room keeps of its game: nothing (no clues, guesses or words). */
const WIPE_GAME = { currentGame: null, phase: "lobby", phaseEndsAt: null, state: {} } satisfies Partial<TurnWrite>;

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
  return p?.role === "owner" || p?.role === "adult" || p?.ageBand === "16+";
}

/** Shared state key: who presses the host's buttons while the host's phone is away. */
export const IN_CHARGE_KEY = "inCharge";
/** Shared state key: when the stand-in's buttons start working (ISO time). */
export const IN_CHARGE_FROM_KEY = "inChargeFrom";

/**
 * A phone only counts as away after this long out of the app (Joshua, 2 Nov:
 * "Away should be if they are from the app for a longer length of time").
 * Checking WhatsApp or sending the invite link takes less than this.
 */
export const AWAY_GRACE_SECONDS = 60;

/**
 * While a game is on (or its results are showing) and the host's phone is
 * away, someone else must be able to move it on: Vote now, Next question,
 * Play again (Joshua, 2 Nov: "it should have assigned someone else as person
 * in charge"). The stand-in is the first player in the game whose phone is
 * here, adults first. Being out of the game does not matter: an adult who has
 * been voted out can still press Vote now. When the host's phone is back, the
 * host is in charge again and the stand-in's buttons go away.
 */
export function standIn(room: Pick<RoomSnapshot, "hostId" | "currentGame" | "members" | "state">, players: Player[]): string | null {
  if (room.currentGame === null) return null;
  if (room.members.find((m) => m.id === room.hostId)?.connected) return null;
  const raw = room.state[PARTICIPANTS_KEY];
  const inGame = Array.isArray(raw) ? (raw as string[]) : [];
  const here = inGame.filter((id) => id !== room.hostId && room.members.some((m) => m.id === id && m.connected));
  const adult = (id: string) => {
    const p = players.find((x) => x.id === id);
    return p?.role === "owner" || p?.role === "adult" || p?.ageBand === "16+";
  };
  return here.find(adult) ?? here[0] ?? null;
}

/** The host, or the stand-in once the host's phone has been away for the grace period. */
function mayRun(ctx: GameContext, actor: string): boolean {
  if (actor === ctx.room.hostId) return true;
  const from = ctx.room.state[IN_CHARGE_FROM_KEY];
  if (typeof from !== "string" || Date.parse(ctx.now) < Date.parse(from)) return false;
  return actor === standIn(ctx.room, ctx.players);
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
  return withInCharge(ctx, applyRoomActionInner(ctx, action));
}

/**
 * Keeps the shared state's "inCharge" up to date after every change, so every
 * phone knows who has the host's buttons right now. Presence changes count:
 * the host's phone going away hands the buttons over at once.
 */
function withInCharge(ctx: GameContext, result: TurnResult): TurnResult {
  if (!result.ok || result.noop) return result;
  const w = result.write;
  const after = {
    hostId: w.hostId ?? ctx.room.hostId,
    currentGame: w.currentGame !== undefined ? w.currentGame : ctx.room.currentGame,
    members: w.members ?? ctx.room.members,
    state: w.state ?? ctx.room.state,
  };
  const phase = w.phase ?? ctx.room.phase;
  if (after.currentGame === null || phase === LOBBY) return result;
  const hostHere = after.members.find((m) => m.id === after.hostId)?.connected === true;
  const was = after.state[IN_CHARGE_FROM_KEY];
  // The clock starts when the host's phone goes away and keeps running while it
  // stays away, whoever the stand-in is.
  const from = hostHere ? null : typeof was === "string" ? was : new Date(Date.parse(ctx.now) + AWAY_GRACE_SECONDS * 1000).toISOString();
  const who = standIn(after, ctx.players);
  if ((after.state[IN_CHARGE_KEY] ?? null) === who && (after.state[IN_CHARGE_FROM_KEY] ?? null) === from) return result;
  return { ...result, write: { ...w, state: { ...after.state, [IN_CHARGE_KEY]: who, [IN_CHARGE_FROM_KEY]: from } } };
}

function applyRoomActionInner(ctx: GameContext, action: Action): TurnResult {
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
        ...WIPE_GAME,
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

  if (action.type === "remove_player") {
    // The host removes someone from the lobby (a wrong person from a WhatsApp
    // group, say). Between games only, so no game is left half-played.
    if (actor !== room.hostId) return reject("host_only");
    const target = String(payload.memberId ?? "");
    if (target === actor) return reject("cannot_remove_self");
    if (!isMember(ctx, target)) return reject("target_not_in_room");
    if (!betweenGames(room.phase)) return reject("game_in_progress");
    return accept({
      members: room.members.filter((m) => m.id !== target),
      events: [{ memberId: target, type: "member_removed", payload: { by: actor } }],
    });
  }

  if (action.type === "close_room") {
    if (actor !== room.hostId) return reject("host_only");
    // Closing wipes the game: typed clues and guesses never outlive the night.
    return accept({ ...WIPE_GAME, status: "closed", events: [{ memberId: actor, type: "room_closed" }] });
  }

  if (action.type === "start_game") {
    if (actor !== room.hostId && !(room.phase === RESULTS && mayRun(ctx, actor))) return reject("host_only");
    if (!betweenGames(room.phase)) return reject("game_in_progress");
    const gameId = String(payload.gameId ?? "");
    const game = getGame(gameId);
    if (!game) return reject("unknown_game");

    // Everyone in the room is dealt in, away or not (Joshua, 2 Nov: "When users
    // are 'away' it doesn't add them to the game"). A phone is marked away the
    // moment it locks or switches app, which on a remote night is all the time.
    // Leaving the room removes a seat for good, so a seat means a player. A
    // phone that wakes up late finds its word or question waiting, and the
    // host can move on without it (start_clues, show_answers).
    // The host who taps Play is plainly here, so is marked back.
    const hostWasAway = memberOf(ctx, actor)?.connected === false;
    const members = hostWasAway ? room.members.map((m) => (m.id === actor ? { ...m, connected: true } : m)) : room.members;
    const ids = members.map((m) => m.id);
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
    if (!hostWasAway) return accept({ ...finished.write, currentGame: gameId });
    return accept({
      ...finished.write,
      currentGame: gameId,
      members,
      events: [{ memberId: actor, type: "member_reconnected" }, ...(finished.write.events ?? [])],
    });
  }

  if (action.type === "end_game") {
    if (!mayRun(ctx, actor)) return reject("host_only");
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
    if (!mayRun(ctx, actor)) return reject("host_only");
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
  // The stand-in acts with the host's say for this one action: the game module
  // checks "is this the host?" and needs no change of its own.
  const asHost = actor !== room.hostId && mayRun(ctx, actor) ? { ...ctx, room: { ...room, hostId: actor } } : ctx;
  return finishGameWrite(ctx, game, game.reduce(gameContext(asHost), action));
}

/** Prefer a connected adult, then any connected member, then anyone left. */
function pickNewHost(ctx: GameContext, remaining: RoomMember[]): string {
  const connectedAdult = remaining.find((m) => m.connected && isAdult(ctx, m.id));
  if (connectedAdult) return connectedAdult.id;
  const connected = remaining.find((m) => m.connected);
  if (connected) return connected.id;
  return remaining[0].id;
}
