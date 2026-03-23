# Plugin Governance Audit: ai-maestro-integrator-agent
**Date**: 2026-03-10
**Repo**: https://github.com/Emasoft/ai-maestro-integrator-agent
**Version audited**: 1.1.17
**Auditor**: Claude Code (automated audit)

---

## Summary

The `ai-maestro-integrator-agent` plugin is a well-structured, large plugin (20 skills, 11 agents, 3 hooks) that largely follows the Plugin Abstraction Principle. The SKILL.md files correctly delegate messaging to the `agent-messaging` skill by name rather than embedding curl commands. The hooks (PreToolUse, Stop) use Python scripts that call `gh` CLI only, not the AI Maestro REST API directly.

However, **one clear violation was found**: a skill script (`ci_webhook_handler.py`) makes direct REST API calls to `http://localhost:23000/api/messages` using `urllib`. Additionally, two lines in a skill reference document instruct agents to "Execute curl POST to AI Maestro API" without delegating to the global scripts. These are **Rule 2 violations**. Rule 1 is clean. Rule 3 has minor concerns (hardcoded role matrices in docs). Rule 4 is partially satisfied.

**Verdict: 1 critical violation (Rule 2), 1 moderate violation (Rule 2 in docs), 1 advisory (Rule 3), 2 missing items (Rule 4).**

---

## Rule 1: Plugin Skills MUST NOT Embed API Syntax

**Rule**: Skill SKILL.md files must not contain `curl`, `http://localhost`, endpoint URLs, or HTTP headers targeting the AI Maestro API. They should reference global AI Maestro skills by name.

**Findings**: CLEAN

Searched all 20 `SKILL.md` files for: `curl`, `http://localhost`, `/api/`, `X-API-Key`, `Authorization:`.

- No SKILL.md file contains curl commands targeting the AI Maestro API.
- The messaging templates skill (`amia-integration-protocols`) correctly instructs agents to use the `agent-messaging` skill by name for all inter-agent communication:
  - `SKILL.md:119` references `ai-maestro-message-templates.md` — AI Maestro curl command templates (as a named reference file)
  - The actual template file (`references/ai-maestro-message-templates.md`) explicitly states: _"To send a message, use the `agent-messaging` skill with the above fields."_ — no curl embedded.
- Curl commands found in skill reference docs (`amia-release-management`, `amia-git-worktree-operations`, etc.) all target generic external services (e.g., `api.example.com`, `sonar.example.com`), NOT the AI Maestro API. These are legitimate examples in the user's own codebase being reviewed.

**Verdict: PASS** (✓ VERIFIED — all 20 SKILL.md files examined, no AI Maestro API calls embedded)

---

## Rule 2: Plugin Hooks/Scripts MUST NOT Call the API Directly

**Rule**: Hooks and scripts must call global AI Maestro scripts (`aimaestro-agent.sh`, `amp-send.sh`, `amp-inbox.sh`, etc.) rather than making direct API calls.

**Findings**: VIOLATIONS FOUND

### Violation 2A (CRITICAL): `ci_webhook_handler.py` calls AI Maestro REST API directly

**File**: `skills/amia-github-projects-sync/scripts/ci_webhook_handler.py`

**Lines**:
- Line 41: `AIMAESTRO_API = os.environ.get("AIMAESTRO_API", "http://localhost:23000")`
- Line 72: `f"{AIMAESTRO_API}/api/messages"` — direct POST to the AI Maestro messages endpoint
- Lines 71–77: Uses `urllib.request.Request` to call the REST API directly instead of delegating to `amp-send.sh`

**Code excerpt**:
```python
req = urllib.request.Request(
    f"{AIMAESTRO_API}/api/messages",
    data=payload.encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)
urllib.request.urlopen(req, timeout=10)
```

**Why this is a violation**: This script bypasses the `amp-send.sh` abstraction layer and calls the AI Maestro messaging API directly. If the API changes (e.g., endpoint renamed, auth headers added, payload format changed), this script breaks independently of the global scripts. It should instead call `amp-send.sh` via subprocess, or at minimum accept the API URL/format from the installed global scripts.

**Note**: The script does have a localhost-only SSRF guard (lines 43–46), which is a positive security measure, but the structural violation remains.

### Violation 2B (MODERATE): Skill reference document instructs direct curl calls

**File**: `skills/amia-integration-protocols/references/phase-procedures.md`

**Lines**:
- Line 95: `- Execute curl POST to AI Maestro API`
- Line 145: `- Execute curl POST to orchestrator-amoa`

These are procedural instructions embedded in a skill reference document telling agents to use `curl` directly to send messages. This contradicts the same skill's own `ai-maestro-message-templates.md` which correctly delegates to the `agent-messaging` skill. The phase-procedures document was not updated when the messaging approach was standardized.

**Hooks (`hooks/hooks.json`)**: CLEAN
All three hooks (`amia-branch-protection`, `amia-issue-closure-gate`, `amia-stop-check`) invoke Python scripts that use only `subprocess`/`gh` CLI calls. None call the AI Maestro REST API directly.

