# Known Issues

Recurring issues and their fixes. If you're debugging terminal problems, check here first.

## Terminal Text Selection (Yellow Instead of Gray)

**Symptom:** Clicking and dragging in the terminal shows yellow tmux copy-mode selection instead of browser-native gray selection. Can't copy text to clipboard via mouse.

**Root Cause:** User's `~/.tmux.conf` has `set -g mouse on`, which makes tmux capture all mouse events before xterm.js can handle them.

**Fix:** `server.mjs` disables mouse mode per-session via `tmux set-option -t <session> mouse off` after PTY creation. This runs once per session, not globally, so the user's tmux config is unaffected for direct terminal use.

**History:** This issue has recurred multiple times. Any change to the PTY spawn flow in `server.mjs` must preserve the `tmux set-option mouse off` call. See CLAUDE.md "Critical Terminal Configuration" section.

**Files:** `server.mjs` (PTY creation block, after `terminalSessions.set()`)

---

## Double/Overlapping Terminal Content on Connect

**Symptom:** When connecting to an agent, terminal content appears twice — once with correct ANSI formatting and once as plain text, overlapping at different widths.

**Root Cause:** The server was sending both PTY `tmux attach` redraw (ANSI, correct width) AND `tmux capture-pane` scrollback (plain text, potentially different width) to xterm.js.

**Fix (v0.29.16):** Removed `capture-pane` history entirely. The PTY `tmux attach` already redraws the visible pane with correct ANSI content. Scrollback history is available via tmux copy mode (Ctrl-b [) or xterm.js buffer (Shift+PageUp/Down).

**Files:** `server.mjs` (WebSocket connection handler, after client is added to session)

---

## Blank Terminal on Agent Switch

**Symptom:** Switching to a different agent shows a blank terminal that takes a long time to display content.

**Root Cause:** The `history-complete` signal was firing immediately (before the PTY had time to stream the tmux redraw). The client did refit + resize + scroll-to-bottom on an empty terminal, and when data arrived later, no scroll-to-bottom was triggered.

**Fix (v0.29.17):** Added 200ms delay before sending `history-complete` to let the PTY stream the initial tmux redraw.

**Files:** `server.mjs` (WebSocket connection handler, `setTimeout` around `history-complete`)

---

## Terminal Not Fitting Container

**Symptom:** Terminal has scrollbars or content is clipped.

**Fix:** Always call `fitAddon.fit()` after `terminal.open(container)` and on window resize.

**Files:** `hooks/useTerminal.ts`

---

## Characters Duplicated / Every Character on New Line

**Symptom:** Typing produces doubled characters or each character appears on a separate line.

**Root Cause:** `convertEol` was set to `true` in xterm.js config. PTY and tmux already handle line endings — xterm.js converting `\n` to `\r\n` on top causes duplication.

**Fix:** `convertEol: false` in terminal options.

**Files:** `hooks/useTerminal.ts`
