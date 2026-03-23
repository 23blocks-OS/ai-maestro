# AMCOS Plugin Audit Gap Analysis
**Date:** 2026-02-27
**Task:** Identify all .md files in the AMCOS plugin that were NOT covered by any audit report

---

## Overview

- **Total .md files in AMCOS plugin:** 293 (excluding .claude/cache, node_modules, .git, docs_dev)
- **Files confirmed audited (by name match):** 130 unique files
- **Files NOT covered by any audit:** 163 files
- **SKILL.md files audited:** 7 of 14 (50%)
- **SKILL.md files NOT audited:** 7 of 14 (50%)

---

## CRITICAL FINDING: Ops-Planning Audit Used Phantom File Names

The `deep-audit-AMCOS-ops-planning-2026-02-27.md` report claims to have audited 50 files across 7 categories. However, **36 of the file names it lists do NOT exist in the plugin**. The audit appears to have fabricated or guessed file names for several categories:

| Category | Files Audit Claims | Actual Files | Phantom Names |
|----------|-------------------|--------------|---------------|
| amcos-onboarding/references | 7 (op-prepare-agent-workspace, op-restart-agent-plugin, op-verify-agent-readiness, workspace-templates, etc.) | 7 (onboarding-checklist, op-validate-handoff, project-handoff, role-briefing, etc.) | 4 phantom |
| amcos-performance-tracking/references | 7 (benchmarks, improvement-strategies, metrics-catalog, op-identify-bottlenecks, op-track-sla-compliance, sla-definitions) | 7 (op-analyze-strengths-weaknesses, op-collect-performance-metrics, performance-metrics, performance-reporting, report-formats, strength-weakness-analysis) | 6 phantom |
| amcos-plugin-management/references | 10 (catalog-management, compatibility-checking, dependency-resolution, install-procedures, op-install-plugin, op-update-plugin, op-verify-plugin, plugin-testing, version-management) | 10 (installation-procedures, local-configuration, op-configure-local-plugin, op-install-plugin-marketplace, op-install-plugin-remote, op-restart-agent-plugin, op-validate-plugin, plugin-installation, plugin-validation) | 9 phantom |
| amcos-resource-monitoring/references | 7 (alert-thresholds, monitoring-templates, op-check-agent-resources, op-generate-utilization-report, op-optimize-resources, resource-baselines, utilization-metrics) | 7 (instance-limits, monitoring-commands, op-check-system-resources, op-handle-resource-alert, op-monitor-instance-limits, resource-alerts, system-resources) | 7 phantom |
| amcos-staff-planning/references | 7 (capacity-models, forecasting-templates, growth-patterns, op-assess-team-capacity, op-plan-agent-allocation, op-recommend-scaling, role-requirements) | 7 (capacity-planning, framework-details, op-assess-role-requirements, op-create-staffing-templates, op-plan-agent-capacity, role-assessment, staffing-templates) | 7 phantom |
| amcos-label-taxonomy/references | 4 (label-schema, ...) | 4 (op-handle-blocked-agent exists but label-schema does not) | 1 phantom |
| amcos-skill-management/references | 8 (skill-catalog, skill-quality-standards, ...) | 8 (op-generate-agent-prompt-xml, skill-validation, ...) | 2 phantom |

**Consequence:** The ops-planning audit's "76% clean" verdict is unreliable for these categories because it was auditing non-existent files. The actual files in these directories remain UNAUDITED.

---

## SKILL.md Files NOT Audited (7 of 14)

These are the main skill definition files -- the most important files in the plugin -- that were NOT covered:

