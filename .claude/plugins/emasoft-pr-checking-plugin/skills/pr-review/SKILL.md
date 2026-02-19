---
name: pr-review-pipeline
description: >
  Use when reviewing PRs, auditing code, or running pre-merge quality gates.
  Trigger with "review the PR", "check the PR", "audit the PR", "pre-merge review".
version: 1.0.0
author: Emasoft
license: MIT
tags:
  - pr-review
  - code-audit
  - claim-verification
  - quality-gate
---

# PR Review Pipeline

## Overview

Three-phase PR review that catches what standard code audits miss. Spawns specialized agents
in sequence: correctness swarm, claim verification, skeptical review — then merges findings.

## Prerequisites

- `gh` CLI installed and authenticated (for `gh pr view`, `gh pr diff`)
- The PR must exist on GitHub (need PR number or branch name)
- `docs_dev/` directory must exist for report output
- The merge script at `$CLAUDE_PLUGIN_ROOT/scripts/epcp-merge-reports.sh` must be executable

## Use when

- Before pushing a PR to an upstream repository
- After completing a feature branch and wanting a pre-merge quality gate
- When asked to "review the PR", "check the PR", "audit the PR", or "pre-merge review"
- After a swarm of code audit agents has already run (this catches what they miss)

## Why this exists

In a real incident, 20+ specialized audit agents checked a 40-file PR and found zero issues.
A single external reviewer then immediately found 3 real bugs — including a function that
claimed to populate 4 fields but actually populated zero of them. The audit swarm checked
code correctness per-file; the reviewer checked claims against reality.

This pipeline automates the three complementary review perspectives needed to catch 100% of
issues:

| Phase | Agent | What it catches | Analogy |
|-------|-------|-----------------|---------|
| 1 | Code Correctness (swarm) | Per-file bugs, type errors, security | Microscope |
| 2 | Claim Verification (single) | PR description lies, missing implementations | Fact-checker |
| 3 | Skeptical Review (single) | UX concerns, cross-file issues, design judgment | Telescope |

## Protocol

### Prerequisites

Before starting, gather:
1. The PR number (or branch name)
2. The PR description text
3. The list of changed files grouped by domain

### Phase 1: Code Correctness Swarm

Spawn **one `epcp-code-correctness-agent` per domain** in parallel.

Group changed files by domain. Common domain splits:

| Domain | File patterns |
|--------|--------------|
| shell-scripts | `*.sh`, `install-*.sh`, `update-*.sh` |
| agent-registry | `lib/agent-registry.ts`, `types/agent.ts` |
| messaging | `lib/messageQueue.ts`, `app/api/messages/**` |
| terminal | `hooks/useTerminal.ts`, `components/TerminalView.tsx` |
| ui-components | `components/*.tsx`, `app/page.tsx` |
| api-routes | `app/api/**/*.ts` |
| memory | `lib/consolidate.ts`, `lib/cozo-*.ts` |
| docs | `docs/**`, `README.md` |
| tests | `tests/**` |
| config | `package.json`, `version.json`, `*.config.*` |

**Spawning pattern:**

```
For each domain with changed files:
  Task(
    subagent_type: "epcp-code-correctness-agent",
    prompt: """
      DOMAIN: {domain_name}
      FILES: {file_list}
      REPORT_PATH: docs_dev/epcp-correctness-{domain_name}.md

      Audit these files for code correctness. Read every file completely.
      Write findings to the report path.

      REPORTING RULES:
      - Write ALL detailed output to the report file
      - Return to orchestrator ONLY: "[DONE/FAILED] correctness-{domain} - brief result. Report: {path}"
      - Max 2 lines back to orchestrator
    """,
    run_in_background: true
  )
```

**Wait for all Phase 1 agents to complete before proceeding.**

### Phase 2: Claim Verification

Spawn **one `epcp-claim-verification-agent`** (single instance, not a swarm).

This agent needs:
- The full PR description (get via `gh pr view {number} --json body --jq .body`)
- All commit messages (get via `gh pr view {number} --json commits`)
- Access to the full codebase to verify claims

