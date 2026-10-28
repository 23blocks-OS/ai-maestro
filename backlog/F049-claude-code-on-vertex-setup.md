# F049 - Claude Code on Google Vertex AI, with the host's own login

**Status:** In Progress (script and tests shipped in 0.106.10; not yet run against a real home folder)
**Type:** Feature
**Created:** 2026-10-28

## Description

`scripts/install-claude-vertex.sh` sets up Claude Code to answer through Google Vertex AI on a cloud host, using the host's own Google identity (no API key), and can lock an agent down to a messaging-only permission profile for agents that talk to outside people.

## Why

A cloud host that already has a Google identity should not need an Anthropic API key on disk. The settings that make Claude Code use Vertex, and the permission rules that keep a public-facing agent to reading and answering messages, were found by hand on one Linux VM and are easy to get wrong (a deny rule for a tool name that does not exist, an invalid `mcp__*` allow rule, a first-run onboarding screen that stops a tmux pane). A script makes it repeatable and safe to run twice.

## What was verified by hand

On one Linux VM on Google Cloud: Claude Code 2.1.312, `claude-haiku-5-5` and `claude-haiku-4-5` answering through Vertex on the `global` location, with the VM's service account (role `roles/aiplatform.user`, no key). Regional endpoints returned quota errors for that project, and Sonnet was not enabled for it. These are observations of one project, not rules.

## Work

- [x] Script with `--project`, `--model`, `--region`, `--profile messaging|full`, `--agent-dir`, `--check`, `--dry-run`, `--yes`. Merges JSON, backs up changed files, idempotent, refuses invalid JSON.
- [x] Tests against a temporary HOME (`tests/install-claude-vertex.test.ts`).
- [x] Docs in `docs/AGENT-PROGRAMS.md`.
- [ ] Run once on a real host with a real Claude Code and a real Vertex project, and record the result here.
- [ ] Decide whether the Wake dialog should offer the messaging profile for Claude Code agents, as it does for Pi (F036).

## Limits

- It does not install Claude Code and does not grant the IAM role. The cloud admin grants `roles/aiplatform.user` to the host's service account.
- Permission rules limit the agent; Claude Code is not an operating-system sandbox.
- The agent CLI creates `<agent>/.claude/settings.local.json` with blanket Bash, Write, Edit and WebFetch permissions. `--agent-dir` replaces those with the messaging rules, but an agent created later will get the blanket file again until the CLI is changed.
