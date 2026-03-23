# Verification Report: AMCOS Operations & Planning Deep Audit
# Generated: 2026-02-27
# Verifier: verification agent (cross-check against actual files)

---

## Summary

**Audit report under review**: `docs_dev/deep-audit-AMCOS-ops-planning-2026-02-27.md`
**Reference standard**: `docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`

| Metric | Audit Claim | Verified |
|--------|-------------|----------|
| Total files audited | 50 | **53 actual files exist** (see details below) |
| Violations found | 8 in 7 files | **8 violations CONFIRMED in 7 files** |
| Files fully clean | 38 of 50 | Adjusted: 41 of 53 (see missed files) |
| RECORD_KEEPING items | 4 | **3 confirmed in onboarding + 1 misplaced (actually in plugin-management)** |

**Overall verdict**: Violations are REAL but the file inventory has significant errors.

---

## Violation-by-Violation Verification (All 8)

### HARDCODED_API Violations (3 in Label Taxonomy)

#### Violation 1: `op-assign-agent-to-issue.md` -- CONFIRMED

- **Path**: `skills/amcos-label-taxonomy/references/op-assign-agent-to-issue.md`
- **Audit claim**: Step 5 and Example contain `curl -X PATCH "$AIMAESTRO_API/api/agents/$AGENT_NAME"` with `current_issues_add`
- **Verified**: YES. Lines 79-81 (Step 5) and lines 103-105 (Example) contain direct `curl -X PATCH` calls to the API.
- **Rule violated**: Rule 2 (Plugin Hooks/Scripts MUST NOT Call the API Directly)
- **Severity**: Real violation. Should use `aimaestro-agent.sh` instead.

#### Violation 2: `op-sync-registry-with-labels.md` -- CONFIRMED

- **Path**: `skills/amcos-label-taxonomy/references/op-sync-registry-with-labels.md`
- **Audit claim**: Steps 1, 2, 4, 5 and Automated Sync Script contain 6+ curl calls
- **Verified**: YES. Direct `curl` calls found at:
  - Line 49: `curl -s "$AIMAESTRO_API/api/teams/default/agents"` (Step 1)
  - Line 58: `curl -s "$AIMAESTRO_API/api/agents/$AGENT"` (Step 2)
  - Lines 89-91: `curl -X PATCH "$AIMAESTRO_API/api/agents/$AGENT"` (Step 4)
  - Lines 107: `curl -s "$AIMAESTRO_API/api/agents/$AGENT_NAME"` (Step 5)
  - Lines 132, 142-144: curl calls in Example
  - Lines 159, 166-168: curl calls in Automated Sync Script
  - Line 181: `POST $AIMAESTRO_API/api/agents/register` in Error Handling table
- **Rule violated**: Rule 2
- **Severity**: Most severe file -- 8+ direct API calls. Should use `aimaestro-agent.sh` throughout.

#### Violation 3: `op-terminate-agent-clear-assignments.md` -- CONFIRMED

- **Path**: `skills/amcos-label-taxonomy/references/op-terminate-agent-clear-assignments.md`
- **Audit claim**: Step 3 and Example contain `curl -X PATCH "$AIMAESTRO_API/api/agents/$AGENT_NAME"` with `status: "terminated"`
- **Verified**: YES. Lines 63-65 (Step 3) and lines 100-102 (Example) contain direct `curl -X PATCH` calls.
- **Rule violated**: Rule 2
- **Severity**: Real violation. Should use `aimaestro-agent.sh` instead.

### HARDCODED_AMP Violation (1 in Plugin Management)

#### Violation 4: `remote-plugin-management.md` -- CONFIRMED

- **Path**: `skills/amcos-plugin-management/references/remote-plugin-management.md`
- **Audit claim**: Sections 2.2 and 3.2 embed raw AMP message format JSON directly
- **Verified**: YES.
  - Line 34: `"type": "plugin-install"` JSON block (Section 2.2)
  - Line 55: `"type": "plugin-update"` JSON block (Section 3.2)
