# F054 - Shared voice rooms for several people and agents (PR #703, part of #702)

**Status:** Todo (defer; keep the design notes)
**Type:** Feature
**Created:** 2026-10-29

## Description

A design document for rooms with several humans and several agents, in the Zoom View, with turn-taking so agents do not talk over each other, moderation, consent and a media server for many participants.

## Why It's Needed

A meeting where a person talks to a team of agents is an attractive demo and matches the Zoom View we already have (a grid of agents with cards and terminals).

## Business Case

Interesting, but it assumes everything below it works: calls, audio, identity for several humans, a media server, cost controls. None exists. The document is careful (separates a call from a room, requires consent for recording, avoids a peer mesh) and honest that nothing is implemented, so it does no harm as a note. Building toward it now would be the wrong order.

## Implementation Plan

- Do not merge PR #703 into `docs/` as a plan of record; keep it as notes in this item until F051-F053 have shipped. If merged, label it "future".
- Its claims about the current Zoom View check out (grid of agent cards, not an audio room).
- The hardest unsolved piece is not audio: it is who may speak to which agent and what an agent may say about its private memory to people in the room. Answer that before building.
- Verdict on #702 (Companion and Zoom integration design): accurate against the code (Companion uses `useTTS`, `useSpeechLevel`, `useCompanionWebSocket` and `CompanionInput`, which posts to `/api/agents/:id/chat`; the call overlay fakes its connection). Merge it as a design doc after two edits: say plainly that there is no login in AI Maestro and the design uses device pairing, and note that CHAT-ARCHITECTURE says the chat UI sends through the WebSocket path, so say which path a spoken message uses.
