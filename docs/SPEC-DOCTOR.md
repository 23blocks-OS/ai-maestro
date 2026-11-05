# Spec: Doctor, health checks for agents, hosts and installs

**Status:** Approved 2026-11-03. Step 1 (server) built in 0.106.63, step 2 (web) in 0.106.64, the mobile screen in app 1.0.2; step 3 (CLI) to do. 4.11 and 4.12 added in 0.106.69. Backlog: F069. Absorbs the local half of F005.
**Goal:** one report per host that names every configuration problem with the agent or file it is about,
says what to do, and offers a safe fix where one exists. The web dashboard, the mobile app and the agents
CLI all read the same report from each host. The server does the checks and the fixes; the clients only
show them and ask the person.

## 1. What exists today

- `services/diagnostics-service.ts`, `GET /api/diagnostics` (Next route and headless router). The checks are
  `tmux`, `node-pty`, `agent-registry`, `shared-folders`, `amp-identity-integrity`, `channel-wake`,
  `node-version`, `disk-space`, and `host:<name>` for each enabled peer (its `/api/v1/health`).
- The report is cached 60 s and a run in progress is shared (`runDiagnostics`). It runs at startup into the
  log (`server.mjs`, `logDiagnosticReport`).
- No page shows it. Checks are host-wide lines. The only agent-level detail is a list of names inside
  `details`. Nothing is fixed.
- Rule since 0.106.21 (`tests/diagnostics-no-recursion.test.ts`): a host never fetches a peer's
  `/api/diagnostics`, only leaf endpoints. Every host calling every other host's report looped on
  2026-10-29.

## 2. Principles

1. **The server checks, the client shows.** All detection and all fixes run on the host that owns the data.
   A client (web, mobile, CLI) never decides on its own that something is broken.
2. **Each client fetches each host.** The web page and the mobile app call every host's `/api/diagnostics`
   directly, like `hooks/useAgents.ts` does for agents (CORS is open on `/api/*`). No host gathers the
   fleet's reports for a client. That keeps the 0.106.21 rule.
3. **Checks are read-only.** A report run never writes a file, the registry or tmux.
4. **A fix is a separate request, and the server checks again.** The client sends a fix id and the item's
   key. The server runs that check again now and acts only if the finding is still true. The client's data
   is never trusted as the reason to delete.
5. **A fix never kills a tmux session, never touches an agent on another host, and never touches an agent
   that runs outside AI Maestro.** A fix that would have to do one of these is not offered.
6. **Additive contract.** Existing fields keep their meaning, so the startup log, the tests and older
   clients keep working. A host on an older version answers the old shape, and clients must show it.

## 3. The report (contract v2)

`GET /api/diagnostics[?fresh=1]`

`fresh=1` skips the finished-report cache. A run already in progress is still shared, so a burst of
refreshes costs one run.

```ts
type DiagnosticStatus = 'pass' | 'warn' | 'fail'

interface DiagnosticReport {
  schema: 2                     // new; absent means v1 (older host)
  timestamp: string
  hostname: string
  hostId: string                // new: getSelfHostId()
  version: string               // new: AI Maestro version from version.json
  summary: { total, passed, failed, warnings, status }   // unchanged; counts checks, not items
  checks: DiagnosticCheck[]
}

interface DiagnosticCheck {
  name: string                  // unchanged, stable id: 'ghost-agents', 'claude-hook', ...
  status: DiagnosticStatus      // the worst of its items, or its own status when it has none
  message: string               // unchanged: one line
  category?: 'host' | 'install' | 'agents' | 'peers'   // new, for grouping
  hint?: string                 // new: what a person does about it, one sentence
  items?: DiagnosticItem[]      // new: one per agent, folder or file the check is about
  details?: Record<string, unknown>                     // unchanged
}

interface DiagnosticItem {
  key: string                   // stable within the check: agent id, folder path or file name
  status: DiagnosticStatus
  message: string               // names the problem: "Folder /x does not exist"
  agentId?: string
  agentName?: string
  path?: string
  fix?: DiagnosticFix
}

interface DiagnosticFix {
  id: 'delete-ghost-agent' | 'remove-deleted-agent-backups'   // closed list, see section 6
  label: string                 // the button text: "Delete agent"
  destructive: boolean          // clients ask for a confirmation when true
  confirm: string               // the confirmation text: what will be removed and what is kept
}
```

