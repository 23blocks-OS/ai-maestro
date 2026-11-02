# Spec: the audit trail

**Status:** Draft for review (2026-11-02). Nothing here is built. Backlog: F066 (this), F067 (governance, which reads it).
**Goal:** for every agent action, record what happened, who authorized it, what caused it and which rules were in force, so that "why did the agent do this" has an answer. Slice 1 ships as an experiment that is off by default.

## 1. Rules

1. **Never slow the agent.** The hook sends an event and moves on. If the server does not answer within the hook's normal timeout (1.5 s), the event is dropped. A counter of dropped events appears in the Audit tab.
2. **One writer per agent.** Only the server writes audit files, so the chain of lines stays intact.
3. **No secret values, no file contents, no whole conversations.** Commands and prompts are clipped and pass through `redactSecrets` before they are written.
4. **Off means off.** With the experiment off, no event is sent or written. Turning it off keeps the files already written, and the settings show how to delete them.
5. **The record is evidence, not a lock.** Agents run as the same OS user as AI Maestro (B021), so an agent can edit audit files. The chain detects that; it does not prevent it. Section 8 says how to get a copy that an agent cannot reach.

## 2. The switch

Settings > Experiments > **Audit trail**. The other experiments live in the browser's local storage; this one must reach the server and the hook, so it is a server setting in `~/.aimaestro/audit-settings.json`:

```json
{ "enabled": true, "agents": "all", "retentionDays": 365, "maxMonthMB": 50, "promptChars": 200, "commandChars": 500 }
```

`agents` is `"all"` or a list of agent ids, so the first trial can cover a few agents. The hook learns the state from the server answer it already gets for each agent, so no extra request is made.

## 3. The event

One JSON object per line. Common fields:

| Field | Meaning |
|---|---|
| `v` | Format version, `1` |
| `id` | `aud_<time>_<random>` |
| `at` | ISO time on the server |
| `agentId`, `hostId` | Who and where |
| `sessionId` | The program's session id, when known |
| `turnId` | The turn this event belongs to (section 4). Joins an action to its cause |
| `kind` | `prompt`, `action`, `approval`, `message`, `config`, `system` |
| `prev` | SHA-256 of the previous line in this file, or `null` for the first |

Fields by kind:

| Kind | Fields |
|---|---|
| `prompt` | `source` (section 4), `text` (first `promptChars`, redacted), `textSha256` (hash of the whole prompt) |
| `action` | `tool`, `target` (command, path or URL, first `commandChars`, redacted), `result` (`done`, `error`), `batch` (position in the tool batch) |
| `approval` | `asked` (tool and a short summary), `answer` (the option chosen), `by` (section 4) |
| `message` | `messageId`, `from`, `subject` (clipped), `verification` (`state`, `trust`, `sender_kind`, `operator` from `local.verification`) |
| `config` | `reason` (`wake`, `file_changed`), `program`, `programVersion`, `model`, `permissionMode`, `launchOptions`, `pluginVersion`, `files` (a map of path to SHA-256 for `CLAUDE.md`, `.claude/settings.json`, `.claude/settings.local.json`, `~/.claude/settings.json`) |
| `system` | `what` (`enabled`, `disabled`, `dropped`, `chain_broken`, `rotated`), `count` |

Each distinct version of a governing file is stored once, by hash, in `audit/config/<sha256>`. A `config` event therefore points at the exact rules that were in force.

## 4. Who authorized it, and what caused it

**The turn.** A `prompt` event opens a turn and gets a new `turnId`. Every `action` and `approval` that follows, until the program's `Stop`, carries that `turnId`. So each action links to the prompt behind it.

**`source` of a prompt:**

| Value | When |
|---|---|
| `{ "type": "person", "via": "dashboard" }` | Typed in the dashboard chat or terminal. No login exists, so this means "someone at a dashboard", not a named person |
| `{ "type": "person", "via": "phone", "personId", "deviceId", "signed": true }` | A signed request from a paired phone (AMP spec 13) |
| `{ "type": "agent", "messageId", "from", "operator": false }` | Started by an AMP message: the push or the poll that delivered it |
| `{ "type": "schedule", "scheduleId" }` | A schedule fired |
| `{ "type": "task", "taskId" }` / `{ "type": "canvas", "file" }` / `{ "type": "webhook", "id" }` | Those features |
| `{ "type": "unknown" }` | Typed straight into the tmux pane or the program, with nothing to identify it |

