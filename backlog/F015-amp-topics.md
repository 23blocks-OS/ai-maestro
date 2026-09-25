# F015 — AMP topics (channels) with replayable offsets

**Status:** Todo
**Type:** Feature
**Created:** 2026-09-25

## Description

Add one-to-many messaging to AMP as a first-class primitive: **topics**
(channels) that agents subscribe to, with every message still Ed25519-signed by
its sender. Each topic is an append-only log; each subscriber keeps an
**offset** (what it has processed) and can **replay** from any offset after a
crash. A live stream (SSE/WebSocket) serves non-LLM consumers (services,
dashboards); LLM agents keep getting woken the AMP way (push, F010 inbox).

Candidates to move onto topics: team broadcasts, meeting chat (today a
`[MEETING:id]` subject prefix on 1:1 mail), deploy/fleet announcements, the
kanban/task events.

## Why It's Needed

AMP is addressed 1:1 mail. One-to-many is faked with subject prefixes and
per-recipient copies, which makes membership, history and "who has seen what"
hard. agentlog (docs/benchmark/agentlog-comparison.md) shows the clean shape:
topics + append-only log + consumer offsets + replay. firstmate's append-only
status events point the same way.

## Business Case

Teams of agents are a core AI Maestro story (meetings, kanban, fleet
coordination). A real channel primitive, signed and federated, is a
differentiator no pub/sub bus (agentlog) or file-based crew (firstmate) has.

## Implementation Plan

- Protocol: topic address form (e.g. `#deploys@team.local`), subscribe /
  unsubscribe, publish (signed), fetch-from-offset; spec change upstream in
  `agentmessaging/claude-plugin` + provider endpoints in AI Maestro.
- Storage: append-only JSONL per topic on the provider; per-subscriber offsets.
- Delivery: push/wake to LLM subscribers as today; SSE for programmatic ones.
- Migrate meeting chat first. Effort: L (protocol + provider + CLI + UI).
