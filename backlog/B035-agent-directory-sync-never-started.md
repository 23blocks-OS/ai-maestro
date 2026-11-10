# B035 — Agent directory sync is never started

**Status:** Done (v0.106.125: the directory reads other hosts from `/mesh`; the dead sync is removed. F089 still adds people and labels)
**Type:** Bug
**Created:** 2026-11-06

## Description

`lib/agent-directory.ts` describes a directory with "Periodic sync with peer hosts", and has `startDirectorySync`, but nothing calls it
since it was added in #147. All three hosts have 0 remote entries (live, 2026-11-06). Only a manual `POST /api/agents/directory/sync`
runs it. The comments mislead: reading them, one concludes that agents sync.

## Why It's Needed

The code says the mesh shares agents when it does not. That hid B034 and misled the design of the people directory.

## Business Case

Accuracy of the design everything else builds on.

## Implementation Plan

Do not just start it: it carries no label and only agents. F089 step 1 replaces it; delete what it replaces. Effort: S, inside F089.