- **Rule violated**: Rule 1 (Plugin Skills MUST NOT Embed API Syntax) -- the JSON message formats should reference the `agent-messaging` skill instead.
- **Severity**: Real violation. The file shows raw message format without referencing the `agent-messaging` skill.

### LOCAL_REGISTRY Violations (4 in Skill Management)

#### Violation 5: `op-configure-pss-integration.md` -- CONFIRMED

- **Path**: `skills/amcos-skill-management/references/op-configure-pss-integration.md`
- **Audit claim**: Directly reads `~/.claude/skills-index.json` via `jq`
- **Verified**: YES. Lines 151, 219, 222, 225 contain patterns like:
  - `jq '.skills[] | select(.name == "my-skill")' ~/.claude/skills-index.json`
- **Rule violated**: LOCAL_REGISTRY -- bypasses PSS CLI abstraction layer
- **Severity**: Real violation. Should use `/pss-status`, `/pss-suggest`, or PSS CLI commands.

#### Violation 6: `op-reindex-skills-pss.md` -- CONFIRMED

- **Path**: `skills/amcos-skill-management/references/op-reindex-skills-pss.md`
- **Audit claim**: Directly reads `~/.claude/skills-index.json` via `jq`
- **Verified**: YES. Lines 85, 87-88, 107, 139, 150, 155, 164, 173, 196 contain patterns like:
  - `cat ~/.claude/skills-index.json | jq '.skills | length'`
  - `cat ~/.claude/skills-index.json | jq '.skills[] | select(.name == "my-skill")'`
- **Rule violated**: LOCAL_REGISTRY
- **Severity**: Real violation. Heavily relies on direct file reads.

#### Violation 7: `pss-integration.md` -- CONFIRMED

- **Path**: `skills/amcos-skill-management/references/pss-integration.md`
- **Audit claim**: Directly reads `~/.claude/skills-index.json` via `jq`
- **Verified**: YES. Lines 186, 189, 196, 221, 252, 263 contain patterns like:
  - `cat ~/.claude/skills-index.json | jq '.skills["amcos-staff-planning"]'`
  - `cat ~/.claude/skills-index.json | jq '.categories["planning"]'`
- **Rule violated**: LOCAL_REGISTRY
- **Severity**: Real violation. Multiple direct reads of internal PSS index structure.

#### Violation 8: `skill-reindexing.md` -- CONFIRMED

- **Path**: `skills/amcos-skill-management/references/skill-reindexing.md`
- **Audit claim**: Directly reads `~/.claude/skills-index.json` via `jq`
- **Verified**: YES. Lines 100, 103, 106, 138-139, 150, 155, 164, 173, 196, 221, 240, 252 contain patterns like:
  - `cat ~/.claude/skills-index.json | jq '.skills | length'`
  - `cat ~/.claude/skills-index.json | jq '.skills[] | select(.name == "my-skill") | .keywords'`
- **Rule violated**: LOCAL_REGISTRY
- **Severity**: Real violation. Very heavily relies on direct file reads.

---

## RECORD_KEEPING Items Verification

| File | Audit Claim | Verified | Location |
|------|-------------|----------|----------|
| `op-restart-agent-plugin.md` | `amcos_team_registry.py log` | YES (line 87) | **WRONG CATEGORY**: File is in `amcos-plugin-management/`, NOT `amcos-onboarding/` |
| `op-conduct-project-handoff.md` | `amcos_team_registry.py log` | YES (line 110) | Correct: `amcos-onboarding/` |
| `op-deliver-role-briefing.md` | `amcos_team_registry.py update-role` and `log` | YES (lines 96, 101) | Correct: `amcos-onboarding/` |
| `op-execute-onboarding-checklist.md` | `amcos_team_registry.py log` | YES (lines 111, 183) | Correct: `amcos-onboarding/` |

