# EPCP PR Review-and-Fix Pipeline: Improvement Report

**Date:** 2026-02-23
**Based on:** 8 passes of the EPCP pipeline on the `feature/team-governance` branch
**Findings resolved across passes:** P1(49) P2(21) P3(21) P4(32) P5(142) P6(96) P7(17) P8(102) = 480 total

---

## 1. Issues Encountered

### 1.1 Stale Report Pollution (CRITICAL)

**Problem:** When a pipeline pass is interrupted and restarted (e.g., due to context compaction or rate limits), the prior run's report files remain in `docs_dev/`. The merge script's glob pattern `epcp-*-P{N}*.md` matches ALL files for that pass number, including stale ones from prior interrupted runs. This produces:
- Inflated raw finding counts in the intermediate report
- Duplicate/contradictory findings from different code states
- The dedup agent wastes effort processing noise

**Evidence (P7):** A stale `epcp-correctness-P7-268dc241.md` from a prior interrupted P7 run (domain "all-domains", a non-standard domain name) was included in the merge, adding 6 spurious findings. Stale `epcp-claims-P7-6648438e.md` and `epcp-review-P7-70ecbca4.md` were also merged. Manual intervention was required to rename the stale correctness report to `*-STALE.md` to exclude it, but the stale claims/review reports still contaminated the merge.

**Root cause:** The pipeline has no concept of a "run ID" within a pass. All files matching the pass number are treated as belonging to the current run.

---

### 1.2 Agent Rate Limits Mid-Execution (HIGH)

**Problem:** When fix agents hit API rate limits, they die mid-execution, potentially leaving:
- Partially applied code changes in the working tree (some files edited, others not)
- No fix report written (or incomplete report)
- No way for the orchestrator to know which fixes were applied vs. which weren't

**Evidence (P7):** 3 of 5 fix agents hit "You've hit your limit" errors. Recovery required:
1. `git diff --name-only` to identify which files were modified
2. `git diff {file}` for each modified file to verify the change was correct
3. Manual application of remaining fixes
4. Cross-referencing the review checklist to ensure nothing was missed

**Root cause:** No checkpoint/progress mechanism exists. Agents work atomically (all-or-nothing), but API limits make this impossible.

---

### 1.3 Lost Agent Task IDs During Context Compaction (HIGH)

**Problem:** When the orchestrator's context is summarized (compacted), background agent task IDs are lost. The orchestrator can no longer poll for results or check status.

**Evidence:** 4 of 10 Phase 1 agents and 3 of 5 Phase 2 fix agents had their task IDs lost. Recovery required:
1. `Glob` for `epcp-*-P7-*.md` to find all report files
2. `Read` first 5 lines of each to identify domain/phase
3. Cross-reference expected vs. found to identify missing reports

**Root cause:** Task IDs are ephemeral in-memory references. The context summary doesn't preserve them in a recoverable way.

---

### 1.4 False Positives from Stale Line Numbers (MEDIUM)

**Problem:** After multiple fix passes, line numbers in the codebase shift. Review agents cite line numbers based on their reading, but by the time the orchestrator processes the findings, prior commits may have shifted lines. This causes:
- Findings that reference wrong locations
- "Missing await" findings where the await actually exists (at a different line)
- Wasted orchestrator time verifying false positives

**Evidence (P7):** MF-001 and MF-002 cited `headless-router.ts:945` and `:953` for missing `await`, but grep confirmed the `await` was present at lines 1012 and 1020. The review agent used stale line references from before P4-P6 fixes shifted the code by ~70 lines.

**Root cause:** Review agents see the current file content but may cite line numbers that don't account for multi-pass drift. No mechanism to verify line-number accuracy before presenting findings.

---

### 1.5 Merge Script Lacks Run Isolation (MEDIUM)

**Problem:** The merge script (`epcp-merge-reports-v2.sh`) has no way to distinguish between:
- Current run's reports
- Prior interrupted run's reports
- Manually created/renamed reports