**Spawning pattern:**

```
Task(
  subagent_type: "epcp-claim-verification-agent",
  prompt: """
    PR_NUMBER: {pr_number}
    PR_DESCRIPTION: (read from `gh pr view {number} --json body --jq .body`)
    COMMIT_MESSAGES: (read from `gh pr view {number} --json commits`)
    REPORT_PATH: docs_dev/epcp-claims.md

    Extract every factual claim from the PR description and commit messages.
    Verify each claim against the actual code.
    Write findings to the report path.

    REPORTING RULES:
    - Write ALL detailed output to the report file
    - Return to orchestrator ONLY: "[DONE/FAILED] claim-verification - brief result. Report: {path}"
    - Max 2 lines back to orchestrator
  """,
  run_in_background: true
)
```

**Wait for Phase 2 to complete before proceeding.**

Phase 2 runs AFTER Phase 1 so it can optionally reference correctness findings
to avoid duplicating effort. However, it MUST NOT skip its own verification —
correctness agents check different things than claim verification.

### Phase 3: Skeptical Review

Spawn **one `epcp-skeptical-reviewer-agent`** (single instance).

This agent needs:
- The full PR diff (get via `gh pr diff {number}`)
- The PR description
- Optionally, the Phase 1 and Phase 2 reports for cross-reference

**Spawning pattern:**

```
Task(
  subagent_type: "epcp-skeptical-reviewer-agent",
  prompt: """
    PR_NUMBER: {pr_number}
    PR_DESCRIPTION: (provide the text or path)
    DIFF: (save `gh pr diff {number}` to docs_dev/pr-diff.txt and provide path)
    CORRECTNESS_REPORTS: docs_dev/epcp-correctness-*.md
    CLAIMS_REPORT: docs_dev/epcp-claims.md
    REPORT_PATH: docs_dev/epcp-review.md

    Review this PR as an external maintainer who has never seen the codebase.
    Read the full diff holistically. Check for UX concerns, breaking changes,
    cross-file consistency, and design judgment issues.
    Write findings to the report path.

    REPORTING RULES:
    - Write ALL detailed output to the report file
    - Return to orchestrator ONLY: "[DONE/FAILED] skeptical-review - Verdict: X, brief result. Report: {path}"
    - Max 2 lines back to orchestrator
  """,
  run_in_background: true
)
```

### Phase 4: Merge Reports

After all 3 phases complete, run the merge script:

```bash
bash $CLAUDE_PLUGIN_ROOT/scripts/epcp-merge-reports.sh docs_dev/
```

This produces a timestamped final report at `docs_dev/pr-review-YYYY-MM-DD-HHMMSS.md`.

**Exit code 1 means MUST-FIX issues were found — do NOT push the PR until they're resolved.**

### Phase 5: Present Results

Read the final report and present a summary to the user:

```
## PR Review Complete

**Verdict:** {REQUEST CHANGES / APPROVE WITH NITS / APPROVE}
**MUST-FIX:** {count} | **SHOULD-FIX:** {count} | **NIT:** {count}

### Must-Fix Issues:
1. [CC-001] {title} — {file:line}
2. [CV-003] {title} — {file:line}

### Should-Fix:
1. [SR-002] {title}

### Full report: docs_dev/pr-review-{timestamp}.md
```

## CRITICAL RULES

1. **NEVER skip Phase 2 and 3.** The correctness swarm alone is insufficient. It will miss
   claimed-but-not-implemented features, cross-file inconsistencies, and UX concerns.
   Phase 2 and 3 are what make this pipeline catch 100% of issues.

2. **Phase order matters.** Phase 1 (parallel) → Phase 2 (sequential) → Phase 3 (sequential).
   Later phases can reference earlier reports to avoid duplicate work, but they must NOT
   skip their own checks.

3. **Each agent writes to a file.** Agents return only 1-2 lines to the orchestrator.
   Full findings go in the report files. This prevents context flooding.

4. **The merge script deduplicates.** If Phase 1 and Phase 3 find the same issue, it only
   appears once in the final report.

