# Consolidated Plugin Governance Audit Report — 2026-03-10

**Audited against:** Plugin Abstraction Principle (docs/PLUGIN-ABSTRACTION-PRINCIPLE.md)
**Source reports:** 9 individual audit reports in docs_dev/plugin-governance-audit-*-2026-03-10.md

---

## Summary Table

| # | Plugin | Type | Status | R1 | R2 | R3 | R4 | Total |
|---|--------|------|--------|----|----|----|----|-------|
| 1 | ai-maestro-assistant-manager-agent | Team | PARTIAL | 4 | 1 | 0 | 1 | 6 |
| 2 | ai-maestro-chief-of-staff | Team | **FAIL** | **8+14** | **4** | 1 | 1 | **28+** |
| 3 | ai-maestro-architect-agent | Team | PARTIAL | 2 | 0 | 0 | 1 | 3 |
| 4 | ai-maestro-integrator-agent | Team | PARTIAL | 0 | 2 | 1 | 2 | 5 |
| 5 | ai-maestro-orchestrator-agent | Team | PARTIAL | 1 | 2 | 0 | 1 | 4 |
| 6 | ai-maestro-programmer-agent | Team | PARTIAL | 2 | 0 | 0 | 1 | 3 |
| 7 | perfect-skill-suggester | Dependency | **PASS** | 0 | 0 | 0 | 0 | 0 |
| 8 | code-auditor-agent | Dependency | **PASS** | 0 | 0 | 0 | 0 | 0 |
| 9 | claude-plugins-validation | Dependency | **PASS** | 0 | 0 | 0 | 0 | 0 |

**Legend:** R1=Skills embed API syntax, R2=Scripts call API directly, R3=Hardcoded governance, R4=Missing deps

---

## Priority Fix Order

1. **ai-maestro-chief-of-staff** — FAIL — 8 SKILL.md files + 14 reference files embed curl/endpoints, 4 Python hook scripts make direct REST calls. Most work needed.
2. **ai-maestro-assistant-manager-agent** — PARTIAL — 4 reference files embed curl commands, 1 hook script calls API directly.
3. **ai-maestro-integrator-agent** — PARTIAL — 1 critical script (ci_webhook_handler.py) uses urllib directly, docs instruct curl usage.
4. **ai-maestro-orchestrator-agent** — PARTIAL — 2 Python scripts make direct curl calls to /api/messages.
5. **ai-maestro-programmer-agent** — PARTIAL — 2 hardcoded localhost URLs in skill file.
6. **ai-maestro-architect-agent** — PARTIAL — 2 minor hardcoded endpoints in reference docs.

---

## Per-Plugin Details

### 1. ai-maestro-assistant-manager-agent (AMAMA)

**Rule 1 (4 violations):**
- `skills/amama-approval-workflows/references/api-endpoints.md:14-52` — curl commands with `/api/v1/governance/requests`
- `skills/amama-approval-workflows/references/governance-password.md:14` — curl POST to `/api/v1/governance/password`
- `skills/amama-amcos-coordination/references/creating-amcos-instance.md:58-170` — curl PATCH/POST commands
- `skills/amama-status-reporting/references/api-endpoints.md:22-48` — curl commands for sessions, health, teams

**Rule 2 (1 violation):**
- `scripts/amama_stop_check.py:42-49` — direct curl call instead of `amp-inbox.sh`

**Rule 4 (1 violation):**
- `.claude-plugin/plugin.json` — missing `requiredSkills` array

**Alignment instructions:**
1. Replace all curl commands in 4 reference files with "Refer to `team-governance` skill" or "Refer to `ai-maestro-agents-management` skill"
2. Replace direct curl call in `amama_stop_check.py` with `amp-inbox.sh` invocation
3. Add dependency declarations to `plugin.json` description field

---

### 2. ai-maestro-chief-of-staff (AMCOS)

