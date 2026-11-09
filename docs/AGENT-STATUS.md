# How agent status works

Written from the code on 2026-11-09 (v0.106.112). It describes what the code does
today, including what is wrong. Line numbers are approximate.

An agent shows one of four statuses: **Working**, **Needs you**, **Ready**, **Offline**.

## The picture

```
 THE AGENT'S HOST                                              ANY HOST THAT SHOWS IT
 ────────────────                                              ──────────────────────
 Claude Code ── hook event ──► ai-maestro-hook.cjs
                                 │
                                 ├─(A) writes ~/.aimaestro/chat-state/<md5(cwd)>.json
                                 │     one file per FOLDER the agent is in
                                 │
                                 └─(B) POST localhost/api/sessions/activity/update
                                       → hookStatusMap[agent name]   (memory, this host only)
                                       → status_update on the /status socket (this host only)

 tmux pane ── PTY output ──► (C) sessionActivity[name] = now     (only while a terminal
                                                                   or chat is open)
 relay of a REMOTE agent ──► (C) sessionActivity[name] = now     (on the host that relays)
 send-keys (wake, poll) ───► (C) sessionActivity[name] = now

 transcript .jsonl ──────────(D) its modified time

                       getActivity()  services/sessions-service.ts ~682
                       picks from A, B, C, D per agent
                                 │
                 GET /api/sessions/activity  ──────────►  browser store
                 (also headless-router ~698)              hooks/useSessionActivity.ts
                                                          ├ fetch on start, every 30 s
                                                          ├ /status socket: status_update
                                                          └ presenceOf(agent) → the 4 statuses
```

## 1. What the hook records

`scripts/claude-hooks/ai-maestro-hook.cjs`, `reduceState` (~1054):

| Claude Code event | Status written |
|---|---|
| UserPromptSubmit | `active` |
| PostToolBatch | `active` (not just after a Stop of the same turn) |
| PermissionRequest | `permission_request` |
| Notification `permission_prompt` / `elicitation_dialog` | `waiting_for_input` + that type → Needs you |
| Notification `idle_prompt` (idle for a minute) | `waiting_for_input` + `idle_prompt` → Ready |
| Stop, StopFailure, StopCancelled | `idle` |
| SessionEnd | `ended` (claims nothing) |
| SessionStart | depends on the agent (`sessionStartStatus`) |

Each event does two things:

- **(A) The state file.** `writeState` writes `~/.aimaestro/chat-state/<md5(input.cwd)>.json`. The key is the folder the agent is in at that moment, not the agent. An agent that works in subfolders has one file per subfolder (on this Mac `ai-maestro` has 44). The hook reads the "previous state" from the same folder's file.
- **(B) The report.** `broadcastStatusUpdate` resolves the agent (by `AIM_AGENT_ID` first) and POSTs to **its own host only** (`aimBase()`). The server keeps it in `hookStatusMap[agent name]` with the time it arrived, and sends `status_update` to browsers connected to **that host**. This one is keyed by agent, so it is correct whatever folder the agent is in.

No other host ever receives A or B.

## 2. How the server decides

`getActivity()` in `services/sessions-service.ts` (~682) builds `{ name → { status, hookStatus, notificationType } }` in three passes. An agent gets the first pass that has an entry for it.

**Pass 1: agents with terminal activity (C).** Any name in `sessionActivity`. That map is written by the PTY (only while someone has the terminal or chat open), by the relay to a remote agent (`server.mjs` ~1305, ~1326, on every message), and by send-keys (`sessions-service.ts` ~1286, `agents-core-service.ts` ~1672).
- Reads the state file for the agent's **top folder only** (A). Ignores the report (B).
- If the file is fresh: status from the file. Otherwise: `active` if C changed in the last 3 s, else `idle`.
- A `waiting` status becomes `active` if C changed more than 5 s after the file, or if the transcript's modified time (D) is newer than the file.

**Pass 2: agents in the registry with no entry yet.**
- Takes the newer of the top-folder file (A) and the report (B).
- If the file won, and the transcript's modified time (D) is more than 3 s newer than the file: `active`. This applies to **any** status, idle included.

**Pass 3: names in `hookStatusMap` (B) still missing.** Status from the report.

