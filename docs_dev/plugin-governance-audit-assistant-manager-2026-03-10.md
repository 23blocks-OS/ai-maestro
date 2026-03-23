# Plugin Governance Audit: AI Maestro Assistant Manager Agent (AMAMA)
**Repo**: https://github.com/Emasoft/ai-maestro-assistant-manager-agent
**Audited**: 2026-03-10
**Plugin Version**: 2.5.2
**Auditor**: Claude Code (claude-sonnet-4-6)
**Audit Framework**: Plugin Abstraction Principle (docs/PLUGIN-ABSTRACTION-PRINCIPLE.md)

---

## Summary

The AMAMA plugin is **substantially aligned** with the Plugin Abstraction Principle but has **2 confirmed violations** and **3 advisory issues**. The violations are in skill reference files (Rule 1) and in one hook script (Rule 2). The plugin correctly references global AI Maestro skills by name in most places and avoids hardcoding governance rules.

| Rule | Status | Severity |
|------|--------|----------|
| Rule 1: Plugin Skills MUST NOT Embed API Syntax | VIOLATION | Medium |
| Rule 2: Plugin Hooks/Scripts MUST NOT Call API Directly | VIOLATION | Low |
| Rule 3: Governance Rules Discovered at Runtime | PASS (with notes) | - |
| Rule 4: Dependencies Declared | PARTIAL | Low |

---

## Violations Found

### VIOLATION 1 — Rule 1: Skill Reference Files Embed Raw curl API Syntax

**Severity**: Medium
**Status**: Confirmed

Several skill reference files in the `skills/` directory embed raw `curl` commands with hardcoded API endpoint paths. While the SKILL.md top-level files are clean (no curl), the reference docs that skills point agents to contain complete curl invocations.

**Files and Line Numbers**:

**`skills/amama-approval-workflows/references/api-endpoints.md`** — lines 14-52:
```
curl -s "$AIMAESTRO_API/api/v1/governance/requests?status=pending"
curl -X POST "$AIMAESTRO_API/api/v1/governance/requests/{id}/approve"
curl -X POST "$AIMAESTRO_API/api/v1/governance/requests/{id}/reject"
curl -X POST "$AIMAESTRO_API/api/v1/governance/transfers"
```

**`skills/amama-approval-workflows/references/governance-password.md`** — line 14:
```
curl -X POST "$AIMAESTRO_API/api/v1/governance/password"
```

**`skills/amama-amcos-coordination/references/creating-amcos-instance.md`** — lines 58-64, 83-87, 161-170:
```
curl -X PATCH "$AIMAESTRO_API/api/teams/$TEAM_ID/chief-of-staff"
curl -X POST "$AIMAESTRO_API/api/v1/governance/requests"
```

**`skills/amama-status-reporting/references/api-endpoints.md`** — lines 22-48:
```
curl -s "$AIMAESTRO_API/api/sessions"
curl -s "$AIMAESTRO_API/api/agents/health"
curl -s "$AIMAESTRO_API/api/teams/$TEAM_ID"
curl -s "$AIMAESTRO_API/api/teams/$TEAM_ID/tasks"
```

**Why this matters**: When AI Maestro changes its API (endpoint paths, new headers required, changed request bodies), every one of these reference files must be updated manually. This defeats the Plugin Abstraction Principle whose point is that only AI Maestro's own skill files should contain the canonical API syntax.

**What the rule requires**: Plugin skill files (including their reference documents) should NOT contain curl commands or endpoint URLs. They should describe what operations are available and reference the global `team-governance` skill by name for the canonical syntax.

---

### VIOLATION 2 — Rule 2: Hook Script Calls API Directly with curl

**Severity**: Low (mitigated by fallback behavior)
**Status**: Confirmed

**File**: `scripts/amama_stop_check.py` — lines 42-49

```python
api_base = os.environ.get("AIMAESTRO_API", "http://localhost:23000")
session_name = os.environ.get("AIMAESTRO_AGENT", "")
result = subprocess.run(
    ["curl", "-sf", f"{api_base}/api/messages?agent={session_name}&action=unread-count"],
    capture_output=True, text=True, timeout=5,
)
```

This hook script, which runs on the Stop event, calls the AI Maestro API directly with `curl` instead of using the global `amp-inbox.sh` script.

The `amp-inbox.sh` script is already installed globally by AI Maestro and provides the correct inbox-checking behavior with proper error handling and format. The hook should call `amp-inbox.sh` instead of constructing its own curl command.

**Mitigation context**: The direct curl call is wrapped in a broad try/except, so failures are silently ignored. This makes it low-risk in practice, but it still violates the abstraction principle.

---

## Advisory Issues (Not Strict Violations)

### ADVISORY A1 — plugin.json Missing Required Fields

**Severity**: Low
**File**: `.claude-plugin/plugin.json`

Current content:
```json
{
  "name": "ai-maestro-assistant-manager-agent",
  "version": "2.5.2",
  "description": "User's right hand - sole interlocutor with user...",
  "author": {...},
  "repository": "...",
  "license": "MIT"
}
```

