# Audit Report: pr-review-and-fix/SKILL.md

**Date:** 2026-02-22
**File:** `/Users/emanuelesabetta/ai-maestro/.claude/plugins/emasoft-pr-checking-plugin/skills/pr-review-and-fix/SKILL.md`
**Lines:** 900

---

## 1. Structure

| Section | Present | Line(s) |
|---------|---------|---------|
| YAML Frontmatter | YES | 1-15 |
| Overview | YES | 17-50 |
| Prerequisites | YES | 52-58 |
| Use When | YES | 60-64 |
| Why This Exists | YES | 66-81 |
| Pass Counter Management | YES | 85-102 |
| Report Naming Convention | YES | 104-164 |
| PROCEDURE 1 -- Code Review | YES | 167-395 |
| PROCEDURE 2 -- Code Fix | YES | 398-554 |
| Loop Termination | YES | 557-611 |
| Critical Rules | YES | 615-658 |
| Error Handling | YES | 662-673 |
| Agent Recovery Protocol | YES | 677-844 |
| Resources | YES | 848-854 |
| Instructions | YES | 856-867 |
| Examples | YES | 869-879 |
| Lessons Learned | YES | 881-900 |

**Verdict: PASS** -- All 17 expected sections are present and in logical order.

---

## 2. Agent References

Referenced agents in the SKILL.md and their existence in `$CLAUDE_PLUGIN_ROOT/agents/`:

| Agent Type | Referenced At | File Exists |
|------------|-------------|-------------|
| `epcp-code-correctness-agent` | Line 179 | YES (`agents/epcp-code-correctness-agent.md`) |
| `epcp-claim-verification-agent` | Line 241 | YES (`agents/epcp-claim-verification-agent.md`) |
| `epcp-skeptical-reviewer-agent` | Line 287 | YES (`agents/epcp-skeptical-reviewer-agent.md`) |
| `epcp-dedup-agent` | Line 352 | YES (`agents/epcp-dedup-agent.md`) |

**Verdict: PASS** -- All 4 referenced agent types have corresponding `.md` files in the plugin's `agents/` directory.

---

## 3. Script References

Referenced scripts and their existence in `$CLAUDE_PLUGIN_ROOT/scripts/`:

| Script Path | Referenced At | File Exists | Executable |
|-------------|-------------|-------------|-----------|
| `$CLAUDE_PLUGIN_ROOT/scripts/epcp-merge-reports-v2.sh` | Lines 57, 334, 849 | YES | YES (`-rwxr-xr-x`) |
| `$CLAUDE_PLUGIN_ROOT/scripts/epcp-merge-reports.sh` | Line 850 (legacy) | YES | YES (`-rwxr-xr-x`) |

**Verdict: PASS** -- All referenced scripts exist and are executable.

---

## 4. Finding ID Format

| Phase | Prefix Format | Documented At | Consistent |
|-------|--------------|---------------|-----------|
| Phase 1 (correctness swarm) | `CC-P{N}-A{hex}-{NNN}` | Lines 139-141, 201-202, 225, 644-646 | YES |
| Phase 2 (claims) | `CV-P{N}-{NNN}` | Lines 143, 257, 266 | YES |
| Phase 3 (skeptical) | `SR-P{N}-{NNN}` | Lines 144, 305, 316 | YES |

**Verdict: PASS** -- Finding ID prefixes (CC, CV, SR) with pass numbers are documented consistently across all sections.

---

## 5. Report Naming (UUID-Based)

| Report Type | UUID Used | Pass-Prefixed | Documented At |
|-------------|----------|---------------|---------------|
| Correctness (per-domain) | YES | YES (`P{N}`) | Lines 111, 127-128, 221 |
| Claim verification | YES | YES (`P{N}`) | Lines 112, 261 |
| Skeptical review | YES | YES (`P{N}`) | Lines 113, 310 |
| Merged intermediate | NO (timestamp) | YES (`P{N}`) | Line 114 |
| Final dedup report | NO (timestamp) | YES (`P{N}`) | Line 115 |
| Fix summary (per-domain) | NO (domain name) | YES (`P{N}`) | Line 116 |
| Test outcome | NO (plain) | YES (`P{N}`) | Line 117 |
| Final clean report | NO (timestamp) | N/A | Line 118 |
| Escalation | NO (timestamp) | N/A | Line 119 |

**Verdict: PASS** -- UUID filenames are used for all parallel agent outputs (correctness, claims, skeptical). Non-parallel outputs (merge, dedup, fix summaries, tests) use timestamps or domain names, which is acceptable since they are not concurrent.

---

## 6. Self-Verification Checklists

