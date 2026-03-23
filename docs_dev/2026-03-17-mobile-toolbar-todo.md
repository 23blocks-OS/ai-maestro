# Mobile Toolbar & Prompt Builder TODO

## Completed
- [x] Button proportions matched to reference image (flex-grow per group)
- [x] Arrow symbols changed to unicode triangles
- [x] Independent Cmd/Meta modifier
- [x] Multi-modifier combos (Shift+Ctrl+Arrow, Ctrl+Alt+key, etc.)
- [x] ANSI modifier parameter encoding for nav keys
- [x] shiftChar() explicit character transformation (no OS dependency)
- [x] Max 2 locked modifiers enforcement
- [x] One-shot auto-release on any keystroke
- [x] Native + toolbar modifier aggregation (OR logic, no duplicates)
- [x] Hold-to-repeat on arrows, PgUp/PgDn, Home/End, Del
- [x] Hold-to-repeat applies locked modifiers on every tick (sendKeyRef)
- [x] Touch double-fire prevention (preventDefault on touchstart)
- [x] Button height 2x taller, zoom-independent (clamp)
- [x] Text selection preserved when tapping toolbar buttons
- [x] Shift+Return inserts newline in prompt builder
- [x] Tab/Shift+Tab indent/deindent in prompt builder
- [x] Enter mode setting (send vs newline) with toggle and localStorage persistence
- [x] Send button sends text + delayed return (500ms)
- [x] Insert Only sends text without return
- [x] Cmd/Ctrl+Enter = opposite of Enter's default

## Open
- [ ] **Server instability / dashboard resets** — PM2 shows 98 restarts. Dashboard resets while typing, reload gets stuck. Investigate PM2 error logs at `logs/pm2-error.log`. May be unrelated to toolbar changes (pre-existing).
- [ ] **Terminal text selection on touch devices** — holding touch on terminal text does not select it, cannot drag to select multilines. xterm.js canvas renderer doesn't support native touch selection. Need custom touch-to-select bridge.
