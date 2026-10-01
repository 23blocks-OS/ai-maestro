# F021 — Audit instructions that trigger extra actions

**Status:** Todo
**Type:** Feature
**Created:** 2026-09-30

## Description

Count in real transcripts what each standing instruction makes agents
do, then remove or narrow the ones that buy nothing. The instructions come
from hook text, AMP notifications, memory recall notices, skills and
CLAUDE.md files.

## Why It's Needed

Anthropic's cost guide (`cost-hillclimb.md`, "What drives prompt cost")
found that cost comes from the extra actions an instruction triggers, not
from prompt length. "Verify twice" added 48% per task, "be maximally
thorough" 39%. Long text that triggers nothing is nearly free while cached.
Each extra action is a step that re-reads a ~500k context.

## Business Case

Lower cost on every agent, at once. Our own injections are ours to fix.

## Implementation Plan

- List every instruction we inject (the hook's `additionalContext`, AMP
  notification wording, memory notices, the plugin's skills).
- For each, count in transcripts the actions that follow it: inbox checks,
  re-reads, verification passes. Subtract mentions in the prompt itself, as
  the guide warns.
- Change one at a time and measure with `scripts/cost-breakdown.mjs`.
- Effort: S–M. Source: `docs/COST-OPTIMIZATION.md`.
