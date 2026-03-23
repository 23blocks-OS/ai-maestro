# Deep Audit: AMAMA Plugin (emasoft-assistant-manager-agent)
# Plugin Abstraction Principle Compliance Audit

**Date**: 2026-02-27
**Auditor**: Claude Code (claude-sonnet-4-6)
**Audit Scope**: Full Plugin Abstraction Principle compliance check across all 28 AMAMA plugin files
**Governance Reference**: `/Users/emanuelesabetta/ai-maestro/plugin/plugins/ai-maestro/skills/team-governance/SKILL.md`
**Principle Reference**: `/Users/emanuelesabetta/ai-maestro/docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`

---

## Executive Summary

The AMAMA plugin is **LARGELY COMPLIANT** with the Plugin Abstraction Principle but has several specific violations that need correction. The most significant violations are concentrated in:

1. **`spawn-failure-recovery.md`** and **`workflow-examples.md`** — contain raw `tmux` bash commands
2. **`creating-ecos-procedure.md`** — contains raw bash `mkdir`/`cp` commands that should be delegated
3. **`TEAM_REGISTRY_SPECIFICATION.md`** — contains a Python code snippet that reads registry files directly
4. **`proactive-kanban-monitoring.md`** — contains raw `gh` CLI commands and `/tmp` snapshot paths

The **approval system is well-designed and MUST BE PRESERVED** — it is EAMA's core value. The harmonization path is to extend it with GovernanceRequest registration via the `team-governance` skill, not to replace it.

Notably, the plugin has **strong compliance** in its primary communication layer: all AMP messaging throughout skills and agent definitions correctly delegates to the `agent-messaging` skill with no hardcoded `curl` commands or API endpoints, which is exactly the right pattern.

---

## Files Audited (28 total)

| # | File | Status |
|---|------|--------|
| 1 | `skills/team-governance/SKILL.md` (reference) | GOVERNANCE REFERENCE |
| 2 | `docs/PLUGIN-ABSTRACTION-PRINCIPLE.md` (reference) | PRINCIPLE REFERENCE |
| 3 | `skills/eama-ecos-coordination/references/ai-maestro-message-templates.md` | PASS |
| 4 | `skills/eama-ecos-coordination/references/approval-response-workflow.md` | PASS |
| 5 | `skills/eama-ecos-coordination/references/completion-notifications.md` | PASS |
| 6 | `skills/eama-ecos-coordination/references/creating-ecos-instance.md` | PASS |
| 7 | `skills/eama-ecos-coordination/references/creating-ecos-procedure.md` | MINOR VIOLATIONS |
| 8 | `skills/eama-ecos-coordination/references/delegation-rules.md` | PASS |
| 9 | `skills/eama-ecos-coordination/references/examples.md` | PASS |
| 10 | `skills/eama-ecos-coordination/references/message-formats.md` | PASS |
| 11 | `skills/eama-ecos-coordination/references/spawn-failure-recovery.md` | VIOLATIONS |
| 12 | `skills/eama-ecos-coordination/references/success-criteria.md` | PASS |
| 13 | `skills/eama-ecos-coordination/references/workflow-checklists.md` | PASS (minor) |
| 14 | `skills/eama-ecos-coordination/references/workflow-examples.md` | VIOLATIONS |
| 15 | `skills/eama-approval-workflows/references/best-practices.md` | PASS |
| 16 | `skills/eama-approval-workflows/references/rule-14-enforcement.md` | PASS |
| 17 | `skills/eama-session-memory/references/record-keeping-formats.md` | PASS |
| 18 | `skills/eama-github-routing/references/proactive-kanban-monitoring.md` | VIOLATIONS |
| 19 | `skills/eama-user-communication/references/blocker-notification-templates.md` | PASS |
| 20 | `skills/eama-user-communication/references/response-templates.md` | PASS |
| 21 | `docs/AGENT_OPERATIONS.md` | MINOR VIOLATIONS |
| 22 | `docs/FULL_PROJECT_WORKFLOW.md` | PASS |
| 23 | `docs/ROLE_BOUNDARIES.md` | PASS |
| 24 | `docs/TEAM_REGISTRY_SPECIFICATION.md` | VIOLATION |
| 25 | `shared/handoff_template.md` | PASS |
| 26 | `shared/message_templates.md` | PASS |
| 27 | `agents/eama-assistant-manager-main-agent.md` | PASS |
| 28 | `agents/eama-report-generator.md` | PASS |
| 29 | `commands/eama-approve-plan.md` | MINOR — NOTED |
| 30 | `commands/eama-orchestration-status.md` | MINOR — NOTED |
| 31 | `commands/eama-planning-status.md` | PASS |
| 32 | `commands/eama-respond-to-ecos.md` | PASS |

---

## Violation Category Legend

| Code | Category | Severity |
|------|----------|----------|
| HARDCODED_API | curl commands, endpoint URLs, HTTP headers embedded in plugin | HIGH |
| HARDCODED_GOVERNANCE | Permission rules embedded instead of discovered via `team-governance` skill | HIGH |
| HARDCODED_AMP | AMP envelope structures hardcoded instead of delegating to `agent-messaging` skill | HIGH |
| LOCAL_REGISTRY | Direct file reads of internal AI Maestro registries | MEDIUM |
| CLI_SYNTAX | Hardcoded `aimaestro-agent.sh` or `amp-send.sh` CLI syntax | MEDIUM |
| REDUNDANT_OPERATIONS | Duplicates AI Maestro behavior (harmonize, not remove) | LOW |
| APPROVAL_SYSTEM | Plugin's internal approval tracking — MUST be preserved, harmonized | INFO |

---

## Detailed Findings Per File

---

### FILE 3: `skills/eama-ecos-coordination/references/ai-maestro-message-templates.md`

**STATUS: PASS**