| Agent Prompt | Has Self-Verification Checklist | Lines |
|-------------|-------------------------------|-------|
| Phase 1: Correctness agent | **NO** | 211-233 |
| Phase 2: Claims agent | **NO** | 250-275 |
| Phase 3: Skeptical reviewer | **NO** | 296-324 |
| Phase 4: Dedup agent | **NO** | 350-367 |
| PROCEDURE 2: Fix agent | YES | 462-482 |
| PROCEDURE 2: Test runner | YES | 504-523 |

**Verdict: FAIL** -- Self-verification checklists are MISSING from 4 out of 6 agent spawning prompts:
- Phase 1 correctness agent (line 211-233)
- Phase 2 claims agent (line 250-275)
- Phase 3 skeptical reviewer (line 296-324)
- Phase 4 dedup agent (line 350-367)

Only the fix agent and test runner have self-verification checklists. The Agent Recovery Protocol (line 727) references the `## Self-Verification` section as a completeness indicator for ALL agents, but 4 agent prompts never instruct the agent to include one.

**Recommendation:** Add self-verification checklists to all 4 missing agent prompts to ensure consistency with the recovery protocol's expectations.

---

## 7. MAX_PASSES Consistency

| Location | Value | Comparison Operator | Line |
|----------|-------|-------------------|------|
| Overview text | 10 | N/A | 26 |
| ASCII diagram header | `max 10` | N/A | 30 |
| **ASCII diagram body** | **5** | **`N >= 5`** | **40** |
| Pass Counter init | 10 | N/A | 91 |
| Pass Counter check | 10 | `PASS_NUMBER > MAX_PASSES` | 98 |
| Loop Termination check | 10 | `PASS_NUMBER > MAX_PASSES` | 564 |
| Critical Rules | 10 | N/A | 648 |
| Instructions init | 10 | N/A | 859 |
| **Instructions check** | N/A | **`PASS_NUMBER >= MAX_PASSES`** | **862** |

**Verdict: FAIL** -- Two inconsistencies found:

1. **Line 40 says `N >= 5` but should be `N >= MAX_PASSES` (10).** The ASCII diagram in the Overview contradicts every other section. This is a **critical** bug: an agent following the diagram would stop at pass 5, while an agent following the pseudocode would stop at pass 10.

2. **Line 862 uses `>=` but lines 98 and 564 use `>`.** The `>` operator allows exactly 10 passes (PASS_NUMBER goes from 1 to 10, and 10 > 10 is false, so pass 10 runs). The `>=` operator allows only 9 passes (10 >= 10 is true, so pass 10 is skipped). This is a **minor** inconsistency but could cause different behavior.

**Recommendation:**
- Line 40: Change `If N >= 5` to `If N >= 10` (or better: `If N > MAX_PASSES (10)`)
- Line 862: Change `PASS_NUMBER >= MAX_PASSES` to `PASS_NUMBER > MAX_PASSES` to match lines 98 and 564

---

## 8. Error Handling & Agent Recovery Protocol

### Error Handling Section (Lines 662-673)

| Scenario | Documented |
|----------|-----------|
| Phase 1 agent fails | YES (line 664) |
| Phase 2/3 agent fails | YES (line 665) |
| Merge script fatal error (exit code 2) | YES (line 666) |
| Dedup agent reports MUST-FIX > 0 | YES (line 667) |
| Dedup agent fails | YES (line 668) |
| gh CLI not authenticated | YES (line 669) |
| Fix agent fails | YES (line 670) |
| Tests fail after fixes | YES (line 671) |
| Max passes reached | YES (line 672) |
| Merge byte-size verification fails | YES (line 673) |

### Agent Recovery Protocol (Lines 677-844)

| Component | Present | Lines |
|-----------|---------|-------|
| Failure Modes & Detection table | YES | 685-696 |
| Step 1: Detect the Loss | YES | 698-719 |
| Step 2: Verify the Loss | YES | 721-733 |
| Step 3: Clean Up Partial Artifacts | YES | 735-765 |
| Step 4: Re-Spawn the Task | YES | 767-789 |
| Step 5: Record the Failure | YES | 791-803 |
| Special Case: Lost during context compaction | YES | 807-816 |
| Special Case: Wrong pass number (version collision) | YES | 818-824 |
| Special Case: Domain label collision | YES | 826-833 |
| Special Case: Fix agent uncommitted changes | YES | 758-765 |
| Special Case: Test runner left no report | YES | 836-843 |

**Verdict: PASS** -- Error handling section covers 10 scenarios. Agent Recovery Protocol has all 5 steps plus 5 special cases including fix agent uncommitted changes and test runner artifacts.