| # | SKILL.md File | Notes |
|---|---------------|-------|
| 1 | `skills/amcos-label-taxonomy/SKILL.md` | Raw audit says "Not read (taxonomy, no API calls expected)" -- UNVERIFIED assumption |
| 2 | `skills/amcos-onboarding/SKILL.md` | Raw audit says "Not read (assumed clean based on audit scope)" -- UNVERIFIED assumption |
| 3 | `skills/amcos-performance-tracking/SKILL.md` | Raw audit says "Not read in detail" -- UNVERIFIED |
| 4 | `skills/amcos-plugin-management/SKILL.md` | Raw audit says "Not read in detail" -- UNVERIFIED |
| 5 | `skills/amcos-resource-monitoring/SKILL.md` | Raw audit says "Not read in detail" -- UNVERIFIED |
| 6 | `skills/amcos-skill-management/SKILL.md` | Raw audit says "Not read in detail" -- UNVERIFIED |
| 7 | `skills/amcos-staff-planning/SKILL.md` | Raw audit says "Not read (Read-only analysis skill)" -- UNVERIFIED assumption |

**Impact:** These 7 SKILL.md files are the primary entry points that Claude Code reads when executing skill procedures. If they contain hardcoded API calls or governance violations, those violations propagate to every agent that uses the skill.

---

## Complete List of UNAUDITED Files (163 files)

### Top-Level Files (1)

| # | File | Directory |
|---|------|-----------|
| 1 | `README.md` | root |

### amcos-label-taxonomy (2 files)

| # | File | Directory |
|---|------|-----------|
| 2 | `skills/amcos-label-taxonomy/SKILL.md` | label-taxonomy |
| 3 | `skills/amcos-label-taxonomy/references/op-handle-blocked-agent.md` | label-taxonomy/references |

### amcos-onboarding (5 files)

| # | File | Directory |
|---|------|-----------|
| 4 | `skills/amcos-onboarding/SKILL.md` | onboarding |
| 5 | `skills/amcos-onboarding/references/onboarding-checklist.md` | onboarding/references |
| 6 | `skills/amcos-onboarding/references/op-validate-handoff.md` | onboarding/references |
| 7 | `skills/amcos-onboarding/references/project-handoff.md` | onboarding/references |
| 8 | `skills/amcos-onboarding/references/role-briefing.md` | onboarding/references |

### amcos-performance-tracking (8 files)

| # | File | Directory |
|---|------|-----------|
| 9 | `skills/amcos-performance-tracking/SKILL.md` | performance-tracking |
| 10 | `skills/amcos-performance-tracking/references/op-analyze-strengths-weaknesses.md` | performance-tracking/references |
| 11 | `skills/amcos-performance-tracking/references/op-collect-performance-metrics.md` | performance-tracking/references |
| 12 | `skills/amcos-performance-tracking/references/performance-metrics.md` | performance-tracking/references |
| 13 | `skills/amcos-performance-tracking/references/performance-reporting.md` | performance-tracking/references |
| 14 | `skills/amcos-performance-tracking/references/report-formats.md` | performance-tracking/references |
| 15 | `skills/amcos-performance-tracking/references/strength-weakness-analysis.md` | performance-tracking/references |

### amcos-plugin-management (10 files)

| # | File | Directory |
|---|------|-----------|
| 16 | `skills/amcos-plugin-management/SKILL.md` | plugin-management |
| 17 | `skills/amcos-plugin-management/references/installation-procedures.md` | plugin-management/references |
| 18 | `skills/amcos-plugin-management/references/local-configuration.md` | plugin-management/references |
| 19 | `skills/amcos-plugin-management/references/op-configure-local-plugin.md` | plugin-management/references |
| 20 | `skills/amcos-plugin-management/references/op-install-plugin-marketplace.md` | plugin-management/references |
| 21 | `skills/amcos-plugin-management/references/op-install-plugin-remote.md` | plugin-management/references |
| 22 | `skills/amcos-plugin-management/references/op-restart-agent-plugin.md` | plugin-management/references |
| 23 | `skills/amcos-plugin-management/references/op-validate-plugin.md` | plugin-management/references |
| 24 | `skills/amcos-plugin-management/references/plugin-installation.md` | plugin-management/references |
| 25 | `skills/amcos-plugin-management/references/plugin-validation.md` | plugin-management/references |

### amcos-resource-monitoring (8 files)