Items only list problems and things a person should know (see each check). A check with nothing to say
has no `items`.

`POST /api/diagnostics/fix` with body `{ "check": "<name>", "key": "<item key>", "fix": "<fix id>" }`.

| Answer | When |
|---|---|
| `200 { ok: true, message }` | The fix ran. The report cache is cleared. |
| `409 { error, message }` | The finding is no longer true (for example, the ghost has a session now). Nothing was changed. |
| `400 { error, message }` | Unknown check, fix or key, or the fix does not belong to that check. |
| `500 { error, message }` | The fix failed part way. The message says what was done. |

## 4. New checks

All agent checks look only at agents on this host (`hostId` is self or unset), not deleted, and skip
`runtime: 'docker'` and `deployment.type: 'cloud'` agents unless the check says otherwise.

### 4.1 `agent-folders` (agents)

| Finding | Item status | Hint |
|---|---|---|
| `workingDirectory` is set but the folder does not exist | warn | Set the folder in the agent's profile, or recreate the folder. |

An agent with no folder is not a finding (wake now gives it `~/agents/<name>`, 0.106.62).

### 4.2 `shared-folders` (agents), changed

Keeps its message and `details`. Adds one item per shared folder: `key` = the folder, `message` = the
agents' names, status warn, no fix. Choosing which agent keeps the folder is the person's decision.

### 4.3 `name-hints` (agents)

The hint is `env.CLAUDE_AGENT_NAME` or `env.AIM_AGENT_NAME` in `.claude/settings.local.json`. AMP scripts
(`amp-helper.sh`) find it by walking up from the session's folder, so the check resolves it the same way:
from the agent's folder up to, not past, the home folder.

| Finding | Item status |
|---|---|
| The hint found names a different agent. This includes a hint in a parent folder that a nested agent inherits, which makes its AMP commands act as the parent. | warn |
| The hint names an agent that does not exist or is deleted | warn |

No hint is not a finding. Hint: run `amp-init.sh --name <name> --remember` in the agent's folder. No fix in
v1: the file is the person's own and may hold other settings.

### 4.4 `amp-mailboxes` (agents)

For agents with AMP (`ampRegistered` or `metadata.amp`):

| Finding | Item status |
|---|---|
| `~/.agent-messaging/agents/<id>/` is missing | warn |
| The address's local part is not the agent's name | warn |

The existing `amp-identity-integrity` check stays as it is: shared keys and did↔key drift are already there.

### 4.5 `ghost-agents` (agents)

A ghost is an agent that AI Maestro registered by itself from a tmux session (`createOrphanAgent`), that
nobody ever used or adopted, and that has nothing running. Example: `zz-canary-exact-bar`, a test
session. When in doubt, it is not a ghost: a missed ghost costs a line in the registry, while a wrong
delete loses an agent.

An agent is a ghost only when **every** condition below is true. Each is a test case.

**Where it came from**

1. `metadata.autoRegistered === true`.
2. Its host is this host. It is not deleted, `runtime` is not `docker`, and `deployment.type` is not `cloud`.

**Nobody used or adopted it**

3. No `claudeSessionId`. No Claude session was ever tied to it.
4. `taskDescription` is still `Auto-registered from orphan tmux session`, and `label` and `avatar` are unset.
   A person who named or described it adopted it.
