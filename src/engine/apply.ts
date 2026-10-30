import type { PrivateMap, RoomSnapshot, TurnWrite } from "./types";

/** The room as it will read after a write lands. Used by the handler to
 *  build the commit and by tests to chain actions. */
export function applyWrite(room: RoomSnapshot, write: TurnWrite): RoomSnapshot {
  return {
    ...room,
    version: room.version + 1,
    hostId: write.hostId ?? room.hostId,
    status: write.status ?? room.status,
    currentGame: write.currentGame === undefined ? room.currentGame : write.currentGame,
    phase: write.phase ?? room.phase,
    phaseEndsAt: write.phaseEndsAt === undefined ? room.phaseEndsAt : write.phaseEndsAt,
    state: write.state ?? room.state,
    members: write.members ?? room.members,
  };
}

export function applyPrivate(current: PrivateMap, write: TurnWrite): PrivateMap {
  if (!write.private) return current;
  return { ...current, ...write.private };
}
