# EPCP Plugin Cross-Reference Consistency Audit

**Date:** 2026-02-22
**Plugin:** emasoft-pr-checking-plugin (v1.1.0)
**Path:** `/Users/emanuelesabetta/ai-maestro/.claude/plugins/emasoft-pr-checking-plugin/`

---

## 1. Agent Names Match Between Skills and Agent Files

### Methodology
Extracted every `subagent_type` and agent reference from both SKILL.md files and compared against actual `.md` files in `agents/`.

### Agent files present in `agents/`:
| File | Agent name (from frontmatter) |
|------|------------------------------|
| `epcp-code-correctness-agent.md` | `epcp-code-correctness-agent` |
| `epcp-claim-verification-agent.md` | `epcp-claim-verification-agent` |
| `epcp-skeptical-reviewer-agent.md` | `epcp-skeptical-reviewer-agent` |
| `epcp-dedup-agent.md` | `epcp-dedup-agent` |

### References in `pr-review/SKILL.md`:
| Reference | Context | Agent file exists? |
|-----------|---------|-------------------|
| `epcp-code-correctness-agent` | Phase 1 spawning pattern (line 96) | YES |
| `epcp-claim-verification-agent` | Phase 2 spawning pattern (line 136) | YES |
| `epcp-skeptical-reviewer-agent` | Phase 3 spawning pattern (line 181) | YES |
| `epcp-dedup-agent` | Phase 4 Stage 2 spawning pattern (line 225) | YES |

### References in `pr-review-and-fix/SKILL.md`:
| Reference | Context | Agent file exists? |
|-----------|---------|-------------------|
| `epcp-code-correctness-agent` | Phase 1 spawning pattern (line 211) | YES |
| `epcp-claim-verification-agent` | Phase 2 spawning pattern (line 252) | YES |
| `epcp-skeptical-reviewer-agent` | Phase 3 spawning pattern (line 298) | YES |
| `epcp-dedup-agent` | Phase 4 Stage 2 spawning pattern (line 352) | YES |
| Dynamic fix agents (not hardcoded) | PROCEDURE 2 (line 446) | N/A (dynamically selected) |
| Dynamic test agents (not hardcoded) | PROCEDURE 2 (line 498) | N/A (dynamically selected) |

**VERDICT: PASS** -- All 4 agent names referenced in both skills have corresponding `.md` files in `agents/`.

---

## 2. Script Paths Match

### References in `pr-review/SKILL.md`:
| Referenced path | Context | File exists? |
|----------------|---------|-------------|
| `$CLAUDE_PLUGIN_ROOT/scripts/epcp-merge-reports-v2.sh` | Prerequisites (line 28) | YES |
| `$CLAUDE_PLUGIN_ROOT/scripts/epcp-merge-reports-v2.sh` | Phase 4 Stage 1 (line 215) | YES |
| `$CLAUDE_PLUGIN_ROOT/scripts/epcp-merge-reports-v2.sh` | Resources section (line 518) | YES |
| `$CLAUDE_PLUGIN_ROOT/scripts/epcp-merge-reports.sh` | Resources section (line 519, labeled "v1, legacy") | YES |
| `$CLAUDE_PLUGIN_ROOT/agents/epcp-dedup-agent.md` | Resources section (line 520) | YES |
| `$CLAUDE_PLUGIN_ROOT/agents/` | Resources section (line 521) | YES |

### References in `pr-review-and-fix/SKILL.md`:
| Referenced path | Context | File exists? |
|----------------|---------|-------------|
| `$CLAUDE_PLUGIN_ROOT/scripts/epcp-merge-reports-v2.sh` | Prerequisites (line 57) | YES |
| `$CLAUDE_PLUGIN_ROOT/scripts/epcp-merge-reports-v2.sh` | Phase 4 Stage 1 (line 334) | YES |
| `$CLAUDE_PLUGIN_ROOT/scripts/epcp-merge-reports-v2.sh` | Resources section (line 849) | YES |
| `$CLAUDE_PLUGIN_ROOT/scripts/epcp-merge-reports.sh` | Resources section (line 850, labeled "v1 legacy") | YES |
| `$CLAUDE_PLUGIN_ROOT/agents/epcp-dedup-agent.md` | Resources section (line 851) | YES |
| `$CLAUDE_PLUGIN_ROOT/agents/` | Resources section (line 852) | YES |

