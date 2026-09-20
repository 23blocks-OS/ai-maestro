# B001 — Two browsers on one agent fight over the terminal size

**Status:** Todo
**Type:** Bug
**Created:** 2026-09-19

## Description

Open the same agent in two browsers at different window sizes and the smaller one
renders wrong — the agent's TUI is sized for the larger viewport and gets
truncated or re-wrapped in the smaller.

Reproduced 19 Sep 2026 with two WebSocket clients on one session:

```
both attached            → pane 80x23
A resizes to 80x24       → pane 80x23
B resizes to 200x50      → pane 200x49   ← B wins
A resizes back to 80x24  → pane 200x49   ← A cannot win it back
```

## Root cause — not what it first looked like

The first read was "any client resizes the shared PTY". **That is wrong.**
`tmux list-clients` shows **two attached clients**: each WebSocket spawns its own
PTY running `tmux attach-session`, and **tmux** arbitrates, not our code.

The deciding setting is `window-size latest` (tmux 3.6a default), where "latest"
means most recently **used**, not most recently resized — which is why A could not
reclaim the size without typing.

`server.mjs:2308` does apply any client's resize to its own PTY unconditionally,
but that is one tmux client asking; tmux decides what the window becomes.

## Why It's Needed

Two browsers on one agent is ordinary: a desktop and a phone, or a second tab.
Today the second viewer silently gets a broken render and nothing explains why.

## Business Case

Low-frequency, high-confusion. Cheap to fix, and it undermines confidence in the
terminal — which is the feature people trust most.

## Implementation Plan

**Do not copy rDev's `activeWs`.** That is him hand-implementing "last one to type
owns the size" because he has one PTY and no multiplexer. We have tmux, which
already offers better answers:

| option | effect | cost |
|---|---|---|
| `window-size smallest` | every client fits; the big screen letterboxes | one setting |
| `window-size latest` (today) | most recent wins; others truncate | — |
| **tmux session groups** (`new-session -t`) | each viewer gets an independent client and its own size over shared windows | real work, the correct fix |

Session groups are what tmux provides for exactly this. Worth a spike before
picking a setting, because the setting is a trade and the group is a fix.

- Effort: **S** (setting) / **M** (session groups)
- Open question: does a session group break our scrollback capture
  (`capture-pane -S -50000`) or the alternate-screen handling?