5. No team lists it as a member.
6. Its AMP inbox and sent folders (`~/.agent-messaging/agents/<id>/messages/inbox`, `sent`) are missing
   or empty. An AMP address alone proves nothing: AI Maestro registers one for every agent by itself.
7. It has no schedules of its own. `schedule.json` in its agent folder may hold only the built-in tasks
   of `defaultSchedule()` (`lib/agent-schedule.ts`, memory index and consolidate, which every agent
   gets). `lib/schedule-registry.ts` has none for it. It has no canvas pages
   (`~/.aimaestro/agents/<id>/canvas/*.html`).
8. When its folder belongs to it alone (`folderOwner(dir, id)` is null), that folder has no Claude
   transcripts (`resolveJsonlPathForDir`). A shared folder's transcripts may be another agent's, so they
   count neither way.

**Nothing is running**

9. No live tmux session matches its name, by the same match `listAgents` uses (any index suffix). The
   check asks tmux itself (`list-sessions`), not a cache. "No server running" means no sessions. Any
   other tmux error skips the whole check with a warn: an empty list from a failed call must never
   read as "no sessions".
10. `runtimeOf(agent)` is null: not streaming, not running outside tmux.

**It is old**

11. The newest of `metadata.autoRegisteredAt`, `lastActive` and every `sessions[].lastActive` is more
    than 24 hours ago. Do not use `createdAt`: an orphan copies it from the tmux session, so a week-old
    tmux session would look like a week-old agent the moment it is registered.

Why each one: on 2026-11-03 this host had 8 live auto-registered agents. All are real agents Juan uses,
and 6 of them have no `claudeSessionId` (they predate the hook that records it). What separates them
from a ghost:
- their names (Gaius, Aria);
- their mail (2 to 16 messages each);
- an AMP address, which they have too, so it is not evidence.

A definition that used fewer conditions would have flagged real agents.

Item status warn. The message lists the facts behind the verdict ("registered 2026-11-01 from tmux
session X, never started, no session for 3 days"). Fix `delete-ghost-agent` (section 6). The fix runs
all eleven conditions again, so if a session or a message arrives between the report and the click,
nothing is deleted.

An auto-registered agent that fails a condition is not a ghost, and the check does not list it. Even an
agent that is only an old, idle orphan stays out of the list once a person has touched it.

### 4.6 `outside-agents` (agents), information only

Agents with no live tmux session for which `runningOutsideTmux` is true. The tmux test comes first,
because an agent in tmux has a recent hook state too: without it, 15 agents on Juan's Mac read as outside
when 4 were. Status pass; one item per agent, status pass, message
"Runs in its own terminal; AI Maestro will not wake it." No fix ever. This explains why such an agent's
Wake button refuses.

### 4.7 `deleted-agent-backups` (install)

Folders in `~/.aimaestro/backups/agents/` whose name matches the backup pattern (`parseBackupName` in
`lib/agent-backup-retention.ts`) and whose agent id is not in the registry, or is there with `deletedAt`.

- One item per backup: `key` = folder name, message = the agent name from its `registry-entry.json` if it
  can be read, its date and its size.
- Status pass while the total is under 1 GB, warn above. Retention already removes them after 30 days;
  this check shows them before that.
- Size comes from `du -sk` through `execFile` with a 5 s timeout. On a timeout, the size shows as unknown.
- Fix `remove-deleted-agent-backups` on the check's single summary item (`key: "*"`).

### 4.8 `app-version` (install)

Status pass, message `AI Maestro <version>`. Clients compare it across hosts (section 5).

### 4.9 `claude-hook` (install)

Reads `~/.claude/settings.json`. Entries are the `hooks.<Event>[].hooks[]` commands that contain
`ai-maestro-hook`.

| Finding | Status |
|---|---|
| No entry at all | fail |
| An event that `install-hooks.sh` installs has no entry | warn, one item per event |
| The command's file does not exist (a moved checkout, an unmounted volume) | fail |
| The file is not this checkout's `scripts/claude-hooks/ai-maestro-hook.cjs` and its content differs | warn |

Hint: run `./update-aimaestro.sh -y`, or `scripts/claude-hooks/install-hooks.sh`.

### 4.10 `amp-scripts` (install), the local half of F005

Compares each `plugin/plugins/ai-maestro/scripts/amp-*.sh` in this checkout with the copy in
`~/.local/bin/`, by sha256.

| Finding | Status |
|---|---|
| Missing from `~/.local/bin` | warn, one item per script |
| Content differs | warn, one item per script |

Extra scripts in `~/.local/bin` are not findings. Hint: run `./update-aimaestro.sh -y`. Comparing scripts
across hosts is the other half of F005 and stays there.

### 4.11 `agent-programs` (install), added in 0.106.69 (F071)

The programs this host's agents launch (`claude`, `codex`, `pi`, … from each local agent's `program`), plus
Claude Code always. Agents launch a bare name in a tmux shell, so each program is found on the user's
interactive login-shell PATH (`$SHELL -ilc`), which can differ from the server's own PATH; then each copy
is asked `--version` with an 8-second limit (the tool-readiness runner, F040).