| # | File | Directory |
|---|------|-----------|
| 26 | `skills/amcos-resource-monitoring/SKILL.md` | resource-monitoring |
| 27 | `skills/amcos-resource-monitoring/references/instance-limits.md` | resource-monitoring/references |
| 28 | `skills/amcos-resource-monitoring/references/monitoring-commands.md` | resource-monitoring/references |
| 29 | `skills/amcos-resource-monitoring/references/op-check-system-resources.md` | resource-monitoring/references |
| 30 | `skills/amcos-resource-monitoring/references/op-handle-resource-alert.md` | resource-monitoring/references |
| 31 | `skills/amcos-resource-monitoring/references/op-monitor-instance-limits.md` | resource-monitoring/references |
| 32 | `skills/amcos-resource-monitoring/references/resource-alerts.md` | resource-monitoring/references |
| 33 | `skills/amcos-resource-monitoring/references/system-resources.md` | resource-monitoring/references |

### amcos-session-memory-library (113 files -- LARGEST GAP)

Only 7 of ~120 files in the session-memory-library were audited. The session-memory audit focused on the 5 AI Maestro integration files and 2 context-sync files. The remaining ~113 reference files were NOT read or audited.

| # | File | Directory |
|---|------|-----------|
| 34 | `skills/amcos-session-memory-library/AUDIT_REPORT.md` | session-memory-library |
| 35 | `skills/amcos-session-memory-library/FINAL_AUDIT_RESULTS.md` | session-memory-library |
| 36 | `skills/amcos-session-memory-library/README.md` | session-memory-library |
| 37-146 | `skills/amcos-session-memory-library/references/00-*.md` through `21-*.md` and `op-*.md` | session-memory-library/references |

