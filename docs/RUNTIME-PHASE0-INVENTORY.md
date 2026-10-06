# Runtime Phase 0: tmux call inventory

F026 Phase 0 (`backlog/F026-agent-runtime-abstraction-herdr.md`). Audit date 2026-10-05.

This lists every place AI Maestro runs tmux, what each call does, whether it was
safe, and where it goes now. Phase 0 changes no behavior: each routed call sends
tmux the same arguments, in the same order, with the same timeouts and stdio.

## How tmux is reached now

```
server.mjs ──┐
             ├─> lib/tmux-runtime.mjs ──> lib/tmux-safe.mjs ──> execFile('tmux', argv)
TmuxRuntime ─┘   (one argv builder per     (no shell; tmux(),
(lib/agent-runtime.ts)  operation; target    tmuxSync(),
                 validated on every call)    assertSessionName,
                                             assertPaneTarget)
```

- `lib/tmux-safe.mjs`: execFile with an argument vector, plus the validators
  (`^[a-zA-Z0-9_-]{1,128}$` for sessions, the same plus `:W.P` for panes).
- `lib/tmux-runtime.mjs` (new, plain ESM): the operations server.mjs needs,
  sync and async. Each operation's argv is built once in `argv.*`, and the
  target is validated there. TmuxRuntime delegates its new methods to it, so
  server.mjs and TypeScript share one implementation.
- `lib/agent-runtime.ts`: the `AgentRuntime` interface and `TmuxRuntime`.

New `AgentRuntime` operations: `pasteText` (paste-buffer injection),
`captureHistory`, `enterCopyMode`, `scroll`, `setOption`, and a `readOnly`
option on `getAttachCommand`.

Legend: **shell** = built as a shell string and run by `/bin/sh`;
**argv** = execFile/spawn with an argument vector. "Name source" says where the
session name comes from and whether it was validated before the call.

## server.mjs

Line numbers are from `main` at aa8c689 (before) and this change (after).

| Before | After | Operation | Was | Name source | Now |
|---|---|---|---|---|---|
| 369 | 372 | `capture-pane -p -t S -S -200` (detectPermissionFromPane) | **shell** `execSync` | /term `query.name`, validated at WS entry (1821) | `capturePaneSync` |
| 735 | 736 | `capture-pane -p -J -t S -S -N` (capturePaneCompact, paste probe) | **shell** | same | `capturePaneSync({join})` |
| 751 | 749 | `capture-pane -p -t S -S -15` (isAgentAtPermissionPrompt) | **shell** | same | `capturePaneSync` |
| 769 | 764 | `display-message -p -t S '#{pane_in_mode}'` (exitCopyMode) | **shell** | same | `exitCopyModeSync` |
| 772 | 764 | `send-keys -t S -X cancel` (exitCopyMode) | **shell** | same | `exitCopyModeSync` |
| 781 | 770 | `capture-pane -t S -p -e -S -N 2>/dev/null \|\| capture-pane -t S -p -e` (capturePaneRaw, `/bin/bash`) | **shell** | same | `capturePaneRawSync` (two argv calls, first with stderr ignored) |
| 830 | 817 | `load-buffer -b B FILE` (chat send) | **shell** | buffer `aimaestro-<ms>`, file in tmpdir | `loadBufferSync` |
| 831 | 818 | `paste-buffer -d -r -b B -t S` | **shell** | /term, validated | `pasteBufferSync` |
| 834 | 821 | `delete-buffer -b B` | **shell** | buffer | `deleteBufferSync` |
| 861 | 848 | `send-keys -t S C-m` | **shell** | /term, validated | `sendKeySync` |
| 874 | 861 | `load-buffer -b B-r FILE2` (chat retry) | **shell** | buffer | `loadBufferSync` |
| 875 | 862 | `paste-buffer -d -r -b B-r -t S` | **shell** | /term, validated | `pasteBufferSync` |
| 876 | 863 | `send-keys -t S C-m` | **shell** | /term, validated | `sendKeySync` |
| 887 | 874 | `send-keys -t S -N count BSpace` (clear staged input) | **shell** | /term, validated | `repeatKeySync` |
| 917 | 904 | `send-keys -t S -l KEY` (permission answer, KEY is `^[0-9a-z]$`) | **shell** | /term, validated | `sendLiteralSync` |
| 1418 | 1405 | `has-session -t S__call` (call session) | argv | registry agent name, regex-checked (1410) | `hasSessionSync` |
| 1419 | 1406 | `kill-session -t S__call` | argv | same | `killSessionSync` |
| 1422 | 1409 | `new-session -d -s S__call -c DIR` | argv | same | `newSessionSync` |
| 1437 | 1424 | `send-keys -t S__call -l CMD` | argv | same | `sendLiteralSync` |
| 1438 | 1425 | `send-keys -t S__call Enter` | argv | same | `sendKeySync` |
| 1443 | 1430 | `pty.spawn tmux attach-session -t S__call -r` (read-only observer) | argv | same | `attachCommand({readOnly})` + pty.spawn |
| 1543 | 1531 | `send-keys -t S__call -l TEXT` (companion voice) | argv, async | same | `sendLiteralAsync` |
| 1552 | 1532 | `send-keys -t S__call Enter` | argv, async | same | `sendKeyAsync` |
| 1667 | 1652 | `send-keys -t S__call C-c` (last companion left) | argv, async | same | `sendKeyAsync` |
| 1669 | 1654 | `kill-session -t S__call` | argv, async | same | `killSessionAsync` |
| 1716 | 1702 | `has-session -t NAME` (streaming chat: is the agent live in tmux?) | argv | registry name **or raw `query.name`/`query.agentId`, unvalidated** | `hasSessionSync` (an invalid name is now "not live" without running tmux) |
| 2053 | 2038 | `has-session` via `sessionExistsSync(S, socket)` | argv (agent-runtime.ts) | /term, validated | unchanged |
| 2069 | 2054 | `attach-session -t S` via `getRuntime().getAttachCommand` + pty.spawn | argv | /term, validated | unchanged call; TmuxRuntime now delegates to `attachCommand` (validates) |
| 2288 | 2273 | `[-S sock] set-option -t S mouse off` | argv, async | /term, validated | `setOptionAsync` |
| 2299 | 2284 | `[-S sock] set-option -w -t S alternate-screen off` | argv, async | same | `setOptionAsync({window})` |
| 2318 | 2319 | `[-S sock] capture-pane -t S -e -p -S -5000` (history replay, 32 MB maxBuffer) | argv, async | same | `captureHistoryAsync` |
| 2368 | 2351 | `[-S sock] copy-mode -e -t S` (tmux-scroll up) | argv, async | same | `enterCopyModeAsync` |
| 2369 | 2352 | `[-S sock] send-keys -t S -X -N n scroll-up` | argv, async | same | `scrollAsync('up')` |
| 2374 | 2357 | `[-S sock] send-keys -t S -X -N n scroll-down` | argv, async | same | `scrollAsync('down')` |
| 2505 | 2488 | `list-sessions -F '#{session_name}'` (startup orphan cleanup) | argv | tmux's own output | `listSessionNamesSync` |
| 2508 | 2490 | `kill-session -t NAME__call` | argv | tmux's own output | `killSessionSync` |

