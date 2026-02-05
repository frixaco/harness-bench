# hbench

CLI agent benchmarker dashboard.

## Stack

- TanStack Start + React 19
- Tailwind 4 + shadcn (base-ui)
- Bun (not Node)

## Commands

```bash
bun run dev      # dev server on :3000
bun run build    # production build
bun run check    # format + lint
bun run test     # vitest
```

## Architecture

- TanStack Start routing. Root shell in `src/routes/__root.tsx`
- WebSocket provider in `src/lib/websocket.tsx`. Connects to Bun server on `ws://localhost:4000/vt`
- Dashboard UI in `src/routes/index.tsx`. Agent cards + model selectors + terminal grid
- Terminal grid uses `ghostty-web` to render PTY output per agent
- Backend in `core/server.ts`. Spawns agent PTYs and streams base64 output over WebSocket
- Agent model list in `core/models.json`
- Theme management in `src/components/theme-provider.tsx` + `src/styles.css`

## Structure

- `src/routes/` - app entry + dashboard UI
- `src/components/ui/` - shadcn primitives
- `src/lib/` - websocket + agent pattern helpers
- `core/` - Bun websocket server + models config
- `src/styles.css` - theme variables (oklch), dark mode default

## UI Guidelines

- Dark theme, monospace for terminals
- lucide-react icons only
- Minimal, bold, not generic - focus on tool output
- Use existing shadcn components before creating new ones
