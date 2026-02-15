# Harness Bench

CLI agent benchmarker dashboard. Run multiple coding agents on the same task, watch their terminals live, and compare each output using reviewer.

https://github.com/user-attachments/assets/eb489f56-fbc7-4e8e-adb2-c232411303d2

## Highlights

- Run `amp`, `opencode`, `claude`, `codex`, `pi`, `droid` in parallel
- WebSocket-driven PTY streaming for live terminal output
- Explicit global stop path via `POST /stop` with shutdown ladder (`Ctrl-C`, `Ctrl-C`, `SIGTERM`, `SIGKILL`)
- Dark, monospace-first UI with `ghostty-web` terminals (optionally `xtermjs`, `restty` alternatives)
- Per agent Git worktree set up with cleanup control

## Quick Start

### Requirements:

- Git
- `OPENROUTER_API_KEY` (add to PATH or provide in UI)
- Bun: `curl -fsSL https://bun.sh/install | bash`
- Amp: `curl -fsSL https://ampcode.com/install.sh | bash`
- Droid: `curl -fsSL https://app.factory.ai/cli | sh`
- OpenCode: `curl -fsSL https://opencode.ai/install | bash`
- Codex: `bun i -g @openai/codex`
- Pi: `bun i -g @mariozechner/pi-coding-agent`
- Claude Code: `curl -fsSL https://claude.ai/install.sh | bash`

Run locally without installing:

```bash
bunx @frixaco/hbench
```

`bunx @frixaco/hbench` runs the prebuilt `dist` server bundle shipped in the package.

Development:

```bash
bun install
bun run dev
```

## Commands

```bash
bun run dev                     # UI + PTY + REST server
bun run build                   # build fullstack server bundle into dist/
bun run start                   # run dist bundle (production runtime)
bun run lint                    # eslint
bun run format                  # prettier
bun run check                   # format + lint
bun publish --access public     # publish new version
```