**Verdict: FAIL** — 1 critical violation (script), 1 moderate violation (documentation)

---

## Rule 3: Governance Rules Are Discovered at Runtime

**Rule**: Plugins must not hardcode governance rules, role restrictions, or permission matrices. These should be discovered at runtime by reading the `team-governance` skill.

**Findings**: ADVISORY

The plugin contains explicit governance/role boundary documentation in `docs/ROLE_BOUNDARIES.md` and `docs/TEAM_REGISTRY_SPECIFICATION.md`. These files contain:

- A hardcoded role hierarchy (AMAMA → AMCOS/AMOA/AMIA → sub-agents)
- Explicit permission matrices with checkmarks/crosses (e.g., `docs/ROLE_BOUNDARIES.md:189-199`)
- Hardcoded rules like "AMCOS CANNOT assign tasks (AMOA only)" and "AMOA CANNOT create agents (request via AMCOS)"

Additionally, `agents/amia-integrator-main-agent.md` (lines 54–61) contains a hardcoded constraints table specifying what AMIA can and cannot do.

**Assessment**: These role boundaries are described from the perspective of the AMIA plugin itself (defining its own responsibilities), which is acceptable self-documentation. The concern is whether the plugin consults the `team-governance` global skill to discover governance rules at runtime, or relies solely on these local documents.

**Finding**: No reference to the `team-governance` skill was found anywhere in the plugin. The plugin has no mechanism to discover governance rules dynamically.

**Impact**: If the AI Maestro team governance rules change (e.g., new approval flows, new roles), these local documents will drift out of sync. The agent will operate on stale rules without realizing it.

**Verdict: ADVISORY** — Not a hard violation (role self-documentation is common), but the absence of `team-governance` skill references means the plugin does not benefit from runtime governance discovery.

---

## Rule 4: Dependencies Declared

**Rule**: `plugin.json` should reference required AI Maestro skills, and skill files should have Prerequisites sections declaring their dependencies.

**Findings**: PARTIALLY SATISFIED

### `plugin.json` — PARTIAL

```json
{
  "name": "ai-maestro-integrator-agent",
  "version": "1.1.17",
  "description": "...Requires AI Maestro for inter-agent messaging.",
  ...
}
```

The description mentions "Requires AI Maestro" in prose, but there is **no structured `dependencies` or `skills` field** declaring which AI Maestro global skills must be pre-installed (`agent-messaging`, `team-governance`, `ai-maestro-agents-management`). A consumer installing this plugin has no programmatic way to know what global skills are required.

### Skill `Prerequisites` sections — MOSTLY PRESENT

All 20 `SKILL.md` files contain a `## Prerequisites` section. However:

- None of the prerequisites sections mention the global AI Maestro skills by name (e.g., `agent-messaging` skill must be installed)
- The `amia-integration-protocols/SKILL.md` states `Prerequisites: None required` but the skill instructs agents to use the `agent-messaging` skill — this is a contradiction
- Skills like `amia-quality-gates` and `amia-session-memory` state `Requires AI Maestro installed` in their YAML frontmatter, which is good, but do not specify which AI Maestro skills are needed

### Missing: Reference to global AI Maestro scripts

No skill or agent references `aimaestro-agent.sh`, `amp-send.sh`, `amp-inbox.sh`, or other global AI Maestro scripts by name. These are the canonical abstraction layer scripts, and their absence from any prerequisite or instruction means agents have no guided path to them.

**Verdict: PARTIAL PASS** — Prerequisites sections exist but lack structured dependency declarations for global AI Maestro skills/scripts.

---

## Additional Findings

### Missing Items

1. **No `dependencies` field in `plugin.json`**: The manifest has `name`, `version`, `description`, `author`, `repository`, `license` — but no `dependencies`, `required_skills`, or `required_scripts` field. This limits automated dependency checking by a plugin installer.

2. **No reference to global AI Maestro scripts anywhere**: The entire plugin (agents, skills, hooks, scripts) never mentions `aimaestro-agent.sh`, `amp-send.sh`, `amp-inbox.sh`. The messaging abstraction is partially honored (SKILL.md files reference `agent-messaging` skill) but no script-level abstraction is used.

3. **`ci_webhook_handler.py` is a standalone webhook server**: This script starts an HTTP server on port 9000. Its purpose (receiving GitHub webhooks) is legitimate, but its direct coupling to the AI Maestro API URL and message format makes it fragile. If the endpoint or message format changes, this server breaks independently of any AI Maestro update.

### Outdated References

- `skills/amia-integration-protocols/references/phase-procedures.md` lines 95 and 145 refer to "curl POST to AI Maestro API" — this predates the `agent-messaging` skill abstraction and should be updated to say "use the `agent-messaging` skill".
- `docs/FULL_PROJECT_WORKFLOW.md` and other docs correctly reference the `agent-messaging` skill name, showing the newer pattern is being adopted but not consistently applied.

### Positive Observations

