# Code Check Report

- **File**: `/Users/emanuelesabetta/Code/EMASOFT-INTEGRATOR-AGENT/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/SKILL.md`
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

The user wants me to analyze the "AI Maestro Integrator Agent" (AMIA) plugin based on the provided SKILL.md file. Let me extract the requested information from this file.

Let me go through each item:

1. **KANBAN COLUMNS**: What columns does the integrator interact with? What column transitions does it trigger?
   - The file doesn't explicitly mention kanban columns. It talks about PR workflow, but not specific kanban columns in GitHub Projects.

2. **REVIEW FLOW**: How does the integrator receive review assignments? How does it report results?
   - From the instructions: "Poll -- Run `amia_orchestrator_pr_poll.py` to get open PRs"
   - "Delegate -- Spawn subagent for review/changes"
   - "Verify -- Run `amia_verify_pr_completion.py` before reporting"
   - Results are reported as JSON: `{"complete": true, "recommendation": "ready_to_merge"}`

3. **ORCHESTRATOR INTERACTION**: How does the integrator communicate with the orchestrator? What protocols?
   - The skill is for the "api-coordinator" agent
   - Uses task spawning for subagent delegation
   - Scripts output to files using `--output-file <path>`

4. **QUALITY GATES**: What conditions must be met before a task passes review?
   - The file mentions "verification" but doesn't detail specific quality gates
   - The verification script returns "Pass/fail status for all completion criteria"

5. **GITHUB SYNC**: How does the integrator sync task status with GitHub Projects V2?
   - Not explicitly mentioned in this file

6. **PR WORKFLOW**: What is the PR lifecycle managed by the integrator?
   - Poll PRs → Classify (human vs AI/bot) → Delegate → Monitor → Verify → Report → Handle failures

7. **NOTIFICATION**: How does the integrator notify the orchestrator and programmer agents of review results?
   - Uses output files to minimize token consumption
   - Status reports delivered as text or JSON format

The SKILL.md provides a high-level overview of the orchestrator's PR review workflow, but lacks specific details about kanban columns, GitHub Projects synchronization, quality gates, and notification mechanisms. These would likely be in the reference documents or scripts mentioned in the file.
# Analysis of AI Maestro Integrator Agent (AMIA) Plugin

Based on the provided `SKILL.md` file, here is the extracted information:

---

## 1. KANBAN COLUMNS

**Not explicitly defined in this file.** The SKILL.md focuses on PR workflow orchestration but does not specify GitHub Projects V2 column names or transitions. The integrator appears to operate at the PR level rather than directly manipulating kanban columns.

---

## 2. REVIEW FLOW

**How assignments are received:**
- **Poll** — Run `amia_orchestrator_pr_poll.py` to get open PRs (line 28)
- Triggered with `/start-pr-review [PR_NUMBER]` (line 9)

**How results are reported:**
- **Verify** — Run `amia_verify_pr_completion.py` before reporting (line 30)
- Output formats (line 36-39):
  | Output Type | Format | Description |
  |---|---|---|
  | Subagent Delegation | Task spawn | Spawned subagent with PR review/fix instructions |
  | Status Report | Text/JSON | Current PR status and action recommendations |
  | Verification Result | JSON | Pass/fail status for all completion criteria |
  | User Notification | Text | Human-readable summary of PR readiness |

**Example output:**
```json
{"complete": true, "recommendation": "ready_to_merge"}
```

---

## 3. ORCHESTRATOR INTERACTION

**Agent type:** `api-coordinator` (line 12)

**Communication protocol:**
- **Task spawning** — Spawn subagents for review/fix work (line 29)
- **Never do work yourself** — Delegate to subagent (line 29)
- **Never block** — Poll progress via background tasks (line 30)

**Output discipline:**
- All scripts support `--output-file <path>` to minimize token consumption (line 41-42)

---

## 4. QUALITY GATES

**Not explicitly detailed in this file.** The SKILL.md states:
- Run `amia_verify_pr_completion.py` to verify completion criteria (line 30)
- Returns "Pass/fail status for all completion criteria" (line 38)
- Specific conditions would be in `references/detailed-guide.md` (line 45)

---

## 5. GITHUB SYNC

**Not explicitly defined in this file.** The PR polling uses `gh` CLI (line 17), but GitHub Projects V2 column synchronization is not specified. Likely covered in `references/detailed-guide.md`.

---

## 6. PR WORKFLOW

**Lifecycle steps (lines 28-33):**

1. **Poll** — Run `amia_orchestrator_pr_poll.py` to get open PRs
2. **Classify** — Human PR = escalate; AI/bot PR = delegate directly
3. **Delegate** — Spawn subagent for review/changes (never do work yourself)
4. **Monitor** — Poll progress via background tasks (never block)
5. **Verify** — Run `amia_verify_pr_completion.py` before reporting
6. **Report** — Report to user, await merge decision
7. **Handle failures** — Delegate fixes

**Critical rules (lines 34-37):**
- Never block, write code, or merge without user approval
- Always verify before reporting status
- Escalate human PRs to user

---

## 7. NOTIFICATION

**To orchestrator/programmer agents:**
- **Output files** — Use `--output-file <path>` to minimize token consumption (line 41-42)
- **Status Report** — Text/JSON format for current PR status and action recommendations
- **User Notification** — Human-readable summary of PR readiness

---

## Summary of Missing Information

The provided `SKILL.md` is a high-level orchestration skill that references external scripts and detailed guides for specifics:

| Item | Status |
|---|---|
| Kanban columns | Not defined — see `references/detailed-guide.md` |
| Quality gates | Not defined — see `amia_verify_pr_completion.py` |
| GitHub Projects V2 sync | Not defined — see `references/detailed-guide.md` |
| Exact column names | Not defined |
| Message formats | Partially defined (JSON verification output) |

**To complete this analysis, the following files would be needed:**
- `amia_orchestrator_pr_poll.py`
- `amia_verify_pr_completion.py`
- `references/detailed-guide.md`