### Scripts present in `scripts/`:
| File | Referenced? |
|------|------------|
| `epcp-merge-reports.sh` | YES (both skills, as "legacy v1") |
| `epcp-merge-reports-v2.sh` | YES (both skills, as active merge script) |

**VERDICT: PASS** -- All script paths referenced in both skills resolve to actual files.

---

## 3. Finding ID Prefix Format Consistency

### Expected formats:
- **Code Correctness (Phase 1):** `CC-P{N}-A{hex}-{NNN}` (e.g., `CC-P1-A0-001`)
- **Claim Verification (Phase 2):** `CV-P{N}-{NNN}` (e.g., `CV-P1-001`)
- **Skeptical Review (Phase 3):** `SR-P{N}-{NNN}` (e.g., `SR-P1-001`)

### Format documented in each file:

| File | CC format | CV format | SR format | Pass prefix included? |
|------|-----------|-----------|-----------|----------------------|
| **pr-review/SKILL.md** | `CC-{AGENT_PREFIX}-{NNN}` (line 88,109) | `CV-{NNN}` (line 149) | `SR-{NNN}` (line 197) | **NO** -- Missing `P{N}` in finding IDs |
| **pr-review-and-fix/SKILL.md** | `CC-P{N}-A{hex}-{NNN}` (lines 139-154, 225, 645) | `CV-P{N}-{NNN}` (lines 143, 266) | `SR-P{N}-{NNN}` (lines 144, 315) | YES |
| **epcp-code-correctness-agent.md** | `CC-{NNN}` in output format template (line 120) | N/A | N/A | **NO** -- Generic `[CC-001]` in template |
| **epcp-claim-verification-agent.md** | N/A | `CV-{NNN}` in output format template (line 121) | N/A | **NO** -- Generic `[CV-001]` in template |
| **epcp-skeptical-reviewer-agent.md** | N/A | N/A | `SR-{NNN}` in output format template (line 155) | **NO** -- Generic `[SR-001]` in template |
| **epcp-dedup-agent.md** | `CC-P4-A0-001` (line 37, example) | implicit | implicit | YES (in examples) |

### INCONSISTENCIES FOUND:

**ISSUE 3a (SHOULD-FIX):** `pr-review/SKILL.md` does NOT include `P{N}` in its finding ID format. The examples show `CC-A0-001` (line 110), not `CC-P1-A0-001`. Since pr-review is a single-pass skill (no loop), pass numbers are technically always `P1`, but the format should still include `P{N}` for consistency with:
- The report filenames which DO include `P{N}` (e.g., `epcp-correctness-P1-{uuid}.md` on line 106)
- The `pr-review-and-fix` skill which includes `P{N}` everywhere
- The merge script v2 which matches on `P{N}` in its glob pattern
- The dedup agent examples which use `CC-P4-A0-001` format

**ISSUE 3b (NIT):** All 3 agent `.md` files use generic finding ID placeholders in their output format templates (e.g., `[CC-001]`, `[CV-001]`, `[SR-001]`) without the pass prefix or agent prefix. This is acceptable since the orchestrator's prompt overrides the template with specific prefixes, but it could cause confusion if an agent follows its own template literally rather than the prompt instructions. The self-verification checklists DO reference `{FINDING_ID_PREFIX}` which is correct.

**ISSUE 3c (NIT):** The `pr-review/SKILL.md` Phase 2 example uses `FINDING_ID_PREFIX: CV` (line 141), missing the pass number. Compare with `pr-review-and-fix/SKILL.md` which uses `FINDING_ID_PREFIX: CV-P{PASS_NUMBER}` (line 257). Same issue for Phase 3: `SR` vs `SR-P{PASS_NUMBER}`.

