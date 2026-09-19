# B002 — wterm and ws are behind

**Status:** Todo
**Type:** Bug
**Created:** 2026-09-19

## Description

Audited the whole terminal stack 19 Sep 2026. Every `@xterm/*` package and
`node-pty` are at latest. Two are not:

| package | installed | latest |
|---|---|---|
| `@wterm/core` `/dom` `/react` | 0.3.0 | **0.5.0** |
| `ws` | 8.21.0 | 8.21.3 |

## Why It's Needed

wterm 0.4 → 0.5 ([vercel-labs/wterm](https://github.com/vercel-labs/wterm)) is not
a patch release:

- **Kitty keyboard protocol** negotiation
- **Kitty terminal images** — bounded PNG/RGB/RGBA
- **focused-cursor visibility fix** — the cursor was being lost over coloured,
  wide, block and blank cells
- *"the local PTY forwards browser dimensions"* — adjacent to B001

The cursor fix alone is a visible defect in the second terminal view today.

## Business Case

Routine currency, but we have two terminal stacks and only one is current. The
wterm view is the newer of the two and is the one drifting.

## Implementation Plan

- Bump `@wterm/core`, `@wterm/dom`, `@wterm/react` to 0.5.0 together — they are
  versioned in lockstep
- Bump `ws` to 8.21.3
- Exercise `WtermView` directly: resize, scrollback, paste, and the cursor over
  coloured cells
- Check whether "PTY forwards browser dimensions" changes what `WtermView` should
  send on `onResize` — it may interact with B001

- Effort: **S**
- Risk: two minor versions of a 0.x library; the API may have moved
