# F082 — What a person says to a device reaches the agent

**Status:** Todo
**Type:** Feature
**Created:** 2026-11-05

## Description

A person types or speaks at a device and the agent gets it in its normal conversation, marked with the device it came
from, and answers on that device. A hibernated agent wakes for it.

## Why It's Needed

Without it a device is only something the agent reads from, not a place the agent is present. This is the difference
between a remote camera and an agent in the kitchen.

## Business Case

It is the core of the product idea, and what Muse gadgets already do.

## Implementation Plan

- Receive the signed `input` message (device-protocol #11) on the device connection (#8).
- Deliver through the existing path to the agent, with the proven delivery the chat uses (`deliverAndVerify`), and show
  it in the chat with the device's label. It is not attributed to a named person: the device knows only that someone
  used it.
- Wake a hibernated agent the way a message does.
- The reply goes to the device that asked, with an output capability (#12).
- Input makes that device active (#7).
- Tests: delivered to the assigned agent only; a hibernated agent wakes; a reply returns to the same device.
- Effort: M. Depends on F078, device-protocol #8, #11, #12.
