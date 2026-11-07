# F096 — Companion mode in the phone app

**Status:** Todo (spec: [docs/SPEC-COMPANION-MODE.md](../docs/SPEC-COMPANION-MODE.md))
**Type:** Feature
**Created:** 2026-11-06

## Description

A person picks an agent in the app and gets the device experience on the phone: its signal, their signal, the mic, their camera. It is a mode of the existing app.

## Why It's Needed

The design made for the MacBook works best on the device people always carry (Juan, 2026-11-06).

## Business Case

- Reach: every app user gets the experience with no hardware.
- It reuses pairing, identity and the voice work, so it costs little.

## Implementation Plan

- App team: the screen, on-device speech to text, playback.
- Server: `POST /api/agents/[id]/speech`, next and headless, using the agent's voice (F092).
- Later: the phone as a real device (F080). Effort: server S, app M.