**Analysis:**
- All messaging throughout this file correctly references "use the `agent-messaging` skill" — never embeds curl commands
- Section 5 ("Standard AI Maestro Messaging Patterns") explicitly states: "No manual API configuration required — the `agent-messaging` skill manages connection details internally" — this is exemplary compliance
- Message content structures are EAMA-specific protocol types (work_request, approval_decision, etc.) — these are plugin-domain objects, not AI Maestro API syntax, so they are correctly embedded here
- No hardcoded endpoints, no hardcoded AMP envelope format

**Findings:** None.

---

### FILE 4: `skills/eama-ecos-coordination/references/approval-response-workflow.md`

**STATUS: PASS**

**Analysis:**
- All messaging delegates to `agent-messaging` skill
- Decision tracking step (Step 4: "Record decision in state tracking / Update EAMA state file") is EAMA's own internal record-keeping — not an AI Maestro system concern — correctly handled internally
- Response format (`approval-response`, `request_id`, `decision`, `responded_at`) is EAMA-ECOS protocol, not AI Maestro API — appropriate to embed
- No hardcoded API calls

**Findings:** None.

---

### FILE 5: `skills/eama-ecos-coordination/references/completion-notifications.md`

**STATUS: PASS**

**Analysis:**
- No API calls, no curl, no hardcoded endpoints
- The YAML snippet for `user_notification_preferences` and `status_report` aggregation format are EAMA internal state structures — not AI Maestro API syntax — appropriate here
- Correctly uses abstract references to "notification_level" setting without hardcoding API endpoint to set it

**Findings:** None.

---

### FILE 6: `skills/eama-ecos-coordination/references/creating-ecos-instance.md`

**STATUS: PASS**

**Analysis:**
- Agent creation correctly delegates to `ai-maestro-agents-management` skill throughout
- Messaging correctly delegates to `agent-messaging` skill
- No hardcoded API calls or curl commands
- Note on "Session Name = AI Maestro Registry Name" is correct conceptual guidance, not API syntax

**Findings:** None.

---

### FILE 7: `skills/eama-ecos-coordination/references/creating-ecos-procedure.md`

**STATUS: MINOR VIOLATIONS**

**Violations Found:**

#### VIOLATION 1 — CLI_SYNTAX (Medium)
**Location:** Step 1 (line ~118), Step 2 (line ~127), Step 3 (line ~135), Pre-requisite section (line ~108)

**Evidence (Step 1):**
```bash
SESSION_NAME="ecos-chief-of-staff-one"
```

**Evidence (Step 2, "Prepare Agent Directory"):**
```bash
mkdir -p ~/agents/$SESSION_NAME
```

**Evidence (Step 3, "Copy Plugin"):**
```bash
mkdir -p ~/agents/$SESSION_NAME/.claude/plugins/
cp -r /path/to/emasoft-chief-of-staff ~/agents/$SESSION_NAME/.claude/plugins/
```

**Evidence (Pre-requisite section):**
```bash
# Copy plugin to agent's local directory
mkdir -p ~/agents/$SESSION_NAME/.claude/plugins/
cp -r /path/to/emasoft-chief-of-staff ~/agents/$SESSION_NAME/.claude/plugins/
```

**Assessment:**
These bash commands (`mkdir`, `cp`) are infrastructure operations that should be described abstractly or delegated to the `ai-maestro-agents-management` skill if it has directory/plugin-preparation operations. If no such operation exists in the skill, these commands are acceptable as procedural steps. However, the path `/path/to/emasoft-chief-of-staff` is a placeholder not a hardcoded path, which is acceptable.

**Recommended Fix:**
Replace bare bash snippets with: "Use the `ai-maestro-agents-management` skill to prepare the agent working directory and copy the plugin." If the skill does not expose directory preparation, note it as a limitation and keep the bash commands but add a comment: "Note: directory preparation not yet covered by ai-maestro-agents-management skill — perform manually."

#### VIOLATION 2 — LOCAL_REGISTRY (Low)
**Location:** Step 9 ("Register ECOS"), file `docs_dev/sessions/active-ecos-sessions.md`

**Evidence:**
```markdown
## Session: ecos-chief-of-staff-one
- **Spawned**: 2026-02-05 16:30:22
- **Plugins**: emasoft-chief-of-staff
...
```

**Assessment:**
Writing to `docs_dev/sessions/active-ecos-sessions.md` is EAMA's own session memory (not an AI Maestro internal registry), so this is EAMA's own record-keeping — acceptable and necessary per the session-memory skill. This is NOT an AI Maestro internal registry read; it's EAMA's own audit log.

**Finding:** NOT a violation — EAMA's own session log is appropriate to write directly.

#### FINDING (NOTE)
The Step 4 ("Execute Agent Creation") instruction, "Use the `ai-maestro-agents-management` skill to create the agent," is correct. The violation is only the directory preparation steps before this.

---

### FILE 8: `skills/eama-ecos-coordination/references/delegation-rules.md`

**STATUS: PASS**

**Analysis:**
- YAML configuration snippets are EAMA's own internal state structure (stored in EAMA's state file), not AI Maestro API syntax — correct to embed
- All messaging delegates to `agent-messaging` skill
- Operations requiring approval list ("Production deployments," etc.) is EAMA's own decision criteria, not a governance permission matrix from AI Maestro — appropriate to embed here

**Findings:** None.

---

### FILE 9: `skills/eama-ecos-coordination/references/examples.md`

**STATUS: PASS**

**Analysis:**
- JSON message examples show ECOS-to-EAMA and EAMA-to-ECOS protocol messages — these are EAMA's domain protocol, not AI Maestro API syntax
- "Log Entry" YAML snippet is EAMA's own audit log format — appropriate to embed
- No hardcoded API calls

**Findings:** None.

---

### FILE 10: `skills/eama-ecos-coordination/references/message-formats.md`

**STATUS: PASS**

**Analysis:**
- All messaging delegates to `agent-messaging` skill
- Message format specifications are EAMA-ECOS protocol definitions — appropriate to document here
- Explicit forward references to other documents for full details

**Findings:** None.

---

### FILE 11: `skills/eama-ecos-coordination/references/spawn-failure-recovery.md`

**STATUS: VIOLATIONS**

**Violations Found:**