---

## 9. PROCEDURE 1 Completeness

| Phase | Description | Documented | Lines |
|-------|-------------|-----------|-------|
| Phase 1 | Code Correctness Swarm (parallel) | YES | 177-236 |
| Phase 2 | Claim Verification (sequential) | YES | 238-283 |
| Phase 3 | Skeptical Review (sequential) | YES | 285-325 |
| Phase 4 | Merge Reports + Deduplicate | YES | 327-373 |
| Phase 5 | Present Results | YES | 375-395 |

**Verdict: PASS** -- All 5 phases are fully documented with spawning patterns, prerequisites, and output expectations.

---

## 10. PROCEDURE 2 Completeness

| Component | Documented | Lines |
|-----------|-----------|-------|
| Agent Selection (Dynamic) | YES | 400-427 |
| Fix Protocol (10 steps) | YES | 429-441 |
| Fix agent spawning pattern | YES | 444-491 |
| Test agent spawning pattern | YES | 493-532 |
| Commit After Fixes | YES | 534-548 |
| Output (report paths) | YES | 550-553 |

**Verdict: PASS** -- Fix protocol, dynamic agent selection with fallback, test protocol, and commit-after-fixes are all documented.

---

## 11. Loop Termination

| Condition | Documented | Lines |
|-----------|-----------|-------|
| Zero-issue exit (all severities) | YES | 573-575 |
| Max-pass escalation | YES | 563-569 |
| Pass increment logic | YES | 559-561 |
| Final report format | YES | 582-611 |

**Verdict: PASS** -- Loop termination is documented with both exit conditions and the final report format.

---

## 12. Internal Consistency

| Check | Result | Details |
|-------|--------|---------|
| MAX_PASSES value | **FAIL** | Line 40 says 5, everywhere else says 10 (see Section 7) |
| MAX_PASSES comparison operator | **FAIL** | Line 862 uses `>=`, lines 98/564 use `>` (see Section 7) |
| Agent types match agent files | PASS | All 4 referenced agents exist |
| Script paths match real scripts | PASS | Both scripts exist and are executable |
| Finding ID format consistency | PASS | CC/CV/SR prefixes consistent across all sections |
| UUID filename consistency | PASS | Documented in naming table and all agent prompts |
| Self-verification in all prompts | **FAIL** | Missing from 4 of 6 agent prompts (see Section 6) |
| Report paths in naming table vs prompts | PASS | All paths match |
| Phase ordering (1->2->3) | PASS | Documented in Critical Rules and PROCEDURE 1 |
| Dedup determines verdict (not merge) | PASS | Documented in Critical Rules #4 and #5 |
| Fix ALL severities (not just MUST-FIX) | PASS | Critical Rule #6, line 636 |
| Commit between passes | PASS | Critical Rule #7 and PROCEDURE 2 section |

**Verdict: PARTIAL FAIL** -- 3 inconsistencies found (see details above).

---

## 13. Markdown Quality

| Check | Result | Details |
|-------|--------|---------|
| Valid YAML frontmatter | PASS | Lines 1-15, properly delimited with `---` |
| Headings hierarchy | PASS | H1 -> H2 -> H3 used correctly |
| Code blocks closed | PASS | All code fences properly opened and closed |
| Tables valid | PASS | All tables have header rows and separator lines |
| No broken links | PASS | No `[text](url)` links present (all references are inline paths) |
| Consistent formatting | PASS | Bold, code, and emphasis used consistently |
| No orphan HTML | PASS | No raw HTML present |
| Horizontal rules | PASS | `---` separators used between major sections |

**Verdict: PASS** -- Markdown is well-formed with no syntax issues.

---

## Summary of Findings

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| 1 | **MUST-FIX** | ASCII diagram says `N >= 5` but MAX_PASSES is 10 everywhere else | Line 40 |
| 2 | **SHOULD-FIX** | Self-verification checklists missing from 4 of 6 agent prompts (correctness, claims, skeptical, dedup) | Lines 211, 250, 296, 350 |
| 3 | **NIT** | Comparison operator inconsistency: `>` (lines 98, 564) vs `>=` (line 862) | Line 862 |

### Counts

- **MUST-FIX:** 1
- **SHOULD-FIX:** 1
- **NIT:** 1
- **Total:** 3

### Overall Assessment

The skill file is well-structured and comprehensive. All agent files and scripts exist. The finding ID format, UUID naming, report naming, error handling, and recovery protocol are all thorough and internally consistent. The three issues found are: one critical value contradiction in the ASCII diagram (5 vs 10), one structural gap (missing self-verification checklists in review agent prompts), and one minor operator inconsistency.