**VERDICT: PARTIAL PASS** -- The `pr-review-and-fix` skill and dedup agent are consistent. The `pr-review` skill omits `P{N}` from finding IDs (3 locations), and all 3 agent templates use simplified IDs in their output format examples.

---

## 4. Self-Verification Checklists

### Agent files -- Self-Verification Checklist present?

| Agent file | Has `## Self-Verification` or `## SELF-VERIFICATION CHECKLIST`? | Checklist items count |
|------------|---------------------------------------------------------------|----------------------|
| `epcp-code-correctness-agent.md` | YES (line 189, titled "SELF-VERIFICATION CHECKLIST") | 13 items |
| `epcp-claim-verification-agent.md` | YES (line 222, titled "SELF-VERIFICATION CHECKLIST") | 16 items |
| `epcp-skeptical-reviewer-agent.md` | YES (line 278, titled "SELF-VERIFICATION CHECKLIST") | 16 items |
| `epcp-dedup-agent.md` | YES (line 224, titled "SELF-VERIFICATION CHECKLIST") | 15 items |

### Skills -- Self-Verification Checklists for fix agents and test runners?

| Skill file | Fix agent self-verification checklist? | Test runner self-verification checklist? |
|-----------|---------------------------------------|----------------------------------------|
| `pr-review/SKILL.md` | N/A (no PROCEDURE 2, review-only) | N/A (no PROCEDURE 2, review-only) |
| `pr-review-and-fix/SKILL.md` | YES (lines 466-482, 13 items) | YES (lines 508-523, 12 items) |

**VERDICT: PASS** -- All 4 agent files have Self-Verification checklists. Both skills have checklists where applicable (`pr-review` is review-only so fix/test checklists are correctly absent).

---

## 5. Report Naming Convention Consistency

### Expected pattern: `epcp-{type}-P{N}-{uuid}.md`

| File | Correctness filename | Claims filename | Review filename | Intermediate | Final |
|------|---------------------|----------------|-----------------|-------------|-------|
| **pr-review/SKILL.md** | `epcp-correctness-P1-${UUID}.md` | `epcp-claims-P1-${UUID}.md` | `epcp-review-P1-${UUID}.md` | `pr-review-P1-intermediate-{ts}.md` | `pr-review-P1-{ts}.md` |
| **pr-review-and-fix/SKILL.md** | `epcp-correctness-P{N}-${UUID}.md` | `epcp-claims-P{N}-${UUID}.md` | `epcp-review-P{N}-${UUID}.md` | `pr-review-P{N}-intermediate-{ts}.md` | `pr-review-P{N}-{ts}.md` |
| **merge-reports-v2.sh** | `epcp-correctness-P{N}-*` (glob) | `epcp-claims-P{N}-*` (glob) | `epcp-review-P{N}-*` (glob) | `pr-review-P{N}-intermediate-{ts}.md` | N/A |
| **Agent templates** | Generic (no UUID in template) | Generic (no UUID in template) | Generic (no UUID in template) | N/A | N/A |

### INCONSISTENCY FOUND:

**ISSUE 5a (SHOULD-FIX):** The `README.md` documents a DIFFERENT naming convention than the skills:

README says:
```
epcp-correctness-P{N}-{domain}.md    (domain-based)
epcp-claims-P{N}.md                  (no UUID)
epcp-review-P{N}.md                  (no UUID)
pr-review-P{N}-{timestamp}.md        (no "intermediate" variant)
```

Skills say:
```
epcp-correctness-P{N}-{uuid}.md      (UUID-based)
epcp-claims-P{N}-{uuid}.md           (with UUID)
epcp-review-P{N}-{uuid}.md           (with UUID)
pr-review-P{N}-intermediate-{ts}.md  (intermediate exists)
pr-review-P{N}-{ts}.md               (final after dedup)
```

The README shows the OLD naming convention (domain-based, no UUID) that was replaced by the UUID-based convention in the skills and merge script v2. The README is stale.

