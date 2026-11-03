# B025 — The approval card shows the command, then only the options

**Status:** Todo
**Type:** Bug
**Created:** 2026-11-03

## Description

An approval card in the chat first shows what the agent wants to run ("Run: git var GIT_AUTHOR_IDENT"
with the command). Seconds later it changes to "Do you want to proceed?" with Yes / Yes, and don't ask
again for: git * / No, and the command is gone. A person who was not watching sees only the options and
cannot tell what they approve. Seen on Blaine (`api-geolocation`) in the mobile app, 2026-11-03
(screenshots IMG_5947 and IMG_5954); the web chat uses the same server state.

Likely cause (from the code, not yet reproduced):

1. Claude Code's observe-only PermissionRequest hook writes a `permission_request` state with the tool
   and its input but no options. The chat draws it: the first card, with the command.
2. `broadcastHookState` in `server.mjs` calls `needsPaneApprovalCard` (`lib/pane-approval.mjs:277`),
   which is true for an observed state without options, and then **replaces** the whole state with the
   card parsed from the pane (`parsePermissionMenu`). The pane card has the menu but not the tool input:
   the second card.

Expected: one card that keeps the command and gains the options.

## Why It's Needed

An approval without its command is a blind "yes". This is the one place the person decides what an
agent may run, often on a phone, often in a hurry.

## Business Case

Risk: a person approves a command they never saw. Trust: approvals are the control that makes running a
fleet of agents acceptable.

## Implementation Plan

- Where the pane card replaces an observed hook state (`server.mjs` `broadcastHookState`, and the
  history path near line 264), merge instead: keep the hook state's tool name and input, take the
  options and keys from the pane.
- Check the three question renderers (`docs/CHAT-ARCHITECTURE.md`) and the mobile app draw the command
  when both are present.
- Tests: an observed state plus a pane menu gives one card with both.
- Effort: S-M. GitHub issue: #768.
