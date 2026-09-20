# B004 — Audit remaining shell-string external commands (git, aws) for injection

**Status:** Todo
**Type:** Bug
**Created:** 2026-09-19

## Description

A sweep for `exec(Async|Sync)` calls that interpolate a value into a shell
string (done while fixing GHSA-2vm8-3q4q-wqv3) found two residual sites that
were left as follow-ups because they are lower severity than the reported tmux
path:

- `services/agents-transfer-service.ts:188`
  ```ts
  execSync(`git clone --branch ${branch} "${repo.remoteUrl}" "${targetPath}"`, …)
  ```
  `branch` is unquoted; `repo.remoteUrl` is double-quoted (same insufficient
  guard the advisory exploited — `$(…)` still evaluates).

- `services/agents-cloud-service.ts:79`
  ```ts
  execAsync(`aws sts get-caller-identity --profile ${profile}`, …)
  ```
  `profile` is unquoted.

NOT in scope of B004, confirmed safe during the sweep:
- **tmux** — all call sites converted to `lib/tmux-safe.mjs` (argv form +
  validated session name). Fixed under the GHSA.
- **docker** — `lib/container-utils.ts` and `services/agents-docker-service.ts`
  use `shellQuote()` / a validated container name, which is a real single-quote
  escaper, not the bare-double-quote guard the advisory defeated.
- **gray-matter** — `lib/safe-matter.ts` already overrides the executable
  engines (GHSA-g7qj-fhxp-6chc). Both call sites use it.

## Why It's Needed

`branch`, `repo.remoteUrl`, and `profile` come from the agent registry / repo
config today, not from an unauthenticated network request — so this is not the
same critical, remotely-reachable class as the tmux path. But they are the same
CODE SHAPE, and the whole lesson of the GHSA is that a value's trust level
changes as the app grows while the dangerous primitive stays put. Convert them
now, while the pattern is fresh, rather than waiting for a route to start
feeding one of them attacker input.

## Business Case

- Risk mitigation: closes the last instances of the exact anti-pattern that
  produced two published advisories, before they become a third.
- Cheap: `git`/`aws` convert to `execFile` with an argument vector the same way
  tmux did; no behaviour change, small diff.
- Credibility: a security reporter who reads the repo after the GHSA fix will
  grep for the same shape. Finding none says the fix was understood, not just
  applied to the one reported line.

## Implementation Plan

- `agents-transfer-service.ts`: `execFileSync('git', ['clone', '--branch',
  branch, repo.remoteUrl, targetPath], …)`. Validate `branch` against a
  ref-name charset; reject a `remoteUrl` whose scheme is not https/ssh/git.
- `agents-cloud-service.ts`: `execFileAsync('aws', ['sts',
  'get-caller-identity', '--profile', profile], …)`; validate `profile` against
  `^[a-zA-Z0-9._-]+$`.
- Add a CI guard test (or a lint grep) that fails on a NEW
  `exec(Sync)?(\`…\${\`) shell-string interpolation, so this class cannot
  silently return. This is the real fix — the audit is one-time, the guard is
  what keeps it fixed.
- Effort: **S**.
- Open question: is a shared `spawn`-based helper (like `tmux-safe`) worth it for
  git/docker/aws, or is per-site conversion enough given how few remain?