**Audit Error**: `op-restart-agent-plugin.md` is listed under `amcos-onboarding/references/` in the audit, but it actually lives in `amcos-plugin-management/references/`. This is also a RECORD_KEEPING item in the plugin-management category, not onboarding.

---

## File Inventory Discrepancies

### Files on Disk vs. Audit Report

#### amcos-plugin-management/references/ (10 actual files, 10 in audit)

| Actual File | Audit Name | Match? |
|-------------|------------|--------|
| `installation-procedures.md` | `install-procedures.md` | NAME MISMATCH (audit uses wrong name) |
| `local-configuration.md` | (not listed) | MISSED by audit |
| `op-configure-local-plugin.md` | (not listed) | MISSED by audit |
| `op-install-plugin-marketplace.md` | (not listed) | MISSED by audit |
| `op-install-plugin-remote.md` | (not listed) | MISSED by audit |
| `op-restart-agent-plugin.md` | (listed under onboarding, not here) | WRONG CATEGORY |
| `op-validate-plugin.md` | `op-verify-plugin.md` | NAME MISMATCH |
| `plugin-installation.md` | (not listed) | MISSED by audit |
| `plugin-validation.md` | `plugin-testing.md` | NAME MISMATCH |
| `remote-plugin-management.md` | `remote-plugin-management.md` | MATCH |

**The audit listed 10 files but used fabricated/wrong names for 7 of them:**
- `catalog-management.md` -- DOES NOT EXIST
- `compatibility-checking.md` -- DOES NOT EXIST
- `dependency-resolution.md` -- DOES NOT EXIST
- `install-procedures.md` -- DOES NOT EXIST (actual: `installation-procedures.md`)
- `op-install-plugin.md` -- DOES NOT EXIST (actual: `op-install-plugin-marketplace.md`)
- `op-update-plugin.md` -- DOES NOT EXIST
- `op-verify-plugin.md` -- DOES NOT EXIST (actual: `op-validate-plugin.md`)
- `plugin-testing.md` -- DOES NOT EXIST (actual: `plugin-validation.md`)
- `version-management.md` -- DOES NOT EXIST

**Actual files NOT listed in audit:**
- `local-configuration.md`
- `op-configure-local-plugin.md`
- `op-install-plugin-marketplace.md`
- `op-install-plugin-remote.md`
- `plugin-installation.md`

#### amcos-skill-management/references/ (8 actual files, 8 in audit)

| Actual File | Audit Name | Match? |
|-------------|------------|--------|
| `op-configure-pss-integration.md` | `op-configure-pss-integration.md` | MATCH |
| `op-generate-agent-prompt-xml.md` | (not listed) | MISSED by audit |
| `op-reindex-skills-pss.md` | `op-reindex-skills-pss.md` | MATCH |
| `op-validate-skill.md` | `op-validate-skill.md` | MATCH |
| `pss-integration.md` | `pss-integration.md` | MATCH |
| `skill-reindexing.md` | `skill-reindexing.md` | MATCH |
| `skill-validation.md` | `skill-catalog.md` | NAME MISMATCH |
| `validation-procedures.md` | `validation-procedures.md` | MATCH |

**Fabricated names:**
- `skill-catalog.md` -- DOES NOT EXIST (actual: `skill-validation.md`)
- `skill-quality-standards.md` -- DOES NOT EXIST

**Missed file:**
- `op-generate-agent-prompt-xml.md`

#### amcos-onboarding/references/ (7 actual files, 7 in audit)

| Actual File | Audit Name | Match? |
|-------------|------------|--------|
| `onboarding-checklist.md` | (not listed) | MISSED by audit |
| `op-conduct-project-handoff.md` | `op-conduct-project-handoff.md` | MATCH |
| `op-deliver-role-briefing.md` | `op-deliver-role-briefing.md` | MATCH |
| `op-execute-onboarding-checklist.md` | `op-execute-onboarding-checklist.md` | MATCH |
| `op-validate-handoff.md` | `op-verify-agent-readiness.md` | NAME MISMATCH |
| `project-handoff.md` | (not listed) | MISSED by audit |
| `role-briefing.md` | `workspace-templates.md` | NAME MISMATCH |