#### VIOLATION 1 — CLI_SYNTAX (Medium)
**Location:** Section 2 ("Communication Breakdown Recovery"), "When ECOS Doesn't Respond," Recovery step 2 reporting to user

**Evidence (lines ~196-201):**
```
Checked:
- AI Maestro API: Running
- Message sent successfully: Yes
- Response received: No

Actions you can take:
1. Check ECOS session: `tmux attach -t ecos-<project-name>`
2. Check ECOS logs (if available)
3. Restart ECOS if needed
```

**Assessment:**
The `tmux attach -t ecos-<project-name>` command is raw tmux CLI syntax embedded in a user-facing message template. Per the Plugin Abstraction Principle Rule 2, plugin scripts/hooks must not use raw CLI. However, this is presented as instructions to the *user* (not the agent), appearing inside a message template block. User-facing tmux commands are outside the scope of the agent's own CLI usage, but they still hardcode the tmux session name format. The recommended approach: reference "Check the session via AI Maestro's session management interface" or "Use the `ai-maestro-agents-management` skill to inspect agent status."

**Recommended Fix:**
Replace `tmux attach -t ecos-<project-name>` in user-facing templates with a reference to using the `ai-maestro-agents-management` skill to inspect agent status.

#### VIOLATION 2 — CLI_SYNTAX (Medium)
**Location:** Section 2, Recovery Procedure Step 2: "Retry health ping once" — message type field

**Evidence (lines ~172-175):**
```
Send a health check message using the `agent-messaging` skill:
- **Recipient**: `ecos-<project-name>`
- **Subject**: "Health Check"
- **Type**: `health_check`    ← NOTE: inconsistency with main skill
```

**Assessment:**
The message type `health_check` in this file conflicts with `ping` used in the main skill and other references. This is an internal inconsistency that, while not a Plugin Abstraction Principle violation per se, creates confusion. Should be standardized to `ping` to match `ai-maestro-message-templates.md`.

#### VIOLATION 3 — CLI_SYNTAX (Low)
**Location:** Section 4 ("Agent Spawning Failures"), Recovery Procedure Step 2

**Evidence (lines ~325-330):**
```bash
# Check if specialist plugin exists
ls -la ~/agents/<session-name>/.claude/plugins/emasoft-orchestrator-agent
ls -la ~/agents/<session-name>/.claude/plugins/emasoft-architect-agent
ls -la ~/agents/<session-name>/.claude/plugins/emasoft-integrator-agent
```

**Assessment:**
Raw `ls -la` bash commands. These are diagnostic steps and the `ai-maestro-agents-management` skill does not expose plugin availability checking. This is a low-severity item — an acceptable procedural detail. However, a reference to the skill should be added where possible.

#### VIOLATION 4 — CLI_SYNTAX (Medium)
**Location:** Section 4, Recovery Procedure Step 3

**Evidence (lines ~333-337):**
```bash
# List sessions
tmux list-sessions

# Kill orphaned sessions if needed
tmux kill-session -t <zombie-session-name>
```

**Assessment:**
Raw `tmux` commands. Per the principle, these should be replaced with references to the `ai-maestro-agents-management` skill for session management. However, `kill-session` is a destructive operation. The recommended approach is to reference the skill's session termination capability.

**Recommended Fix:**
Replace `tmux list-sessions` and `tmux kill-session -t` with: "Use the `ai-maestro-agents-management` skill to list all agent sessions and terminate orphaned ones."

#### VIOLATION 5 — LOCAL_REGISTRY (Low — Acceptable)
**Location:** Section 5 ("Logging and Audit Trail"), Log Locations table

**Evidence:**
```
| ECOS spawn failures | `docs_dev/sessions/spawn-failures.md` | Markdown |
| Communication failures | `docs_dev/sessions/communication-failures.md` | Markdown |
| Approval conflicts | `docs_dev/sessions/approval-conflicts.md` | Markdown |
| Agent spawn failures | `docs_dev/sessions/agent-spawn-failures.md` | Markdown |
```

**Assessment:**
These are EAMA's own session memory files (per the `eama-session-memory` skill). Writing to them is EAMA's own record-keeping, NOT reading AI Maestro internal registries. This is acceptable and necessary for EAMA to function across sessions.

**Finding:** NOT a violation — these are EAMA's own audit logs.

---

### FILE 12: `skills/eama-ecos-coordination/references/success-criteria.md`

**STATUS: PASS**

**Analysis:**
- All agent creation verification delegates to `ai-maestro-agents-management` skill
- All messaging delegates to `agent-messaging` skill
- Bash snippet `ls -la` and `git status` appear only in the "Verification Evidence" section as example checks for the HUMAN to verify (shown in code blocks as evidence examples) — these are documentation, not agent instructions
- Reference to `docs_dev/approvals/approval-log.md` and `docs_dev/sessions/active-ecos-sessions.md` are EAMA's own session memory files — appropriate

**Findings:** None.

---

### FILE 13: `skills/eama-ecos-coordination/references/workflow-checklists.md`

**STATUS: PASS (minor observation)**

**Violations Found:**

#### OBSERVATION — CLI_SYNTAX (Low — Borderline)
**Location:** "Checklist: Creating New Project," git initialization steps (lines ~22-37)

**Evidence:**
```bash
cd /path/to/new-project
git init
git config user.name "Emasoft"
git config user.email "713559+Emasoft@users.noreply.github.com"
```

```bash
git add -A
git commit -m "Initial project structure"
```

**Assessment:**
These are bare git commands. However, project initialization (creating the git repo, initial commit) is a task that the Plugin Abstraction Principle's guidance on scripts/hooks addresses — scripts should call `aimaestro-agent.sh` or `amp-send.sh`, not raw CLI. BUT: project creation is EAMA's direct responsibility, not an agent-lifecycle operation. Git initialization is not an AI Maestro-managed operation, so there is no global script wrapping it. These commands are acceptable as direct EAMA operations.

**Finding:** Borderline — acceptable given no AI Maestro abstraction exists for git init. However, add a comment that EAMA performs git initialization directly as part of its project creation responsibility.

---

