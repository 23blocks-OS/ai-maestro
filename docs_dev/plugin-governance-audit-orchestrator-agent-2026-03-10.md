# Plugin Governance Audit: ai-maestro-orchestrator-agent
**Date**: 2026-03-10
**Repo**: https://github.com/Emasoft/ai-maestro-orchestrator-agent
**Version audited**: 1.5.3
**Auditor**: Claude Code (automated audit)
**Reference standard**: docs/PLUGIN-ABSTRACTION-PRINCIPLE.md in ai-maestro repo

---

## Summary

The plugin is a large, mature orchestration agent with 16 skills, 15 commands, 6 agents, and 4 hooks. The majority of the plugin follows the Plugin Abstraction Principle correctly: skills reference the `agent-messaging` skill by name instead of embedding curl syntax, hooks trigger Python scripts (not raw API calls), and governance rules are not hardcoded.

However, there are **3 confirmed violations** of the Plugin Abstraction Principle that require fixes:

1. **Rule 2 (CRITICAL)**: Two Python scripts call the AI Maestro API directly with curl, bypassing the official `amp-send.sh` / `amp-inbox.sh` abstraction layer.
2. **Rule 1 (MINOR)**: One SKILL.md file embeds a hardcoded `http://localhost:23000` URL in its prerequisites section.
3. **Rule 4 (MINOR)**: `plugin.json` declares the AI Maestro dependency in prose but does not use a structured `dependencies` field.

No hardcoded governance rules, permission matrices, or role restriction tables were found in skills or commands.

---

## Rule 1: Plugin Skills MUST NOT Embed API Syntax

**Verdict: VIOLATION FOUND (1 instance)**

### Violation

**File**: `skills/amoa-orchestration-patterns/SKILL.md`, **line 85**

```
AI Maestro running (`http://localhost:23000`), GitHub CLI (`gh`) authenticated.
```

This hardcodes the AI Maestro API base URL directly in a skill file's Prerequisites section. Per the Plugin Abstraction Principle, skills must not embed endpoint URLs, curl commands, or HTTP syntax. The URL is the provider's internal address and will break if the port or host changes.

### Non-Violations (correctly handled)

The following `curl` occurrences in skill files are **NOT violations** because they are:
- Generic examples in changelog/tutorial reference files (not AI Maestro API calls): `skills/amoa-orchestration-patterns/references/changelog-writing-guidelines.md`, `skills/amoa-orchestration-patterns/references/orchestrator-no-implementation.md`, `skills/amoa-orchestration-patterns/references/orchestrator-guardrails-part3-scenarios.md`
- Third-party tool installation instructions (Rust, bun, uv, Go linter): multiple files under `skills/amoa-remote-agent-coordinator/templates/toolchain/` and `references/`
- Docker health-check examples targeting project-specific services (not the AI Maestro API): `skills/amoa-verification-patterns/references/docker-troubleshooting.md`
- The `localhost` references in `skills/amoa-verification-patterns/` refer to user project services, not AI Maestro

All messaging operations in skill files correctly reference the `agent-messaging` skill by name:
```
# Use the agent-messaging skill to send messages.
```
This pattern appears across 70+ locations and is fully compliant.

---

## Rule 2: Plugin Hooks/Scripts MUST NOT Call the API Directly

**Verdict: VIOLATION FOUND (2 scripts)**

### Violation 1: `scripts/amoa_notify_agent.py`

This script directly calls the AI Maestro API at `http://localhost:23000/api/messages` using `subprocess.run(["curl", ...])`.

Key evidence (lines 47–127):
```python
DEFAULT_API_URL = "http://localhost:23000"
# ...
endpoint = "{}/api/messages".format(api_url)
# ...
result = subprocess.run(
    ["curl", "-s", "-S", "-X", "POST", endpoint,
     "-H", "Content-Type: application/json",
     "-d", payload_json, ...],
    ...
)
```

**Impact**: This bypasses `amp-send.sh`. If the AI Maestro API endpoint, port, or authentication scheme changes, this script silently breaks without the update propagating from the official AMP abstraction layer.

**Hooks that trigger this script**: Not triggered by hooks directly, but invoked by agent commands and other scripts during orchestration (it is the general-purpose notification utility).

### Violation 2: `scripts/amoa_confirm_replacement.py`

This script also calls the AI Maestro API directly with curl in two functions:

