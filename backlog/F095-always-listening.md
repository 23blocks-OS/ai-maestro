# F095 — Talk to an agent without tapping: it listens all the time

**Status:** Todo
**Type:** Feature
**Created:** 2026-11-06

## Description

Today a person taps the mic to talk and taps again to send. Later, a person just speaks: the device listens all the time, knows when someone is talking to the agent, and sends only that.

The device would detect speech locally, then either a wake phrase ("Hey Lola") or, in a conversation already started, a short window where no phrase is needed. Nothing is sent or recorded until then. The person can still interrupt the agent by talking.

## Why It's Needed

Tapping makes a device feel like a tool you operate. Juan wants an agent that feels present in a room: you talk, and it answers (Juan, 2026-11-06).

## Business Case

- Positioning: a real presence in a place, the idea behind agents owning devices, and what voice products in a home already offer.
- Risk to handle: a microphone that is always on is the most sensitive thing this product could do.

## Implementation Plan

- Hold to the protocol's rules: the microphone grant applies, and a sign shows whenever the microphone is on. A listening mode needs its own grant, off by default, and a clearly different sign from "sending to the agent".
- Detection runs on the device and audio stays there until the wake phrase. Weak devices may not manage this: the 2010 MacBook is a Core 2 Duo without AVX, so measure, and keep tap to talk as the fallback.
- Other people in the room did not agree to this: decide what a guest sees and how to mute it with one touch.
- The agent's own voice must not trigger it: needs echo handling, or listening pauses while it speaks. Barge-in depends on this.
- Follows the kiosk redesign (tap to talk) and F092. Related: F059 and F050 for real-time voice. Protocol first, as it changes what a device may do.
- Effort: L.
