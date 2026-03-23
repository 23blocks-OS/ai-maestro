# Code Check Report

- **File**: `/Users/emanuelesabetta/Code/EMASOFT-INTEGRATOR-AGENT/ai-maestro-integrator-agent/skills/amia-quality-gates/SKILL.md`
- **Task**: You are analyzing the "AI Maestro Integrator Agent" (AMIA) plugin. The integrator manages code reviews, PR integration, CI/CD quality gates, and kanban card movements for reviewed items.

For each file, extract:
1. KANBAN COLUMNS: What columns does the integrator interact with? What column transitions does it trigger?
2. REVIEW FLOW: How does the integrator receive review assignments? How does it report results?
3. ORCHESTRATOR INTERACTION: How does the integrator communicate with the orchestrator? What protocols?
4. QUALITY GATES: What conditions must be met before a task passes review?
5. GITHUB SYNC: How does the integrator sync task status with GitHub Projects V2?
6. PR WORKFLOW: What is the PR lifecycle managed by the integrator?
7. NOTIFICATION: How does the integrator notify the orchestrator and programmer agents of review results?

Extract exact column names, message formats, API patterns, and workflow steps.
- **Model**: `minimax/minimax-m2.5`

---

The user wants me to analyze the "AI Maestro Integrator Agent" (AMIA) plugin based on the provided markdown file. They've given me specific questions to answer about:
1. KANBAN COLUMNS
2. REVIEW FLOW
3. ORCHESTRATOR INTERACTION
4. QUALITY GATES
5. GITHUB SYNC
6. PR WORKFLOW
7. NOTIFICATION

However, I notice they've only provided one file - the SKILL.md file for amia-quality-gates. This is a skill definition file, not the actual implementation code. The task asks me to extract specific details about the integrator, but the actual code/implementation files aren't attached.

Let me analyze what I can extract from this SKILL.md file:

1. **KANBAN COLUMNS**: The file mentions "kanban card movements for reviewed items" in the task description, but the SKILL.md itself doesn't explicitly list kanban columns. It does mention gates (Pre-Review, Review, Pre-Merge, Post-Merge) which could be considered as columns or states.

2. **REVIEW FLOW**: 
   - Identified from PR labels (no label = Pre-Review)
   - Four gates: Pre-Review, Review, Pre-Merge, Post-Merge
   - Uses labels to track gate status
   - Applies decision labels (passed/failed/warning)

3. **ORCHESTRATOR INTERACTION**: The skill is invoked with `/amia-enforce-gates`. It's part of the "amia-main" agent. The output mentions JSON format with specific fields.

4. **QUALITY GATES**: 
   - Pre-Review: tests/lints
   - Review: 8-dim review
   - Pre-Merge: CI/conflicts
   - Post-Merge: main health
   - Blocking conditions and escalation paths

5. **GITHUB SYNC**: Uses GitHub CLI (`gh`), GitHub labels, PR comments
   - PR workflow involves four distinct gates: Pre-Review, Review, Pre-Merge, and Post-Merge
   - Notifications include decision labels,Based on the provided `SKILL.md` file for `amia-quality-gates`, here is the analysis:

 PR comments, and escalation triggers---

# AMIA Quality Gates Analysis

## 1. KANBAN COLUMNS

**Columns/States Identified:**
The integrator uses a **four-gate pipeline** as its workflow states:

| Gate | Trigger Condition |
|------|-------------------|
| Pre-Review | Default (no label) |
| Review | Passed Pre-Review |
| Pre-Merge | Passed Review |
| Post-Merge | Passed Pre-Merge |

**Note:** The SKILL.md does not explicitly list Kanban board column names from GitHub Projects V2. The gates appear to be tracked via GitHub labels rather than direct Kanban column movements.

---

## 2. REVIEW FLOW

**How assignments are received:**
- Invoked via `/amia-enforce-gates` command (from orchestrator or programmer agents)
- Script execution: `python scripts/amia_quality_gate_check.py --repo owner/repo --pr 42`

**How results are reported:**
- Output format: JSON (to stdout or file with `--output-file <path>`)
- Decision labels applied: `passed` / `failed` / `warning`
- If passed: advance to next gate
- If failed: apply failure label, escalate, document in PR comments

---

## 3. ORCHESTRATOR INTERACTION

**Protocol:**
- Trigger: `/amia-enforce-gates` command
- Agent context: `agent: amia-main` (line 10)
- Context type: `context: fork`

**Output format:**
```json
{
  "gate_status": "pass|fail|warning",
  "gate": "pre-review|review|pre-merge|post-merge",
  "checks_passed": <number>,
  "checks_failed": <number>
}
```

---

## 4. QUALITY GATES

| Gate | Checks Performed |
|------|------------------|
| **Pre-Review** | tests, lints |
| **Review** | 8-dimensional review (see `amia-code-review-patterns`) |
| **Pre-Merge** | CI checks, conflict detection |
| **Post-Merge** | main branch health |

**Blocking conditions:**
- Non-zero exit codes from scripts indicate failure
- Failure triggers escalation paths (A/B/C/D)

**Override handling:**
- Verify authority
- Document justification
- Apply `gate:override-applied` label

---

## 5. GITHUB SYNC

**Methods:**
- **GitHub CLI (`gh`)** - authenticated CI/CD pipeline required
- **Labels** - from `amia-label-taxonomy` skill
- **PR Comments** - for documenting failures and escalations

**Sync mechanisms:**
- Labels applied/removed to track gate progression
- PR comments document decisions and escalations

---

## 6. PR WORKFLOW

**Lifecycle:**
1. **Pre-Review** → (checks: tests/lints) → Pass/Fail
2. **Review** → (checks: 8-dim review) → Pass/Fail
3. **Pre-Merge** → (checks: CI/conflicts) → Pass/Fail
4. **Post-Merge** → (checks: main health) → Complete

**Label progression:**
- Decision labels mark pass/fail/warning
- Failure labels trigger escalation
- `gate:override-applied` for override authority

---

## 7. NOTIFICATION

**Escalation paths:**
- Four escalation paths: A, B, C, D (defined in `references/escalation-paths.md`)
- Documented in PR comments
- Notifications sent to relevant parties

**Output fields for notifications:**
| Field | Purpose |
|-------|---------|
| Gate Status | Current gate and decision |
| Check Results | All checks with outcomes |
| Labels Applied | Labels added/removed |
| Escalation Actions | Notifications sent |
| Next Steps | Pipeline continuation |

---

## LIMITATIONS

The provided `SKILL.md` is a **definition file** - it describes the skill interface but does not contain the actual implementation code. To extract exact column names from GitHub Projects V2, message formats, and concrete API patterns, I would need access to:

1. `scripts/amia_quality_gate_check.py` - the actual gate check script
2. `references/gate-pipeline.md` - pipeline flow details
3. `references/escalation-paths.md` - escalation definitions
4. Any code files that interact with GitHub Projects V2 API