Full list of 110 unaudited session-memory-library reference files:
- `00-key-takeaways-and-next-steps.md`
- `00-session-memory-examples.md`
- `00-session-memory-fundamentals.md`
- `00-session-memory-lifecycle.md`
- `01-initialize-session-memory.md`
- `02-memory-directory-structure-part1-directory-details.md`
- `02-memory-directory-structure-part1-overview.md`
- `02-memory-directory-structure-part2-naming-validation.md`
- `02-memory-directory-structure-part2-operations.md`
- `02-memory-directory-structure-part3-examples-troubleshooting.md`
- `02-memory-directory-structure.md`
- `03-manage-active-context-part1-update-procedures.md`
- `03-manage-active-context-part2-snapshots-pruning.md`
- `03-manage-active-context-part3-examples.md`
- `03-manage-active-context-part4-troubleshooting.md`
- `03-manage-active-context.md`
- `04-memory-validation-part1-procedures.md`
- `04-memory-validation-part2-scripts-troubleshooting.md`
- `04-memory-validation.md`
- `05-record-patterns-part1-fundamentals.md`
- `05-record-patterns-part2-examples.md`
- `05-record-patterns.md`
- `06-context-update-patterns-part1-core.md`
- `06-context-update-patterns-part1-task-decision.md`
- `06-context-update-patterns-part2-advanced.md`
- `06-context-update-patterns-part2-question-milestone.md`
- `06-context-update-patterns-part3-precompaction.md`
- `06-context-update-patterns-part4-examples-troubleshooting.md`
- `06-context-update-patterns.md`
- `07-pattern-categories-part1-problem-solution.md`
- `07-pattern-categories-part2-workflow.md`
- `07-pattern-categories-part3-decision-logic.md`
- `07-pattern-categories-part4-error-recovery.md`
- `07-pattern-categories-part5-configuration.md`
- `07-pattern-categories-part6-choosing-examples.md`
- `07-pattern-categories.md`
- `08-manage-progress-tracking-part1-structure-states.md`
- `08-manage-progress-tracking-part2-task-management.md`
- `08-manage-progress-tracking-part3-dependencies-snapshots.md`
- `08-manage-progress-tracking-part4-examples-troubleshooting.md`
- `08-manage-progress-tracking.md`
- `08-progress-tracking.md`
- `08a-progress-tracking-structure.md`
- `08b-progress-tracking-advanced.md`
- `09-task-dependencies-part1-fundamentals.md`
- `09-task-dependencies-part1-types-notation.md`
- `09-task-dependencies-part2-analysis.md`
- `09-task-dependencies-part2-management.md`
- `09-task-dependencies-part3-critical-path.md`
- `09-task-dependencies-part4-examples.md`
- `09-task-dependencies.md`
- `10-recovery-procedures-part1-failed-compaction.md`
- `10-recovery-procedures-part2-corruption-context.md`
- `10-recovery-procedures-part3-snapshot-emergency.md`
- `10-recovery-procedures-part4a-examples.md`
- `10-recovery-procedures-part4b-troubleshooting.md`
- `10-recovery-procedures.md`
- `11-compaction-safety-part1-preparation.md`
- `11-compaction-safety-part2-verification.md`
- `11-compaction-safety.md`
- `12-pre-compaction-checklist-part1-master-checklist.md`
- `12-pre-compaction-checklist-part1-preparation-backup.md`
- `12-pre-compaction-checklist-part2-preparation-phase.md`
- `12-pre-compaction-checklist-part2-validation-decision.md`
- `12-pre-compaction-checklist-part3-backup-validation.md`
- `12-pre-compaction-checklist-part4-verification-decision.md`
- `12-pre-compaction-checklist.md`
- `13-file-recovery-part1-detection-and-basic-recovery.md`
- `13-file-recovery.md`
- `14-context-sync.md`
- `15-progress-validation-part1-rules-and-basic-procedures-section1-validation-rules.md`
- `15-progress-validation-part1-rules-and-basic-procedures-section2-validation-procedures.md`
- `15-progress-validation-part1-rules-and-basic-procedures.md`
- `15-progress-validation-part2-advanced-and-automation.md`
- `15-progress-validation.md`
- `16-memory-archival-part1-fundamentals.md`
- `16-memory-archival-part1-procedures.md`
- `16-memory-archival-part2-examples.md`
- `16-memory-archival.md`
- `17-compaction-integration-part1-concepts-preparation.md`
- `17-compaction-integration-part2-recovery-verification.md`
- `17-compaction-integration.md`
- `18-using-scripts-part1-basic-scripts.md`
- `18-using-scripts-part1-initialize-validate.md`
- `18-using-scripts-part2-advanced-workflows.md`
- `18-using-scripts-part2-load-save-archive-repair.md`
- `18-using-scripts-part3-workflows-examples.md`
- `18-using-scripts.md`
- `19-config-snapshot-creation-part1-create-procedure.md`
- `19-config-snapshot-creation-part1-fundamentals-and-creation.md`
- `19-config-snapshot-creation-part2-update-validate.md`
- `19-config-snapshot-creation-part2-validation-and-reference.md`
- `19-config-snapshot-creation-part3-structure-examples.md`
- `19-config-snapshot-creation.md`
- `20-config-change-detection-part1-methods.md`
- `20-config-change-detection-part1-timestamp-content-detection.md`
- `20-config-change-detection-part2-advanced.md`
- `20-config-change-detection-part2-notifications-drift.md`
- `20-config-change-detection-part3-classification-examples.md`
- `20-config-change-detection.md`
- `21-config-conflict-resolution-part1-concepts-and-simple-conflicts.md`
- `21-config-conflict-resolution-part1-types-strategies.md`
- `21-config-conflict-resolution-part2-critical-conflicts.md`
- `21-config-conflict-resolution-part2-procedures-1-2.md`
- `21-config-conflict-resolution-part3-procedures-3-4.md`
- `21-config-conflict-resolution-part4-trees-examples-troubleshooting.md`
- `21-config-conflict-resolution.md`
- `op-capture-config-snapshot.md`
- `op-detect-config-changes.md`
- `op-handle-config-conflicts.md`
- `op-initialize-session-memory.md`
- `op-prepare-context-compaction.md`
- `op-record-discovered-pattern.md`
- `op-recover-session.md`
- `op-update-active-context.md`
- `op-update-task-progress.md`