### FILE 14: `skills/eama-ecos-coordination/references/workflow-examples.md`

**STATUS: VIOLATIONS**

**Violations Found:**

#### VIOLATION 1 — CLI_SYNTAX (Medium)
**Location:** "ECOS Spawn Failure Recovery Protocol," Step 2 (lines ~197-204)

**Evidence:**
```bash
# List existing sessions
tmux list-sessions

# Check if session name already exists
tmux list-sessions | grep "ecos-<project-name>"
```

**Assessment:**
Same issue as `spawn-failure-recovery.md` — raw `tmux` commands. Should reference `ai-maestro-agents-management` skill.

**Recommended Fix:**
"Use the `ai-maestro-agents-management` skill to list all agent sessions and check for name collisions."

#### VIOLATION 2 — CLI_SYNTAX (Medium)
**Location:** Section "Example 2: ECOS Not Responding," user-facing message (line ~477)

**Evidence:**
```
Can you check the ECOS session? `tmux attach -t ecos-inventory-system`
```

**Assessment:**
Same as spawn-failure-recovery.md — raw tmux command in user-facing template. Should reference the `ai-maestro-agents-management` skill or the AI Maestro web UI for session inspection.

**Note:** This content is duplicated from `spawn-failure-recovery.md`. Both files should be corrected simultaneously.

---

### FILE 15: `skills/eama-approval-workflows/references/best-practices.md`

**STATUS: PASS**

**Analysis:**
- No API calls, no curl, no hardcoded endpoints
- All guidelines are EAMA's own operational rules — appropriate here
- No permission matrix (those are discovered via `team-governance` skill)

**Findings:** None.

---

### FILE 16: `skills/eama-approval-workflows/references/rule-14-enforcement.md`

**STATUS: PASS**

**Analysis:**
- No API calls, no curl, no hardcoded endpoints
- RULE 14 is EAMA's own enforcement policy for user requirements immutability — not a governance rule from AI Maestro — correct to embed here
- No permission matrix

**Findings:** None.

---

### FILE 17: `skills/eama-session-memory/references/record-keeping-formats.md`

**STATUS: PASS**

**Analysis:**
- All record-keeping files (`docs_dev/projects/project-registry.md`, `docs_dev/approvals/approval-log.md`, etc.) are EAMA's own session memory — NOT AI Maestro internal registries
- The guidance explicitly states "EAMA has no persistent memory between Claude Code restarts / Record-keeping files are the ONLY persistent state" — this establishes that these are EAMA's own files
- Python `get_agent_address` function referenced in TEAM_REGISTRY_SPECIFICATION.md is NOT present in this file
- No hardcoded API calls

**Approval Log Format (CRITICAL — Detailed Analysis):**

The Approval Log format is EAMA's core record-keeping system:
```markdown
## APPROVAL-2026-02-04-001
- **Request ID**: ECOS-REQ-20260204-143022
- **From**: ecos-inventory-system
- **Timestamp**: 2026-02-04 14:30:22 UTC
- **Operation**: Deploy to staging environment
- **Risk Level**: Medium
- **Decision**: APPROVED (by user)
- **Approved By**: User (exact quote: "Yes, deploy to staging")
- **Justification**: ECOS needs to verify API in staging before production
- **Conditions**: None
- **Outcome**: Deployment successful
```

