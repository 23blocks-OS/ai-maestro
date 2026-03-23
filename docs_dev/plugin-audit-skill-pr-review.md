# SKILL.md Audit Report — pr-review

**File:** `/Users/emanuelesabetta/ai-maestro/.claude/plugins/emasoft-pr-checking-plugin/skills/pr-review/SKILL.md`
**Date:** 2026-02-22
**Auditor:** Claude (automated)

---

## 1. Structure

| Required Section | Present? | Line(s) |
|---|---|---|
| Overview | YES | 18-21 |
| Prerequisites | YES | 23-28 |
| Use When | YES | 30-35 |
| Protocol / Phases | YES | 53-263 |
| Error Handling | YES | 342-349 |
| Agent Recovery Protocol | YES | 353-497 |
| Examples | YES | 500-514 |
| Resources | YES | 516-522 |
| Lessons Learned | YES | 524-538 |

**Verdict:** PASS — All required sections present.

Additional sections found (not required but valuable): "Why this exists" (37-51), "Critical Rules" (265-299), "Quick Reference" (301-312), "Instructions" (314-327), "Output" (329-340).

---

## 2. Agent References

| Agent Name in SKILL.md | Expected File | Exists? |
|---|---|---|
| `epcp-code-correctness-agent` | `agents/epcp-code-correctness-agent.md` | YES (9223 bytes) |
| `epcp-claim-verification-agent` | `agents/epcp-claim-verification-agent.md` | YES (12266 bytes) |
| `epcp-skeptical-reviewer-agent` | `agents/epcp-skeptical-reviewer-agent.md` | YES (13471 bytes) |
| `epcp-dedup-agent` | `agents/epcp-dedup-agent.md` | YES (8884 bytes) |

**Verdict:** PASS — All 4 referenced agents exist as .md files in `../../../agents/`.

---

## 3. Script References

| Script Path in SKILL.md | Expected File | Exists? | Executable? |
|---|---|---|---|
| `$CLAUDE_PLUGIN_ROOT/scripts/epcp-merge-reports-v2.sh` | `scripts/epcp-merge-reports-v2.sh` | YES (11240 bytes) | YES |
| `$CLAUDE_PLUGIN_ROOT/scripts/epcp-merge-reports.sh` (legacy, line 519) | `scripts/epcp-merge-reports.sh` | YES (9444 bytes) | YES |

**Verdict:** PASS — All referenced scripts exist and are executable.

---

## 4. Finding ID Format

The SKILL.md documents **three finding ID prefix schemes**:

| Phase | Prefix Pattern | Example IDs in SKILL.md |
|---|---|---|
| Phase 1 (Correctness) | `CC-{AGENT_PREFIX}-NNN` where AGENT_PREFIX = A0, A1, ... AF, A10 | CC-A0-001, CC-A0-002, CC-A1-001, CC-A1-005 |
| Phase 2 (Claims) | `CV-NNN` | CV-001, CV-003 |
| Phase 3 (Skeptical) | `SR-NNN` | SR-001, SR-002 |

**ISSUE FOUND — Inconsistency in findingPrefix example (line 382):**

Line 382 in the Agent Recovery Protocol shows:
```
findingPrefix: string    // e.g., "CC-P1-A2" — for re-spawn consistency
```

This uses the format `CC-P1-A2` (with pass number `P1` embedded). However, the Phase 1 spawning instructions (lines 87-89, 109-110) define the format as `CC-A0-001` (no pass number in the finding ID). The pass number `P1` appears only in the *filename* (e.g., `epcp-correctness-P1-{uuid}.md`), not in the finding ID prefix.

**Severity:** NIT — The example comment in the recovery protocol uses a format (`CC-P1-A2`) that contradicts the format defined in Phase 1 (`CC-A0`). The pass number should not appear in the finding ID prefix; it belongs only in the filename. This could confuse an agent following the recovery protocol.

**Verdict:** PARTIAL PASS — CC/CV/SR prefixes are documented consistently in the main protocol. One contradictory example exists in the recovery protocol section (line 382).

