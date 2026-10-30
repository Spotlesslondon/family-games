# Family Games

Game night on everyone's phone. One room, one phone each, an optional big screen.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm test` | Engine and game module tests (Vitest) |
| `npm run db:test` | Runs the migrations and the SQL isolation tests on a throwaway local Postgres. Needs Postgres server binaries installed. |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm run build` | Production build |

## Layout

- `src/engine/` the room reducer, game module contract and registry. Pure TypeScript, no I/O.
- `src/app/` the Next.js app: phone screens, big screen, Route Handlers.
- `supabase/migrations/` schema, row level security and `commit_room_turn`.
- `supabase/tests/` the local Supabase shim and SQL tests run by `db:test`.
- `public/sw.js` service worker (install and, from Phase 3, push).

## How a turn works

A phone sends an action to the `room-action` Route Handler. The handler loads the room, its members and the actor's private state, runs `applyRoomAction` (which hands game actions to the running game module), and commits the result through `commit_room_turn` in one transaction with a version check. Realtime then delivers the new room row to every phone.
