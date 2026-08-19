# Harness Bench

CLI agent benchmarker dashboard. Run multiple coding agents on the same task, watch their terminals live, and compare each output using reviewer.

https://github.com/user-attachments/assets/eb489f56-fbc7-4e8e-adb2-c232411303d2

## TODO

- [ ] Evaluate https://smolmachines.com/

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
bun run build                   # build full-stack server bundle into dist/
bun run start                   # run the production dist bundle
bun run lint                    # lint source files
bun run ts:ui                   # type-check the UI
bun run ts:api                  # type-check the server
bun run format                  # format files in place
```

## Releasing

Publishing uses npm trusted publishing through `.github/workflows/release.yml`. The workflow does not use an `NPM_TOKEN` secret.

1. Check the current npm version and choose a higher `X.Y.Z`:

   ```bash
   npm view @frixaco/hbench version
   ```

2. Update `version` in `package.json`.
3. Verify the package:

   ```bash
   bun install --frozen-lockfile
   bun run lint
   bun run ts:ui
   bun run ts:api
   npm pack --dry-run
   ```

4. Commit the version change, create a matching tag, and push both:

   ```bash
   git add package.json
   git commit -m "Release X.Y.Z"
   git tag vX.Y.Z
   git push --atomic origin main vX.Y.Z
   ```

The tag must point to the commit containing version `X.Y.Z`. A tag push runs the release workflow. npm rejects a version that already exists.

The npm package must trust GitHub Actions for repository `frixaco/harness-bench`, workflow `release.yml`, with `npm publish` permission.