Missing fields compared to what the Plugin Abstraction Principle recommends:
- No `requiredSkills` array listing globally-required AI Maestro skills (e.g., `"team-governance"`, `"agent-messaging"`, `"ai-maestro-agents-management"`)
- No `minimumAIMaestroVersion` field (the README states `>= 0.26.0` but this is not machine-readable in the manifest)

The README correctly documents the `AI Maestro >= 0.26.0` dependency and the `ai-maestro-agents-management` external skill requirement. However, these are only in prose form, not in a structured `plugin.json` field that tooling can read.

---

### ADVISORY A2 — Agent File Embeds API Endpoint Paths Inline

**Severity**: Low
**File**: `agents/amama-assistant-manager-main-agent.md` — lines 84, 94-97, 101-102, 111, 142

The main agent definition file contains inline API endpoint paths as informational constraints (not as curl commands to execute):

```
PATCH /api/teams/[id]/chief-of-staff
POST /api/teams
GET /api/messages?agent={name}&status=unread
GET /api/health
POST /api/v1/governance/requests/[id]/approve
```

These appear in the "Key Constraints" and "Governance Awareness" sections as documentation of what the MANAGER role can do, not as executable instructions. This is borderline: it is reasonable for an agent's system prompt to describe its own capabilities using API paths as shorthand, but strictly speaking the agent should be told "use the `team-governance` skill for COS assignment" rather than "call `PATCH /api/teams/[id]/chief-of-staff`".

This is advisory (not a hard violation) because the intent is informational and the agent is the primary consumer of these instructions, not an external plugin.

---

### ADVISORY A3 — SKILL.md Files for Approval Workflows and AMCOS Coordination Include API Paths in Instructions

**Severity**: Low
**Files**:
- `skills/amama-approval-workflows/SKILL.md` — line 25: `GET /api/v1/governance/requests?status=pending`
- `skills/amama-amcos-coordination/SKILL.md` — lines 25-27: `PATCH /api/teams/$TEAM_ID/chief-of-staff`, `POST /api/agents/register`, `POST /api/teams`

These SKILL.md files list API paths in their Instructions sections. Unlike the reference files (Violation 1 above), these are not full curl commands — just path references. However, they still embed endpoint knowledge that should be in the global `team-governance` skill.

The clean skills (e.g., `amama-role-routing`, `amama-user-communication`, `amama-session-memory`) correctly avoid embedding API paths and just describe behavior at a high level. The approval-workflows and amcos-coordination skills should follow the same pattern.

---

## Missing Items

| Item | Status | Notes |
|------|--------|-------|
| `.claude-plugin/plugin.json` manifest | Present | Missing structured fields (see Advisory A1) |
| README | Present | Well-documented, substantive |
| `messaging-helper.sh` references | None found | No violations — correctly uses `amp-send` CLI |
| Hooks reference global scripts | Partial | `amama_notify_agent.py` correctly calls `amp-send`; `amama_stop_check.py` does not (Violation 2) |
| Session start/end hooks | Present | File-based only, no API calls — compliant |
| `ai-maestro-agents-management` external skill | Declared in agent | Only in prose, not in plugin.json |
| Hardcoded governance rules | None found | `thresholds.py` correctly defines roles as data, not logic |
| Old `messaging-helper.sh` references | None found | Clean |
| Legacy API references (pre-v0.26) | None found | All endpoints look current |

---

## What is Correct (Passing Items)

The following are well-implemented and serve as positive examples:

1. **`thresholds.py`** — Governance roles defined as a `frozenset` constant (`VALID_GOVERNANCE_ROLES`), not hardcoded in conditionals. Clean.

2. **`amama_notify_agent.py`** — Uses `amp-send` CLI (globally installed), not a direct API call. Correct.

3. **`amama_session_start.py` and `amama_session_end.py`** — Pure file I/O, no API calls. Correct.

4. **`amama-user-communication` SKILL.md** — No API paths, no curl. Clean reference to other skills by name.

5. **`amama-role-routing` SKILL.md** — No API paths, no curl. Uses skill references correctly.

6. **`amama-session-memory` SKILL.md** — References `$AIMAESTRO_API/api/memory/` only as a documentation note in Resources, not as an embedded instruction.

7. **Agent skill list** (`amama-assistant-manager-main-agent.md`) — Correctly lists `ai-maestro-agents-management` as an external dependency with a clear prose warning that it must be globally installed.

8. **`skills/amama-amcos-coordination/references/success-criteria.md`** — Correctly refers to the `ai-maestro-agents-management` skill by name for agent listing, not curl.

9. **`skills/amama-user-communication/references/amcos-monitoring.md`** — Uses `agent-messaging` skill and `ai-maestro-agents-management` skill by name for all monitoring actions.

10. **No `messaging-helper.sh` references** — The plugin has migrated to the correct `amp-*` scripts.

