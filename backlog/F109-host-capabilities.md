# F109 — Each host says what it can run

**Status:** In Progress
**Type:** Feature
**Created:** 2026-11-10

## Description

Every host runs the same code and has the same features (it is a mesh), but not every host has the physical resources or the connectivity to run every feature. Each host should report, as part of its host information, which features it **can** run and which it **cannot**, and why: for example live meetings (needs the meeting keys, a microphone path and bandwidth), local voice (needs the voice models), the speaking side (needs Claude credentials), heavy indexing (needs memory). The dashboard shows it per host, and features that need a capability go only to a host that has it.

## Why It's Needed

Juan, 2026-11-10: "All hosts share the same code and the same set of features as this is a mesh network, but some may not have the physical resources or connectivity to run some features." Today this is decided by hand and remembered by people: some features run only on one computer, and a small host has too little memory for others. Nothing in the code knows it, so a feature can land on a host that cannot carry it.

## Business Case

- Reliability: a feature placed on a host that cannot run it fails at the worst moment (a meeting, a call).
- Fewer hand-kept rules, and a clear reason shown when a host cannot do something.
- Scales with more hosts (other people's machines, cloud workers).

## Implementation Plan

- A capability probe per host (memory, CPU, disk, vault keys present (names only), voice models, Claude credentials, public reachability), plus an operator override ("runs meetings: yes/no").
- Published over `/mesh` as one more feed (docs/SPEC-MESH-SYNC.md), so every host knows every other host's capabilities.
- Host page in Settings: can / cannot, with the reason.
- Features check it before they start (meeting bridge, speaking side, indexing) and refuse plainly.
- Effort: M. Open: which capabilities are probed and which are only declared by the operator.

## Shipped, first step (v0.106.156)

- `lib/host-capabilities.ts`: probe (memory, CPUs, free disk, vault key names, local voice, Claude Code, agent faces), cached a minute. Capabilities: meetings, publicMeetings, lipSyncFace, agentVoice, localVoice, speakingSide, heavyWork, each with a reason.
- Operator override in `~/.aimaestro/host-capabilities.json`, e.g. `{ "meetings": { "can": false, "why": "meetings run only on the office computer" } }`.
- Shared over /mesh as the page feed `capabilities` (`GET /api/mesh/capabilities`); Settings → Hosts shows a row per host (hover for the reason).
- Enforced so far: meeting invites refuse on a host that cannot host meetings. Still open: speaking side and indexing checks, public reachability probe.