It uses a simple glob and includes everything. The only exclusion mechanisms are filename-based filters (`pr-review-*`, `epcp-fixes-*`, `epcp-tests-*`), which don't cover stale phase reports.

**Evidence:** The `*-STALE.md` rename hack worked for one file type but not others. Even after renaming, the script still included 2 stale files from a prior run.

---

### 1.6 No Checkpoint/Resume for Fix Agents (MEDIUM)

**Problem:** Fix agents receive a batch of findings and must fix all of them. If the agent dies mid-batch, there's no checkpoint to resume from. The replacement agent starts from scratch and may:
- Re-apply already-applied fixes (causing Edit conflicts)
- Miss the context of what was already done
- Waste tokens re-reading files that were already fixed

**Root cause:** Fix agents don't write incremental progress. They produce a single final report.

---

### 1.7 Dedup Agent Receives Noisy Input (LOW)

**Problem:** When stale reports pollute the merge, the dedup agent processes more findings than necessary. While it correctly handles duplicates (it removed 6 in P7), the extra work:
- Consumes tokens unnecessarily
- Increases risk of false dedup (merging genuinely different findings)
- Slows down the pipeline

---

### 1.8 Inconsistent Agent Domain Assignment (LOW)

**Problem:** The correctness swarm uses domain labels like `api-agents`, `api-other`, `services`, etc. But there's no canonical domain registry. When a pass is interrupted and restarted:
- Different agents may get different domain assignments
- A stale "all-domains" report from a prior run has no matching domain in the current run
- No validation that all expected domains have reports

---

### 1.9 Report File Proliferation (HIGH)

**Problem:** The pipeline generates an excessive number of report files in `docs_dev/`. Each pass produces:
- 10 correctness reports (one per domain)
- 1 claims report
- 1 skeptical review report
- 1 intermediate merged report
- 1 final deduplicated report
- N fix reports (one per domain)
- 1 test outcome report
- 1 lint outcome report (if Docker available)
- 1 agent manifest file
- N checkpoint files

That's ~20+ files per pass. Across 8 passes, this creates 140-160 files in a flat directory. This makes `docs_dev/` unusable for other purposes and makes it very hard to find the current pass's reports among the clutter.

**Evidence (P8):** `docs_dev/` contains 66+ files from previous passes, making it difficult to identify which reports are current vs. historical.

**Root cause:** The pipeline uses a flat file structure with no pass-level organization. All passes dump their reports into the same directory.

---

### 1.11 Fix Agent File Modification Tracking Gap (MEDIUM)

**Problem:** Fix agents claim to have modified N files in their reports, but the orchestrator has no way to verify these claims. In P8, `git status` showed 92 modified files but only 62 had actual diffs — the rest were touched by agents that opened files via Edit tool but didn't change content, or had whitespace-only changes that normalized. This discrepancy means:
1. The orchestrator cannot tell which fix agents silently failed to modify files
2. Some agents may report "FIXED" for findings they didn't actually fix
3. The commit may miss files that were supposed to be modified

**Impact:** Silent fix failures go undetected until the next review pass catches them, wasting an entire review-fix cycle.

**Proposed solution:** After all fix agents complete but before committing, the orchestrator should run `git diff --name-only` and cross-check against the union of all fix agents' claimed modifications. Any discrepancy (claimed but no diff, or unexpected diff) should be flagged and investigated.

### 1.12 Max Passes Limit Too Low (LOW)

**Problem:** The original MAX_PASSES of 10 was too optimistic. In practice, large PRs (200+ files) routinely require 15-25 passes because each fix pass can introduce new issues in adjacent code, and the review swarm catches progressively subtler issues.

**Resolution:** MAX_PASSES increased from 10 to 25 in SKILL.md.

### 1.10 Flat Report Structure Prevents Audit Trail Navigation (LOW)