**Rule 1 (8 SKILL.md + 14 reference files):**
- `skills/amcos-failure-detection/SKILL.md:100-108` — curl to `/api/agents`, `/api/messages`
- `skills/amcos-recovery-execution/SKILL.md:107` — curl to `/api/agents`
- `skills/amcos-agent-replacement/SKILL.md:93-100` — curl POST `/api/messages`
- `skills/amcos-permission-management/SKILL.md:22-88` — POST/GET governance endpoints
- `skills/amcos-transfer-management/SKILL.md:35` — POST governance requests
- `skills/amcos-pre-op-notification/SKILL.md:40-79` — GET `/api/teams`
- `skills/amcos-agent-coordination/SKILL.md:23-88` — GET/POST `/api/teams/{id}/agents`
- `skills/amcos-agent-termination/SKILL.md:79` — DELETE `/api/agents/{id}`
- 14 reference files with embedded curl commands

**Rule 2 (4 violations — Python hook scripts):**
- `scripts/amcos_stop_check.py` — direct API polling
- `scripts/amcos_session_tracker.py` — direct REST calls
- `scripts/amcos_approval_manager.py:47-81` — full REST API client
- `scripts/amcos_notification_handler.py` — direct API calls

**Rule 3 (1 violation):**
- Hardcoded role constraints in agent definitions

**Rule 4 (1 violation):**
- `.claude-plugin/plugin.json` — missing requiredSkills

**Alignment instructions:**
1. Replace ALL curl commands in 8 SKILL.md files with references to `team-governance` and `agent-messaging` skills
2. Replace ALL curl commands in 14 reference files similarly
3. Rewrite 4 Python hook scripts to use `amp-send.sh`, `amp-inbox.sh`, `aimaestro-agent.sh`
4. Remove hardcoded role constraints — reference `team-governance` skill for runtime discovery
5. Add dependency declarations to `plugin.json`

---

### 3. ai-maestro-architect-agent

**Rule 1 (2 violations):**
- `skills/amaa-design-communication-patterns/references/op-send-ai-maestro-message.md:135` — hardcoded `/api/messages` endpoint
- Same pattern in `-ops` copy of the reference file

**Rule 4 (1 violation):**
- `.claude-plugin/plugin.json` — missing requiredSkills for `agent-messaging`, `ai-maestro-agents-management`
- Version mismatch: README says 2.1.0, plugin.json says 2.1.3

**Alignment instructions:**
1. Replace hardcoded `/api/messages` in 2 reference files with "Use `amp-send.sh` or the `agent-messaging` skill"
2. Add dependency declarations to `plugin.json`
3. Fix version mismatch between README and plugin.json

---

### 4. ai-maestro-integrator-agent

**Rule 2 (2 violations):**
- `skills/amia-github-projects-sync/scripts/ci_webhook_handler.py:41,72-77` — CRITICAL: direct REST call to `http://localhost:23000/api/messages` via urllib
- `skills/amia-integration-protocols/references/phase-procedures.md:95,145` — instructs agents to "Execute curl POST to AI Maestro API"

**Rule 3 (1 advisory):**
- `docs/ROLE_BOUNDARIES.md:189-199` and `agents/amia-integrator-main-agent.md:54-61` — hardcoded permission matrices

**Rule 4 (2 violations):**
- `plugin.json` — no structured dependencies field
- `amia-integration-protocols/SKILL.md:19` — Prerequisites says "None required" but uses agent-messaging

**Alignment instructions:**
1. Rewrite `ci_webhook_handler.py` to use `amp-send.sh` subprocess call instead of urllib
2. Replace curl instructions in `phase-procedures.md` with "Use the `agent-messaging` skill"
3. Add runtime governance discovery references instead of static ROLE_BOUNDARIES.md
4. Add dependency declarations and fix Prerequisites section

---

### 5. ai-maestro-orchestrator-agent

**Rule 1 (1 violation):**
- `skills/amoa-orchestration-patterns/SKILL.md:85` — hardcoded `http://localhost:23000`

