# F081 — An agent's devices follow it through export, import, moves and deletion

**Status:** Todo
**Type:** Feature
**Created:** 2026-11-05

## Description

Agents move between hosts. When one does, its device key, device list and active device go with it, and its devices
keep working with no re-pairing. Deleting an agent removes them. A hibernated agent keeps its devices.

## Why It's Needed

Devices pin the agent's key. A move that leaves the key behind strands every device the agent owns, and the operator
would have to walk to each one to fix it.

## Business Case

Reliability of something people build into their homes and cars. Agent portability is a structural advantage of AI
Maestro; devices must not break it.

## Implementation Plan

- `services/agents-transfer-service.ts`, export and import: include `~/.aimaestro/agents/<id>/devices/`. The key is a
  secret: an export file must say that it carries one, and offer to leave it out.
- After a move, the old host must not keep a copy that still signs.
- Hibernated: the server holds the key, so device calls still work; define what a device shows (`activity` unknown).
- Hard delete removes the folder; the devices then reject the key. Say so in the delete dialog when an agent has devices.
- Tests: export and import keep a device working; a move leaves no signing copy behind; delete removes the folder.
- Effort: S-M. Depends on F078.