**Problem:** When investigating a regression or understanding the history of a finding across passes, there's no easy way to navigate the audit trail. Reports from pass 3 are mixed with reports from pass 7, and the only way to distinguish them is by parsing the filename `P{N}` prefix.

---

## 2. Proposed Solutions

### 2.1 Run ID Isolation (Fixes 1.1, 1.5, 1.8)

**Proposal:** Generate a unique run ID at the start of each pass and embed it in ALL report filenames.

**Current pattern:**
```
epcp-correctness-P{N}-{uuid}.md
```

**Proposed pattern:**
```
epcp-correctness-P{N}-R{run_id}-{uuid}.md
```

Where `run_id` is a short 8-character hash generated once per pass invocation (e.g., first 8 chars of `uuidgen`).

**Implementation:**
1. Orchestrator generates `RUN_ID` at start of each pass
2. Passes `RUN_ID` to every spawned agent in the prompt
3. Agents include `R{RUN_ID}` in their output filename
4. Merge script takes `RUN_ID` as argument and only merges files matching that run
5. Stale files from prior runs are automatically excluded

**Merge script change:**
```bash
# New argument
RUN_ID="${3:?Error: run_id is required as third argument}"
PATTERN="epcp-*-P${PASS_NUMBER}-R${RUN_ID}-*.md"
```

**Cleanup rule:** At the start of each pass, the orchestrator lists files from prior runs (different `RUN_ID`) and moves them to a `docs_dev/archive/` subdirectory instead of deleting them. This preserves the audit trail while preventing pollution.

---

### 2.2 Agent Progress Checkpointing (Fixes 1.2, 1.6)

**Proposal:** Fix agents write incremental progress to a checkpoint file as they resolve each finding.

**Checkpoint file format:**
```json
{
  "runId": "a1b2c3d4",
  "pass": 7,
  "domain": "ui-components",
  "agentUuid": "xxxx-yyyy",
  "findings": [
    {"id": "SF-001", "status": "fixed", "file": "AgentProfileTab.tsx", "timestamp": "..."},
    {"id": "SF-002", "status": "fixed", "file": "AgentProfileTab.tsx", "timestamp": "..."},
    {"id": "SF-003", "status": "in_progress", "file": "TerminalView.tsx", "timestamp": "..."}
  ]
}
```

**Path:** `docs_dev/epcp-checkpoint-P{N}-R{RUN_ID}-{domain}.json`

**Recovery protocol:** When an agent dies and is re-spawned:
1. Check for existing checkpoint file for this domain/pass/run
2. Read which findings were already marked "fixed"
3. Verify the fixes are actually applied (read the files)
4. Skip already-fixed findings, continue with remaining ones

**Orchestrator recovery:** When the orchestrator detects a dead agent:
1. Read the checkpoint file
2. Identify which findings remain unfixed
3. Spawn a replacement agent with only the remaining findings
4. The replacement agent starts from the checkpoint, not from scratch

---

### 2.3 Agent Registry File (Fixes 1.3)

**Proposal:** Write a manifest file at the start of each pass that records all spawned agents, their expected output files, and their status.

**Manifest file:** `docs_dev/epcp-agents-P{N}-R{RUN_ID}.json`

```json
{
  "pass": 7,
  "runId": "a1b2c3d4",
  "phase": "correctness",
  "agents": [
    {
      "domain": "api-agents",
      "prefix": "A0",
      "taskId": "abc123",
      "expectedOutput": "epcp-correctness-P7-Ra1b2c3d4-{uuid}.md",
      "status": "running",
      "launchedAt": "2026-02-22T22:00:00Z"
    }
  ]
}
```

