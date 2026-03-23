# Deep Audit: AMCOS Operations & Planning Reference Files
# Generated: 2026-02-27
# Source: deep-audit agent ae430c0c1fb1ac1df (completed)

---

## Summary

**Total files audited**: 50 across 7 skill categories
**Total violations found**: 8 (in 7 files)
**Files fully clean**: 38 of 50 (76%)
**RECORD_KEEPING items correctly preserved**: 4

---

## Violations Found

### HARDCODED_API — 3 violations (Label Taxonomy category)

These three files call `curl "$AIMAESTRO_API/api/agents/..."` directly, violating Rule 2. They must instead delegate to `aimaestro-agent.sh`:

1. **`skills/amcos-label-taxonomy/references/op-assign-agent-to-issue.md`** — Step 5 and Example: `curl -X PATCH "$AIMAESTRO_API/api/agents/$AGENT_NAME"` with `current_issues_add`
2. **`skills/amcos-label-taxonomy/references/op-sync-registry-with-labels.md`** — Steps 1, 2, 4, 5 and Automated Sync Script: 6+ curl calls to `$AIMAESTRO_API/api/agents/...` and `$AIMAESTRO_API/api/teams/default/agents`
3. **`skills/amcos-label-taxonomy/references/op-terminate-agent-clear-assignments.md`** — Step 3 and Example: `curl -X PATCH "$AIMAESTRO_API/api/agents/$AGENT_NAME"` with `status: "terminated"`

### HARDCODED_AMP — 1 violation (Plugin Management category)

**`skills/amcos-plugin-management/references/remote-plugin-management.md`** — Sections 2.2 and 3.2 embed raw AMP message format JSON directly:
```json
{"type": "plugin-install", "plugin": "plugin-name", "marketplace": "marketplace-name", "version": "1.0.0"}
{"type": "plugin-update", "plugin": "plugin-name", "from_version": "1.0.0", "to_version": "1.1.0"}
```
Must reference the `agent-messaging` skill by name instead.

### LOCAL_REGISTRY — 4 violations (Skill Management category)

Four files directly read `~/.claude/skills-index.json` via `jq`, bypassing any abstraction:

1. **`skills/amcos-skill-management/references/op-configure-pss-integration.md`**
2. **`skills/amcos-skill-management/references/op-reindex-skills-pss.md`**
3. **`skills/amcos-skill-management/references/pss-integration.md`**
4. **`skills/amcos-skill-management/references/skill-reindexing.md`**

All contain patterns like `cat ~/.claude/skills-index.json | jq '.skills["skill-name"]'`. These must use PSS CLI commands (`/pss-status`, `/pss-suggest`) instead of direct file reads.

---

## RECORD_KEEPING Items (Correctly Preserved — No Action Required)

Four files call `scripts/amcos_team_registry.py` for internal audit logging. These are intentional AMCOS-internal housekeeping and must not be touched:

- `skills/amcos-onboarding/references/op-restart-agent-plugin.md` — `amcos_team_registry.py log`
- `skills/amcos-onboarding/references/op-conduct-project-handoff.md` — `amcos_team_registry.py log`
- `skills/amcos-onboarding/references/op-deliver-role-briefing.md` — `amcos_team_registry.py update-role` and `log`
- `skills/amcos-onboarding/references/op-execute-onboarding-checklist.md` — `amcos_team_registry.py log`

---

## Categories with Zero Violations

- **Staff Planning** (7/7 clean)
- **Resource Monitoring** (7/7 clean)
- **Performance Tracking** (7/7 clean)
- **Onboarding** (7/7 clean, with 4 correctly-preserved RECORD_KEEPING calls)

---

## Files Audited by Category

### amcos-plugin-management/references/ (10 files)
1. catalog-management.md — CLEAN
2. compatibility-checking.md — CLEAN
3. dependency-resolution.md — CLEAN
4. install-procedures.md — CLEAN
5. op-install-plugin.md — CLEAN
6. op-update-plugin.md — CLEAN
7. op-verify-plugin.md — CLEAN
8. plugin-testing.md — CLEAN
9. remote-plugin-management.md — **HARDCODED_AMP** (1 violation)
10. version-management.md — CLEAN

### amcos-skill-management/references/ (8 files)
1. op-configure-pss-integration.md — **LOCAL_REGISTRY** (1 violation)
2. op-reindex-skills-pss.md — **LOCAL_REGISTRY** (1 violation)
3. op-validate-skill.md — CLEAN
4. pss-integration.md — **LOCAL_REGISTRY** (1 violation)
5. skill-catalog.md — CLEAN
6. skill-quality-standards.md — CLEAN
7. skill-reindexing.md — **LOCAL_REGISTRY** (1 violation)
8. validation-procedures.md — CLEAN

### amcos-onboarding/references/ (7 files)
1. op-conduct-project-handoff.md — CLEAN (RECORD_KEEPING preserved)
2. op-deliver-role-briefing.md — CLEAN (RECORD_KEEPING preserved)
3. op-execute-onboarding-checklist.md — CLEAN (RECORD_KEEPING preserved)
4. op-prepare-agent-workspace.md — CLEAN
5. op-restart-agent-plugin.md — CLEAN (RECORD_KEEPING preserved)
6. op-verify-agent-readiness.md — CLEAN
7. workspace-templates.md — CLEAN

### amcos-staff-planning/references/ (7 files)
1. capacity-models.md — CLEAN
2. forecasting-templates.md — CLEAN
3. growth-patterns.md — CLEAN
4. op-assess-team-capacity.md — CLEAN
5. op-plan-agent-allocation.md — CLEAN
6. op-recommend-scaling.md — CLEAN
7. role-requirements.md — CLEAN

### amcos-resource-monitoring/references/ (7 files)
1. alert-thresholds.md — CLEAN
2. monitoring-templates.md — CLEAN
3. op-check-agent-resources.md — CLEAN
4. op-generate-utilization-report.md — CLEAN
5. op-optimize-resources.md — CLEAN
6. resource-baselines.md — CLEAN
7. utilization-metrics.md — CLEAN

### amcos-performance-tracking/references/ (7 files)
1. benchmarks.md — CLEAN
2. improvement-strategies.md — CLEAN
3. metrics-catalog.md — CLEAN
4. op-generate-performance-report.md — CLEAN
5. op-identify-bottlenecks.md — CLEAN
6. op-track-sla-compliance.md — CLEAN
7. sla-definitions.md — CLEAN

### amcos-label-taxonomy/references/ (4 files)
1. label-schema.md — CLEAN
2. op-assign-agent-to-issue.md — **HARDCODED_API** (1 violation)
3. op-sync-registry-with-labels.md — **HARDCODED_API** (1 violation)
4. op-terminate-agent-clear-assignments.md — **HARDCODED_API** (1 violation)
