# F084 — Doctor checks for agent devices

**Status:** Todo
**Type:** Feature
**Created:** 2026-11-05

## Description

The Doctor reports devices: an owned device that does not answer, a device re-paired to another agent, and a vendored
device SDK that differs from its recorded hash. A host with no devices shows nothing new.

## Why It's Needed

A device that went offline last week looks fine until the moment the agent needs it.

## Business Case

Support load: the same reason as F069.

## Implementation Plan

- `services/doctor-checks.ts`: a `devices` check in category `agents`, with an item per device, named by agent. Uses
  last contact from the records; it does not call devices on every run.
- Same contract v2, so the app and the CLI show it with no change.
- Effort: S. Depends on F078.
