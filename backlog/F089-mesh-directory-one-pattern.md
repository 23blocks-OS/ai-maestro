# F089 — One pattern for the mesh: owner host and a directory on every host

**Status:** Todo (spec for review: [docs/SPEC-MESH-ENTITIES.md](../docs/SPEC-MESH-ENTITIES.md))
**Type:** Feature
**Created:** 2026-11-06

## Description

Every entity known across the organization (agents, people, teams, projects, `org:` groups) follows one pattern: one owner host
writes it, and every host keeps a read copy of what is needed to find, name and verify it, through one generic sync. Delivery
stores and forwards, so it does not depend on the recipient's host being awake.

## Why It's Needed

Juan's rule (2026-11-06): if agents sync between hosts, humans do too; concepts and patterns come first. The audit found that only
hosts sync. Agents and people are found by asking peers at the moment of need, teams exist on one host, and anything on a sleeping
host stops existing for the mesh.

## Business Case

- Reliability: a laptop going to sleep must not make a person or an agent disappear.
- Cost: every later feature (devices, org visibility, host join) stops inventing its own answer.

## Implementation Plan

Steps and decisions are in the spec, sections 6 and 7. Builds on the peer exchange that hosts use. Replaces `lib/agent-directory.ts`
sync. Depends on Juan's decisions on what "organization" means and on one writer. Absorbs part of F057; F074 and F075 follow it.

- Effort: L, in steps.