**Recovery protocol:** When task IDs are lost after compaction:
1. Read the manifest file (it's on disk, survives compaction)
2. For each agent, check if `expectedOutput` exists and is complete
3. Mark completed agents, re-spawn incomplete ones

This eliminates the current recovery pattern of "glob for files, read first 5 lines to guess which domain they belong to."

---

### 2.4 Line Number Verification in Review Agents (Fixes 1.4)

**Proposal:** Add a verification step to the correctness agent instructions:

> After identifying a finding, verify the line number by re-reading the file at that location. If the line content doesn't match what you expected (e.g., the code you're citing has moved), update the line number in your finding. Report the ACTUAL line number where the issue exists, not the line number from a stale mental model.

Additionally, the dedup agent should be instructed:

> When a finding cites a specific line number, verify that the cited code actually exists at that line. If the code is at a different line, update the reference. If the code doesn't exist at all (was already fixed), mark the finding as RETRACTED.

---

### 2.5 Pre-Pass Cleanup Protocol (Fixes 1.1, 1.5)

**Proposal:** Before starting each pass, run a deterministic cleanup:

```bash
# Move ALL prior intermediate/phase reports for this pass number to archive
# (regardless of run ID — catches files from before run ID was implemented)
mkdir -p docs_dev/archive
for f in docs_dev/epcp-*-P${PASS_NUMBER}-*.md; do
  [ -f "$f" ] && mv "$f" docs_dev/archive/
done
for f in docs_dev/pr-review-P${PASS_NUMBER}-*.md; do
  [ -f "$f" ] && mv "$f" docs_dev/archive/
done
```

This ensures a clean slate before agents start writing. Combined with run ID isolation (2.1), this provides defense-in-depth against stale file pollution.

**Important:** Archive, don't delete. The files form an audit trail and may be useful for debugging pipeline issues.

---

### 2.6 Atomic Fix Agent Pattern (Fixes 1.2)

**Proposal:** Change the fix agent protocol to use git stash for atomicity:

1. Before fixing, `git stash push -m "pre-fix-P{N}-{domain}"`
2. Apply all fixes
3. If all fixes succeed → `git stash drop`
4. If agent dies → orchestrator runs `git stash pop` to restore clean state

**Alternative (simpler):** The orchestrator creates a throwaway branch before spawning fix agents:

```bash
git checkout -b fix-pass-{N}-attempt-{M}
# Spawn fix agents
# If all succeed → merge back to feature branch
# If agents die → delete the throwaway branch, retry on a fresh one
```

This is cleaner than manual verification of partial changes.

---

### 2.7 Pass-Level Directory Structure (Fixes 1.9, 1.10)

**Proposal:** Organize reports into per-pass subdirectories instead of a flat structure.

**Current structure (flat — 140+ files):**
```
docs_dev/
  epcp-correctness-P1-R{run}-{uuid1}.md
  epcp-correctness-P1-R{run}-{uuid2}.md
  ...
  epcp-claims-P1-R{run}-{uuid}.md
  epcp-review-P1-R{run}-{uuid}.md
  pr-review-P1-intermediate-{ts}.md
  pr-review-P1-{ts}.md
  epcp-fixes-done-P1-api-agents.md
  epcp-tests-outcome-P1.md
  ... (× 8 passes = 140+ files)
```

**Proposed structure (hierarchical — clean navigation):**
```
docs_dev/
  epcp/
    P1/
      correctness/       # All 10 domain reports
      claims/            # 1 claims report
      review/            # 1 skeptical review
      merged/            # intermediate + final
      fixes/             # fix reports per domain
      tests/             # test outcome
      lint/              # lint outcome + megalinter
      manifest.json      # agent manifest
      checkpoints/       # fix agent checkpoints
    P2/
      ...
    P8/
      ...
    FINAL.md             # Final clean report
```

**Benefits:**
- `docs_dev/` stays clean (just `epcp/` directory + other dev docs)
- Easy to navigate: `ls docs_dev/epcp/P8/correctness/` shows all domain reports for pass 8
- Easy to archive: `mv docs_dev/epcp/P1 docs_dev/epcp/archive/P1` cleans up old passes
- Finding counts per pass: `grep -r "### \[CC-" docs_dev/epcp/P8/correctness/ | wc -l`
- Audit trail preserved: all passes remain accessible under `epcp/P{N}/`