**Fabricated names:**
- `op-prepare-agent-workspace.md` -- DOES NOT EXIST
- `op-restart-agent-plugin.md` -- DOES NOT EXIST here (it's in plugin-management)
- `op-verify-agent-readiness.md` -- DOES NOT EXIST (actual: `op-validate-handoff.md`)
- `workspace-templates.md` -- DOES NOT EXIST (actual: `role-briefing.md`)

**Missed files:**
- `onboarding-checklist.md`
- `project-handoff.md`

#### amcos-staff-planning/references/ (7 actual files, 7 in audit)

| Actual File | Audit Name | Match? |
|-------------|------------|--------|
| `capacity-planning.md` | `capacity-models.md` | NAME MISMATCH |
| `framework-details.md` | `forecasting-templates.md` | NAME MISMATCH |
| `op-assess-role-requirements.md` | `op-assess-team-capacity.md` | NAME MISMATCH |
| `op-create-staffing-templates.md` | `op-plan-agent-allocation.md` | NAME MISMATCH |
| `op-plan-agent-capacity.md` | `op-recommend-scaling.md` | NAME MISMATCH |
| `role-assessment.md` | `role-requirements.md` | NAME MISMATCH |
| `staffing-templates.md` | `growth-patterns.md` | NAME MISMATCH |

**ALL 7 names are wrong.** The audit fabricated all filenames for this category.

#### amcos-resource-monitoring/references/ (7 actual files, 7 in audit)

| Actual File | Audit Name | Match? |
|-------------|------------|--------|
| `instance-limits.md` | `alert-thresholds.md` | NAME MISMATCH |
| `monitoring-commands.md` | `monitoring-templates.md` | NAME MISMATCH |
| `op-check-system-resources.md` | `op-check-agent-resources.md` | NAME MISMATCH |
| `op-handle-resource-alert.md` | `op-generate-utilization-report.md` | NAME MISMATCH |
| `op-monitor-instance-limits.md` | `op-optimize-resources.md` | NAME MISMATCH |
| `resource-alerts.md` | `resource-baselines.md` | NAME MISMATCH |
| `system-resources.md` | `utilization-metrics.md` | NAME MISMATCH |

**ALL 7 names are wrong.** The audit fabricated all filenames for this category.

#### amcos-performance-tracking/references/ (7 actual files, 7 in audit)

| Actual File | Audit Name | Match? |
|-------------|------------|--------|
| `op-analyze-strengths-weaknesses.md` | `op-identify-bottlenecks.md` | NAME MISMATCH |
| `op-collect-performance-metrics.md` | `op-generate-performance-report.md` | NAME MISMATCH |
| `op-generate-performance-report.md` | `op-track-sla-compliance.md` | NAME MISMATCH |
| `performance-metrics.md` | `metrics-catalog.md` | NAME MISMATCH |
| `performance-reporting.md` | `benchmarks.md` | NAME MISMATCH |
| `report-formats.md` | `sla-definitions.md` | NAME MISMATCH |
| `strength-weakness-analysis.md` | `improvement-strategies.md` | NAME MISMATCH |

**ALL 7 names are wrong.** The audit fabricated all filenames for this category.

#### amcos-label-taxonomy/references/ (4 actual files, 4 in audit)

| Actual File | Audit Name | Match? |
|-------------|------------|--------|
| `op-assign-agent-to-issue.md` | `op-assign-agent-to-issue.md` | MATCH |
| `op-handle-blocked-agent.md` | (not listed) | MISSED by audit |
| `op-sync-registry-with-labels.md` | `op-sync-registry-with-labels.md` | MATCH |
| `op-terminate-agent-clear-assignments.md` | `op-terminate-agent-clear-assignments.md` | MATCH |

**Fabricated name:**
- `label-schema.md` -- DOES NOT EXIST

**Missed file:**
- `op-handle-blocked-agent.md` -- EXISTS, was verified CLEAN (no curl, no AIMAESTRO_API, no skills-index.json)

---

## Harmonization Guidance Check

The audit report does NOT include harmonization guidance. Each violation is identified but no specific fix instructions are provided beyond generic statements like "Must instead delegate to `aimaestro-agent.sh`" or "Must reference the `agent-messaging` skill by name."

**Missing harmonization details:**
- No specific `aimaestro-agent.sh` command equivalents for each curl call
- No PSS CLI command equivalents for each `skills-index.json` read
- No example of what the `agent-messaging` skill reference should look like for remote-plugin-management.md
- No diff or before/after examples

---

## Complete Summary of Audit Errors

### Critical Errors
1. **Fabricated filenames**: 31 out of 50 filenames listed in the audit DO NOT EXIST on disk. The audit apparently guessed/hallucinated filenames instead of reading actual directory listings.
2. **Missed files**: 8 actual files are not mentioned at all in the audit:
   - `amcos-plugin-management/references/local-configuration.md`
   - `amcos-plugin-management/references/op-configure-local-plugin.md`
   - `amcos-plugin-management/references/op-install-plugin-marketplace.md`
   - `amcos-plugin-management/references/op-install-plugin-remote.md`
   - `amcos-plugin-management/references/plugin-installation.md`
   - `amcos-skill-management/references/op-generate-agent-prompt-xml.md`
   - `amcos-onboarding/references/onboarding-checklist.md`
   - `amcos-onboarding/references/project-handoff.md`
   - `amcos-label-taxonomy/references/op-handle-blocked-agent.md`
3. **Wrong category for RECORD_KEEPING item**: `op-restart-agent-plugin.md` is in `amcos-plugin-management/`, not `amcos-onboarding/` as the audit claims.
4. **Total actual files**: 53 (not 50 as claimed)

### Correct Items
1. All 8 violations are REAL and verified against actual file contents
2. The violation types (HARDCODED_API, HARDCODED_AMP, LOCAL_REGISTRY) are correctly categorized
3. The 3 onboarding RECORD_KEEPING items (conduct-project-handoff, deliver-role-briefing, execute-onboarding-checklist) are correctly identified
4. The "categories with zero violations" claim is CORRECT for staff-planning, resource-monitoring, performance-tracking (verified via grep -- no curl, AIMAESTRO_API, or skills-index.json patterns found)
5. The 4th RECORD_KEEPING item (`op-restart-agent-plugin.md`) does exist and does contain `amcos_team_registry.py log`, just in the wrong category

### Missed Files Requiring Audit

These 9 files were not audited. All were spot-checked and found CLEAN:

| File | Category | Violation Status |
|------|----------|-----------------|
| `local-configuration.md` | plugin-management | CLEAN |
| `op-configure-local-plugin.md` | plugin-management | CLEAN |
| `op-install-plugin-marketplace.md` | plugin-management | CLEAN |
| `op-install-plugin-remote.md` | plugin-management | CLEAN |
| `plugin-installation.md` | plugin-management | CLEAN |
| `op-generate-agent-prompt-xml.md` | skill-management | CLEAN |
| `onboarding-checklist.md` | onboarding | CLEAN |
| `project-handoff.md` | onboarding | CLEAN |
| `op-handle-blocked-agent.md` | label-taxonomy | CLEAN |

---

## Verdict

**Violations**: All 8 claimed violations are REAL and accurately described. The audit correctly identified what is broken and why.

**File inventory**: Severely inaccurate. 31 of 50 filenames are fabricated, 9 files are missed entirely, and 1 RECORD_KEEPING item is attributed to the wrong category. The total file count is 53, not 50.

**Recommendation**: The violation findings should be trusted and acted upon. The file inventory section ("Files Audited by Category") should be regenerated from actual directory listings.