**`check_ack_received` function (lines 159–165)**:
```python
AIMAESTRO_API = os.environ.get("AIMAESTRO_API", "http://localhost:23000")
# ...
result = subprocess.run(
    ["curl", "-s",
     "{}/api/messages?agent={}&action=list&status=unread".format(AIMAESTRO_API, new_agent)],
    ...
)
```

**`send_amcos_notification` function (lines 384–393)**:
```python
result = subprocess.run(
    ["curl", "-s", "-X", "POST",
     "{}/api/messages".format(AIMAESTRO_API),
     "-H", "Content-Type: application/json",
     "-d", json.dumps(payload)],
    ...
)
```

**Impact**: Same as Violation 1. Both operations (inbox polling and message sending) have official AMP script equivalents: `amp-inbox.sh` and `amp-send.sh`.

### Hooks are clean

Hooks (`hooks/hooks.json`) trigger only internal Python scripts (`amoa_stop_check/main.py`, `amoa_check_verification_status.py`, `amoa_check_polling_due.py`, `amoa_file_tracker.py`). None of these were found to call the AI Maestro API directly.

### Script `amoa_download.py`

Uses `curl` only for generic file downloads from arbitrary URLs (not the AI Maestro API). This is **not a violation**.

---

## Rule 3: Governance Rules Are Discovered at Runtime

**Verdict: COMPLIANT**

No hardcoded governance rules, role restriction matrices, permission tables, COS (Chief of Staff) approval requirements, team transfer workflows, or governance endpoint URLs were found in any skill, command, agent, or hook file.

The plugin correctly references AMCOS, AMAMA, and AMOA roles by name as coordination roles, but does not define the permission matrix for those roles inline. Governance authority is deferred to the AI Maestro `team-governance` skill which is loaded at runtime.

---

## Rule 4: Dependencies Declared

**Verdict: PARTIAL COMPLIANCE**

### plugin.json (lines 1–11)

```json
{
  "name": "ai-maestro-orchestrator-agent",
  "version": "1.5.3",
  "description": "Task distribution, agent coordination, progress monitoring - executes plans via subagents. Requires AI Maestro for inter-agent messaging.",
  "author": { ... },
  "repository": "...",
  "license": "MIT"
}
```

**Positive**: The description text states "Requires AI Maestro for inter-agent messaging."

**Gap**: There is no structured `dependencies` or `skills` array in `plugin.json` that explicitly lists:
- `agent-messaging` (the global AI Maestro skill this plugin relies on)
- `team-governance` (if governance operations are needed)

This means automated dependency resolution (if implemented in the marketplace) would have no machine-readable declaration to work from.

### README.md

The README correctly lists "AI Maestro messaging system for inter-agent communication" as a requirement and mentions the `agent-messaging` skill is used throughout. This is good documentation but does not substitute for a structured `dependencies` field in the manifest.

---

## Missing Items

| Item | Status | Notes |
|------|--------|-------|
| `.claude-plugin/plugin.json` | Present | Missing structured `dependencies` field |
| README.md | Present, complete | Good coverage of components, workflow, validation |
| `dependencies` field in plugin.json | Missing | Only described in prose in `description` string |
| Structured skill dependency declaration | Missing | No `requires_skills: [agent-messaging]` field |
| `team-governance` skill reference | Missing | Not mentioned anywhere; if the plugin orchestrates governance actions via AMCOS, this should be declared |

---

## Violations Found (with file:line)

| # | Rule | Severity | File | Line | Description |
|---|------|----------|------|------|-------------|
| V1 | Rule 1 | Minor | `skills/amoa-orchestration-patterns/SKILL.md` | 85 | Hardcoded `http://localhost:23000` URL in Prerequisites |
| V2 | Rule 2 | Critical | `scripts/amoa_notify_agent.py` | 48, 87–119 | Direct curl call to `/api/messages` bypassing `amp-send.sh` |
| V3 | Rule 2 | Critical | `scripts/amoa_confirm_replacement.py` | 68, 159–165, 384–393 | Direct curl calls to `/api/messages` bypassing `amp-send.sh`/`amp-inbox.sh` |
| V4 | Rule 4 | Minor | `.claude-plugin/plugin.json` | whole file | No structured `dependencies` field; dependency on `agent-messaging` skill only declared in description prose |

---

## Alignment Instructions