How long a report counts: `active` / `idle` for 15 min (`HOOK_STATUS_TTL_MS`), `waiting_for_input` / `permission_request` for 24 h (`WAITING_STATE_TTL_MS`). Older ones are ignored.

`?local=true` changes nothing in `getActivity`; it only limits the snapshots.

## 3. How the browser shows it

`hooks/useSessionActivity.ts`, one store per page:
- Loads `GET /api/sessions/activity` on start, again every 30 s while the page is visible, and when a turn ends.
- Applies `status_update` messages from the `/status` socket as they arrive. These come only from hook reports on the host the page is connected to.
- `presenceOf(agent)` looks up the agent by name, then by id, and maps it with `presenceFrom` (`lib/agent-presence.ts`): no session → Offline; a permission or question → Needs you; `active` → Working; anything else → Ready.

## 4. Agents on another host

The page talks to one host. That host has no state file (A) and no report (B) for an agent that lives elsewhere. So:
- If nobody has the agent open: no entry → **Ready, always**, even while it works.
- If someone opens its chat or terminal: the relay writes C on every message, pass 1 finds no hook state, and 3 s of traffic means **Working**, even while it is idle. The status flickers with the traffic.

The other host's correct feed is already fetched every 15 s by `services/status-snapshots-service.ts` `refreshRemote` (`?local=true`), and the `activity` part is thrown away; only `snapshots` is kept.

## 5. Audit, 2026-11-09 ~07:30 UTC

`scripts/status-audit.mjs` (read only) compares each host's feed with the last timestamped entry in each agent's transcript.

| Host | Agents with a session | Correct | Wrong | To check by hand |
|---|---|---|---|---|
| this Mac | 53 | 38 | **7** | 8 |
| mac-mini | 45 | 39 | **4** | 2 |
| mini-lola | 2 | 1 | 0 | 1 |

All 11 wrong rows are the same case: the agent finished hours ago (last entry `turn_duration`, 6 to 63 h old) and shows **Working**:

- this Mac: 23b-counsel, 23b-cto, 23blocks-api-authentication, 23blocks-api-crm, 23blocks-api-forms, 23blocks-api-rag, 23blocks-architect
- mac-mini: 3m-gm, 3m-support, tct-gm, tct-hr

Cause, from the rows: the top-folder file says `idle_prompt` (less than 24 h old, so it still counts), and the transcript file's modified time is 1 to 55 min ago **with no new entry**. Pass 2 reads that as "resumed" and says `active`. Example: 23b-cto's transcript was modified at 23:41 local, but its last line is still the `turn_duration` of 18:29 UTC. What touches the files is not known yet. 23b-counsel has no fresh hook state and reached `active` through pass 1 (terminal activity).

Agents idle for more than 24 h show Ready only because their `idle_prompt` report has expired, so the false "resumed" check is never reached.

Across hosts: this Mac showed Dahlia (`operario-dev`) as **Ready** while her transcript showed a tool call 5 min old and mac-mini showed her Working. That is the "always Ready" case of section 4. Earlier, with her chat open, it was the "Working while idle" case.

## 6. Known defects

1. The transcript's modified time is taken as proof of work (pass 1 and pass 2). It is not: 11 agents show Working while idle.
2. The state file is per folder, and pass 1 reads only the top folder. An agent working in a subfolder can show the wrong status while its terminal is open.
3. Pass 1 ignores the per-agent report (B), which is the one that is right.
4. The relay counts its own traffic as work.
5. Remote agents get no status from their host: Ready when nobody looks, Working when someone does.
6. The socket and the 30 s fetch use different rules (the socket sends the hook's report, normalised but without passes 1 to 3; the fetch applies them), so the two can disagree and the page can flip between them.
7. Two agents with the same name on two hosts share one entry.

## Run the audit

```bash
node scripts/status-audit.mjs                       # this host, as a table
node scripts/status-audit.mjs --json --viewer URL   # also what the host at URL shows
ssh mac-mini-ts '...; node --input-type=module - --json' < scripts/status-audit.mjs
```

"CHECK" rows are agents whose transcript ends in an open turn more than 10 min old (a question left open, a crash or a long tool), or with no transcript (Codex, a shell). They need a look, not a fix.
