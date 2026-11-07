# F103 — A paired device can speak as its owner (the phone counts as Juan)

**Status:** Todo
**Type:** Feature
**Created:** 2026-11-07

## Description

Today everything said at a device is unverified input: the agent hears "someone not verified said". When the phone app sends its words as device input (the cerebellum plan sent to the app team on 2026-11-07), Juan's own phone would lose the trust it has today, where its words reach the chat as him.

The rule: the operator can mark a paired device as speaking for one person ("this phone is Juan's"). Input from that device then reaches the agent and its cerebellum as that person, not as an unverified someone. Juan's decision (2026-11-07); the first step of kiosk auth (F101), applied to a device only one person carries.

## Why It's Needed

- Without it, moving the phone onto the device path makes the agent refuse real requests from its owner.
- It is the trust model F101 needs anyway: a verified "who" attached to device input.

## Business Case

The agent's owner can ask for real work from their own phone by voice, at cerebellum speed, with the agent knowing it is them.

## Implementation Plan

- **Where it lives:** in AI Maestro, not the device and not the protocol. Device records (`devices/state.json`, owned by the device SDK) have no person; add `agent.devicePeople: { [deviceKey]: personId }` in the registry, validated in `services/agents-core-service.ts`.
- **Who sets it:** only the operator, in the dashboard's Devices view ("Speaks as: Juan"). A device can never claim it. Unpairing a device clears it.
- **What changes:** `lib/device-events.ts` sends input from such a device as that person (the same path the chat uses for the operator), and the cerebellum's turn line says "Juan said at his phone" instead of "someone not verified said". Everything else stays unverified.
- **Limits to state plainly:** it trusts the device, not the voice. Someone holding the unlocked phone speaks as its owner. Fine for a phone; never offered for a shared kiosk (that is F101).
- Tests: a marked device's input reaches the agent as the person; an unmarked one stays unverified; a device cannot set it.
- Related: F100, F101, F057 (people). Effort: S.
