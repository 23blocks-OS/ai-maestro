# F117 — Poppy: pages for agent access to companies

**Status:** Blocked
**Type:** Feature
**Created:** 2026-11-15

## Description

Agents that use the Personal Agent Protocol (Poppy) sign in to companies on the owner's behalf. The agent framework team (lbf-research, through lbf-gm) asked AI Maestro for four things:

1. **Held action page.** When an agent holds an action for the owner's approval, the owner approves or declines it in the dashboard (and the phone app).
2. **Device sign-in page.** While a Device Sign-In waits, the dashboard shows the code and the link the owner must open.
3. **Access view.** For each agent, the companies it can reach, with scopes and expiry, and a Revoke button per company.
4. **Agent key in the vault.** One P-256 (ES256) key per agent, kept in the aim-secret vault by name. The agent signs with it and never reads it.

## Why It's Needed

An agent that acts at a company needs a place where the owner sees and controls that access. Without these pages the owner can't approve, sign in or revoke without the terminal.

## Business Case

Poppy support for our own agent types is planned. AI Maestro is where the owner already manages agents, so access control belongs there too.

## Implementation Plan

- **Blocked on:** the shared Python package from lbf-research (identity, Poppy-Session signing, Device Sign-In). The pages show its state, so its interfaces come first. Decision (2026-11-15): build after that package exists.
- Held actions can reuse A2UI canvas pages (F114) or the task board's waiting cards.
- Key: aim-secret, one entry per agent; signing through `aim-secret exec`, so the key never reaches the agent's context.
- Every view must work for agents on other hosts.
- Effort: M for 1 and 2, M for 3, S for 4.
