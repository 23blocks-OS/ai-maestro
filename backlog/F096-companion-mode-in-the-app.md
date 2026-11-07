# F096 — Companion mode in the phone app

**Status:** In Progress (works on TestFlight; spec: [docs/SPEC-COMPANION-MODE.md](../docs/SPEC-COMPANION-MODE.md))
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

## Update 2026-11-07

Built by the app team and tested by Juan on an iPhone: Lola's real voice through `/speech`, signals from real audio, captions, and a picture on request. The server part shipped in 0.106.96 to 0.106.99.

Done means it reaches the App Store. Still open: the delay numbers from a real test, and the app in the background.
