import type { GameModule } from "./types";

const modules = new Map<string, GameModule>();

export function registerGame(module: GameModule): void {
  if (modules.has(module.id)) {
    throw new Error(`game module already registered: ${module.id}`);
  }
  modules.set(module.id, module);
}

export function getGame(id: string): GameModule | undefined {
  return modules.get(id);
}

export function listGames(): GameModule[] {
  return Array.from(modules.values());
}

/** Test support only. */
export function clearGames(): void {
  modules.clear();
}