**Rule 2 (2 violations):**
- `scripts/amoa_notify_agent.py` — direct curl to `/api/messages` bypassing `amp-send.sh`
- `scripts/amoa_confirm_replacement.py` — direct curl to `/api/messages` bypassing `amp-send.sh`/`amp-inbox.sh`

**Rule 4 (1 violation):**
- `.claude-plugin/plugin.json` — no structured dependencies field

**Alignment instructions:**
1. Remove hardcoded URL from SKILL.md line 85 — replace with "AI Maestro installed and running"
2. Rewrite `amoa_notify_agent.py` to call `amp-send.sh` via subprocess
3. Rewrite `amoa_confirm_replacement.py` to call `amp-inbox.sh` and `amp-send.sh`
4. Add dependency declarations to `plugin.json`

---

### 6. ai-maestro-programmer-agent

**Rule 1 (2 violations):**
- `skills/ampa-handoff-management/SKILL.md:24` — hardcoded `localhost:23000`
- `skills/ampa-handoff-management/SKILL.md:56` — hardcoded `curl -s "http://localhost:23000/api/health"`

**Rule 4 (1 violation):**
- `.claude-plugin/plugin.json` — missing dependencies block

**Alignment instructions:**
1. Remove hardcoded localhost and curl from SKILL.md lines 24, 56 — replace with agent-messaging skill references
2. Add dependencies to `plugin.json`
3. Replace static governance docs with runtime skill references (advisory)

---

### 7-9. Dependency Plugins (PASS)

- **perfect-skill-suggester** — Fully compatible. No AI Maestro API calls, no hook conflicts, no skill collisions.
- **code-auditor-agent** — Fully aligned. Valid manifest, no API hardcoding, no conflicts.
- **claude-plugins-validation** — Fully compatible. No hooks, no API calls, no name overlaps.

---

## Cross-Plugin Patterns

### Pattern 1: Python hook scripts making direct REST calls (Rule 2)
**Affected:** chief-of-staff (4 scripts), orchestrator (2 scripts), integrator (1 script), assistant-manager (1 script)
**Root cause:** All plugins were written before the Plugin Abstraction Principle was established. Python scripts use `urllib`/`requests`/`subprocess+curl` directly.
**Fix pattern:** Replace with `subprocess.run(['amp-send.sh', ...])` or `subprocess.run(['aimaestro-agent.sh', ...])`.

### Pattern 2: Skills embedding raw curl commands (Rule 1)
**Affected:** chief-of-staff (22 files), assistant-manager (4 files), programmer (1 file), orchestrator (1 file), architect (2 files)
**Root cause:** Skills were written as standalone API references before the global skill delegation pattern existed.
**Fix pattern:** Replace curl examples with "Refer to the `team-governance` skill for this operation" or "Use the `agent-messaging` skill".

### Pattern 3: Missing dependency declarations in plugin.json (Rule 4)
**Affected:** ALL 6 team plugins
**Root cause:** Claude Code plugin.json spec doesn't have a formal `dependencies` field. Plugins don't declare what AI Maestro skills they need.
**Fix pattern:** Add to plugin.json description: "Requires AI Maestro skills: team-governance, agent-messaging, ai-maestro-agents-management"

### Pattern 4: Static governance docs instead of runtime discovery (Rule 3)
**Affected:** integrator (ROLE_BOUNDARIES.md), programmer (ROLE_BOUNDARIES.md, TEAM_REGISTRY_SPECIFICATION.md)
**Root cause:** Governance rules were documented statically before `team-governance` skill existed.
**Fix pattern:** Add banner to static docs: "These rules are defined in the `team-governance` skill. This document may be outdated."

---

## Statistics

| Metric | Count |
|--------|-------|
| Plugins audited | 9 |
| PASS | 3 (all dependency plugins) |
| PARTIAL | 5 |
| FAIL | 1 (chief-of-staff) |
| Total Rule 1 violations | ~30+ |
| Total Rule 2 violations | 10 |
| Total Rule 3 violations | 3 |
| Total Rule 4 violations | 8 |
| **Total violations** | **~51+** |
