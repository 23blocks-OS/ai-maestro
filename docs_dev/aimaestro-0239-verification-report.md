# AI Maestro v0.23.9 — Verification Report

**Date:** 2026-02-16
**Baseline:** Comprehensive analysis report for v0.22.2 (`aimaestro-022-comprehensive-report.md`)
**Verified version:** v0.23.9 (confirmed in `package.json` and `version.json`)

---

## Executive Summary

| Category | Fixed | Partial | Unfixed | Total |
|----------|-------|---------|---------|-------|
| Critical/Major issues | 3 | 1 | 1 | 5 |
| Not-reproduced issues | — | — | — | 1 |
| Feature requests | 0 | 0 | 1 | 1 |
| Improvements | 2 | 1 | 4 | 7 |
| **Total** | **5** | **2** | **6** | **14** |

**Bottom line:** The three highest-impact bugs (#9 CLAUDECODE env var, #5 tmux race conditions, #2 null-field inbox) are fully resolved. Issue #12 (manual trust) remains the only unfixed blocker for automated agent provisioning. The team isolation feature request and most improvements are deferred.

---

## 1. Issue #9 — CLAUDECODE Env Var Blocks Plugin Install

**Original severity:** MAJOR
**Status: FIXED**

The fix is present in **5 independent locations** across v0.23.9:

| Location | File | Lines | Fix |
|----------|------|-------|-----|
| `run_claude_command()` | `plugin/src/scripts/aimaestro-agent.sh` | 338–340 | `(cd "$work_dir" && unset CLAUDECODE && claude ...)` in subshell |
| `run_claude_command()` (published copy) | `plugin/plugins/ai-maestro/scripts/aimaestro-agent.sh` | 338–340 | Same |
| Session create API | `app/api/sessions/create/route.ts` | 204–208 | `tmux set-environment -r CLAUDECODE` + `unset CLAUDECODE` in send-keys |
| Agent wake API | `app/api/agents/[id]/wake/route.ts` | 162–163, 229 | `tmux set-environment -r CLAUDECODE` + `unset CLAUDECODE` in send-keys |
| Help assistant API | `app/api/help/agent/route.ts` | 127–129 | `tmux set-environment -r CLAUDECODE` + `unset CLAUDECODE` in send-keys |

**Details:**
- The `unset CLAUDECODE` in `run_claude_command()` is correctly scoped inside a subshell `(...)` so it does not leak into the parent session.
- `require_claude()` (line 200–206) only checks for the `claude` binary via `command -v` and does not need nesting awareness — this is correct.
- The env var name `CLAUDECODE` (no underscore) is confirmed correct — no references to `CLAUDE_CODE` or `CLAUDE_CODE_NESTING` exist in the codebase.

**Open concern:** No automated regression test exists for this fix. A test that verifies `CLAUDECODE` is unset inside the subshell would prevent regressions.

---

## 2. Issue #5 — tmux send-keys Enter Race Condition

**Original severity:** MINOR (upgraded to MODERATE in the report due to data corruption risk)
**Status: FIXED**

All 3 originally-reported vulnerable patterns plus 1 additional pattern now use atomic `\;` chaining with the `-l` (literal) flag:

| # | File | Line | Fixed Pattern |
|---|------|------|---------------|
| 1 | `app/api/agents/[id]/chat/route.ts` | 315 | `send-keys -t "${sessionName}" -l '${escapedMessage}' \; send-keys -t "${sessionName}" Enter` |
| 2 | `app/api/agents/[id]/session/route.ts` | 173 | `send-keys -t "${sessionName}" -l '${escapedKeys}' \; send-keys -t "${sessionName}" Enter` |
| 3 | `lib/notification-service.ts` | 72 | `send-keys -t "${target}" -l "echo '${escapedMessage}'" \; send-keys -t "${target}" Enter` |
| 4 | `app/api/sessions/[id]/command/route.ts` | 142 | `send-keys -t "${sessionName}" -l '${escapedKeys}' \; send-keys -t "${sessionName}" Enter` |

All 4 fixed patterns include explanatory comments (e.g., "Text and Enter are sent atomically via tmux `\;` command chaining to prevent race conditions").

**7 other send-keys patterns** in the codebase still use the old `"text" Enter` format (without `\;` chaining), but these are **not vulnerable** because:
- They use a single `execAsync` call (text and Enter are separate arguments to the same `tmux send-keys` invocation, processed in one server round-trip).
- They intentionally omit `-l` because they send known shell commands, not arbitrary user input.
- Examples: env export commands in wake/create routes, `"exit" Enter` for hibernate, `"unset CLAUDECODE" Enter` for help assistant.

---

## 3. Issue #2 — Null-Field Inbox Messages

**Original severity:** MODERATE
**Status: FIXED**

File: `lib/messageQueue.ts`, function `convertAMPToMessage()` (lines 192–235).

Full null/undefined validation is now implemented:

| Field | Validation | Behavior if Missing |
|-------|-----------|---------------------|
| `envelope` | `if (!envelope)` | Returns `null` (message skipped) |
| `payload` | `if (!payload)` | Returns `null` (message skipped) |
| `envelope.id` | `if (!envelope.id)` | Returns `null` with `console.warn` |
| `envelope.from` | `if (!envelope.from)` | Returns `null` with `console.warn` |
| `envelope.to` | `if (!envelope.to)` | Returns `null` with `console.warn` |
| `envelope.subject` | `if (!envelope.subject)` | Returns `null` with `console.warn` |
| `envelope.timestamp` | Fallback | Defaults to `new Date().toISOString()` |
| `envelope.priority` | Fallback | Defaults to `'normal'` |
| `payload.type` | Fallback | Defaults to `'notification'` |
| `payload.message` | Fallback | Defaults to `''` |

The `console.warn` for skipped messages includes a diagnostic object (`hasId`, `hasFrom`, `hasTo`, `hasSubject`) for debugging.

---

## 4. Issue #3 — Reply Routing Unreliable

**Original severity:** MODERATE
**Status: PARTIALLY FIXED**

### What was implemented

| Aspect | Status | Evidence |
|--------|--------|----------|
| `in_reply_to` field in AMP envelope | IMPLEMENTED | `lib/types/amp.ts:138`, `lib/types/amp-message.ts:63` |
| Thread tracking via `thread_id` | IMPLEMENTED | `route/route.ts:390` — `thread_id: body.in_reply_to \|\| messageId` |
| `in_reply_to` propagated in forwarding | IMPLEMENTED | `route/route.ts:188` — forwarded to remote hosts |
| `in_reply_to` in signature canonical form | IMPLEMENTED | `route/route.ts:170, 416` |
| `amp-reply.sh` uses in_reply_to correctly | IMPLEMENTED | Lines 108–139: reads original `envelope.from`, passes `--reply-to` and `--thread-id` |

### What remains unimplemented

| Aspect | Status |
|--------|--------|
| Dedicated `reply_to` return-address field | NOT IMPLEMENTED |
| Cached/pre-resolved return routing | NOT IMPLEMENTED |
| Reply bypasses re-resolution of sender | NO — replies still re-resolve |

**How reply routing currently works:**
1. `amp-reply.sh` reads the original message from inbox
2. Extracts `envelope.from` from the original message
3. Calls `amp-send.sh` with that address as recipient
4. `amp-send.sh` → `sendFromUI()` → `resolveAgentIdentifier()` re-resolves the sender

**Remaining gap:** If the original sender has been renamed, moved hosts, or changed address since sending, the reply may fail to resolve. The `from` field is the only routing hint — no pre-cached verified return address exists.

### Proposed fix (still applicable)

Add a `reply_to` field to the AMP envelope containing the sender's full routing info (`agent_id`, `address`, `host`) at send time. When handling a reply, use this cached address instead of re-resolving. Fall back to current resolution if `reply_to` is absent (backward compatibility).

---

## 5. Issue #12 — Manual Trust Approval Required

**Original severity:** MODERATE
**Status: NOT FIXED**

No auto-trust mechanism exists anywhere in v0.23.9. Every new agent launched by AI Maestro requires manual tool approval on first use.

### Evidence

| Component | What it does | Trust setup? |
|-----------|-------------|--------------|
| `cmd_create()` in `aimaestro-agent.sh` (line 1058–1270) | Validates name, calls `create_project_template()`, POSTs to `/api/agents` | **NO** — never writes `.claude/settings.local.json` |
| `create_project_template()` in `agent-helper.sh` (line 277–431) | Creates `.claude/` dir, `CLAUDE.md`, `.gitignore`, `git init` | **NO** — no permissions/trust rules written |
| Wake route (`/api/agents/[id]/wake/route.ts`) | Creates tmux session, sets AMP env vars, launches program | **NO** — no trust/permissions setup |
| Session create route (`/api/sessions/create/route.ts`) | Creates tmux session, registers agent, launches program | **NO** — no trust/permissions config |
| `createAgent()` in `lib/agent-registry.ts` | Pure data registration (UUID, name, host, sessions, metrics) | **NO** — no filesystem writes to settings |
| Docker create route (`/api/agents/docker/create/route.ts`) | Docker agents — has `yolo` flag for `--dangerously-skip-permissions` | Docker-only YOLO toggle, not an auto-trust mechanism |

**Global search results:**
- `settings.local.json` exists only at `~/.ai-maestro/.claude/settings.local.json` with `{"spinnerTipsEnabled": false}` — unrelated
- `allowedTools` appears only in marketplace skill metadata (UI display)
- `--permission-mode bypassPermissions` appears only in the `/api/help/agent` route (built-in help assistant)
- **No code anywhere writes trust rules to an agent's working directory**

### Proposed fix (still applicable)

The create flow should write a `.claude/settings.local.json` into the agent's working directory:

```json
{
  "permissions": {
    "allow": [
      "Bash(*)",
      "Read(*)",
      "Write(*)",
      "Edit(*)",
      "mcp__*"
    ]
  }
}
```

Alternatively, the wake/create routes should pass `--permission-mode acceptEdits` or `--dangerously-skip-permissions` as `programArgs` depending on the agent's trust level configuration.

---

## 6. Issue #10 — `create` Returns Exit Code 1

**Original severity:** MINOR
**Status: NOT REPRODUCED (unchanged)**

The success path in `cmd_create()` implicitly returns 0. This issue was not reproducible in v0.22.x and remains non-reproducible in v0.23.9. No fix needed.

---

## 7. Feature Request — Team-Based Communication Isolation

**Status: NOT IMPLEMENTED**

| Component | Current state |
|-----------|--------------|
| Team types (open/closed) | NOT IMPLEMENTED — `types/team.ts` defines a Team Meeting feature, not isolation |
| `routingMatrix` | NOT IMPLEMENTED — no routing logic in team-registry.ts |
| `resolveAgent()` team checks | NOT IMPLEMENTED — 8-step resolution has no team filtering |
| `roles.json` (MANAGER/CHIEF-OF-STAFF) | NOT IMPLEMENTED — no roles.json exists anywhere |
| Role-assignment security (anti-automation) | NOT IMPLEMENTED |
| CLI team subcommands | NOT IMPLEMENTED — "team" does not appear in `aimaestro-agent.sh` (3879 lines) |

The `Team` interface in `types/team.ts` has: `id`, `name`, `description`, `agentIds`, `instructions`, `createdAt`, `updatedAt`, `lastMeetingAt`, `lastActivityAt`. No `type` field (open/closed), no routing semantics.

---

## 8. Improvements (10.1–10.7)

### 10.1 Version Consistency — PARTIALLY ADDRESSED

| Location | Version |
|----------|---------|
| `package.json` | `0.23.9` |
| `version.json` | `0.23.9` |
| `aimaestro-agent.sh` (line 24 comment) | `v1.0.1` |
| `aimaestro-agent.sh` (--version output) | `v1.0.1` |

`package.json` and `version.json` are now consistent. The CLI script uses an independent versioning scheme (`v1.0.1`) — this may be intentional but was flagged as confusing.

### 10.2 Script Duplication — NOT ADDRESSED (worse)

AMP scripts exist in **4 locations** with **different sizes**:

| Script | `~/.local/bin/` | `scripts/` | `plugins/amp-messaging/scripts/` | `plugin/plugins/ai-maestro/scripts/` |
|--------|----------------|-----------|-------------------------------|-------------------------------------|
| amp-inbox.sh | 4,811 B | 8,841 B | 4,537 B | 4,811 B |
| amp-send.sh | 29,965 B | 5,179 B | 13,510 B | 29,965 B |
| amp-read.sh | 7,487 B | N/A | 5,338 B | 7,487 B |
| amp-reply.sh | 3,996 B | N/A | 3,299 B | 3,996 B |
| amp-register.sh | 12,445 B | 10,132 B | 11,500 B | 12,445 B |

Three distinct versions of each script coexist with no single source of truth.

### 10.3 amp-read.sh Sourcing Documentation — ADDRESSED

`~/.local/bin/amp-read.sh` line 16–18 properly documents the sourcing:
```bash
# Source helper functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/amp-helper.sh"
```

### 10.4 Planning Output Directory — ADDRESSED

`AIMAESTRO_PLANNING_DIR` environment variable is documented in `plugin/plugins/ai-maestro/skills/planning/SKILL.md` (line 43) with usage pattern: `PLAN_DIR="${AIMAESTRO_PLANNING_DIR:-docs_dev}"`.

### 10.5 Changelog — NOT ADDRESSED

No `CHANGELOG.md` exists. `HISTORY.md` is a narrative development history (last updated at v0.19.31), not a structured per-version changelog. `version.json` points to GitHub Releases as the changelog mechanism.

### 10.6 Script Size — NOT ADDRESSED

`aimaestro-agent.sh`: 3,879 lines / 135,448 bytes (~135 KB). Essentially unchanged from the v0.22.2 report (3,877 lines). No refactoring or splitting has occurred.

### 10.7 CLI Args Owner Field — NOT ADDRESSED

No combined `cliArgs` object with an `owner` sub-field exists. The Agent type has `programArgs?: string` (line 456) and `owner?: string` (line 186) as separate top-level fields.

---

## Verification Methodology

Each issue was verified by reading the actual installed files at `~/ai-maestro/` (v0.23.9) and cross-referencing against the original report's findings and proposed fixes.

**Files examined:**

| File | Purpose |
|------|---------|
| `plugin/src/scripts/aimaestro-agent.sh` | CLI tool — create, wake, require_claude, run_claude_command |
| `plugin/src/scripts/agent-helper.sh` | Helper — create_project_template |
| `lib/messageQueue.ts` | Message queue — convertAMPToMessage, resolveAgent |
| `lib/message-send.ts` | Message sending — buildAMPEnvelope, sendFromUI |
| `lib/notification-service.ts` | Notification delivery via tmux |
| `lib/types/amp.ts` | AMP type definitions |
| `lib/types/amp-message.ts` | AMP message type definitions |
| `lib/agent-registry.ts` | Agent CRUD — createAgent |
| `lib/team-registry.ts` | Team CRUD — no routing logic |
| `types/team.ts` | Team Meeting type definition |
| `types/agent.ts` | Agent type definition |
| `app/api/agents/[id]/chat/route.ts` | Chat API — tmux send-keys |
| `app/api/agents/[id]/session/route.ts` | Session API — tmux send-keys |
| `app/api/agents/[id]/wake/route.ts` | Wake API — session creation |
| `app/api/agents/[id]/hibernate/route.ts` | Hibernate API — graceful shutdown |
| `app/api/sessions/create/route.ts` | Session creation API |
| `app/api/sessions/[id]/command/route.ts` | Session command API |
| `app/api/agents/docker/create/route.ts` | Docker agent creation |
| `app/api/help/agent/route.ts` | Help assistant API |
| `~/.local/bin/amp-read.sh` | AMP read script |
| `~/.local/bin/amp-reply.sh` | AMP reply script |
| `plugin/plugins/ai-maestro/skills/planning/SKILL.md` | Planning skill |
| `package.json`, `version.json` | Version info |

---

## Remaining Work for Next Release

### Priority 1 (Blockers)

1. **Issue #12 — Auto-trust mechanism**: Write `.claude/settings.local.json` with pre-approved permissions during agent creation. Without this, every new agent requires manual intervention.

### Priority 2 (Reliability)

2. **Issue #3 — Reply routing `reply_to` field**: Add cached return address to AMP envelope for guaranteed reply delivery when sender state changes.
3. **Regression tests**: Add automated tests for Issue #9 (CLAUDECODE unset) and Issue #5 (atomic tmux chaining).

### Priority 3 (Maintenance)

4. **10.2 — Script deduplication**: Establish single source of truth for AMP scripts; eliminate 3-way divergence.
5. **10.6 — Script refactoring**: Split `aimaestro-agent.sh` (135 KB) into focused modules.
6. **10.5 — Changelog**: Create structured `CHANGELOG.md` tracking per-version changes.
7. **10.1 — Version consistency**: Decide if CLI script versioning (`v1.0.1`) is intentionally separate from app versioning (`0.23.9`); if not, unify.
8. **10.7 — CLI args ownership**: Consider associating `programArgs` with the agent that set them.

### Priority 4 (Strategic)

9. **Team-based communication isolation**: Design and implement open/closed team types with routing enforcement. This is a significant feature requiring envelope format changes, resolution chain modifications, and CLI subcommands.