Result: server.mjs no longer imports `child_process`. It has no shell-string
tmux call and no direct `execFile('tmux')`; `tests/no-shell-tmux.test.ts`
enforces both.

## lib/, services/, app/

| File:line | Operation | Was | Now / note |
|---|---|---|---|
| `lib/agent-runtime.ts` (TmuxRuntime, ~20 calls) | list/has/new/kill/rename session, display-message, send-keys, capture-pane, set-environment, copy-mode cancel | argv via `tmux-safe` | unchanged; 5 new methods added (see above) |
| `lib/agent-runtime.ts` `sessionExistsSync`, `killSessionSync`, `renameSessionSync` | has/kill/rename, sync | argv, **no name validation** | unchanged. Callers: `lib/agent-registry.ts:634,635,749,755,1357` (names from the registry) and server.mjs /term (validated). Not injectable (argv), left as is |
| `lib/agent-runtime.ts` `execAsync = promisify(exec)` | none (dead code) | unused shell exec | removed |
| `lib/schedule-executor.ts:126` | `new-session -d -s S -c DIR` | argv, validated | unchanged (could use `getRuntime().createSession`; same argv, left alone) |
| `lib/memory/summarizer.ts:385,388` | `kill-session`, `new-session -d -s S "bash '<file>'"` | argv; the session's command is a shell command with a `shellQuote`d path the code generated | unchanged; name is generated internally |
| `lib/container-utils.ts:114-209` | `docker exec <c> tmux send-keys/has-session/display-message/capture-pane` | **shell**, every value through `shellQuote` | unchanged. Targets a tmux inside a container, so it is not a TmuxRuntime call; candidate for a `DockerRuntime` later. Safe today (quoted) |
| `services/sessions-service.ts:425,451,474-476` | `-S sock list-sessions`, `display-message`, `set-environment` (OpenClaw sockets) | argv, async | unchanged: custom-socket discovery of sessions the runtime does not own; names come from tmux output |
| `services/diagnostics-service.ts:66` | `tmux -V` | **shell** (constant string, no input) | now `tmux(['-V'])` (argv) |
| `services/*`, `lib/notification-service.ts`, `lib/pane-occupant.ts`, `lib/index-delta.ts`, `app/api/messages/pending-wakes/route.ts` | everything else | `getRuntime()` | already on the runtime |
| `app/` | no direct tmux calls | | |

