# B022 — Hook state files are keyed by folder, not by agent or session

**Status:** Todo
**Type:** Bug
**Created:** 2026-11-02

## Description

The hook writes `~/.aimaestro/chat-state/<cwd-hash>.json` (and `.announced`, `.notified`,
`.recalled`) per folder. Two sessions in the same folder overwrite each other's status, inbox
announcements and recall state. Found with #758.

## Why It's Needed

With one folder per agent (0.106.61) this mostly stops. It still happens when two sessions of one
agent run at once, or when an agent works in another agent's folder for a while.

## Business Case

Low frequency now, but wrong status and missed notifications are the bugs people notice most.

## Implementation Plan

- Key the files by agent id when the hook resolves one, and by folder otherwise.
- Readers to change: `readHookState` (lib/chat-transcript.mjs), pane readback, the server's
  hookState watchers, `pruneChatState`, the announced, notified and recalled helpers in the hook.
- Migration: read both names for one release.
- Effort: M. Open question: does the server always know the agent id when it reads the state?
