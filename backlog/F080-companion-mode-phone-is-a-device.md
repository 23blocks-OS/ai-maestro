# F080 — Companion mode makes the phone one of the agent's devices

**Status:** Todo (plan first; Juan, 2026-11-05: this needs careful planning)
**Type:** Feature
**Created:** 2026-11-05

## Description

When a person turns on companion mode in the app while talking to an agent, the phone becomes that agent's active
device, in both directions: the phone reaches everything the agent can do (chat, tasks, voice), and the agent reaches
the phone's camera, microphone and speaker through the device protocol. Turning companion mode off, closing the app or
losing the connection ends the agent's access.

Today companion mode is a web page (`/companion`) with a speech connection to one agent; it does not use the protocol.

## Why It's Needed

It is the most natural way to have an agent with you: no hardware to buy, and the jump between devices is one tap.

## Business Case

Activation: every app user already owns the device. Positioning: an agent that travels with you, without a cloud in
the middle.

## Implementation Plan

- Turning it on is the person's approval on the device, so it needs no operator key. Only one owner at a time;
  switching agents is a transfer.
- Needs from the protocol: device-opened connections (device-protocol #8), an assignment that ends by itself,
  permission per capability, the in-use sign (#14), and live audio for voice (F050, F059). Until then the app's
  current speech path stays.
- The phone keeps its person record (`types/person-device.ts`); companion mode adds a temporary device link beside it.
- The app also gets a Devices view (who owns what, the agent's active device). The app is ai-maestro-app's work.
- Effort: L. Depends on F078, device-protocol #7 and #8.

## Update 2026-11-06

The protocol has device-opened connections, but live media over them is excluded for now, and `clients/mobile` is a placeholder. This item waits for those.
