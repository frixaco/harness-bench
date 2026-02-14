---
name: screenshotting-dashboard
description: "Captures a fresh dashboard screenshot of the local hbench web app with all CLI agents running. Use when asked to update the README screenshot or verify all TUIs are active."
---

# Screenshotting Dashboard

Captures a fresh screenshot of the local hbench dashboard with all agent TUIs running, then saves the image to the public directory.

## When to Use

- User asks to update the README screenshot
- User requests a fresh UI capture after changes
- Need to verify the six TUIs are running and visible

## Assumptions

- `bun run dev` is running
- App is available at `http://localhost:3000`
- Chrome MCP is available

## Workflow

1. Navigate to `http://localhost:3000`.
2. Click each agent play button (Amp, Droid, Pi, Codex, Claude, Opencode).
3. Confirm terminals show `Terminal input` fields for all agents.
4. Take a full-page screenshot.
5. Save to `public/` with a cache-busting filename (date-stamped).
6. Update README image reference if requested.

## Tools

- Use Chrome MCP: `navigate_page`, `take_snapshot`, `click`, `take_screenshot`, `new_page`.

## Example Requests

- "Launch MCP, run TUIs again, confirm all are running, then update the README screenshot."
- "Take a new dashboard screenshot with all agents running and save it in public."
