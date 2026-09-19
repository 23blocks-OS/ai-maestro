# F003 — Native iOS selection and paste in the terminal

**Status:** Todo
**Type:** Feature
**Created:** 2026-09-19

## Description

Swap `@xterm/xterm` for **`@cocalc/xterm`**, a fork carrying xterm.js
[PR #5961](https://github.com/xtermjs/xterm.js/pull/5961), which adds native iOS
long-press selection and paste. Revert to stock once the PR lands upstream.

Found in `singledigit/microvm-dev-environment`, whose author verified it on
iPhone Safari and left a comment saying exactly that.

## Why It's Needed

The dashboard is reachable from a phone or iPad today, and the terminal is close
to unusable there: no long-press selection, no native paste. rDev is explicitly
"built for the iPad" and this is the one change that made it work.

## Business Case

- Mobile is the gap the benchmark keeps flagging — **Orca and Paseo both ship iOS
  and Android**, and both lead with "check your agents from your phone".
- Small and reversible: a dependency swap with a documented exit (drop the fork
  when #5961 merges).

## Implementation Plan

- Pin `@cocalc/xterm` in place of `@xterm/xterm`, confirm the addon versions we use
  (fit, webgl, serialize, clipboard, unicode11, web-links) still load against it —
  **the fork tracks 5.5 and we are on 6.0, so this may be a downgrade, not a swap.
  Check that first; it may be the whole answer.**
- Verify on a real iPhone/iPad, not a simulator.
- Add a note to `docs/CHAT-ARCHITECTURE.md` recording why we are on a fork.

- Effort: **S** (if the fork tracks 6.0) / **M** (if it means downgrading from 6.0)
- Risk: losing xterm 6.0 features we already depend on
