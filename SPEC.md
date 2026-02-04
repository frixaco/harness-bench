# CLI Agent Benchmarker (Local-First) Spec

## Summary

- Local-only runner for CLI coding agents.
- Native harness experience; optional per-tool prompt overrides.
- Parallel runs with live TUI streaming in browser.
- Diffs displayed with diffs.com library.
- Generic reviewer model for ranking (no weighted rubric).

## Tools

- pi
- codex
- claude code
- amp
- droid
- opencode

## Assumptions

- User installs and authenticates all tools locally.
- Repo exists locally and is accessible by the app.
- No cloud execution, no credential handling in app.

## Non-Goals

- Model capability leaderboard.
- Cloud runners or CI integration.
- Built-in auth or secrets management.

## User Flow

1. Select local repo path.
2. Enter task prompt.
3. Select tools to run.
4. Optional per-tool prompt overrides.
5. Run all tools in parallel.
6. Watch live TUI grid.
7. Review diffs + metrics + reviewer ranking.

## UI Requirements

- Grid view: one live terminal per tool.
- Status per tool: queued/running/done/failed.
- Results panel with diff viewer (diffs.com).
- Run summary and reviewer output.
- Disclosure: “Native harness benchmark.”

## Architecture

### Local Server (Bun)

- HTTP API for runs, artifacts, and results.
- WebSocket per tool run for PTY stream.
- Job scheduler for parallel execution.

### Runner

- Per-tool workspace created by copying repo to temp dir.
- Run tool inside PTY using `Bun.spawn({ terminal: ... })`.
- Capture PTY stream for live view and log storage.
- Collect diff and metrics on completion.

### Browser Client

- Terminal renderer using ghostty-web.
- WebSocket connection per tool for live TUI.
- Diff view using diffs.com embedded component.

## PTY Streaming

- Bun PTY for each tool process.
- Stream raw PTY data to client over WS.
- Record PTY log for playback and diagnostics.

## Diff Collection

- Baseline snapshot at run start.
- Post-run `git diff` in workspace.
- Store diff text + file list + stats.
- Render diffs with diffs.com.

## Metrics

- Time to completion.
- Diff stats: files changed, lines added/removed.
- Exit status.
- Optional tool-provided token usage if available.

## Reviewer

- Generic prompt (no rubric weights).
- Rank results and provide brief summary.
- Reviewer output stored per run.

## Concurrency

- Run all selected tools in parallel.
- Configurable max concurrency to protect machine.

## Storage

- Local filesystem storage for:
  - PTY logs
  - Diffs
  - Run metadata
  - Reviewer output

## Security Constraints

- No git push/commit from runner.
- Remove git remotes in temp workspace.
- Only local execution; no secret handling.

## Future Roadmap

- Model selection macros for tools without CLI flags.
- Optional cloud runner mode.
- Public shareable runs/leaderboard.

## Open Questions

- Preferred packaging: plain Bun server + browser, or app wrapper later?
- Max default concurrency for typical laptops?