---

## 5. Report Naming

| Report Type | Pattern in SKILL.md | UUID-based? |
|---|---|---|
| Correctness (Phase 1) | `docs_dev/epcp-correctness-P1-{uuid}.md` | YES |
| Claims (Phase 2) | `docs_dev/epcp-claims-P1-{uuid}.md` | YES |
| Skeptical (Phase 3) | `docs_dev/epcp-review-P1-{uuid}.md` | YES |
| Intermediate merge | `docs_dev/pr-review-P1-intermediate-{timestamp}.md` | NO (timestamp) |
| Final deduplicated | `docs_dev/pr-review-P1-{timestamp}.md` | NO (timestamp) |

The format `epcp-{type}-P{N}-{uuid}.md` is documented in:
- Phase 1 spawning prompt (line 106)
- Phase 2 spawning prompt (line 147)
- Phase 3 spawning prompt (line 192)
- Output section (lines 332-336)
- Critical Rules section (lines 285-288)

**Verdict:** PASS — UUID-based filenames consistently documented for all agent outputs. Merge outputs use timestamps (expected and correct).

---

## 6. Self-Verification Checklists

**In agent .md files:**

| Agent File | Has Self-Verification Section? |
|---|---|
| `epcp-code-correctness-agent.md` | YES (lines 189, 194) |
| `epcp-claim-verification-agent.md` | YES (lines 222, 227) |
| `epcp-skeptical-reviewer-agent.md` | YES (lines 278, 283) |
| `epcp-dedup-agent.md` | YES (lines 224, 229) |

**In SKILL.md spawning prompts:**

The SKILL.md spawning prompts (Phases 1-3) do **NOT** explicitly include self-verification checklists inline. Instead, they rely on the agent definition files containing the checklist (which they do). The SKILL.md references the self-verification section in two places:
- Line 403: "File contains the `## Self-Verification` section (the agent's checklist)" (used as completeness check)
- Line 425: "Delete partial report files (missing Self-Verification section at the end)"

**ISSUE FOUND — Spawning prompts lack self-verification reminder:**

The spawning prompts for Phase 1 (lines 97-118), Phase 2 (lines 136-158), and Phase 3 (lines 180-205) do NOT include a reminder for agents to perform self-verification. They rely entirely on the agent .md definitions to include this. While this works (the agents DO have the checklist in their definitions), a defensive approach would include a one-line reminder like "Complete the Self-Verification checklist before returning."

**Severity:** NIT — The agent definitions handle this correctly. The spawning prompts could be more defensive but are not broken.

**Verdict:** PARTIAL PASS — All 4 agents have self-verification checklists in their definition files. Spawning prompts rely on agent definitions rather than inline checklists. SKILL.md correctly references self-verification in the recovery protocol for completeness checking.

---

## 7. Error Handling

**Error Handling section (lines 342-349):**
- Phase 1 agent failure: re-run for domain only — YES
- Phase 2/3 failure: re-run single agent — YES
- Merge script exit code 2: input error — YES
- Merge byte-size verification failure: files preserved — YES
- Dedup agent failure: re-run on intermediate (idempotent) — YES
- `gh` CLI auth failure: stop and ask user — YES

**Agent Recovery Protocol (lines 353-497):**
- Step 1: Detect the Loss — YES (with tracking fields and loss conditions)
- Step 2: Verify the Loss — YES (file existence, completeness checks)
- Step 3: Clean Up Partial Artifacts — YES (with safety rules)
- Step 4: Re-Spawn the Task — YES (new UUID, same prefix, 3-retry limit)
- Step 5: Record the Failure — YES (recovery log table format)
- Special Cases — YES (context compaction, wrong pass number, domain collision)

**Verdict:** PASS — Comprehensive error handling covering both simple errors and complex recovery scenarios.

---

## 8. Internal Consistency