5. **Exit code 1 = block the PR.** If the merge script returns exit code 1, there are
   MUST-FIX issues. Do not push the PR until they're resolved and the pipeline re-run.

6. **Re-run after fixes.** After fixing issues, re-run the full pipeline to verify the fixes
   are correct and didn't introduce new issues.

## Quick Reference

```
# Full pipeline
/pr-review 206

# Just claim verification (fastest, catches the most common misses)
# Spawn epcp-claim-verification-agent manually

# Just skeptical review (for a quick holistic check)
# Spawn epcp-skeptical-reviewer-agent manually
```

## Instructions

Follow the 5-phase protocol strictly:

1. Gather the PR number, description, and list of changed files grouped by domain.
2. Spawn one `epcp-code-correctness-agent` per domain in parallel (Phase 1 swarm).
3. Wait for all Phase 1 agents to complete before proceeding.
4. Spawn a single `epcp-claim-verification-agent` with the PR description and commit messages (Phase 2).
5. Wait for Phase 2 to complete before proceeding.
6. Spawn a single `epcp-skeptical-reviewer-agent` with the full diff and earlier reports (Phase 3).
7. Wait for Phase 3 to complete.
8. Run the merge script: `bash $CLAUDE_PLUGIN_ROOT/scripts/epcp-merge-reports.sh docs_dev/`
9. Read the final merged report and present the verdict summary to the user.
10. If exit code 1 (MUST-FIX issues), do NOT push the PR until issues are resolved and pipeline re-run.

## Output

The pipeline produces:
- Per-domain correctness reports: `docs_dev/epcp-correctness-{domain}.md`
- Claim verification report: `docs_dev/epcp-claims.md`
- Skeptical review report: `docs_dev/epcp-review.md`
- Final merged report: `docs_dev/pr-review-YYYY-MM-DD-HHMMSS.md`

Final report includes: verdict (APPROVE/REQUEST CHANGES/REJECT), all deduplicated issues
with severity (MUST-FIX/SHOULD-FIX/NIT), and a checklist of what needs fixing.

## Error Handling

- If any Phase 1 agent fails, re-run it for that domain only
- If Phase 2 or 3 fails, re-run that phase (they are single agents)
- If the merge script exits with code 1, MUST-FIX issues exist — do NOT push the PR
- If `gh` CLI is not authenticated, stop and ask the user to run `gh auth login`

## Examples

```
# Full pipeline on PR 206
User: "review PR 206"
→ Skill activates, runs all 5 phases, presents merged verdict

# Quick claim check only
User: "just verify the claims in PR 206"
→ Spawn only epcp-claim-verification-agent

# Re-run after fixes
User: "re-run the PR review"
→ Full pipeline again to verify fixes didn't introduce new issues
```

## Resources

- Merge script: `$CLAUDE_PLUGIN_ROOT/scripts/epcp-merge-reports.sh`
- Agents: `$CLAUDE_PLUGIN_ROOT/agents/`
- Report output directory: `docs_dev/`

## Lessons Learned (Baked Into This Pipeline)

1. **Swarms are microscopes.** Great at per-file correctness. Blind to the big picture.
2. **PR descriptions lie.** Not maliciously — authors believe they implemented what they described.
   The gap between intent and implementation is the #1 source of missed bugs.
3. **Absence is the hardest bug to find.** A missing field assignment produces no error, no warning,
   no test failure. The code compiles and runs fine. Only a claim verifier or skeptical reviewer
   will notice that `fromLabel` is declared in the type but never set in the return statement.
4. **Cross-file consistency requires holistic view.** Version "0.22.5" in JSON-LD but "0.22.4"
   in prose HTML — each file is internally valid, but together they're inconsistent.
5. **UX judgment is not a code concern.** Auto-copying clipboard on text selection is technically
   correct code. Whether it's a good idea requires a different kind of thinking.
6. **The stranger's perspective is irreplaceable.** Twenty agents who know the codebase missed
   what one agent pretending to be a stranger caught immediately. Fresh eyes see what familiarity
   blinds you to.
