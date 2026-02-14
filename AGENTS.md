# hbench

CLI agent benchmark dashboard in your browser.
Run local coding-agent CLIs in parallel, stream PTY output live, inspect per-agent diffs.
Locally.

## Stack

- Bun - WebSocket, REST API and runtime (do not use Node, npm, npx or Node APIs)
- Tailwind 4 + shadcn/base-ui
- `ghostty-web` terminal renderer with optional `xtermjs` and `restty` versions
- `@pierre/diffs` for patch rendering
- OpenRouter for diff review feature

## Runtime Requirements

- Bun installed
- Git installed
- Agent CLIs on `PATH`: `amp`, `droid`, `pi`, `codex`, `claude`, `opencode`

## UI Guidelines

- Dark-first, monospace-friendly dashboard
- Keep terminal output primary; controls compact; everything easy to reach
- Use `lucide-react` icons only
- shadcn/base-ui primitives components must be manually set up by me
