// Shared types for the room engine and every game module.
// Everything here is plain data so it can round-trip through Postgres jsonb.

export type AgeBand = "6-8" | "9-11" | "12-15" | "16+";
export type MemberRole = "owner" | "adult" | "member";

export interface Player {
  id: string;
  name: string;
  ageBand: AgeBand;
  role: MemberRole;
}

export interface RoomMember {
  id: string;
  connected: boolean;
}

/** The public room row as the engine sees it. Mirrors the rooms table. */
export interface RoomSnapshot {
  id: string;
  version: number;
  hostId: string;
  status: "open" | "closed";
  currentGame: string | null;
  phase: string;
  /** ISO timestamp or null when the phase has no timer. */
  phaseEndsAt: string | null;
  state: Record<string, unknown>;
  members: RoomMember[];
}

/** Private state per member, keyed by member id. Mirrors room_private. */
export type PrivateMap = Record<string, Record<string, unknown>>;

export interface Action {
  type: string;
  actorId: string;
  payload?: Record<string, unknown>;
}

export interface GameEvent {
  memberId?: string | null;
  type: string;
  payload?: Record<string, unknown>;
}

/** What a successful turn writes. Fields left undefined are unchanged. */
export interface TurnWrite {
  currentGame?: string | null;
  phase?: string;
  phaseEndsAt?: string | null;
  state?: Record<string, unknown>;
  /** Partial: only the members listed are upserted. */
  private?: PrivateMap;
  events?: GameEvent[];
  /** Members whose room membership changed. */
  members?: RoomMember[];
  hostId?: string;
  status?: "open" | "closed";
  /** Points to write to the scoreboard when a game completes. */
  scores?: { memberId: string; rawPoints: number }[];
}

export type TurnResult =
  | { ok: true; write: TurnWrite; noop?: false }
  /** Nothing to write: the handler commits nothing and bumps no version. */
  | { ok: true; write: TurnWrite; noop: true }
  | { ok: false; reason: string };

export const reject = (reason: string): TurnResult => ({ ok: false, reason });
export const accept = (write: TurnWrite): TurnResult => ({ ok: true, write });
export const noop = (): TurnResult => ({ ok: true, write: {}, noop: true });

export interface PhaseSpec {
  /** Seconds until advance_if_expired may move the phase on. Omit for no timer. */
  timerSeconds?: number;
  /** Who the phase waits for, for the host's screen. */
  waitsFor: "all" | "one" | "host" | "none";
}

export interface GameContext {
  room: RoomSnapshot;
  players: Player[];
  private: PrivateMap;
  /** ISO timestamp of the server clock at the time of the action. */
  now: string;
  /** Deterministic in tests, crypto-backed in production. Returns [0, 1). */
  rng: () => number;
}

export interface GameModule {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  phases: Record<string, PhaseSpec>;
  /** First phase and initial public and private state. */
  setup(ctx: GameContext, options?: Record<string, unknown>): TurnResult;
  /** Apply a game action. The room has already checked the actor is a member. */
  reduce(ctx: GameContext, action: Action): TurnResult;
  /** The phase timer ran out. Usually moves to the next phase with what was collected. */
  onPhaseExpired(ctx: GameContext): TurnResult;
  isComplete(state: Record<string, unknown>): boolean;
  results(state: Record<string, unknown>): { memberId: string; rawPoints: number }[];
}
