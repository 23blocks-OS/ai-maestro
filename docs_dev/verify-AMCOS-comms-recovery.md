# Verification Report: Deep Audit of AMCOS Comms/Recovery Reference Files

**Date:** 2026-02-27
**Auditor:** Verification Agent
**Source Report:** `/Users/emanuelesabetta/ai-maestro/docs_dev/deep-audit-AMCOS-comms-recovery-2026-02-27.md`
**Reference Standard:** `/Users/emanuelesabetta/ai-maestro/docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`

---

## 1. File Inventory Cross-Check

### 1.1 amcos-notification-protocols/references/ (14 files)

| File | In Report? | Status |
|------|-----------|--------|
| acknowledgment-protocol.md | YES | Correctly marked CLEAN |
| ai-maestro-message-templates.md | YES | Marked UNREVIEWED - **see Issue A below** |
| design-document-protocol.md | YES | Violations claimed |
| edge-case-protocols.md | YES | Violations claimed |
| failure-notifications.md | YES | Violations claimed |
| message-response-decision-tree.md | YES | Correctly marked CLEAN |
| op-acknowledgment-protocol.md | YES | Correctly marked CLEAN |
| op-failure-notification.md | YES | Correctly marked CLEAN |
| op-post-operation-notification.md | YES | Correctly marked CLEAN |
| op-pre-operation-notification.md | YES | Correctly marked CLEAN |
| post-operation-notifications.md | YES | Violations claimed |
| pre-operation-notifications.md | YES | Correctly marked CLEAN |
| proactive-handoff-protocol.md | YES | Violations claimed |
| task-completion-checklist.md | YES | Correctly marked CLEAN |

**Result:** All 14 files accounted for. No missed files.

### 1.2 amcos-failure-recovery/references/ (14 files)

| File | In Report? | Status |
|------|-----------|--------|
| agent-replacement-protocol.md | YES | Violations claimed |
| examples.md | YES | Violations claimed |
| failure-classification.md | YES | Correctly marked CLEAN |
| failure-detection.md | YES | Correctly marked CLEAN |
| op-classify-failure-severity.md | YES | Correctly marked CLEAN |
| op-detect-agent-failure.md | YES | Correctly marked CLEAN |
| op-emergency-handoff.md | YES | Violations claimed |
| op-execute-recovery-strategy.md | YES | Marked CLEAN with RECORD_KEEPING |
| op-replace-agent.md | YES | Violations claimed |
| op-route-task-blocker.md | YES | Violations claimed |
| recovery-operations.md | YES | Violations claimed |
| recovery-strategies.md | YES | Violations claimed |
| troubleshooting.md | YES | Violations claimed |
| work-handoff-during-failure.md | YES | Violations claimed |

**Result:** All 14 files accounted for. No missed files.

### 1.3 amcos-team-coordination/references/ (6 files)

| File | In Report? | Status |
|------|-----------|--------|
| op-assign-agent-roles.md | YES | Marked CLEAN with RECORD_KEEPING |
| op-maintain-teammate-awareness.md | YES | Marked CLEAN with RECORD_KEEPING |
| op-send-team-messages.md | YES | Marked CLEAN with RECORD_KEEPING |
| role-assignment.md | YES | Violations claimed |
| team-messaging.md | YES | Violations claimed |
| teammate-awareness.md | YES | Violations claimed |

**Result:** All 6 files accounted for. No missed files.

### 1.4 Total File Inventory

- **Actual files on disk:** 34
- **Files mentioned in report:** 34
- **MISSED files:** 0

---

## 2. Spot-Check of Claimed Violations

### 2.1 Spot-Check #1: `recovery-operations.md` — HARDCODED_API claims

**Claim:** 9 HARDCODED_API instances including tmux bash commands at sections 1.2, 1.3, 1.5, 4.1, and direct file reads at 5.1, 6.1, 6.2.

**VERIFIED by reading file.** Confirmed violations:

| Claim | Verified? | Evidence |
|-------|-----------|----------|
| Section 1.2: `tmux has-session -t <agent-name> 2>/dev/null` | **YES** | Lines 59-61 contain exact bash block |
| Section 1.3: `tmux list-panes -t <agent-name> -F '#{pane_pid}'` | **YES** | Lines 73-74 contain exact bash block |
| Section 1.5: `ping -c 3 <host-ip>` | **YES** | Lines 105-106 contain exact bash block |
| Section 4.1: `PID=$(tmux list-panes...)` kill TERM | **YES** | Lines 275-281 contain exact bash block |
| Section 5.1: Recovery policy path | **YES** | Line 312 hardcodes `$CLAUDE_PROJECT_DIR/thoughts/shared/recovery-policy.json` |
| Section 5.2: Policy JSON with governance defaults | **YES** | Lines 318-330 embed full JSON with `auto_replace_on_terminal: false` |
| Section 6.1: Recovery log path | **YES** | Line 358 hardcodes `$CLAUDE_PROJECT_DIR/thoughts/shared/recovery-log.json` |
| Section 3.4: Direct file read of policy | **YES** | Line 252 reads from the recovery policy file directly |

**Verdict: HARDCODED_API count CONFIRMED.** The audit counted 9 instances; I verified 8 of them directly. The count is accurate or possibly conservative. All claimed violations are real.

**HOWEVER:** The audit report claims `Section 6.2: Direct jq query of recovery log` as an instance. I read the file and section 6.2 (lines 381-398) describes the recovery event schema fields — it does NOT contain a `jq` command or direct file read. This appears to be a **FALSE POSITIVE**. The section describes the schema only, not a direct read operation.

**Corrected count: 8 HARDCODED_API (not 9).**

### 2.2 Spot-Check #2: `edge-case-protocols.md` — HARDCODED_API claims

**Claim:** 8 HARDCODED_API instances.

**VERIFIED by reading file.** Confirmed violations:

| Claim | Verified? | Evidence |
|-------|-----------|----------|
| Section 1.2: `echo "..." >> .claude/logs/maestro-failures.log` | **YES** | Lines 60-61 |
| Section 1.2: Fallback queue with JSON heredoc | **YES** | Lines 68-84 |
| Section 1.3: `cat > ".claude/handoffs/to-${ROLE}-$(date +%s).md"` | **YES** | Lines 119-138 |
| Section 2.1: `gh api rate_limit` | **YES** | Lines 148-151 |
| Section 2.2: GitHub cache writes | **YES** | Lines 157-160 |
| Section 2.2: GitHub queue writes | **YES** | Lines 179-188 |
| Section 7.1: `find .claude/handoffs -name "*${UUID}*"` | **YES** | Lines 599-600 |
| Section 8.1/8.3: `ls -la .claude/memory/` and `cp -r .claude/memory/*` | **YES** | Lines 679-680 and 749-751 |

**Verdict: HARDCODED_API count of 8 CONFIRMED.** All claimed violations verified as real.

**RECORD_KEEPING claims also verified:**
- Section 1.2 failure log: CONFIRMED at line 61
- Section 2.3 status caching: CONFIRMED at lines 198-203
- Section 8 session memory: CONFIRMED at lines 670-792

### 2.3 Spot-Check #3: `team-messaging.md` — HARDCODED_AMP claims

**Claim:** 5 HARDCODED_AMP instances at section 2.1 (content format JSON blocks for announcement, request, alert, status-update, role-assignment).

**VERIFIED by reading file.** Confirmed violations:

| Claim | Verified? | Evidence |
|-------|-----------|----------|
| Announcement content format JSON | **YES** | Lines 30-34 |
| Request content format JSON | **YES** | Lines 47-52 |
| Alert content format JSON | **YES** | Lines 64-69 |
| Status Update content format JSON | **YES** | Lines 83-89 |
| Role Assignment content format JSON | **YES** | Lines 100-106 |

**Verdict: HARDCODED_AMP count of 5 CONFIRMED.** All 5 JSON schema blocks are embedded directly in the reference file, coupling it to the AMP protocol internals.

**NOTE:** The rest of the file (sections 2.2-2.8) is fully compliant — all messaging operations reference the `agent-messaging` skill by name. Only section 2.1 has violations.

### 2.4 Spot-Check #4: `op-emergency-handoff.md` — HARDCODED_API + HARDCODED_AMP claims

**Claim:** 3 HARDCODED_API, 2 HARDCODED_AMP, 1 LOCAL_REGISTRY.

**VERIFIED by reading file.** Confirmed violations:

| Claim | Verified? | Evidence |
|-------|-----------|----------|
| Step 1: `cat $CLAUDE_PROJECT_DIR/.amcos/agent-health/task-tracking.json \| jq` | **YES** | Lines 53-54 |
| Step 3: `mkdir -p $CLAUDE_PROJECT_DIR/thoughts/shared/handoffs/emergency/` | **YES** | Lines 116-118 |
| Step 3: Hardcoded handoff directory path | **YES** | Line 117 |
| Step 2: Full JSON envelope to `eoa-orchestrator` | **YES** | Lines 74-88 — despite `> **Note**: Use the agent-messaging skill` on line 72 |
| Step 4: Full JSON envelope with hardcoded UUID `EH-20250204-svgbbox-001` | **YES** | Lines 129-142 — note the hardcoded project-specific UUID example |
| LOCAL_REGISTRY: Direct read of task-tracking.json | **YES** | Line 54 |

**Verdict: All 6 violations CONFIRMED.** The HARDCODED_AMP instances are notable because the file includes `> **Note**: Use the agent-messaging skill` disclaimers before each JSON block, but then immediately embeds the full envelope structure anyway, creating the exact coupling the Plugin Abstraction Principle prohibits.

---

## 3. Recovery Log Path Inconsistency — VERIFIED

**Claim:** Two files use different paths for recovery log.

| File | Path Found | Format | Line |
|------|-----------|--------|------|
| `recovery-operations.md` | `$CLAUDE_PROJECT_DIR/thoughts/shared/recovery-log.json` | .json | Line 358 |
| `recovery-strategies.md` | `$CLAUDE_PROJECT_DIR/.amcos/agent-health/recovery-log.jsonl` | .jsonl | Line 79 |

**VERIFIED.** This is a real and critical inconsistency. The paths differ in both directory location AND file extension (.json vs .jsonl), meaning even the storage format is different. This must be harmonized.

---

## 4. Issue A: `ai-maestro-message-templates.md` — UNREVIEWED File

The audit report marked this file as "NOT READ DIRECTLY" and said "Manual review required."

**I have now read this file.** Here is the assessment:

### Violations Found in `ai-maestro-message-templates.md`

#### HARDCODED_AMP — 7 instances

| Location | Violation |
|----------|-----------|
| Section 1: `amp-send.sh` base command with `--to --subject --priority --type --message` flags | Embeds exact CLI syntax for AMP script |
| Section 2: Full `amp-send.sh` command for approval requests to `eama-main` | Hardcoded AMP CLI invocation with all fields |
| Section 3: Full `amp-send.sh` command for escalation to `eama-assistant-manager` | Hardcoded AMP CLI invocation |
| Section 4: Full `amp-send.sh` command for operation notices | Hardcoded AMP CLI invocation |
| Section 5: Full `amp-send.sh` command for operation results | Hardcoded AMP CLI invocation |
| Section 6: Full `amp-send.sh` command for EOA notification | Hardcoded AMP CLI invocation |
| Section 8: `for agent in...` bash loop with `amp-send.sh` | Hardcoded iteration + AMP CLI invocation |

#### HARDCODED_API — 2 instances

| Location | Violation |
|----------|-----------|
| Section 1: `amp-init.sh --auto` | Direct script invocation for setup |
| Section 8: `for agent in...done` bash loop | Direct bash iteration pattern |

**NOTE:** This file is interesting because it uses `amp-send.sh` (the global script layer) instead of raw `curl` API calls, which means it partially follows the Plugin Abstraction Principle's Layer 2 (scripts). However, it still violates Rule 1 by embedding the exact CLI syntax rather than referencing the `agent-messaging` skill. The Plugin Abstraction Principle states: "Plugin skills reference these global skills by name" — this file should say "Use the `agent-messaging` skill" rather than embedding `amp-send.sh` commands.

**Assessment:** The audit report's suspicion was correct — this file has violations. However, they are LESS severe than most other violations because `amp-send.sh` is already an abstraction layer. The file sits in a gray zone: it uses the correct tool (`amp-send.sh`) but embeds the exact invocation syntax.

**Recommendation:** This file could be considered PARTIALLY COMPLIANT. The `amp-send.sh` references are less fragile than raw `curl` calls, but should still be replaced with `agent-messaging` skill references per the Plugin Abstraction Principle.

---

## 5. Summary Table Accuracy Check

The audit report's summary table (lines 688-729) claims:

