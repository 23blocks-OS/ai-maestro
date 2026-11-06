# F086 — Open the device protocol: name, public repo, website and docs

**Status:** Todo
**Type:** Feature
**Created:** 2026-11-05

## Description

Make the device protocol something others can implement: settle its name, open the repo, publish the spec on its own
small website (as agentmessaging.org does for AMP), and add a gadgets and homes page to AI Maestro's own site and docs.

## Why It's Needed

The repo is private, so nobody else can build a device or a controller. A protocol with one implementation and no
public spec is an internal API.

## Business Case

Positioning: an open, private-by-design alternative to vendor gadget platforms. Hardware makers and hobbyists can
target it, and AI Maestro is the reference controller.

## Implementation Plan

- Name: neutral, without our product in it. The code already uses `ADP_HOME`, which suggests Agent Device Protocol.
- Timing: after device-protocol #7 and #8, because those change the model. Publishing v1 as it stands would describe
  one device per controller.
- Site: spec, quick start with the Linux bridge, how to build a device, how to build a controller. Same format as the
  other protocol sites.
- Update the protocol repo's runbook: AI Maestro as the controller, without the isolation advice.
- Effort: S-M.