**Implementation in SKILL.md:**
1. At pass start: `mkdir -p docs_dev/epcp/P${PASS_NUMBER}/{correctness,claims,review,merged,fixes,tests,lint,checkpoints}`
2. Update all agent prompts to write to subdirectory paths
3. Update merge script to read from `docs_dev/epcp/P${N}/correctness/` and write to `docs_dev/epcp/P${N}/merged/`
4. Update cleanup protocol: archive entire `P{N}` directories instead of individual files

---

### 2.8 Skill File Improvements

**Proposed changes to `pr-review-and-fix/SKILL.md`:**

1. **Add RUN_ID generation at the top of each pass:**
   ```
   RUN_ID=$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -c1-8)
   ```

2. **Add pre-pass cleanup step** before spawning Phase 1 agents.

3. **Add agent manifest creation** after spawning agents.

4. **Add checkpoint protocol** to fix agent prompts.

5. **Update merge script invocation** to pass RUN_ID.

6. **Add recovery section** for when agents are lost — reference the manifest file instead of ad-hoc glob+read patterns.

7. **Add explicit "verify line numbers" instruction** to correctness agent prompts.

8. **Add rate-limit handling:** If a fix agent fails, check the checkpoint file before deciding whether to re-spawn or manually finish.

---

## 3. Priority Matrix

| Solution | Fixes | Effort | Impact | Priority |
|----------|-------|--------|--------|----------|
| 2.1 Run ID Isolation | 1.1, 1.5, 1.8 | Medium | High | **P0** |
| 2.5 Pre-Pass Cleanup | 1.1, 1.5 | Low | High | **P0** |
| 2.7 Pass-Level Directories | 1.9, 1.10 | Medium | High | **P0** |
| 2.3 Agent Registry File | 1.3 | Low | Medium | **P1** |
| 2.2 Checkpoint Protocol | 1.2, 1.6 | Medium | Medium | **P1** |
| 2.4 Line Number Verification | 1.4 | Low | Medium | **P1** |
| 2.6 Atomic Fix Pattern | 1.2 | Medium | Medium | **P2** |
| 2.8 Skill File Updates | All | Medium | High | **P1** |

---

## 4. Implementation Plan

### Phase A: Immediate (merge script + skill cleanup)

1. Update `epcp-merge-reports-v2.sh` to accept `RUN_ID` parameter
2. Add pre-pass cleanup to the skill PROCEDURE 1 section
3. Add agent manifest creation to the skill
4. Add "verify line numbers" instruction to correctness agent prompts

### Phase B: Next iteration (checkpointing + recovery)

1. Add checkpoint protocol to fix agent prompt instructions
2. Add checkpoint-aware recovery to the skill's error handling section
3. Add rate-limit handling section to the skill

### Phase C: Future (atomicity)

1. Implement throwaway branch pattern for fix agents
2. Add automatic cleanup of archived reports after 30 days

---

## 5. Appendix: Full Pass History

| Pass | Raw Findings | After Dedup | Fixed | Tests | Commit |
|------|-------------|-------------|-------|-------|--------|
| 1 | ~60 | 49 | 49 | 780/780 | 7796e52 |
| 2 | ~25 | 21 | 21 | 780/780 | f6b89d8 |
| 3 | ~25 | 21 | 21 | 780/780 | db8b9bf |
| 4 | ~40 | 32 | 32 | 780/780 | 0a6b95e |
| 5 | ~160 | 142 | 142 | 867/867 | b4b7782+45f89bf |
| 6 | ~110 | 96 | 96 | 867/867 | (prior commit) |
| 7 | 29 | 17 | 17 | 867/867 | ff4a833 |
| **Total** | | **378** | **378** | | |