| Finding | Status |
|---|---|
| A program an agent runs is not installed | fail, naming up to five agents |
| The copy that runs first does not answer `--version` in 8 s | fail |
| An older copy runs before a newer one on the PATH | warn |
| Claude Code 2.0.45 or later, and the PermissionRequest hook is not registered | warn |
| The login shell could not be asked | warn |

`details.programs` lists `{ name, path, version }` for every program found (for F072, the create-agent
dialog). Cost: one login shell and one `--version` per program per run, a few seconds, in parallel with the
other checks.

### 4.12 `amp-refusals` (host), added in 0.106.69 (B006)

Every AMP message this host refuses with 401/403, at `/api/v1/route` (local and mesh delivery) or
`/api/v1/federation/deliver` (another provider), is written as one JSON line to
`~/.aimaestro/logs/amp-refusals.jsonl` (`lib/amp-refusals.ts`: time, endpoint, status, reason code, sender,
recipient, forwarding host or provider, key fingerprint prefix; kept to its newest 2,000 lines past 1 MB).
The check reads the last 24 hours.

| Finding | Status |
|---|---|
| Refusals in the last 24 hours | warn, one item per reason and sender (count, via, last time), at most 10 |

Hint: the sender's host usually runs stale AMP scripts or the sender rotated its key; update that host.

## 5. Fleet findings, made by the client

The client has every host's report, so it derives these. Nothing on the server calls a peer for them.

| Finding | Status |
|---|---|
| A host does not answer | fail (as in `useAgents`) |
| A host's `version` is lower than the highest in the fleet | warn |
| A host answers `schema` 1 (no `schema` field) | warn: "Update this host for the full checks"; show its checks without items |

Each report's `host:<name>` checks (peer reachability) are shown once, from the first card that has
them, and not at all when that peer has its own card (its card already says whether it answered). Every
host has them, so showing all would repeat each pair; a peer that only some hosts know, such as one that is
down, still shows. A card's counts and status are computed from the checks it shows, so the header never
names a failure the card hides.

## 6. Fixes (closed list)

### `delete-ghost-agent`

1. Load the agent. Run all eleven conditions of 4.5 again, now, against a fresh tmux list (not the
   1-second cache). If any condition fails, answer 409.
2. Call the existing hard delete (`deleteAgentById(id, true)`). It backs up first.
3. No tmux session exists to kill, because step 1 just proved that. The delete's kill uses the exact
   target (`=name`), so it cannot hit another agent's session.

### `remove-deleted-agent-backups`

1. List the backups again with the 4.7 rule, now. Agents that exist again (restored) drop out.
2. Remove each listed folder. Only real directories directly under the backups folder whose names match
   the pattern; never follow symlinks (the same guard as `pruneAgentBackups`).
