# F079 — Agent devices, phase 2: move a device to another agent, or unassign it, from the dashboard

**Status:** Todo (spec: [docs/SPEC-AGENT-DEVICES.md](../docs/SPEC-AGENT-DEVICES.md), section 9)
**Type:** Feature
**Created:** 2026-11-05

## Description

The operator moves a device from one agent to another, or unassigns it, from the Devices page (F078), safely:
a device has zero or one owner at any moment, and the dashboard shows the new owner only after the device
confirms it.

Protocol v1 (`23blocks-OS/ai-maestro-device-protocol`) cannot do this: the owner changes only by hand on the
device (`pair` with the new agent's key and address). So this item has two parts:

1. **Protocol (device-protocol repo, issue #10):**
   - An **operator key**, pinned on the device at pairing time next to the agent's key. It may only change the
     assignment; it cannot invoke capabilities.
   - Signed `assign {agent address, agent key, expectedRevision}` and `unassign {expectedRevision}` requests from
     the operator key, with a fresh challenge like every request.
   - The device applies the change only when `expectedRevision` matches its current revision (compare and swap),
     replaces the grant atomically, resets optional grants (the camera goes back to off), and answers with a signed
     confirmation that carries the new revision and owner.
   - In-flight capture data is never released to the former owner (the bridge already rechecks the grant before
     releasing data; keep that and test it).
   - Spec, SDK and Linux bridge changes, and tests, in that repo.
2. **AI Maestro:**
   - Transfer and Unassign buttons on the Devices page, with an inline confirmation.
   - States: transfer pending (sent, no confirmation yet), failed (refused or revision mismatch, with the reason),
     and offline (the device did not answer; it stays pending until the operator retries or reconciles).
   - The owner shown is always the last signed confirmation or registration, never what AI Maestro asked for.
   - The former agent loses access at its next call even if its session cached the device (F078 already checks the
     registration before each call).

## Why It's Needed

Devices move between agents as work moves (a laptop from Lola to a new support agent). Doing it by hand on the
device means walking to it or opening a shell on it, and nothing in AI Maestro shows the change until the next
discovery.

## Business Case

- Operations: one place to see and change who owns each device.
- Safety: compare and swap on the device makes two owners at once impossible, even with retries, restarts or two
  operators clicking at the same time.

## Implementation Plan

- Protocol first, in its repo, reviewed on its own; then AI Maestro.
- AI Maestro: the operator key lives with the host's own keys (not in any agent's folder); routes
  `POST /api/devices/[key]/assign` and `/unassign` (Next and headless), a pending-operations record per device so a
  restart keeps the pending state, and reconciliation by signed discovery.
- No app-level auth (by design): "authorized operator" means someone who can reach the dashboard, as for every
  other action.
- Tests: assignment, unassignment, transfer during a capture, an offline device and a retry, two conflicting
  requests (only one wins, the other fails with the revision mismatch), against the protocol's test double.
- Depends on F078. GitHub: #789 (the transfer half).
- Effort: M (protocol S-M, AI Maestro M).