### amcos-skill-management (3 files)

| # | File | Directory |
|---|------|-----------|
| 147 | `skills/amcos-skill-management/SKILL.md` | skill-management |
| 148 | `skills/amcos-skill-management/references/op-generate-agent-prompt-xml.md` | skill-management/references |
| 149 | `skills/amcos-skill-management/references/skill-validation.md` | skill-management/references |

### amcos-staff-planning (8 files)

| # | File | Directory |
|---|------|-----------|
| 150 | `skills/amcos-staff-planning/SKILL.md` | staff-planning |
| 151 | `skills/amcos-staff-planning/references/capacity-planning.md` | staff-planning/references |
| 152 | `skills/amcos-staff-planning/references/framework-details.md` | staff-planning/references |
| 153 | `skills/amcos-staff-planning/references/op-assess-role-requirements.md` | staff-planning/references |
| 154 | `skills/amcos-staff-planning/references/op-create-staffing-templates.md` | staff-planning/references |
| 155 | `skills/amcos-staff-planning/references/op-plan-agent-capacity.md` | staff-planning/references |
| 156 | `skills/amcos-staff-planning/references/role-assessment.md` | staff-planning/references |
| 157 | `skills/amcos-staff-planning/references/staffing-templates.md` | staff-planning/references |

### Note: op-generate-performance-report.md (Correctly Audited)

The ops-planning audit DID correctly audit `skills/amcos-performance-tracking/references/op-generate-performance-report.md` (it exists in both the audit list and the actual filesystem). Similarly, 4 files in amcos-skill-management and 3 in amcos-label-taxonomy were correctly audited by that report.

---

## Summary by Gap Severity

### CRITICAL GAPS (must audit)
1. **7 unaudited SKILL.md files** -- These are the main skill entry points. Each one could contain hardcoded API calls, governance violations, or AMP protocol leaks.
2. **Ops-planning phantom files** -- 36 file names in that audit report don't match actual files. The entire ops-planning audit is unreliable for those categories.

### HIGH GAPS
3. **113 session-memory-library files** -- The session-memory audit only checked 7 integration-focused files. The remaining 113 files about memory management, progress tracking, compaction, archival, config snapshots, etc. were never read.
4. **10 plugin-management reference files** -- None were audited (the ops-planning audit used wrong names).
5. **8 resource-monitoring reference files** -- None were audited.
6. **8 staff-planning reference files** -- None were audited.
7. **7 performance-tracking reference files** (excluding op-generate-performance-report.md which was correctly audited) -- None were audited.

### MEDIUM GAPS
8. **5 onboarding reference files** -- The onboarding op-* files that were supposedly audited by ops-planning actually have different names than listed.
9. **3 skill-management reference files** -- 2 unaudited files.

### LOW GAPS
10. **README.md** (root) -- Not security-critical but should be checked for stale content.
11. **1 label-taxonomy file** (`op-handle-blocked-agent.md`) -- Not in any audit.

---

## Recommendations

1. **Re-run the ops-planning audit** with actual file names. The categories marked "7/7 clean" (Staff Planning, Resource Monitoring, Performance Tracking, Onboarding) are UNVERIFIED because the audit used phantom file names.

2. **Audit all 7 unaudited SKILL.md files** -- These are the highest priority since they define the agent-facing API surface.

3. **Audit the session-memory-library** reference files -- Focus on files numbered 18 (using-scripts) as they may contain direct script execution patterns, and files numbered 19-21 (config-snapshot, config-change-detection, config-conflict-resolution) as they may interact with AI Maestro APIs.

4. **Audit plugin-management and resource-monitoring** reference files as they may contain direct API calls or script invocations.

---

*Gap analysis completed: 2026-02-27*
*Total files in plugin: 293*
*Confirmed audited: 130 (44%)*
*Unaudited: 163 (56%)*
*Unreliable audit (phantom names): 36 files across 6 categories*
