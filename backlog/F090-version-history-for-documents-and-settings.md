# F090 — Version history for an agent's documents, canvases and settings, with Git

**Status:** Todo
**Type:** Feature
**Created:** 2026-11-06

## Description

An agent's canvases, documents and settings keep a full history: what changed, when and by whom, with a diff and an Undo. AI Maestro
uses the Git already on every host, run by argv, with no new dependency and no Git server.

Today nothing has history. An agent can overwrite a canvas or break a setting, and the earlier version is gone (113 canvas files on
one host, 2026-11-06).

## Why It's Needed

Agents edit files on their own, all day. A person needs to see what changed and go back, without asking the agent.

## Business Case

- Trust: every change can be seen and undone, so people let agents do more.
- It gives F066 (audit trail) part of what it needs: "which rules was this agent running under at 14:03?" is a version stored by hash, which
  is how Git stores files.

## Implementation Plan

- One repo per agent under `~/.aimaestro/agents/<id>/`, separate from the agent's own project repo, so it never touches its code or commits. It
  moves with the agent (F081).
- **An allowlist of what is tracked** (canvas, docs, settings), never the whole folder: it holds `keys/` and databases (61 GB across one host's
  agents). Secrets and binaries must be unable to enter the history, because Git never forgets. Add a test that fails if a tracked path can hold
  a key.
- Automatic commits on save, naming who changed it (the agent, a person, AI Maestro), batched so 50 saves are not 50 commits.
- UI: history, diff and restore, first on canvases. Restore is a new commit; history is never rewritten.
- Size limit and a rule for old history.
- No sync between hosts in this item. Later, shared documents can sync with Git, which needs no server for it.
- Not for the directory (`docs/SPEC-MESH-ENTITIES.md`): it must converge by itself, and revocation cannot wait, so it keeps its own sync. A host may
  later commit directory changes to a local repo, read-only, for audit.
- Related: F066, F081.
- Effort: M.