| Metric | Report Claims | Verified |
|--------|--------------|----------|
| HARDCODED_API total | 42 | **CLOSE** — 1 false positive found in recovery-operations.md section 6.2 (schema description, not a jq command). Also, ai-maestro-message-templates.md adds 2 more that were uncounted. Net: ~43 |
| HARDCODED_GOVERNANCE total | 17 | Not spot-checked, but the items I saw in recovery-operations.md (section 3.4) were genuine |
| HARDCODED_AMP total | 21 | **UNDERCOUNTED** — ai-maestro-message-templates.md adds 7 more instances bringing total to ~28 |
| LOCAL_REGISTRY total | 15 | Spot-checked items confirmed accurate |
| RECORD_KEEPING total | 21 | Spot-checked items confirmed accurate |

**Note:** The Executive Summary table at the top of the report (lines 10-16) shows different totals than the detailed summary table at the bottom (lines 688-729). The executive summary says HARDCODED_API=38 but the detail table sums to 42. The detail table appears to be the authoritative count.

---

## 6. Harmonization Guidance Assessment

**Claim:** The audit provides harmonization guidance, not just "remove this."

**VERIFIED.** The audit report is notably balanced in this regard:

### Evidence of Preservation/Harmonization Guidance

1. **RECORD_KEEPING category explicitly exists** (line 30): "RECORD_KEEPING: Internal tallying, logging, and state recording that MUST be preserved and harmonized (do NOT remove — these are design-intentional)"

2. **Per-file RECORD_KEEPING annotations** include "PRESERVE" markers for every instance (e.g., line 78: "The UUID registry schema... must be PRESERVED")

3. **Governance coupling is handled respectfully** (line 276): "The approval requirement for agent replacement is a meaningful governance boundary. If it must be preserved, it should be expressed as a reference to the governance skill's approval workflow"

4. **Edge case fallbacks acknowledged as intentional** (line 105): "The file itself acknowledges this is a last-resort fallback... The fallback behaviour is architecturally intentional but the bash implementation bypasses skill abstraction"

5. **Fix priorities are tiered** (lines 735-753): Priority 1 is correctness, not deletion. Priority 4 is "path hygiene" — the mildest intervention.

6. **PATH INCONSISTENCY guidance recommends harmonizing** (lines 668-670), not deleting either path.

### Missing Harmonization Guidance

1. **No explicit migration pattern suggested.** The report identifies violations but does not provide concrete "before/after" examples of what a harmonized version would look like. For example, when it says "replace full JSON envelope blocks with prose descriptions referencing the agent-messaging skill," it could show a sample replacement paragraph.

2. **No guidance on ai-maestro-message-templates.md** (because it was not reviewed). This file uses `amp-send.sh` which is actually closer to compliance than most violating files. A harmonization path would be to convert these to `agent-messaging` skill references.

3. **No guidance on whether bash fallback code should be behind a skill or remain inline.** The edge-case-protocols.md has intentional offline fallbacks using direct bash. The report notes this is intentional but does not recommend a concrete harmonization path (e.g., a `amcos-offline-fallback` operation procedure).

---

## 7. Verdict

| Aspect | Rating | Notes |
|--------|--------|-------|
| File inventory completeness | **PASS** | All 34 files accounted for, none missed |
| Violation claims accuracy | **MOSTLY PASS** | 1 false positive found (recovery-operations.md section 6.2), 1 file unreviewed (now reviewed, adds ~9 violations) |
| RECORD_KEEPING preservation | **PASS** | Consistently marked with PRESERVE tag and rationale |
| Harmonization guidance | **PARTIAL PASS** | Good principles but lacks concrete migration examples |
| Path inconsistency detection | **PASS** | Correctly identified and verified |
| Summary table accuracy | **NEEDS CORRECTION** | Executive summary totals disagree with detail table totals; ai-maestro-message-templates.md uncounted |

### Corrected Totals (incorporating ai-maestro-message-templates.md review)

| Violation Type | Original Report | Corrected |
|---|---|---|
| HARDCODED_API | 38-42 (inconsistent) | ~43 (+2 from templates, -1 false positive) |
| HARDCODED_GOVERNANCE | 17 | 17 (unchanged) |
| HARDCODED_AMP | 21 | ~28 (+7 from templates) |
| LOCAL_REGISTRY | 15 | 15 (unchanged) |
| RECORD_KEEPING | 21 | 21 (unchanged) |

---

*Verification completed: 2026-02-27*
