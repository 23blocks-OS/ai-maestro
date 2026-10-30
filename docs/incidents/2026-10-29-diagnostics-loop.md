# Incident 2026-10-29: hosts looped diagnostics requests and buried themselves in child processes

**Status:** Resolved. Loop fixed in 0.106.21 (#719); the audit's findings fixed in 0.106.23 to 0.106.26; all of our hosts updated.
**Severity:** P0 (outage). AI Maestro was unusable for the whole organization: the dashboard stopped loading, the hosts were saturated, and work stopped. Agents kept running in tmux; no data was lost.
**Issue:** #720
**Affected versions:** 0.106.4 to 0.106.20 for multi-host setups; 0.24.17 to 0.106.20 for multi-host headless setups.

## Summary

Each AI Maestro host checked its peers by calling the peer's own `/api/diagnostics`. That endpoint runs the peer's full diagnostics, which calls *its* peers' `/api/diagnostics`, including the host that asked. Nothing stopped the recursion. Every run spawned `tmux -V` and `df`. The code had been in place since February 2026 but never ran live, because Next.js 14 served a cached copy of the route. The upgrade to Next.js 15 removed that caching. On the day the upgrade reached our three hosts, the requests between them grew faster than they could be served. One host reached 1,297 live child processes, macOS's `syspolicyd` stayed pinned checking every new process, the dashboard stopped loading, and `pm2 stop` could not stop the server.

## Impact

- Our three hosts (called A, B and C here; A is a MacBook, B a Mac mini, C a Linux machine) ran the loop from about 14:18 to 20:50 local time.
- On host A: dashboard loading agents took 20 seconds, then nothing answered at all; `GET /api/sessions` timed out. CPU of the server stayed near 100% for hours; `syspolicyd` near 80%; the Tailscale network extension at 30 to 50%. The machine was described as running like an oven.
- On host B, after A was stopped: the server at 101% CPU with about 1,000 connections to host C.
- Agents (Claude Code sessions in tmux) kept running. No tmux session was lost: 40 on host A before and after.
- Users outside our fleet with two or more hosts on 0.106.4 or later are exposed in the same way (see "Who else is affected").

## Timeline (local time, MDT)

| Time | Event |
|---|---|
| 2026-02-26 | 0.24.17 adds startup self-diagnostics, including the peer check that calls the peer's `/api/diagnostics`. Under Next.js 14 the route is cached; the loop is dormant. |
| 2026-10-27 ~11:00 | Fleet deployed with 0.106.2 (Next.js 14.2.35). Startup diagnostics on host A report peers as "healthy (8/10 checks passed)": the peers answered in full, within 5 seconds. |
| 2026-10-28 09:25 | Commit 4ceaa399 upgrades to Next.js 15.5.28 (security update, 25 advisories). Released as v0.106.6 at 16:36. |
| 2026-10-29 14:15–14:20 | Fleet deployed with 0.106.15, the first Next.js 15 build on our hosts. At 14:18 host A's startup diagnostics report both peers as just "healthy": their `/api/diagnostics` already took more than 5 seconds and the check fell back to the health endpoint. The loop is running. |
| ~16:26 | Host A reboots. On start, all 40 agents queue transcript indexing at once; that backlog adds load (see "Contributing factors"). |
| 16:39 | User reports AI Maestro takes forever to load this machine's agents. Load average 55; `/api/sessions` takes 20 s. Attributed at first to the indexing backlog. |
| 20:16 | `/api/sessions` on host A no longer answers within 5 s. |
| 20:25–20:30 | Hosts B and C updated to 0.106.20 and restarted. Each restart runs startup diagnostics again. |
| ~20:30 | Host A has 1,098 child processes of the server: about 270 `tmux -V`, 270 `df -k ~/.aimaestro`, dozens of `tmux display-message` per session. Rises to 1,297. |
| 20:3x | `pm2 stop ai-maestro` times out twice (60 s, then 400 s): the pm2 daemon cannot get an answer. SIGTERM to the server is ignored. |
| ~20:45 | Server, its wrapper and the pm2 daemon on host A killed by exact pid (SIGKILL). All children exit. tmux untouched. |
| 20:46 | Root cause found in `checkRemoteHost`. |
| 20:48 | With A down, B and C still bounce about 1,000 connections; B's server at 101% CPU. |
| 20:49 | AI Maestro stopped on host B. C has no live peer and calms. |
| ~20:52 | Old logs and deploy records tie the start to the Next.js 15 deploy. |
| 20:5x | Fix merged as 0.106.21 (#719). Rollout starts: C, then B, then A. |

## Root cause

`services/diagnostics-service.ts`, `checkRemoteHost`, before 0.106.21:

```ts
let url = `${host.url}/api/diagnostics`
response = await fetch(url, { signal: AbortSignal.timeout(5000) })
// on error: fall back to `${host.url}/api/v1/health`
```

`runDiagnostics` runs local checks (`tmux -V`, a `df` shell pipeline, node-pty, registry, AMP identity, channel wake) and then `checkRemoteHost` for every enabled peer. The peer serves `/api/diagnostics` by running `runDiagnostics` itself, so it calls all of its peers, including the caller. Every request causes one new request per peer. The 5-second timeout ends the caller's wait, not the peer's work. With two hosts listing each other the requests go back and forth at a steady rate; with three, each run causes two more, and the backlog grows without limit. On a busy host each spawn takes longer, which makes the backlog grow faster.

Hosts list each other automatically: at startup each host registers itself with every known peer (`register-peer` in `server.mjs`), so every multi-host setup is two-way.

## Why it woke up now

The route handler does not read its request and does not set `dynamic`:

```ts
export async function GET() {
  const result = await runDiagnostics()
  return NextResponse.json(result.data, { status: result.status })
}
```

**Next.js 14 caches a `GET` route handler like this by default:** it is rendered once and the stored result is served. Peers calling `/api/diagnostics` got a stored copy and the recursion never ran. **Next.js 15 changed the default: `GET` route handlers are not cached.** From 0.106.4 every call ran the full diagnostics, peers included.

Evidence: 10-27 (Next 14) peers answered in full within 5 seconds; 10-29 14:18 (Next 15, first deploy) peers timed out. The only change in that window on the host, diagnostics or server paths was the Next.js upgrade. Not shown directly: the cached route file in the old build, because that build no longer exists.

Headless mode (`MAESTRO_MODE=headless`) serves the same function through `services/headless-router.ts` without Next.js, so multi-host headless setups have run the live loop since 0.24.17. None of our hosts runs headless.

## Contributing factors

1. **Delta-index backlog at boot.** After the reboot, all agents queued transcript indexing at once; the queue grew from 20 to 56 waiting over four hours and never drained, and the embedding worker was started again about once a minute. It did not cause the loop but it kept host A busy, so spawns were slower and the backlog grew faster.
2. **No bound on child processes.** Nothing limits how many `tmux` or `df` processes the server runs at once. Diagnostics had no single-flight or cache.
3. **Session discovery falls back to one `tmux display-message` per session** when the single `list-sessions` call does not parse. Under load this multiplies spawns by the number of sessions (40 here).
4. **macOS checks every new process** (`syspolicyd`). A spawn flood pins it and slows every spawn on the machine, including the user's terminal.
5. **The framework upgrade changed runtime behaviour silently.** The Next.js 15 upgrade was reviewed for its build and its security advisories, not for which routes would stop being cached.
6. **Diagnosis took time** because the first symptom (slow dashboard after a reboot) matched a known cause (indexing backlog), and because `ps`, `tmux` and pm2 themselves stalled under the load.

## Who else is affected

| Setup | Exposure |
|---|---|
| Two or more hosts, 0.106.4 to 0.106.20, both running | Affected. Two hosts: steady loop, one server near 100% CPU. Three or more: grows without limit. |
| Multi-host headless, 0.24.17 to 0.106.20 | Affected since February. |
| Mixed fleet, some hosts on 0.106.21 | A fixed host breaks the loop on its side; two old hosts still loop with each other. |
| Single host | Not affected normally (no peers). Possible but not observed: a host listing itself under an old id after a hostname change, because the diagnostics peer filter checked the id only, not the URL. |

## Resolution

0.106.21 (#719):

- The peer check calls `/api/v1/health` only. It makes no outgoing calls, so no cycle is possible, including a host calling itself.
- `runDiagnostics` shares a run in progress with everyone who asks meanwhile, and reuses a finished report for 60 seconds (state on `globalThis`, shared by all Next.js bundles).
- `df` runs with arguments instead of a shell pipeline.
- `tests/diagnostics-no-recursion.test.ts` (5 tests) fails on the old code and passes on the new.

## What went well, what did not

- Agents were not affected: tmux sessions survived every stop and kill, because the kills used exact pids and never touched tmux.
- The process listing pointed straight at the cause once it could be read (`tmux -V` and `df` in equal numbers).
- Not well: the loop ran for six hours before it was found; the first explanation offered (indexing backlog) was true but incomplete; a deploy to the remote hosts was started while host A was already failing, which restarted their diagnostics and fed the loop; `pm2 stop` could not stop a server this busy.

## Audit: the same class of failure elsewhere

Every server-side call to a peer or to this host, and every child process reachable from a route or a timer, was reviewed after the fix. The top four were checked against the code.

| # | Finding | Severity | Checked |
|---|---|---|---|
| 1 | `tmux()` in `lib/tmux-safe.mjs` has no default timeout, and local discovery (`GET /api/agents`, `GET /api/sessions?local=true`, `GET /api/sessions/restore`) runs it, plus `docker ps` through a shell with no timeout, on every request with no cache. A hung tmux or Docker daemon leaves one stuck child per request, and the cached `/api/sessions` path then waits on it. Same end state as this incident. | High | Yes |
| 2 | Hibernate decides "remote" from `hostId` only (`services/agents-wake-service.ts`). After a hostname change it proxies to itself without end. Wake has the fix (it also checks `hostUrl`); hibernate does not. | High (after a hostname change) | Yes |
| 3 | Docker agent creation forwards to a host entry that is really this host, under a DNS name, and forwards again. | Medium (needs a DNS host entry) | Path read |
| 4 | The hosts health check calls the peer's full `/api/sessions`, not `?local=true`, so one health check costs every peer a fan-out of its own. | Medium | Yes |
| 5 | Each agent's message poll has no in-flight guard and no timeouts, and looks up its own session through the cross-host `/api/sessions`. | Medium | Path read |
| 6 | The owning-host lookup caches hits but not misses; cards poll every 3 s and each poll probes every peer. | Low to medium | Path read |
| 7 | Synchronous pane captures every 1 s (permission sweep) and every 2.5 s per open chat block the event loop when tmux is slow. | Low to medium | Path read |
| 8 | Several tool, docker and host checks cache without single-flight; all have timeouts. | Low | Path read |
| 9 | GET routes that Next 14 cached and Next 15 now runs every time: `help/agent`, `sessions/restore`, `agents/normalize-hosts`. None calls peers. | Low | Path read |
| 10 | Static shell strings in services; the advisory's pattern (`tmux ... -t "${name}"` through a shell) remains in two CLI scripts. | Low | Path read |

Found safe: host sync (propagation id and depth limit), AMP routing, the one-hop message, team and meeting forwards, the unified agent list (peers answer locally), email index (header stops a second fan-out), the schedule, inbox and wake timers (in-flight flags).

The review of the changes merged the same day (#714 to #719) found, among others: a late "device not registered" receipt can clear a newer push token; call and device files are never pruned; call pushes have no rate limit; a connected call never lapses; a JSON `null` body gives a 500 on three new routes.

## Actions

| # | Action | Status |
|---|---|---|
| 1 | Break the loop, share and cache runs, `df` without a shell (0.106.21) | Done, #719 |
| 2 | Roll 0.106.21 to every host | Done 21:05 (C 21:00, B 21:03, A 21:05); 0.106.24 rolled out 21:30–21:43 |
| 3 | Issue with symptoms, exposure and workaround for users | Done, #720 |
| 4 | Audit every server-side call to peers and every spawn reachable from routes and timers for the same class of failure | Done (above) |
| 5 | Review the changes merged on 2026-10-29 (#714 to #719) | Done (above) |
| 6 | Default timeout in `tmux()`; timeout on `docker ps`; short cache and single-flight on local discovery (audit 1) | Done, #722 (0.106.23) |
| 6a | Hibernate checks `hostUrl` like wake (audit 2); docker create uses `isSelfHost` (audit 3); hosts health uses a local endpoint (audit 4) | Done, #722 |
| 6b | Fixes from the review of #714 to #719 | Done, #724 (0.106.24) |
| 6c | Audit 5 to 10: message poll guard and timeouts, owning-host miss cache, capped permission sweep, shared probes, argv instead of shell strings | Done, 0.106.26 |
| 6d | Bound concurrent child processes in the server in one place | Open: the per-call bounds above cover the known paths; a global limit is not built |
| 7 | Delta-index backlog: one waiting run per agent, slot before pin, one throttle per process, 3-minute boot grace | Done, #725 (0.106.25) |
| 8 | A rule and a test: any server-side call to a peer must reach a local-only endpoint or pass a local flag | To do |
| 9 | For framework upgrades, list the routes whose caching changes and check what they do | To do |
| 10 | Release notes for 0.106.21 telling multi-host users to update every host | To do |
