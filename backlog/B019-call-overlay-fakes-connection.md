# B019 - The call screen says "connected" after 2.5 seconds, whatever happens

**Status:** Done in 0.106.18 (the overlay follows the real voice socket; it will follow the call state machine once calls exist, F051)
**Type:** Bug
**Created:** 2026-10-29

## Description

`components/MobileCallOverlay.tsx` starts in a ringing phase and switches to connected after a fixed 2500 ms timer (lines 63-65). Nothing is called and nothing answers; the screen only looks like a call. Found while reviewing PR #701, which also notes it. Expected: the screen reflects what actually happens. Actual: it always shows connected.

## Why It's Needed

It is a small false claim in the product, the kind we work to avoid elsewhere (delivery reports, agent status). It also looks broken the moment real calls exist.

## Business Case

Honesty of the UI; a prerequisite for any real calling (F050). No customer has reported it.

## Implementation Plan

- Today: no real call exists, so rename the phase honestly (for example "talking to {agent}") or show "voice" instead of "ringing/connected", so the screen does not pretend to dial.
- Later: drive the phase from the call state machine (F051).
- Effort S. File: `components/MobileCallOverlay.tsx`. Check the desktop Companion page for the same pattern.