- The `ai-maestro-message-templates.md` reference document (the key messaging guide) correctly delegates everything to the `agent-messaging` skill and provides no raw curl commands — this is the right pattern.
- The three hook scripts are clean: no AI Maestro API calls, only `gh` CLI and git operations.
- All SKILL.md files follow the progressive disclosure pattern and are compact (under 4000 chars).
- The `ci_webhook_handler.py` includes a localhost-only SSRF guard, showing security awareness.
- README is substantive and complete — not a stub.

---

## Violations Summary Table

| # | Rule | File | Line(s) | Severity | Description |
|---|------|------|---------|----------|-------------|
| V1 | Rule 2 | `skills/amia-github-projects-sync/scripts/ci_webhook_handler.py` | 41, 72–77 | CRITICAL | Direct REST call to `http://localhost:23000/api/messages` via `urllib` — bypasses `amp-send.sh` abstraction |
| V2 | Rule 2 | `skills/amia-integration-protocols/references/phase-procedures.md` | 95, 145 | MODERATE | Instructs agents to "Execute curl POST to AI Maestro API" — contradicts the `agent-messaging` skill delegation pattern |
| V3 | Rule 3 | `docs/ROLE_BOUNDARIES.md`, `agents/amia-integrator-main-agent.md` | 189–199, 54–61 | ADVISORY | Hardcoded permission matrices/role constraints — no runtime discovery via `team-governance` skill |
| V4 | Rule 4 | `.claude-plugin/plugin.json` | — | MINOR | No structured `dependencies` field listing required AI Maestro skills/scripts |
| V5 | Rule 4 | `skills/amia-integration-protocols/SKILL.md` | 19 | MINOR | Prerequisites states "None required" but skill instructs use of `agent-messaging` skill |

---

## Missing Items

| Item | Location | Description |
|------|----------|-------------|
| `dependencies` in plugin.json | `.claude-plugin/plugin.json` | No structured field declaring required AI Maestro global skills (`agent-messaging`, `team-governance`) |
| Global script references | All agents and skills | No reference to `amp-send.sh`, `amp-inbox.sh`, `aimaestro-agent.sh` anywhere in the plugin |
| `team-governance` skill reference | All skill SKILL.md files | No skill reads the `team-governance` skill for runtime governance discovery |
| Prerequisites update for `amia-integration-protocols` | `skills/amia-integration-protocols/SKILL.md` | Should declare dependency on `agent-messaging` global skill |

---

## Alignment Instructions

### Fix V1 (CRITICAL): Replace direct API call in `ci_webhook_handler.py`

**Current** (lines 62–79):
```python
def _send_maestro_message(subject: str, message: str, priority: str = "normal") -> None:
    payload = json.dumps({...})
    req = urllib.request.Request(f"{AIMAESTRO_API}/api/messages", ...)
    urllib.request.urlopen(req, timeout=10)
```

**Required change**: Replace with a subprocess call to `amp-send.sh`:
```python
import subprocess
def _send_maestro_message(to: str, subject: str, message: str, priority: str = "normal") -> None:
    subprocess.run(
        ["amp-send.sh", to, subject, message, "--priority", priority],
        check=False, timeout=10
    )
```
If `amp-send.sh` is not on PATH (it is installed by AI Maestro to `~/.local/bin/`), fall back gracefully rather than coupling to the raw API endpoint.

### Fix V2 (MODERATE): Update `phase-procedures.md`

**File**: `skills/amia-integration-protocols/references/phase-procedures.md`

- Line 95: Change `- Execute curl POST to AI Maestro API` to `- Send message using the \`agent-messaging\` skill (see ai-maestro-message-templates.md for templates)`
- Line 145: Change `- Execute curl POST to orchestrator-amoa` to `- Send message using the \`agent-messaging\` skill to orchestrator-amoa`

### Fix V3 (ADVISORY): Add `team-governance` skill reference

In `agents/amia-integrator-main-agent.md`, add to Required Reading:
```
4. **team-governance skill** (global AI Maestro skill) - Read at session start for current governance rules and approval flows
```

And replace the hardcoded constraints table with a reference: "Governance rules and role boundaries are defined in the `team-governance` skill — consult it at session start for the authoritative permission matrix."

### Fix V4 (MINOR): Add `dependencies` to `plugin.json`

```json
{
  "name": "ai-maestro-integrator-agent",
  "version": "1.1.17",
  "description": "...",
  "dependencies": {
    "ai-maestro-skills": ["agent-messaging", "team-governance"],
    "ai-maestro-scripts": ["amp-send.sh", "amp-inbox.sh", "amp-read.sh"]
  },
  ...
}
```

### Fix V5 (MINOR): Update `amia-integration-protocols` prerequisites

In `skills/amia-integration-protocols/SKILL.md`, change:
```
## Prerequisites
None required. This is a reference skill with no external dependencies.
```
To:
```
## Prerequisites
- **`agent-messaging` skill** (global AI Maestro skill) — Required for all inter-agent messaging operations described in the reference documents
```