### Fix V1: Remove hardcoded URL from SKILL.md

**File**: `skills/amoa-orchestration-patterns/SKILL.md`, line 85

Replace:
```
AI Maestro running (`http://localhost:23000`), GitHub CLI (`gh`) authenticated.
```
With:
```
AI Maestro running and accessible (check `$AIMAESTRO_API` or default port), GitHub CLI (`gh`) authenticated.
```

Or simply:
```
AI Maestro installed and running, GitHub CLI (`gh`) authenticated.
```

Never embed specific URL/port in skill files.

### Fix V2: Replace direct API calls in `scripts/amoa_notify_agent.py`

Replace the entire `send_message()` function's `subprocess.run(["curl", ...])` block with a call to the globally-installed `amp-send.sh` script:

```python
import subprocess

def send_message(agent_id, subject, message, priority, message_type):
    try:
        result = subprocess.run(
            ["amp-send.sh", agent_id, subject, message],
            capture_output=True, text=True, timeout=45,
        )
        return result.returncode == 0, result.stdout.strip()
    except FileNotFoundError:
        return False, "amp-send.sh not found -- install AI Maestro AMP scripts"
    except subprocess.TimeoutExpired:
        return False, "Request timed out"
```

Note: `amp-send.sh` may need `--priority` and `--type` flags added if the official script supports them. Check `~/.local/bin/amp-send.sh` usage.

Alternatively, if the script must remain Python-only (e.g. for portability), it should at minimum read the API URL exclusively from `$AIMAESTRO_API` without any hardcoded fallback to `localhost:23000`, and the calling convention should be documented as requiring that env var to be set.

### Fix V3: Replace direct API calls in `scripts/amoa_confirm_replacement.py`

**For `check_ack_received`**: Replace the `curl` call with `amp-inbox.sh`:
```python
result = subprocess.run(
    ["amp-inbox.sh", "--agent", new_agent, "--status", "unread", "--format", "json"],
    capture_output=True, text=True, timeout=15,
)
```

**For `send_amcos_notification`**: Replace the `curl` POST with `amp-send.sh`:
```python
result = subprocess.run(
    ["amp-send.sh", ecos_session, subject, json.dumps(message_content)],
    capture_output=True, text=True, timeout=15,
)
```

Verify the exact flag signatures of the installed AMP scripts before implementing.

### Fix V4: Add structured dependencies to plugin.json

Add a `dependencies` field:
```json
{
  "name": "ai-maestro-orchestrator-agent",
  "version": "1.5.3",
  "description": "Task distribution, agent coordination, progress monitoring - executes plans via subagents.",
  "author": { "name": "Emasoft", "email": "713559+Emasoft@users.noreply.github.com" },
  "repository": "https://github.com/Emasoft/ai-maestro-orchestrator-agent",
  "license": "MIT",
  "dependencies": {
    "skills": ["agent-messaging"],
    "scripts": ["amp-send.sh", "amp-inbox.sh", "amp-read.sh", "amp-reply.sh"]
  },
  "requires": {
    "ai-maestro": ">=0.20.0"
  }
}
```

Adjust version floor to match the minimum AI Maestro version where AMP was introduced.

---

## Positive Findings

The following aspects of the plugin are well-aligned with the Plugin Abstraction Principle and should be preserved:

1. **Skills reference `agent-messaging` by name**: All 70+ messaging operations in skills use the pattern `# Use the agent-messaging skill to send messages.` — fully compliant with Rule 1.

2. **No API syntax in commands**: All 15 command files (`commands/*.md`) contain no curl, no endpoint URLs, and no HTTP headers.

3. **No API syntax in agents**: All 6 agent definition files (`agents/*.md`) contain no curl or direct API calls.

4. **Hooks are clean**: `hooks/hooks.json` only references internal plugin scripts; none make direct API calls.

5. **No hardcoded governance rules**: The plugin correctly treats governance authority as externally defined, delegating to AMCOS without embedding permission tables.

6. **`op-send-message.md` and `op-check-inbox.md` are model examples**: These skill reference files correctly describe messaging operations in terms of the `agent-messaging` skill rather than raw curl commands.

7. **`orchestration-api-commands.md` is compliant**: This key reference file uses Task API syntax (`TaskCreate`, `TaskUpdate`) for local subagents and references the `agent-messaging` skill for remote agents — the correct pattern.