**`by` of an approval:** the same shapes, for whoever answered the card (dashboard, phone with device id, or a signed person request).

**For an action**, "authorized by" is one of three answers:
- the approval with the same `turnId` that came just before it;
- otherwise the permission mode in the latest `config` event (the allow rule itself is recorded only once the hook gets `PreToolUse`; that is a later slice);
- the turn's source as the instruction behind it.

## 5. Where the events come from

| Event | Source today | Slice |
|---|---|---|
| `prompt` | Hook `UserPromptSubmit`; server-side senders (chat, AMP push, schedules) add the `source` they know | 1 |
| `action` | Hook `PostToolBatch` (`tool_calls`: `tool_name`, `tool_input`; check that the result is included) | 1 |
| `approval` | Hook `PermissionRequest` (asked), `sendPermissionResponse` in `server.mjs` (answered) | 1 |
| `message` | AMP delivery in `services/amp-service.ts` (`deliverLocally`, person mailbox) | 1 |
| `config` | Wake (`agents-core`), and a check of the file hashes on every `SessionStart` | 1 |
| Denied by a rule or by the sandbox | Hook `PreToolUse` / `PostToolUseFailure` (new hook registration) | 2 |
| Codex, Grok Build | Their transcripts and hooks | 3 |

Server-side sources write directly. The hook posts to `POST /api/agents/:id/audit/events`. That endpoint accepts requests only from the same machine (loopback address), because hooks run on the agent's host. Without that check, anyone on the network could write fake audit events. Headless mode serves the same route through `services/headless-router.ts`.

## 6. Storage

- `~/.aimaestro/agents/<id>/audit/YYYY-MM.jsonl`, 0600, append-only. It lives in the agent's folder, so export and transfer carry it.
- When a month passes `maxMonthMB`, the server rotates to `YYYY-MM.N.jsonl` and writes a `system` `rotated` event. Files older than `retentionDays` are deleted at startup and once a day.
- **The chain:** each line's `prev` is the SHA-256 of the previous line's exact bytes. `GET /api/agents/:id/audit/verify` walks the files and reports the first line that does not match. A broken chain becomes a `system` `chain_broken` event and a warning in the tab.

## 7. Reading it

- `GET /api/agents/:id/audit?from=&to=&kind=&turnId=&limit=` returns events, newest first.
- `GET /api/agents/:id/audit/export?from=&to=&format=jsonl|csv`.
- **Audit tab** on the agent profile:
  - a timeline grouped by turn: the prompt and its source, then its actions and approvals;
  - `config` events shown as dividers ("from here: Opus, supervised, settings v3");
  - filters by kind and by result;
  - the dropped-events counter and the chain state.
- The organization view across hosts (the owning-host pattern) is slice 2.

These routes follow the no-auth design: anyone who can reach the dashboard can read them, as with chats and terminals. That is why rule 3 matters.

## 8. A copy that agents cannot change (slice 2)

An optional forwarder sends each event as it is written to:
- syslog;
- a webhook;
- a security event store (SIEM) such as Microsoft Sentinel or Splunk.

Another host or a SIEM is where the record becomes trustworthy. For agents that must not touch their own record, use containers: an agent in a container cannot reach the host's audit folder.

## 9. Slices

**Slice 1, the experiment (about 2-3 days):**
- the switch and settings;
- the event format, the writer, the chain, rotation and retention;
- `prompt`, `action`, `approval`, `message` and `config` from the sources marked 1;
- the loopback-only endpoint;
- read, export and verify;
- the Audit tab.

Tests:
- no event is written when the switch is off;
- a secret in a command is redacted;
- a broken chain is found;
- the hook gives up within its timeout when the server is down;
- a request from a non-loopback address is refused.

**Trial:** turn it on for a few agents on this Mac for a day. Check that every action shows its cause and authority, measure the file size, and list the gaps.

**Slice 2:**
- denials from `PreToolUse` and the sandbox;
- allow-rule attribution;
- the organization view;
- the forwarder;
- B006 refusals as `system` events.

**Slice 3:** Codex and Grok Build. Then F067 builds on this.

## 10. Open questions

1. **Prompt text:** keep the first 200 characters (default), or only the hash for stricter privacy?
2. **Retention default:** one year, as in Jaime's deployment?
3. **The switch:** one setting for the whole organization, or one per host? Per host is simpler for slice 1.