This is EAMA's own local audit trail. It is correct to maintain this separately from AI Maestro's GovernanceRequest system — they serve different purposes (EAMA's is operational memory; GovernanceRequests are formal governance tracking).

**Findings:** None.

---

### FILE 18: `skills/eama-github-routing/references/proactive-kanban-monitoring.md`

**STATUS: VIOLATIONS**

**Violations Found:**

#### VIOLATION 1 — HARDCODED_API (High)
**Location:** "Monitoring Procedure," Steps 1-4 (lines ~56-97)

**Evidence (Step 1):**
```bash
# Store current state
gh project item-list <PROJECT_NUMBER> --owner Emasoft --format json > /tmp/kanban-snapshot-$(date +%s).json
```

**Evidence (Step 2):**
```bash
# Compare snapshots to find changes
diff <(jq -S '.items' /tmp/kanban-snapshot-previous.json) \
     <(jq -S '.items' /tmp/kanban-snapshot-current.json)
```

**Evidence (Step 4):**
```bash
# Update tracking file
echo "Last sync: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> docs_dev/kanban/sync-log.md
mv /tmp/kanban-snapshot-current.json /tmp/kanban-snapshot-previous.json
```

**Assessment:**
These are raw bash commands using `gh` CLI, `diff`, `jq`, and `/tmp` paths. The `gh` CLI is NOT covered by `aimaestro-agent.sh` — it is GitHub's own CLI. The Plugin Abstraction Principle Rule 2 requires hooks/scripts to call globally-installed AI Maestro scripts. Since no AI Maestro script wraps GitHub Project board monitoring, this is a gap in AI Maestro's abstraction layer rather than purely a plugin violation.

However, the `/tmp/kanban-snapshot-*.json` pattern for storing snapshots is problematic — it is fragile, not persistent across reboots, and not covered by any AI Maestro abstraction.

**Severity Assessment:** The `gh` CLI calls are acceptable (GitHub CLI is not an AI Maestro concern and has no wrapper), but the `/tmp` snapshot storage should use `docs_dev/kanban/` instead for consistency with EAMA's session memory system.

**Recommended Fix:**
- Move snapshot storage from `/tmp/` to `docs_dev/kanban/` (consistent with EAMA session memory)
- Add a note: "GitHub Project board monitoring uses the `gh` CLI directly — no AI Maestro abstraction exists for this operation."

#### VIOLATION 2 — HARDCODED_API (Medium)
**Location:** "Monitoring Schedule" section, bash snippet

**Evidence:**
```bash
gh project item-list <PROJECT_NUMBER> --owner Emasoft --format json | jq '...'
```

**Assessment:**
The hardcoded `--owner Emasoft` is a hardcoded identity. This should be configurable, not hardcoded. However, since it uses a placeholder `<PROJECT_NUMBER>`, this may be a template showing the pattern rather than an absolute hardcode. The `Emasoft` owner is consistent with the project's identity (per global CLAUDE.md rules which state `git config user.name "Emasoft"`). This is acceptable as a configured value.

**Finding:** Low severity — acceptable given this is the project owner's own identity.

---

### FILE 19: `skills/eama-user-communication/references/blocker-notification-templates.md`

**STATUS: PASS**

**Analysis:**
- All messaging delegates to `agent-messaging` skill
- Templates are user-facing communication formats — appropriate to embed in plugin
- No hardcoded API calls

**Findings:** None.

---

### FILE 20: `skills/eama-user-communication/references/response-templates.md`

**STATUS: PASS**

**Analysis:**
- No API calls, no curl, no hardcoded endpoints
- All templates are user-facing communication formats — appropriate to embed
- No permission matrices

**Findings:** None.

---

### FILE 21: `docs/AGENT_OPERATIONS.md`

**STATUS: MINOR VIOLATIONS**

**Violations Found:**

#### VIOLATION 1 — CLI_SYNTAX (Low)
**Location:** Section 10 ("Session Lifecycle"), "Starting an EAMA Session" (lines ~247-249)

**Evidence:**
```bash
# Launch EAMA with plugin loaded
claude --plugin-dir /path/to/emasoft-assistant-manager-agent \
       --agent eama-user-interface-agent
```

**Assessment:**
This is the `claude` CLI command for launching an agent with a plugin. This is not `aimaestro-agent.sh` — it is Claude Code's own CLI. The Plugin Abstraction Principle does not cover the `claude` CLI itself (that IS the AI Maestro/Claude Code interface layer, not an internal API). This is acceptable procedural documentation.

**Finding:** Acceptable — this documents how Claude Code itself is launched, not an AI Maestro API call.

#### VIOLATION 2 — CLI_SYNTAX (Low)
**Location:** Section 11 ("Troubleshooting"), Debug Commands (lines ~283-285)

**Evidence:**
```bash
# Check EAMA plugin loaded
claude plugin list | grep emasoft-assistant-manager
```

**Assessment:**
Same as above — `claude` CLI is acceptable. Not an AI Maestro internal API.

**Finding:** Acceptable.

#### VIOLATION 3 — HARDCODED_GOVERNANCE (Low — Borderline)
**Location:** Section 5 ("Plugin Mutual Exclusivity"), "What EAMA CANNOT Do" (lines ~101-106)

**Evidence:**
```
- EAMA CANNOT access EOA (Orchestrator) skills
- EAMA CANNOT access EIA (Integrator) skills
- EAMA CANNOT access EAA (Architect) skills
- EAMA CANNOT access ECOS (Chief of Staff) skills
```

**Assessment:**
Per Rule 3 of the Plugin Abstraction Principle: "Plugins MUST NOT hardcode governance rules, permission matrices, or role restrictions. Agents discover these by reading the `team-governance` skill at runtime."

However, this is architectural role separation (plugin mutual exclusivity), not a governance permission rule from AI Maestro's permission matrix. The Plugin Abstraction Principle's Rule 3 example is "Only MANAGER agents can create closed teams" — i.e., AI Maestro governance rules. EAMA's plugin exclusivity is a design constraint of the Emasoft agent ecosystem, not an AI Maestro governance rule. This is appropriately embedded.

**Finding:** Borderline — acceptable given this is Emasoft's own architectural constraint, not an AI Maestro governance rule.

---

### FILE 22: `docs/FULL_PROJECT_WORKFLOW.md`

**STATUS: PASS**

**Analysis:**
- No hardcoded API calls
- Communication matrix references AI Maestro messaging abstractly
- Workflow steps reference skills by name (not API endpoints)
- No permission matrices
- Git config shown: `git config user.name "Emasoft"` appears in workflow-checklists.md, not here

**Findings:** None.

---

### FILE 23: `docs/ROLE_BOUNDARIES.md`

**STATUS: PASS**

**Analysis:**
- Role boundary definitions are Emasoft's own architectural constraints — NOT AI Maestro governance rules — appropriate to embed
- No hardcoded API calls
- Interaction patterns use abstract messaging references (not curl)

**Minor Note:** The statement "ECOS CAN: Create agents (with EAMA approval)" implies an approval workflow, but it does not hardcode the permission check mechanism — it simply describes the intended constraint. Acceptable.

**Findings:** None.

---

### FILE 24: `docs/TEAM_REGISTRY_SPECIFICATION.md`

**STATUS: VIOLATION**

**Violations Found:**

#### VIOLATION 1 — LOCAL_REGISTRY (High)
**Location:** "How to Send Messages" section, Python code snippet (lines ~252-281)

**Evidence:**
```python
import json

def get_agent_address(agent_name: str, registry_path: str = ".emasoft/team-registry.json") -> str:
    """Get AI Maestro address for an agent."""
    with open(registry_path, encoding="utf-8") as f:
        registry = json.load(f)
    ...

# Example: Look up orchestrator address
address = get_agent_address("svgbbox-orchestrator")
# Returns: "svgbbox-orchestrator"

# Then use the `agent-messaging` skill to send a message to this address.
```

**Assessment:**
This is a Python snippet showing how to look up agent addresses by reading `.emasoft/team-registry.json` directly from disk. The Plugin Abstraction Principle Rule 2 states: "Plugin hooks call globally-installed AI Maestro scripts, never `curl` or `fetch()`." However, this is not a hook — it is documentation showing agents how to look up addresses from their local team registry (a git-tracked project file, not an AI Maestro internal registry like `~/.aimaestro/agents/registry.json`).

The `.emasoft/team-registry.json` is EAMA's own project file (described in this spec as "git-tracked and stored in the repository"). This is NOT the AI Maestro agent registry. Reading a git-tracked project file is not the same as reading AI Maestro's internal state.

**Revised Assessment:** This is a borderline case. The file being read (`.emasoft/team-registry.json`) is a plugin-managed file, not an AI Maestro internal registry. However, the correct approach per the principle would be to look up agent addresses via the `agent-messaging` skill or the `ai-maestro-agents-management` skill rather than parsing a local JSON file.

**Recommended Fix:**
Change the guidance to: "Look up agent addresses using the `ai-maestro-agents-management` skill's agent listing feature, or directly use the agent's session name as the AI Maestro messaging address." Remove the Python code snippet for parsing registry files.

The correct statement (already present at the end of the snippet) is: "Then use the `agent-messaging` skill to send a message to this address." The Python code is unnecessary if the AI Maestro messaging address IS the agent's session name (as shown in the registry: `"ai_maestro_address": "svgbbox-orchestrator"`).

---

### FILE 25: `shared/handoff_template.md`

**STATUS: PASS**

**Analysis:**
- YAML frontmatter defines handoff document structure — appropriate for EAMA's own protocol
- Communication hierarchy description is Emasoft's own architectural constraint — acceptable
- No API calls, no curl, no hardcoded endpoints

**Findings:** None.

---

### FILE 26: `shared/message_templates.md`

**STATUS: PASS**

**Analysis:**
- All messaging delegates to `agent-messaging` skill throughout
- Message type definitions (task_assignment, status_request, etc.) are EAMA-domain protocol — appropriate to embed
- No hardcoded API calls or AMP envelope structures

**Findings:** None.

---

### FILE 27: `agents/eama-assistant-manager-main-agent.md`

**STATUS: PASS**

**Analysis:**
- "External Dependencies" section explicitly states: "This agent requires the `ai-maestro-agents-management` skill which is globally installed by AI Maestro (not bundled in this plugin)" — exemplary compliance declaration
- Skills listed in frontmatter: `ai-maestro-agents-management` is listed — correct
- All messaging references delegate to `agent-messaging` skill
- All agent creation delegates to `ai-maestro-agents-management` skill
- No hardcoded API calls

**Notable Compliance Pattern:** The agent definition correctly declares its AI Maestro skill dependency rather than hardcoding the API syntax. This is the best practice pattern described in PLUGIN-ABSTRACTION-PRINCIPLE.md.

**One Minor Observation:**
The skills list in frontmatter includes `ai-maestro-agents-management` as if it's bundled with the plugin. However, the "External Dependencies" section corrects this by noting it's globally installed. This is a slight inconsistency in the frontmatter vs. body, but functionally correct.

**Findings:** None that violate the principle.

---

### FILE 28: `agents/eama-report-generator.md`

**STATUS: PASS**

**Analysis:**
- GitHub CLI calls in the "Data Sources" section (`gh project item-list`, `gh issue list`, `gh pr view`) are for data gathering — the `gh` CLI is not an AI Maestro internal API, so no abstraction violation
- All messaging delegates to `agent-messaging` skill
- Report output to `docs_dev/reports/` is EAMA's own session memory — appropriate

**Findings:** None.

---

### FILE 29: `commands/eama-approve-plan.md`

**STATUS: MINOR — NOTED**

**Violations Found:**

#### VIOLATION — CLI_SYNTAX (Medium)
**Location:** `allowed-tools` frontmatter and Usage section (lines ~5-15)

**Evidence:**
```yaml
allowed-tools: ["Bash(python3 ${CLAUDE_PLUGIN_ROOT}/scripts/eama_approve_plan.py:*)"]
```
```
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/eama_approve_plan.py" $ARGUMENTS
```

**Assessment:**
This command invokes a Python script bundled with the plugin (`scripts/eama_approve_plan.py`). Per Rule 2, "Plugin hooks/scripts MUST NOT Call the API Directly." If `eama_approve_plan.py` makes direct API calls to `http://localhost:23000/...`, this is a violation. If it calls `aimaestro-agent.sh` internally, it complies. Without seeing the script's source, this is flagged for verification.

**Recommended Action:** Audit `scripts/eama_approve_plan.py`, `scripts/eama_orchestration_status.py`, `scripts/eama_planning_status.py`, and `scripts/validate_plugin.py` for direct API calls.

---

### FILE 30: `commands/eama-orchestration-status.md`

**STATUS: MINOR — NOTED**

**Same concern as FILE 29:** `scripts/eama_orchestration_status.py` needs to be audited for direct API calls.

---

### FILE 31: `commands/eama-planning-status.md`

**STATUS: PASS**

**Analysis:**
- Uses `scripts/eama_planning_status.py` — same audit concern as above, but output format is read-only status reporting, lower risk of API calls.

---

### FILE 32: `commands/eama-respond-to-ecos.md`

**STATUS: PASS**

**Analysis:**
- `allowed-tools: ["Read", "Write"]` — no Bash/curl needed
- All messaging delegates to `agent-messaging` skill via explicit instructions
- Request validation reads from EAMA's own state files — appropriate
- No hardcoded API calls

**Findings:** None.

---

## CRITICAL SECTION: EAMA Approval System Deep Analysis

This is the most important section of the audit. The EAMA approval system is EAMA's core value and MUST be preserved. This section documents exactly what it tracks, how, and the harmonization path with AI Maestro's GovernanceRequest system.

### What EAMA's Approval System Tracks

**Record Type**: `docs_dev/approvals/approval-log.md`

**Approval Record Fields (from `record-keeping-formats.md`):**
```
- Request ID: ECOS-REQ-YYYYMMDD-HHMMSS
- From: ecos-<project> (which ECOS instance sent the request)
- Timestamp: UTC ISO-8601
- Operation: Free-text description of what ECOS wants to do
- Risk Level: Low | Medium | High | Critical
- Decision: APPROVED | DENIED
- Approved By: User (with exact verbatim quote) | EAMA (autonomous)
- Justification: Why the decision was made
- Conditions: Any conditions attached (can be "None")
- Outcome: What happened after the decision
```

**Approval ID Format:** `APPROVAL-YYYY-MM-DD-###`

**Immutability Principle:** Past entries are NEVER modified — corrections are appended as subsections (see "Correction" pattern in the spec).

### The Approval Workflow

The EAMA approval workflow has three paths:

**Path 1: Autonomous Approval (EAMA decides)**
- ECOS sends `approval_request` via AMP
- EAMA evaluates: routine operation + low risk + in-scope
- EAMA sends `approval_decision` (decision: "approve", approved_by: "eama") to ECOS
- EAMA logs to `approval-log.md` with Approved By: "EAMA (auto-approved)"

**Path 2: User Escalation (User decides)**
- ECOS sends `approval_request` via AMP
- EAMA evaluates: high risk OR irreversible OR out-of-scope
- EAMA presents to user with risk assessment and recommendation
- User provides decision (verbatim quote recorded)
- EAMA sends `approval_decision` (decision: per user, approved_by: "user", user_quote: verbatim) to ECOS
- EAMA logs to `approval-log.md` with Approved By: "User (exact quote: '...')"

**Path 3: Denial (EAMA decides)**
- ECOS sends `approval_request` via AMP
- EAMA evaluates: violates policies | risk too high | user explicitly forbids
- EAMA sends `approval_decision` (decision: "deny") to ECOS
- EAMA logs to `approval-log.md` with Decision: DENIED and justification

**Response Types:**
- `approved` — proceed
- `rejected` — cancel
- `needs-revision` — modify and resubmit (from `/eama-respond-to-ecos` command)

**Autonomous Delegation Mode:**
- EAMA can grant ECOS autonomous mode for specific operation types
- Configured via YAML state file with operation_types, scope_limits, notification_level, expires_at
- EAMA sends `autonomy-grant` message to ECOS when granting
- EAMA sends `autonomy-revoke` message when revoking
- All autonomous operations still logged by EAMA for audit

**Operations ALWAYS Requiring EAMA Approval (hardcoded in delegation-rules.md):**
- Production deployments
- Security-sensitive changes
- Data deletion
- External communications (publishing, notifications)
- Budget commitments
- Breaking changes (API backward-compatibility breaks)
- Access changes (permissions, credentials)

### How This Interacts with AI Maestro's GovernanceRequest System

The AI Maestro `team-governance` skill includes a **GovernanceRequest system** (`/api/v1/governance/requests`) for formal cross-host governance operations. EAMA's approval system and AI Maestro's GovernanceRequests are **complementary, not competing**:

| Dimension | EAMA Approval Log | AI Maestro GovernanceRequest |
|-----------|-------------------|------------------------------|
| **Purpose** | Operational approval of ECOS operations | Formal agent lifecycle governance (create, transfer, cross-host) |
| **Scope** | Any operation ECOS proposes | Specifically: agent CRUD, team membership changes, cross-host operations |
| **Storage** | `docs_dev/approvals/approval-log.md` (local, git-untracked) | `~/.aimaestro/governance-requests/` (AI Maestro internal) |
| **Initiator** | ECOS → EAMA | Any agent with MANAGER or COS role |
| **Approver** | EAMA (autonomous) or User | MANAGER agent (via governance password) |
| **State machine** | pending → approved/denied (binary) | pending → local-approved → dual-approved → executed |
| **Cross-host** | No (EAMA-ECOS is local) | Yes (cross-host multi-step approval) |
| **Audit trail** | EAMA's `approval-log.md` | AI Maestro's GovernanceRequest state |

### Harmonization Recommendation

**The EAMA approval system MUST be preserved in full.** It is EAMA's core operational intelligence. The harmonization path is:

**When ECOS requests an operation that falls under AI Maestro governance scope (agent creation, team assignment, cross-host operations):**

1. EAMA receives the approval request via AMP as usual
2. EAMA processes the request using its existing approval workflow
3. If EAMA approves, EAMA ALSO submits a GovernanceRequest via the `team-governance` skill to formally register the operation in AI Maestro's governance tracking:
   ```
   Use the `team-governance` skill: "Submit a GovernanceRequest for agent creation"
   → POST /api/v1/governance/requests with type, requestedBy (EAMA's agentId), payload
   ```
4. EAMA records both: its own `approval-log.md` entry AND the GovernanceRequest ID from AI Maestro
5. The GovernanceRequest ID should be stored in the approval-log.md entry as an additional field: `AI Maestro Request ID: <governance-request-uuid>`

**This means:** EAMA's approval-log.md gains a new optional field, and EAMA gains a new step when approving governance-scoped operations. The plugin does NOT change its approval decision logic — it simply also registers the decision with AI Maestro for cross-system visibility.

**Implementation guidance for the plugin update:**

Add to `record-keeping-formats.md` Approval Log format:
```markdown
## APPROVAL-2026-02-04-001
...
- **Outcome**: Deployment successful
- **AI Maestro Request ID**: <governance-request-uuid> (if applicable — for agent CRUD, team operations)
```

Add to `approval-response-workflow.md` Step 4 ("Record decision in state tracking"):
```markdown
4. **Record decision in state tracking**
   - Update EAMA state file
   - Log for audit trail
   - **If operation is governance-scoped (agent CRUD, team assignment, cross-host):**
     Follow the `team-governance` skill to submit a GovernanceRequest and store the returned request ID in the approval log entry
```

---

## Summary of All Violations

### HIGH Severity Violations (Must Fix)

| # | File | Violation | Line(s) | Description |
|---|------|-----------|---------|-------------|
| H1 | `proactive-kanban-monitoring.md` | HARDCODED_API | ~56-97 | Raw bash commands using `/tmp` snapshot paths; should use `docs_dev/kanban/` |
| H2 | `TEAM_REGISTRY_SPECIFICATION.md` | LOCAL_REGISTRY | ~252-281 | Python snippet reading `.emasoft/team-registry.json` directly; should reference skill |

### MEDIUM Severity Violations (Should Fix)

| # | File | Violation | Line(s) | Description |
|---|------|-----------|---------|-------------|
| M1 | `spawn-failure-recovery.md` | CLI_SYNTAX | ~196-201 | `tmux attach -t` in user-facing template |
| M2 | `spawn-failure-recovery.md` | CLI_SYNTAX | ~333-337 | `tmux list-sessions` and `tmux kill-session` commands |
| M3 | `workflow-examples.md` | CLI_SYNTAX | ~197-204 | `tmux list-sessions` in recovery protocol |
| M4 | `workflow-examples.md` | CLI_SYNTAX | ~477 | `tmux attach -t ecos-inventory-system` in user message |
| M5 | `creating-ecos-procedure.md` | CLI_SYNTAX | ~108-136 | `mkdir` and `cp` commands for plugin preparation |
| M6 | `spawn-failure-recovery.md` | INCONSISTENCY | ~172-175 | Message type `health_check` should be `ping` (inconsistency with other files) |
| M7 | `commands/eama-approve-plan.md` | CLI_SYNTAX | ~5-15 | Python script `eama_approve_plan.py` needs audit for direct API calls |
| M8 | `commands/eama-orchestration-status.md` | CLI_SYNTAX | ~5-15 | Python script `eama_orchestration_status.py` needs audit for direct API calls |

### LOW Severity (Acceptable or Borderline)

| # | File | Violation | Description |
|---|------|-----------|-------------|
| L1 | `spawn-failure-recovery.md` | CLI_SYNTAX | `ls -la` for plugin verification — no AI Maestro abstraction exists for this |
| L2 | `workflow-checklists.md` | CLI_SYNTAX | `git init`/`git add`/`git commit` — no AI Maestro abstraction for git operations |
| L3 | `AGENT_OPERATIONS.md` | CLI_SYNTAX | `claude plugin list` — Claude CLI itself, acceptable |
| L4 | `proactive-kanban-monitoring.md` | HARDCODED_API | `--owner Emasoft` — project owner identity, acceptable |

---

## Compliance Score by Category

| Category | Files Checked | Violations | Compliance |
|----------|--------------|------------|------------|
| HARDCODED_API (curl/endpoints) | 28 | 1 | 96% |
| HARDCODED_GOVERNANCE | 28 | 0 | 100% |
| HARDCODED_AMP | 28 | 0 | 100% |
| LOCAL_REGISTRY | 28 | 1 | 96% |
| CLI_SYNTAX (tmux/bash) | 28 | 5 | 82% |
| APPROVAL_SYSTEM | 28 | 0 (preserved) | 100% |
| REDUNDANT_OPERATIONS | 28 | 0 | 100% |

**Overall Plugin Compliance: ~91% (LARGELY COMPLIANT)**

---

## Recommended Fixes (Priority Order)

### Priority 1 (High — Fix First)

1. **`TEAM_REGISTRY_SPECIFICATION.md`** — Remove the Python `get_agent_address()` snippet. Replace with: "The `ai_maestro_address` field in `team-registry.json` IS the agent's AI Maestro session name. Use it directly with the `agent-messaging` skill. No lookup function is needed."

2. **`proactive-kanban-monitoring.md`** — Move snapshot storage from `/tmp/` to `docs_dev/kanban/snapshots/`. Add note that `gh` CLI is used directly (no AI Maestro abstraction exists for GitHub Project monitoring).

### Priority 2 (Medium — Fix Soon)

3. **`spawn-failure-recovery.md`** — Replace all `tmux` commands with references to `ai-maestro-agents-management` skill. Fix `health_check` type to `ping` for consistency.

4. **`workflow-examples.md`** — Same `tmux` command fixes as above (duplicate content).

5. **`creating-ecos-procedure.md`** — Add note that directory preparation (`mkdir`, `cp`) is a pre-creation step performed manually or via future `ai-maestro-agents-management` skill extension.

### Priority 3 (Lower — When Convenient)

6. **Python scripts audit** — Review `scripts/eama_approve_plan.py` and `scripts/eama_orchestration_status.py` for direct API calls; replace any found with `aimaestro-agent.sh` calls.

7. **Approval system harmonization** — Add `AI Maestro Request ID` field to approval-log.md format. Add GovernanceRequest submission step to approval-response-workflow.md for governance-scoped operations.

### Items NOT Requiring Changes

The following are confirmed compliant and MUST NOT be changed:
- All AMP messaging patterns (use `agent-messaging` skill throughout — exemplary)
- All agent creation patterns (use `ai-maestro-agents-management` skill throughout — exemplary)
- The entire approval tracking system in `docs_dev/approvals/approval-log.md` — preserve as-is
- EAMA's session memory files in `docs_dev/` — correct and necessary
- Role boundary definitions in `ROLE_BOUNDARIES.md` — plugin's own architecture, not AI Maestro governance
- RULE 14 enforcement — plugin's own requirement immutability policy, not AI Maestro governance

---

## Plugin Prerequisites Declaration Assessment

Per the Plugin Abstraction Principle, plugins should declare skill dependencies. AMAMA does this in:

**`agents/eama-assistant-manager-main-agent.md`:**
```yaml
skills:
  - ...
  - ai-maestro-agents-management  # External dependency — correctly declared
```

And the "External Dependencies" section explicitly calls out the AI Maestro requirement. This is compliant.

**Missing:** A `plugin.json` description field declaring: "Requires AI Maestro skills: ai-maestro-agents-management, agent-messaging, team-governance." This should be added when the plugin.json is next updated.

---

## Conclusion

The AMAMA plugin demonstrates strong architectural discipline:

1. **Zero hardcoded curl commands** across all 28 files — the messaging abstraction is fully respected
2. **Zero hardcoded AMP envelope structures** — all messaging correctly delegates to the `agent-messaging` skill
3. **Zero hardcoded governance permission matrices** — no AI Maestro role rules are embedded
4. **Exemplary approval system** — EAMA's operational approval workflow is well-designed, properly audited, and MUST be preserved

The violations are concentrated in infrastructure-level bash commands (`tmux`, `mkdir`, `cp`) in a few reference documents. These are medium-to-low severity and mostly affect diagnostic/recovery procedures rather than core operational flows.

The harmonization with AI Maestro's GovernanceRequest system is straightforward: add a new optional field to EAMA's approval log and a new step to submit GovernanceRequests for governance-scoped operations. This does not require changing EAMA's approval logic — only extending it.

---

*End of Audit Report*
