# F083 — The agent and the person can see the active device, and jump

**Status:** In Progress (jump and the Active marker work; the rest is below)
**Type:** Feature
**Created:** 2026-11-05

## Description

An agent knows which device it is on without asking. The dashboard shows it on the agent's card and in its chat, and
has a control to jump to another of the agent's devices. The agent's tool gets `aimaestro-device.sh jump <device>`.

## Why It's Needed

"Only one active" means little if nobody can see which one it is. An agent that does not know it is in the kitchen
answers as if it were in a terminal.

## Business Case

Trust and privacy: a person can always see where the agent is present.

## Implementation Plan

- Server: active device per agent (device-protocol #7), `POST /api/agents/[id]/devices/[key]/activate`, and deactivate.
- Status follows the single-source rule: the server feed carries it; views read it, none computes it.
- Agent context: the hook adds the active device to what the agent is told (one short line), only when it has one.
  An agent with no devices sees no change.
- UI: a small device label on the card and in the chat header; the jump control in the profile and on the Devices page.
- Tests: a jump changes what every view shows; an agent with no devices shows nothing.
- Effort: S-M. Depends on F078, device-protocol #7.

## Update 2026-11-06

The SDK holds the active device (`Controller.jump`, the `activated` event). What is left is the status feed, the agent's context and the screens. Spec step 4.

## Update 2026-11-07

Shipped: jump and the Active marker on the Devices page and in the agent's profile, `adp-device.sh jump`, and a device shows what its agent is doing (0.106.84).

Still to do: the hook does not tell the agent its active device, and the agent's card and chat header show no device label.