**ISSUE 5b (NIT):** The README also references `epcp-merge-reports.sh` (v1) in the Pipeline section (line 56: "Phase 4: Merge reports via scripts/epcp-merge-reports.sh") but both skills use `epcp-merge-reports-v2.sh`. The README is referencing the legacy script.

**VERDICT: PARTIAL PASS** -- Skills, merge script, and agents are internally consistent on UUID-based naming. README is stale and documents the old domain-based naming convention.

---

## 6. Error Handling / Recovery Protocol Consistency

### Structure comparison:

| Section | pr-review/SKILL.md | pr-review-and-fix/SKILL.md |
|---------|-------------------|---------------------------|
| **Error Handling section** | YES (lines 344-350, 7 bullet points) | YES (lines 664-674, 11 bullet points) |
| **Agent Recovery Protocol section** | YES (lines 353-497) | YES (lines 677-844) |
| **Failure Modes & Detection table** | YES (9 modes) | YES (9 modes, with 1 extra timeout variant) |
| **Step 1: Detect the Loss** | YES (6 fields, 6 conditions) | YES (6 fields, 6 conditions) |
| **Step 2: Verify the Loss** | YES (4 substeps) | YES (4 substeps) |
| **Step 3: Clean Up Partial Artifacts** | YES (7 rules) | YES (7 rules + fix agent special case) |
| **Step 4: Re-Spawn the Task** | YES (4 substeps, 5 rules) | YES (4 substeps, 6 rules) |
| **Step 5: Record the Failure** | YES (recovery log table) | YES (recovery log table) |
| **Special Cases** | 3 cases | 4 cases (adds "Test runner left no report") |

### Detailed differences:

**Step 1 (Detect the Loss) -- agentType field:**
- `pr-review`: `"correctness" | "claims" | "skeptical" | "dedup"`
- `pr-review-and-fix`: `"correctness" | "claims" | "skeptical" | "dedup" | "fix" | "test"`
  - CORRECT: pr-review-and-fix adds fix and test agent types which are unique to that skill.

**Step 1 -- findingPrefix example:**
- `pr-review`: `"CC-P1-A2"` -- includes P{N} prefix
- `pr-review-and-fix`: `"CC-P3-A2"` -- includes P{N} prefix
  - Note: pr-review uses P1 in the example while the finding IDs in the rest of its SKILL.md omit P{N}. This is a minor inconsistency within pr-review itself (relates to Issue 3a).

**Failure Modes table:**
- `pr-review`: Timeout deadlines are "review agents: 10 min, dedup agent: 5 min"
- `pr-review-and-fix`: Timeout deadlines are "review agents: 10 min, fix agents: 15 min, test runner: 20 min"
  - CORRECT: pr-review-and-fix adds timeouts for fix and test agents.

**Step 3 (Clean Up) -- Fix agent special case:**
- `pr-review`: NOT present (correct -- no fix agents in review-only)
- `pr-review-and-fix`: Present (lines 757-766, 5 substeps for handling uncommitted source changes)
  - CORRECT: This is a pr-review-and-fix-specific concern.

**Step 4 (Re-Spawn) -- Extra rule:**
- `pr-review`: 5 re-spawn rules
- `pr-review-and-fix`: 6 re-spawn rules (adds "For fix agents: verify `git status` is clean before re-spawning")
  - CORRECT: pr-review-and-fix-specific.

**Step 3 example -- Pass number in filenames:**
- `pr-review`: `docs_dev/epcp-correctness-P1-a1b2c3d4.md` (hardcoded P1)
- `pr-review-and-fix`: `docs_dev/epcp-correctness-P3-a1b2c3d4.md` (example with P3)
  - ACCEPTABLE: Different examples, both consistent with their context.

**Special Cases:**
- `pr-review`: 3 cases (lost during compaction, wrong pass number, domain collision)
- `pr-review-and-fix`: 4 cases (same 3 + "Test runner left no report")
  - CORRECT: The extra case is specific to pr-review-and-fix.

