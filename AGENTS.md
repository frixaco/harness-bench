# hbench

CLI agent benchmarker dashboard.

## Stack

- Tanstack Start + React 19
- Tailwind 4 + shadcn (base-ui)
- Bun (not Node)

## Commands

```bash
bun run dev      # dev server on :3000
bun run build    # production build
bun run check    # format + lint
bun run test     # vitest
```

## Structure

- `src/components/dashboard/` - main dashboard components
- `src/components/ui/` - shadcn primitives
- `src/styles.css` - theme variables (oklch), dark mode default

## UI Guidelines

- Dark theme, monospace for terminals
- lucide-react icons only
- Minimal, bold, not generic - focus on tool output
- Use existing shadcn components before creating new ones
