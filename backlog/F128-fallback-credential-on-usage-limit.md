# F128 — Switch to a fallback credential when a session hits its usage limit

**Status:** Todo
**Type:** Feature
**Created:** 2026-11-19

## Description

When a Claude Code session reaches its account's usage limit, AI Maestro sees it and moves that agent (or its crew) to the next credential profile in a configured fallback list, then restarts the agents that are idle. Agents that are working stay where they are; the credential check shows them as `mismatch` until they restart (0.106.237).

Proposed setting, from the field: `credential.fallback = [<profile>, ...]` on the agent record, plus a crew-level default.

## Why It's Needed

Field report, 2026-11-18/19: eleven agents on one subscription token hit the account's usage window twice in five hours. The whole crew, its GM included, stopped for 28 minutes and then for three hours. Today the switch is done by hand (or by a 15-minute schedule as a stopgap).

## Business Case

- Reliability: a crew that shares one account stops at once; a fallback keeps it working.
- Less operator load: no manual rotation at night.

## Implementation Plan

- Detection: the pane line Claude Code prints when the limit is reached (read from the pane, the same way as permission prompts), or rate-limit headers where a gateway exposes them. Find which is reliable before building.
- `lib/agent-credential.ts`: `fallback` list in `parseCredential` (vault names only, same checks as `secret`).
- The switch reuses the existing `credential switch` path, with `--restart` for idle agents only.
- Record each automatic switch in the agent's log so the operator sees why it moved.
- Open: when to move back (the window resets), and whether a crew moves together or agent by agent.
- Effort: M.