**Special Cases -- "Lost during compaction" substep 5:**
- `pr-review`: Only 4 substeps
- `pr-review-and-fix`: 5 substeps (adds "For fix agents: check `git log` for the most recent fix commit")
  - CORRECT: pr-review-and-fix-specific.

**VERDICT: PASS** -- Both recovery protocols have the same 5-step structure. pr-review-and-fix correctly extends with fix/test agent handling. No contradictions or structural omissions found.

---

## 7. MAX_PASSES Value

### pr-review-and-fix/SKILL.md:
- Line 26: "the maximum pass limit (10) is reached"
- Line 31: Diagram shows max 10
- Lines 91-92: `MAX_PASSES = 10`
- Lines 98-101: `if PASS_NUMBER > MAX_PASSES:` with message "Maximum pass limit (10)"
- Lines 563-564: `if PASS_NUMBER > MAX_PASSES (10):`
- Line 643: "Maximum 10 passes"
- Line 859: `MAX_PASSES = 10`

### INCONSISTENCY FOUND:

**ISSUE 7a (SHOULD-FIX):** The diagram on lines 39-40 says:
```
|  2. If zero issues -> DONE (write final report)   |
|     If N >= 5   -> STOP (escalate to user)         |
```
This says `N >= 5`, which contradicts the rest of the file which says `MAX_PASSES = 10` and uses `PASS_NUMBER > MAX_PASSES` (i.e., > 10). The diagram should say `If N > 10` or `If N >= MAX_PASSES`.

**ISSUE 7b (SHOULD-FIX):** The `README.md` line 39 says:
```
Review a PR AND automatically fix all findings. Loops until zero issues remain (max 5 passes).
```
This says "max 5 passes" but the skill says MAX_PASSES = 10. The README is stale.

### pr-review/SKILL.md:
- Does NOT define MAX_PASSES. CORRECT -- it runs a single pass (review only, no fix loop).

**VERDICT: PARTIAL PASS** -- MAX_PASSES = 10 is consistently documented in 6+ places in pr-review-and-fix. However, the diagram (line 40) says "N >= 5" and the README says "max 5 passes", both contradicting the value of 10. pr-review correctly has no MAX_PASSES.

---

## 8. Version References

### Version strings found across all files:

| File | Version | Location |
|------|---------|----------|
| `.claude-plugin/plugin.json` | `"version": "1.1.0"` | Line 3 |
| `pr-review/SKILL.md` (frontmatter) | `version: 2.0.0` | Line 6 |
| `pr-review-and-fix/SKILL.md` (frontmatter) | `version: 2.0.0` | Line 6 |

### INCONSISTENCY FOUND:

**ISSUE 8a (SHOULD-FIX):** The plugin manifest (`plugin.json`) declares version `1.1.0`, but both skills declare version `2.0.0` in their frontmatter. These are presumably independent versioning (plugin vs. skill), but this could be confusing. There is no documentation explaining the relationship between plugin version and skill version.

If they are supposed to be the same: `plugin.json` needs to be bumped to `2.0.0`.
If they are intentionally independent: A note explaining this should be added to `plugin.json` or `README.md`.

**VERDICT: AMBIGUOUS** -- Cannot determine if this is intentional or a bug without knowing the versioning policy. Flagged for review.

---

## 9. Marketplace Manifest (`plugin.json`)

### Content of `.claude-plugin/plugin.json`:
```json
{
  "name": "emasoft-pr-checking-plugin",
  "version": "1.1.0",
  "description": "Three-phase PR review pipeline...",
  "author": { "name": "Emasoft", "url": "https://github.com/Emasoft" },
  "license": "MIT",
  "keywords": ["pr-review", "code-audit", "claim-verification", "quality", "auto-fix"]
}
```

### ISSUES FOUND:

**ISSUE 9a (MUST-FIX):** The manifest does NOT list skills. A Claude Code plugin manifest should enumerate the skills it provides so the runtime can discover them. Current manifest has no `skills` field.

