# EPCP Plugin Full Validation Report

**Date:** 2026-02-15 00:16 UTC
**Plugin:** emasoft-pr-checking-plugin
**Path:** /Users/emanuelesabetta/.claude/plugins/emasoft-pr-checking-plugin/
**Validators used:** validate_plugin.py, validate_skill.py, validate_agent.py (x3)
**Privacy check:** CLAUDE_PRIVATE_USERNAMES="emanuelesabetta" (no leaks found)

---

## 1. Full Plugin Validation (validate_plugin.py --verbose)

**Result: EXIT CODE 2 (MAJOR issues)**

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| MAJOR | 2 |
| MINOR | 1 |
| INFO | 9 |
| PASSED | 31 |

### MAJOR Issues

1. **Description must include 'Use when ...' phrase (Nixtla strict mode)** -- skills/pr-review/SKILL.md
   - The skill frontmatter description field does not contain a "Use when ..." trigger phrase.
   - Required for Claude CLI to know when to proactively suggest the skill.

2. **'## Instructions' must include numbered step-by-step list** -- skills/pr-review/SKILL.md
   - The Instructions section does not contain a clearly numbered step-by-step list (1. 2. 3. ...).
   - The validator expects explicit numbered steps directly under the Instructions heading.

### MINOR Issues

1. **Checklist found but missing 'Copy this checklist and track your progress' phrase** -- skills/pr-review/SKILL.md
   - Best practice for complex workflows with checklists.

### INFO Notes (non-blocking)

- Optional directories commands/, hooks/, docs/ not found (acceptable)
- Skill name pr-review-pipeline differs from directory name pr-review (cosmetic mismatch)
- Consider gerund naming pattern for skill name
- No absolute paths found in 7 files checked (no privacy leaks)
- README.md and LICENSE present
- Shell script epcp-merge-reports.sh is executable and passes shellcheck

---

## 2. Skill Validation (validate_skill.py --verbose)

**Result: PASSED (exit code 0)**

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| MAJOR | 0 |
| MINOR | 0 |
| INFO | 3 |
| PASSED | 5 |

INFO: Unknown frontmatter field version. Skill name differs from directory name. Task-oriented skill without $ARGUMENTS placeholder.

---

## 3. Agent Validations (validate_agent.py --verbose)

### 3a. epcp-claim-verification-agent.md -- PASSED (100/100)

| CRITICAL | MAJOR | MINOR | INFO | PASSED |
|----------|-------|-------|------|--------|
| 0 | 0 | 0 | 7 | 7 |

### 3b. epcp-code-correctness-agent.md -- PASSED (100/100)

| CRITICAL | MAJOR | MINOR | INFO | PASSED |
|----------|-------|-------|------|--------|
| 0 | 0 | 0 | 7 | 7 |

### 3c. epcp-skeptical-reviewer-agent.md -- PASSED (100/100)

| CRITICAL | MAJOR | MINOR | INFO | PASSED |
|----------|-------|-------|------|--------|
| 0 | 0 | 0 | 7 | 7 |

All agents: INFO-level notes about adding "Use when..." trigger phrases, "use proactively" hints, structured sections, and example commentary blocks.

---

## 4. Overall Summary

| Component | Result | Score |
|-----------|--------|-------|
| Plugin (overall) | MAJOR issues | Exit 2 |
| Skill: pr-review | PASSED | Clean |
| Agent: claim-verification | PASSED | 100/100 |
| Agent: code-correctness | PASSED | 100/100 |
| Agent: skeptical-reviewer | PASSED | 100/100 |
| Privacy check | PASSED | No leaks |
| Shell scripts | PASSED | Shellcheck clean |
| README + LICENSE | PASSED | Present |

### Action Items to Reach Exit Code 0

1. [MAJOR] Add "Use when ..." to skill description in skills/pr-review/SKILL.md frontmatter
2. [MAJOR] Add numbered step-by-step list (1. 2. 3.) directly under ## Instructions in SKILL.md
3. [MINOR] Add "Copy this checklist and track your progress" phrase near the checklist section

### Optional Improvements (INFO-level)

- Rename skill directory from pr-review to pr-review-pipeline (or rename skill to pr-review)
- Add commentary blocks to all 6 agent examples (2 per agent)
- Add "Use when..." trigger phrases to agent descriptions
- Add "use proactively" to agent descriptions
- Add structured sections (## Capabilities, ## Workflow) to agent files