3. Answer with the count and the size freed, and list any that failed.

Fixes not offered in v1, with the reason:

- **Choose a folder for shared or missing folders:** the person must pick a folder. The item links to
  the agent's profile instead.
- **Write a name hint:** it edits a file that belongs to the person.
- **Reinstall the hook or scripts:** it runs installers. The hint gives the command.

## 7. Clients

### Web (this repo)

- Settings gets a **Doctor** section. `?section=doctor` opens it; that deep link is new on the settings
  page.
- One card per host:
  - the host's name, version, summary and time of the report;
  - the checks grouped by category, failures first;
  - each check's items with its hint;
  - a **Refresh** button that calls `fresh=1`.
- Fix buttons ask for confirmation inline, never with `window.confirm`. They post to the **agent's** host,
  then refresh that host.
- Hosts are fetched in parallel. Each host card shows its own spinner or error, so a slow host does not
  block the page.

### Mobile app (ai-maestro-app)

The same contract. The app already calls each host directly. The app team builds its own Doctor screen
from the report and the fix endpoint. Nothing on the server is specific to the app.

### CLI (`aimaestro-agent.sh doctor`, plugin)

- `doctor` prints this host's report: one line per check and its items indented, coloured by status.
- `--json` prints the raw report. `--all` reads `/api/hosts` and prints every enabled host.
- Exit code 0 when nothing fails, 1 when any check fails.
- No fixes from the CLI in v1.

## 8. Cost and safety

- A run is still cached 60 s and shared.
- New work per run:
  - one tmux list (cached 1 s by the runtime);
  - per local agent, one or two `existsSync` calls, and reads of hint files up to home;
  - one `readdir` of the backups folder and one `du`;
  - two small file reads, and about 15 hashes of files under 50 KB.
  This is well under a second for 60 agents.
- Startup log: `logDiagnosticReport` keeps printing one line per check. Items are not printed, except for
  a count after a check's line ("3 items").
- No new write path for clients except `POST /api/diagnostics/fix` with its closed list. Its input is
  validated (check name and fix id from the closed lists; an agent id must be a registry id; a backup key
  must match the pattern).

## 9. Delivery

| Step | Repo | Contents |
|---|---|---|
| 1. Server | ai-maestro | Contract v2, checks 4.1-4.10, `POST /api/diagnostics/fix`, Next and headless routes, tests. Version bump and CHANGELOG. |
| 2. Web | ai-maestro | The Settings Doctor section and the deep link. Version bump and CHANGELOG. |
| 3. CLI | ai-maestro-plugins | `doctor` subcommand, plugin version bump. |
| 4. Mobile | ai-maestro-app | Its Doctor screen, built against step 1 once that step is deployed. |

Tests for step 1:

- Each check, with a fixture registry and a temporary home folder:
  - a missing folder;
  - a parent hint inherited by a nested agent;
  - a ghost, and each of the eleven ghost conditions that saves it (one test per condition), including an
    orphan of an old tmux session registered a minute ago;
  - an outside agent;
  - a backup of a deleted agent and a backup of a live agent (only the first is reported);
  - a hook path to a missing file;
  - a drifted AMP script.
- Fix `delete-ghost-agent`: it runs when the conditions hold, and answers 409 when a tmux session or a
  `claudeSessionId` appeared.
- Fix `remove-deleted-agent-backups`: it skips a symlink, a non-matching name and a restored agent's
  backup.
- The existing no-recursion test still passes, and the report stays one run per minute under 50
  concurrent calls.
- Tests never create a real tmux session. Created tmux sessions become orphan agents.

## 10. Decisions

1. A ghost is 24 hours old at least (Juan, 2026-11-03). Section 4.5 defines it.
2. Backups warn at 1 GB (Juan, 2026-11-03).
3. Notifying a person about a new `fail` is out of v1. It belongs to F070 (notifications for long
   actions and agent results).