Expected (based on the plugin's actual structure):
```json
{
  "skills": [
    {
      "name": "pr-review",
      "path": "skills/pr-review/SKILL.md"
    },
    {
      "name": "pr-review-and-fix",
      "path": "skills/pr-review-and-fix/SKILL.md"
    }
  ]
}
```

**ISSUE 9b (MUST-FIX):** The manifest does NOT list agents. A plugin manifest should enumerate the agents it provides so they can be registered as available `subagent_type` values.

Expected:
```json
{
  "agents": [
    {
      "name": "epcp-code-correctness-agent",
      "path": "agents/epcp-code-correctness-agent.md"
    },
    {
      "name": "epcp-claim-verification-agent",
      "path": "agents/epcp-claim-verification-agent.md"
    },
    {
      "name": "epcp-skeptical-reviewer-agent",
      "path": "agents/epcp-skeptical-reviewer-agent.md"
    },
    {
      "name": "epcp-dedup-agent",
      "path": "agents/epcp-dedup-agent.md"
    }
  ]
}
```

**Note:** The exact manifest schema for Claude Code plugins may differ. The key finding is that `plugin.json` contains ONLY metadata fields (name, version, description, author, license, keywords) and does NOT enumerate any skills or agents. If the Claude Code plugin runtime discovers skills/agents by directory convention rather than manifest declaration, this may be acceptable -- but it should be verified.

**ISSUE 9c (NIT):** The `epcp-dedup-agent` is not mentioned in the `README.md` Agents table (line 20-26). The table lists 3 agents (correctness, claim-verification, skeptical-reviewer) but omits the dedup agent. While the dedup agent is an internal implementation detail, it IS a declared agent in the plugin and should be listed for completeness.

**VERDICT: FAIL** -- The manifest lacks `skills` and `agents` fields. The README omits the dedup agent from the Agents table.

---

## Summary of All Findings

| # | Severity | Issue | Files Affected |
|---|----------|-------|---------------|
| 3a | SHOULD-FIX | `pr-review/SKILL.md` finding IDs omit `P{N}` prefix (e.g., `CC-A0-001` instead of `CC-P1-A0-001`) | `skills/pr-review/SKILL.md` |
| 3b | NIT | Agent template output formats use simplified IDs (`[CC-001]`) without pass/agent prefix | All 3 review agent `.md` files |
| 3c | NIT | `pr-review/SKILL.md` Phase 2/3 spawning uses `CV`/`SR` instead of `CV-P1`/`SR-P1` as finding prefix | `skills/pr-review/SKILL.md` |
| 5a | SHOULD-FIX | `README.md` documents old naming convention (domain-based, no UUID) | `README.md` |
| 5b | NIT | `README.md` Pipeline section references legacy merge script v1 | `README.md` |
| 7a | SHOULD-FIX | Diagram in `pr-review-and-fix/SKILL.md` says `N >= 5` instead of `N > 10`/`N > MAX_PASSES` | `skills/pr-review-and-fix/SKILL.md` (line 40) |
| 7b | SHOULD-FIX | `README.md` says "max 5 passes" instead of "max 10 passes" | `README.md` (line 39) |
| 8a | SHOULD-FIX | Plugin version `1.1.0` vs skill versions `2.0.0` -- unclear if intentional | `plugin.json`, both SKILL.md files |
| 9a | MUST-FIX | `plugin.json` missing `skills` field (no skill enumeration) | `.claude-plugin/plugin.json` |
| 9b | MUST-FIX | `plugin.json` missing `agents` field (no agent enumeration) | `.claude-plugin/plugin.json` |
| 9c | NIT | `README.md` Agents table omits `epcp-dedup-agent` | `README.md` |

### Counts
- **MUST-FIX:** 2 (both in plugin.json manifest)
- **SHOULD-FIX:** 5 (finding ID prefix, README naming, diagram value, README max passes, version mismatch)
- **NIT:** 4 (agent template IDs, finding prefix shorthand, README script ref, README missing dedup agent)
- **PASS items:** 4 (agent name mapping, script paths, self-verification checklists, recovery protocol structure)