## Shell scripts and CLI scripts that call tmux directly (not changed)

These run on a person's machine or inside an agent's own tmux pane, not in the
server. Phase 0 documents them only.

### plugin/ (submodule; `src/` is the source, `plugins/ai-maestro/` the build)

| File | tmux use | Note |
|---|---|---|
| `src/scripts/agent-commands.sh:818-819` | `has-session -t -- "$s"`, `rename-session -t -- "$s" "$new"` | quoted, `--` guarded; could call the rename API instead |
| `src/scripts/agent-core.sh:271` | `display-message -p '#S'` (which session am I in) | self-identification inside a pane; must stay local |
| `src/scripts/agent-session.sh:285` | `attach-session -t -- "$s"` | interactive attach for a human; must stay tmux |
| `src/scripts/agent-helper.sh`, `src/scripts/import-agent.sh` | mentions in messages only | |
| `plugins/ai-maestro/scripts/amp-helper.sh:147,1575`, `amp-statusline.sh:165`, `aid-helper.sh:140`, `aid-init.sh:82` | `display-message -p '#S'` | from agentmessaging/* upstream repos; self-identification, must stay local |

### scripts/ and the repo root

| File | tmux use | Note |
|---|---|---|
| `scripts/register-agent-from-session.mjs:94,107,118,130` | `execSync` **shell strings**: `rename-session -t "${old}" "${new}"`, `display-message -p "#S"`, `list-sessions -F`, `display-message -p -t "${s}" -F "#{pane_current_path}"` | local CLI; names come from tmux or the person running it. Same pattern as the advisory but not network-reachable. Candidate for `tmux-safe` |
| `scripts/setup-agent-amp.mjs:538` | `execSync` **shell string**: `set-environment -t "${tmuxSession}" AMP_DIR "${agentHome}"` | local setup CLI; names from the registry. Candidate for `tmux-safe` |
| `scripts/shell-helpers/common.sh:165` | `display-message -p '#S'` | self-identification |
| `scripts/remote-install.sh:383-1396` | `has-session`, `kill-session mailman`, `new-session`/`new-window`/`attach-session my-first-agent` | installer, constant names |
| `scripts/setup-gateway.sh:358` | `has-session -t mailman` | constant name |
| `scripts/start-with-ssh.sh:27` | `setenv -g SSH_AUTH_SOCK` | |
| `scripts/setup-tmux.sh`, `install.sh:335,775` | `tmux -V`, `source-file ~/.tmux.conf` | installer |
| `scripts/test-call-session.sh`, `scripts/test-message-wake.sh` | `has-session`, `kill-session`, `list-sessions`, `capture-pane` | manual test scripts |
| `scripts/index-all-agents.sh`, `install-plugin.sh`, `update-aimaestro.sh`, `verify-installation.sh` | messages / `command -v tmux` only | |

## Calls not routed, and why

- `lib/container-utils.ts`: runs tmux inside a Docker container through
  `docker exec`; it belongs to a future DockerRuntime, not TmuxRuntime. Already
  quoted with `shellQuote`.
- `services/sessions-service.ts` OpenClaw socket discovery: lists sessions on
  foreign sockets that no agent runtime owns. Argv already.
- `lib/memory/summarizer.ts`, `lib/schedule-executor.ts`: argv through
  `tmux-safe` already; moving them would not change safety.
- `agent-runtime.ts` sync helpers (`sessionExistsSync`, `killSessionSync`,
  `renameSessionSync`): argv already. Adding validation could make
  `deleteAgent`/`renameAgent` skip a legacy session whose name does not match
  the pattern, which is a behavior change, so they were left.
- Scripts under `plugin/` and `scripts/`: out of scope for Phase 0 (documented).

## Small differences a reader might notice

- A target that is not a valid session/pane name is refused before tmux runs.
  For every server.mjs path the name was already validated upstream, so this
  only matters for the streaming chat's `has-session` (1702), where an invalid
  `query.name` now means "not live" without asking tmux (tmux would have said
  "can't find session" too, except through its prefix matching).
- `capturePaneRaw`'s 3-second timeout used to cover the whole `A || B` shell
  line; now each of the two calls has its own 3 seconds.
- Call sessions for agent names longer than 122 characters (the `__call` suffix
  pushes them past the 128-character limit) are now refused with an error in the
  log instead of being created. Agent names are far shorter in practice.
