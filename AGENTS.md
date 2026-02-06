# hbench

CLI agent benchmark dashboard. Run local coding-agent CLIs in parallel, stream PTY output live, inspect per-agent diffs.

## Stack

- TanStack Start + React 19
- Bun runtime/server (no Node runtime)
- Tailwind 4 + shadcn/base-ui
- `ghostty-web` terminal renderer
- `@pierre/diffs` for patch rendering

## Commands

```bash
bun run dev      # starts UI (:3000) + PTY server (:4000)
bun run ui       # UI only (Vite :3000)
bun run pty      # Bun PTY/WebSocket server (:4000)
bun run build    # production build
bun run preview  # preview built app
bun run start    # start output server (.output/server/index.mjs)
bun run test     # vitest (run)
bun run check    # prettier --write + eslint --fix
bun run lint     # eslint
bun run format   # prettier
```

## Runtime Requirements

- Bun installed
- Git installed
- Agent CLIs on `PATH`: `amp`, `droid`, `pi`, `codex`, `claude`, `opencode`

## Architecture

- Root shell/router: `src/routes/__root.tsx`
- WebSocket context: `src/lib/websocket.tsx` (client connects to `ws://localhost:4000/vt`, retries on disconnect)
- Dashboard route: `src/routes/index.tsx`
- Terminal grid: one `ghostty-web` terminal per agent, lazy-attached when run requested
- Diff UI: per-agent sheet fetches patch from `GET http://localhost:4000/diff?agent=...`
- Backend: `core/server.ts`
- Model list source: `core/models.json`

## Backend Notes (`core/server.ts`)

- WS endpoint: `/vt`
- HTTP endpoint: `/diff` (returns git diff text, includes untracked files)
- Sandbox root: `~/.hbench`
- `setup` message clones repo + creates per-agent git worktrees
- `wipe` message deletes `~/.hbench`
- Agent launch: spawns CLI command in PTY from that agent's worktree
- Streams output as base64 WS payloads (`type: "output"`)
- Handles `input` and `resize` messages per agent
- Emits setup/wipe status events for toasts

## Repo Structure

- `src/routes/` route components (`__root.tsx`, `index.tsx`)
- `src/components/ui/` shadcn/base-ui primitives
- `src/components/theme-provider.tsx` theme state + localStorage persistence
- `src/lib/websocket.tsx` WS provider/hooks
- `src/lib/agent-patterns.ts` per-agent card textures
- `core/server.ts` Bun PTY + git-worktree orchestration
- `core/models.json` agent -> model options
- `public/screenshot-2026-02-06.png` current dashboard screenshot

## UI Guidelines

- Dark-first, monospace-friendly dashboard; light mode also supported
- Keep terminal output primary; controls compact
- Use `lucide-react` icons only
- Reuse existing shadcn/base-ui primitives before new UI abstractions
