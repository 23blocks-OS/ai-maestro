# F091 — The Town: default town at install, join from the new machine, and merge

**Status:** Todo (spec: [docs/SPEC-TOWN.md](../docs/SPEC-TOWN.md))
**Type:** Feature
**Created:** 2026-11-06

## Description

The machines that trust each other are a **Town**. An install founds one at once, with a default name. The first screen offers Start here or Join
another town, so a person no longer creates a second town by accident. Joining works from the new machine. A town with no residents is free to
rename or drop. Towns with residents can merge. The analogy (town, buildings, town hall, offices) is the language of the product; code and
APIs keep plain words. Every town has a town id; a name alone is not an identity.

## Why It's Needed

Two things were both called "organization", which confused every item touching them. And the current flow is a dead end: the name is permanent, a
second machine's first screen creates a second one, and joining is then refused with "mismatch".

## Business Case

- Activation: a town is there on first run, with no form to fill.
- Growth: adding a machine is one step, from the machine.
- Positioning: a product with character, as "tailnet" gave Tailscale.

## Implementation Plan

See the spec. Steps: town id on update; default name and new first screen; join from the new machine; words in the product; merge, with its own design
first. Default names are ancient and historic cities. Depends on F089 for merge. Takes over the town half of F075.

- Effort: L, in steps.
