# F107 — One sync channel between hosts

**Status:** Todo
**Type:** Feature
**Created:** 2026-11-09

## Description

Hosts exchange agent data in about ten different ways (the browser asks every host for agents, projects and tasks; servers ask every host for sessions, snapshots, events and lookups), and agent status in none. Replace them with one WebSocket per peer, `/mesh`, where each host publishes its own agents (list, session, status, snapshot) and the others keep a read-only copy. Spec: [docs/SPEC-MESH-SYNC.md](../docs/SPEC-MESH-SYNC.md).

## Why It's Needed

Agents on another host show Ready while they work and Working while they are idle (B038, reopened). Each cross-host path fails in its own way, so every bug is fixed once per feature. The audit of 2026-11-09 (`scripts/status-audit.mjs`, docs/AGENT-STATUS.md) found 11 agents shown Working while idle on two hosts.

## Business Case

Status is the first thing the operator reads about the fleet. While it is wrong, nobody can trust the dashboard, and multi-host is the product's main use. One channel also closes B035 (the agent directory sync that never started).

## Implementation Plan

Four steps, each shipped and checked with the status audit before the next (spec section 5): status right on the owning host (S); the channel carrying status (M); agent list and sessions on the channel (M); snapshots, lookups, directory and the rest (M).
