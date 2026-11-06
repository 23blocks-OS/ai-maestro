# F085 — Set up a new device with one command from AI Maestro

**Status:** Todo
**Type:** Feature
**Created:** 2026-11-05

## Description

Adding a device today means cloning the protocol repo on it, installing Node, and copying keys by hand in both
directions. AI Maestro gives one command to run on the device that installs the bridge and finishes the pairing.

## Why It's Needed

The runbook has seven sections. Few people will finish it. Muse's Linux installer is one script.

## Business Case

Activation: the step between "this is interesting" and "my agent is in my kitchen".

## Implementation Plan

- An installer in the protocol repo (checksummed, readable first, as B018 asks of our other installers).
- Pairing code: the dashboard shows a short one-time code; the device sends its key with it, and the operator compares
  a fingerprint on both sides. It must not weaken the protocol's rule that an unpaired peer cannot enroll itself.
- The repo is private today, so the install path depends on the decision to open it (F086).
- Effort: M. Depends on F078.