| Check | Result |
|---|---|
| Agent names match between spawning prompts and agent files | PASS |
| File patterns match between Output section and spawning prompts | PASS |
| Phase numbering consistent (1→2→3→4→5) | PASS |
| Finding ID prefixes match between Protocol and Critical Rules | PASS (except line 382 — see item 4) |
| Merge script path consistent across all references | PASS (4 references, all `$CLAUDE_PLUGIN_ROOT/scripts/epcp-merge-reports-v2.sh`) |
| Phase order: Protocol says 1→2→3→4→5, Instructions says same | PASS |
| Verdict options consistent (APPROVE / REQUEST CHANGES / APPROVE WITH NITS in Phase 5 vs. APPROVE/REQUEST CHANGES/APPROVE WITH CHANGES in Output) | **ISSUE** |

**ISSUE FOUND — Verdict label inconsistency:**

- Phase 5 presentation template (line 251): `REQUEST CHANGES / APPROVE WITH NITS / APPROVE`
- Output section (line 338): `APPROVE/REQUEST CHANGES/APPROVE WITH CHANGES`

"APPROVE WITH NITS" (line 251) vs "APPROVE WITH CHANGES" (line 338) — these are two different labels for what appears to be the same verdict level.

**Severity:** SHOULD-FIX — Agents and the dedup agent need a single, consistent set of verdict labels. Having two different labels could cause the dedup agent to produce a verdict that doesn't match the expected values in the presentation template.

---

## 9. Completeness — All 5 Phases

| Phase | Title | Lines | Documented? |
|---|---|---|---|
| Phase 1 | Code Correctness Swarm | 62-121 | YES — parallel spawning, domain grouping, prefix assignment |
| Phase 2 | Claim Verification | 123-165 | YES — single agent, PR description + commits |
| Phase 3 | Skeptical Review | 167-206 | YES — single agent, full diff + earlier reports |
| Phase 4 | Merge Reports + Deduplicate | 208-242 | YES — two-stage: bash merge then dedup agent |
| Phase 5 | Present Results | 244-263 | YES — summary template with verdict and counts |

**Verdict:** PASS — All 5 phases fully documented with spawning patterns, inputs, and outputs.

---

## 10. Markdown Quality

| Check | Result |
|---|---|
| YAML frontmatter valid | PASS (lines 1-14, properly delimited with `---`) |
| All code blocks closed | PASS (checked all ``` pairs — all matched) |
| Tables properly formatted | PASS (6 tables, all with header rows and separator rows) |
| No broken internal links | PASS (no `[text](url)` links to validate — all references are to `$CLAUDE_PLUGIN_ROOT` paths) |
| Heading hierarchy valid | PASS (H1 → H2 → H3, no skipped levels) |
| No orphaned list items | PASS |
| Horizontal rules properly formatted | PASS (two `---` separators at lines 351 and 498) |

**Verdict:** PASS — Valid markdown throughout.

---

## Summary of All Findings

| # | Severity | Section | Finding |
|---|---|---|---|
| 1 | NIT | Finding ID Format (item 4) | Line 382 uses `CC-P1-A2` format in example comment, contradicting the `CC-A0` format defined in Phase 1. Pass number should only appear in filenames, not finding IDs. |
| 2 | NIT | Self-Verification (item 6) | Spawning prompts do not include explicit self-verification reminders; they rely on agent definitions (which do contain them). Could be more defensive. |
| 3 | SHOULD-FIX | Internal Consistency (item 8) | Verdict label mismatch: "APPROVE WITH NITS" (line 251) vs "APPROVE WITH CHANGES" (line 338). Should use one consistent label. |

**Overall Assessment:** The SKILL.md is well-structured, comprehensive, and internally consistent with the exception of the verdict label mismatch (SHOULD-FIX) and two minor nits. All agent references resolve to existing files. All script references resolve to existing, executable files. All 5 phases are documented. Error handling is thorough including a detailed Agent Recovery Protocol. Markdown quality is clean.

**Rating:** 9.5/10 — One SHOULD-FIX, two NITs. No MUST-FIX issues.