---

## Alignment Instructions (Step-by-Step)

### Fix 1: Move curl commands out of skill reference files (addresses Violation 1)

For each of the following reference files:
- `skills/amama-approval-workflows/references/api-endpoints.md`
- `skills/amama-approval-workflows/references/governance-password.md`
- `skills/amama-amcos-coordination/references/creating-amcos-instance.md`
- `skills/amama-status-reporting/references/api-endpoints.md`

**Replace** each curl code block with a prose description of what the operation does, and add a note directing the agent to use the global `team-governance` skill for the canonical curl syntax. Example transformation:

Before:
```bash
curl -X PATCH "$AIMAESTRO_API/api/teams/$TEAM_ID/chief-of-staff" \
  -H "Content-Type: application/json" \
  -d "{\"agentId\": \"$AGENT_ID\"}"
```

After:
```
Use the global `team-governance` skill to assign the COS role to a team.
Operation: Assign COS to team (PATCH /api/teams/{id}/chief-of-staff)
See the `team-governance` skill for the current canonical API syntax and required headers.
```

This way if the AI Maestro API changes, only the global `team-governance` skill needs updating.

---

### Fix 2: Replace direct curl call in amama_stop_check.py with amp-inbox.sh (addresses Violation 2)

**File**: `scripts/amama_stop_check.py`, function `check_ai_maestro_inbox()` (lines 39-57)

**Replace** the subprocess call to `curl` with a call to `amp-inbox.sh`:

```python
def check_ai_maestro_inbox() -> tuple[int, list[str]]:
    """Check AI Maestro inbox for unread messages via amp-inbox.sh."""
    try:
        result = subprocess.run(
            ["amp-inbox.sh", "--unread-count"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0 and result.stdout.strip():
            count = int(result.stdout.strip())
            if count > 0:
                return count, [f"{count} unread message(s)"]
    except (subprocess.TimeoutExpired, subprocess.SubprocessError, ValueError, FileNotFoundError, OSError):
        pass
    return 0, []
```

Note: Verify the exact `amp-inbox.sh` flag for unread count (`--unread-count` or similar) against the installed script's `--help` output, as the exact flag may differ from the above example.

---

### Fix 3: Add structured dependency fields to plugin.json (addresses Advisory A1)

Update `.claude-plugin/plugin.json` to add machine-readable dependency declarations:

```json
{
  "name": "ai-maestro-assistant-manager-agent",
  "version": "2.5.2",
  "description": "User's right hand - sole interlocutor with user, directs other roles. Requires AI Maestro for inter-agent messaging.",
  "minimumAIMaestroVersion": "0.26.0",
  "requiredGlobalSkills": [
    "ai-maestro-agents-management",
    "agent-messaging",
    "team-governance"
  ],
  "author": {
    "name": "Emasoft",
    "email": "713559+Emasoft@users.noreply.github.com"
  },
  "repository": "https://github.com/Emasoft/ai-maestro-assistant-manager-agent",
  "license": "MIT"
}
```

---

### Fix 4: Clean API path references from top-level SKILL.md instructions (addresses Advisory A3)

For `skills/amama-approval-workflows/SKILL.md` line 25 and `skills/amama-amcos-coordination/SKILL.md` lines 25-27:

Replace bare endpoint paths in the "Instructions" sections with references to the global `team-governance` skill. Example:

Before (amama-approval-workflows/SKILL.md):
```
1. Poll pending (`GET /api/v1/governance/requests?status=pending`)
```

After:
```
1. Poll pending governance requests — use the `team-governance` skill for API syntax
```

---

### Fix 5 (Optional): Refactor agent Key Constraints to use skill references (addresses Advisory A2)

The `agents/amama-assistant-manager-main-agent.md` Key Constraints table references API paths as documentation. This is low-priority but can be improved by changing:

Before:
```
| **COS ASSIGNMENT** | You are the ONLY one who assigns COS role to existing agents via `PATCH /api/teams/[id]/chief-of-staff`. |
```

After:
```
| **COS ASSIGNMENT** | You are the ONLY one who assigns COS role to existing agents. Use the `team-governance` skill for the API call. |
```

---

## Prioritized Action List

| Priority | Action | File | Rule |
|----------|--------|------|------|
| HIGH | Remove curl commands from skill reference files | 4 reference files (see Violation 1) | Rule 1 |
| MEDIUM | Replace curl in amama_stop_check.py with amp-inbox.sh | `scripts/amama_stop_check.py:47` | Rule 2 |
| MEDIUM | Add structured dependency fields to plugin.json | `.claude-plugin/plugin.json` | Rule 4 |
| LOW | Remove API paths from SKILL.md instruction steps | `amama-approval-workflows/SKILL.md:25`, `amama-amcos-coordination/SKILL.md:25-27` | Rule 1 |
| LOW | Refactor agent Key Constraints to use skill references | `agents/amama-assistant-manager-main-agent.md` | Rule 1 |
