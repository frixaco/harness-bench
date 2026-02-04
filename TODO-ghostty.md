# libghostty-vt Integration TODO

## 1. WASM Build

- [ ] Clone ghostty repo, build `ghostty-vt.wasm`
  ```bash
  zig build -Dtarget=wasm32-freestanding -Doptimize=ReleaseSmall
  ```
- [ ] Copy WASM to `public/` or bundled assets
- [ ] Verify C ABI exports: `ghostty_parser_new`, `ghostty_terminal_*`

## 2. JS Bindings

- [ ] Create `src/lib/ghostty-vt.ts` — load WASM, wrap C API
- [ ] Memory helpers: allocate/free for WASM heap
- [ ] Parser wrapper: `feed(bytes: Uint8Array) → Action[]`
- [ ] Terminal state wrapper: rows/cols, cursor, cell access

## 3. Terminal State

- [ ] Grid buffer: cells with char + attrs (fg/bg/bold/etc)
- [ ] Handle actions: `print`, `execute`, `csi_dispatch`, `osc_dispatch`
- [ ] Scrollback buffer (configurable limit)
- [ ] Resize support (SIGWINCH → reflow)

## 4. Rendering Layer

- [ ] Canvas renderer component (`<TerminalCanvas />`)
- [ ] Dirty-rect tracking — only repaint changed rows
- [ ] Font metrics: measure monospace char width/height
- [ ] Cursor rendering (block/bar/underline)
- [ ] Selection support (mouse drag → highlight)

## 5. Input (Control)

- [ ] Key encoder: `ghostty_key_encoder_encode` for escape sequences
- [ ] Mouse encoder: clicks/scroll → VT mouse reports
- [ ] Send encoded input back over WebSocket to PTY

## 6. Integration

- [ ] Hook into existing WebSocket PTY stream (per-tool)
- [ ] Create `useTerminal(wsUrl)` hook — connects WS, feeds parser, triggers render
- [ ] Grid layout: N terminals in CSS grid, each with own canvas

## 7. Extras

- [ ] Playback mode: replay stored PTY logs
- [ ] Copy/paste with OSC 52 or selection
- [ ] Hyperlink support (OSC 8)

---

**Start with**: WASM build → minimal parser wrapper → feed PTY bytes → print to console. Then add rendering.
