# F071 — Doctor: check the agent programs on each host (Claude Code, Codex, Pi, …)

**Status:** Todo
**Type:** Feature
**Created:** 2026-11-03

## Description

A new Doctor install check, `agent-programs` (F069, `docs/SPEC-DOCTOR.md`), on every host. For each
program the host's agents use, and each program AI Maestro can launch:

- which copy AI Maestro starts (the same resolver the server uses to launch agents), and its version;
- `--version` run with a time limit: a program that does not answer is a fail;
- an older copy earlier on PATH than the one in use (scripts and other users of PATH find it first);
- a program an agent on this host is set to run that is not installed: fail, naming the agents;
- for Claude Code: the PermissionRequest hook is registered when the version supports it (2.0.45+).

Each finding has a hint with the exact command to fix it (install, update, or remove the old copy). The
report also lists the installed programs and versions, so other screens can use it (F072).

## Why It's Needed

On 2026-11-03 mac-mini had a Homebrew Claude Code 2.0.33 in `/usr/local/bin` ahead of the 2.1.316 the
agents run. It hung on `--version`, stalled two deploys, and kept the PermissionRequest hook off that host
for weeks. Nothing showed it; it was found by watching a stuck deploy (fixed in 0.106.65, PR #771).

## Business Case

- Reliability: a broken or stale agent program fails silently until a deploy or an agent start hangs.
- Support: "my agent will not start" on a new host is mostly a missing or old program.
- It feeds F072, so the create-agent dialog knows what each host can run.

## Implementation Plan

- `services/doctor-checks.ts`: `checkAgentPrograms(agents, …)`. Reuse the launch resolver (the code that
  picks the newest `claude`) and the program kinds in `lib/agent-runtime-kind.mjs`. Run each `--version`
  through `execFile` with a 10 s timeout, in parallel, once per report (the report is cached 60 s).
- Category `install`; items keyed by program name; no fixes in the closed list (installers stay out of v1
  of the Doctor, see SPEC-DOCTOR section 6), hints only.
- Add the installed programs to the report (`details.programs: { name, path, version }[]`) for F072.
- Tests with fake binaries: answers, hangs, missing, an older copy earlier on PATH.
- Tell the app team (ai-maestro-app): a new check, same contract.
- Effort: S-M.
