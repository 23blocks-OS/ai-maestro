# EPCP Plugin Agent Definition Audit Report

**Plugin:** emasoft-pr-checking-plugin (v1.1.0)
**Audit Date:** 2026-02-22
**Scope:** 4 agent definition files in `agents/`
**Auditor:** Plugin Validator Agent

---

## Summary

| Agent File | Frontmatter | Tools | Description | Prompt Structure | Self-Verification | Examples | References | Overall |
|---|---|---|---|---|---|---|---|---|
| epcp-code-correctness-agent.md | WARN | WARN | PASS | PASS | PASS | PASS | PASS | MINOR issues |
| epcp-claim-verification-agent.md | WARN | WARN | PASS | PASS | PASS | PASS | PASS | MINOR issues |
| epcp-skeptical-reviewer-agent.md | WARN | WARN | PASS | PASS | PASS | PASS | PASS | MINOR issues |
| epcp-dedup-agent.md | PASS | PASS | PASS | PASS | PASS | WARN | PASS | MINOR issues |

**Overall Verdict:** All 4 agents are well-structured and production-quality. 0 CRITICAL issues, 0 MAJOR issues, several MINOR issues and NITs.

---

## 1. epcp-code-correctness-agent.md

### 1.1 YAML Frontmatter

**Fields present:** `name`, `description`, `capabilities`
**Fields missing:** `tools`, `model`

- PASS: `name` is present and matches filename convention (kebab-case)
- PASS: `description` is multi-line folded scalar (valid YAML `>` syntax)
- PASS: `capabilities` list is well-structured (5 items, actionable descriptions)
- WARN: **No `tools` field declared.** The agent implicitly uses Read, Grep, Glob, Write, and Bash (evidenced by the prompt instructions to "Read every file", "Use Grep/Glob"). These should be declared in frontmatter for orchestrator routing and tool-gating.
- WARN: **No `model` field.** Unlike epcp-dedup-agent.md which specifies `model: sonnet`, this agent relies on model inheritance. Not an error, but inconsistent with sibling agents.

### 1.2 Tool Declarations

- WARN: No `tools` list in frontmatter. The body text references Read, Write, Grep, Glob, and Bash implicitly but these are never formally declared.

### 1.3 Description Quality

- PASS: Description is excellent. It clearly states what the agent does ("per-domain code correctness auditor"), how it is deployed ("spawned as a SWARM"), and its limitations ("structurally blind to cross-file inconsistencies").
- PASS: The microscope/telescope metaphor creates clear mental model of role boundaries.

### 1.4 Prompt Structure

- PASS: **Input format** clearly defined (DOMAIN, FILES, DIFF, REPORT_PATH)
- PASS: **Output format** specified with exact markdown template
- PASS: **Critical rules** section present (6 rules, all actionable)
- PASS: **Audit checklist** is comprehensive (7 categories, 40+ individual checks)
- PASS: **Scope and limitations** section explicitly states what the agent is blind to
- PASS: **Reporting rules** enforce minimal orchestrator response

### 1.5 Self-Verification Checklist

- PASS: Present at end of file
- PASS: 13 items, all feasible and verifiable
- PASS: Items are consistent with the audit checklist and output format
- NIT: Checklist item "My report file uses the UUID filename: epcp-correctness-P{N}-{uuid}.md" references a naming convention that is not explained anywhere in this agent file. The `P{N}` and `{uuid}` placeholders suggest the orchestrator provides these, but this is not stated in the INPUT FORMAT section.
- NIT: Checklist item "My finding IDs use the assigned prefix: {FINDING_ID_PREFIX}-001" references `{FINDING_ID_PREFIX}` which is also not mentioned in INPUT FORMAT. The examples use "CC-" prefix implicitly but the input parameter is never formally declared.

### 1.6 Examples

- PASS: 2 examples present, both with proper `<example>` tags
- PASS: Both have context line, user input, and assistant response
- PASS: Example 1 (messaging domain) demonstrates finding an actual bug
- PASS: Example 2 (shell scripts domain) demonstrates a clean-ish result
- PASS: Return format in examples matches the CRITICAL RULES specification

### 1.7 References

- PASS: No broken references to external files or scripts
- PASS: No references to other agent files (correctly scoped to its own domain)

---

## 2. epcp-claim-verification-agent.md

### 2.1 YAML Frontmatter

**Fields present:** `name`, `description`, `capabilities`
**Fields missing:** `tools`, `model`

- PASS: `name` matches filename convention
- PASS: `description` is detailed and explains the real-world incident that motivated this agent
- PASS: `capabilities` list (5 items) is specific and actionable
- WARN: **No `tools` field.** Agent uses Read, Grep, Glob, Write, Bash (and implicitly `gh` CLI for PR diff). Should be declared.
- WARN: **No `model` field.** Inconsistent with epcp-dedup-agent.md.

### 2.2 Tool Declarations

- WARN: No `tools` list in frontmatter. The prompt explicitly mentions "Use Grep/Glob to find the relevant file(s)" and uses `gh pr diff` but tools are not declared.

### 2.3 Description Quality

- PASS: Excellent description. Explains the real incident that motivated the agent's creation.
- PASS: Clearly differentiates from correctness checking ("the gap between what the author thinks they did and what the code actually does").

### 2.4 Prompt Structure

- PASS: **Input format** clearly defined (PR_DESCRIPTION, COMMIT_MESSAGES, DIFF_PATH, PR_NUMBER, REPORT_PATH)
- PASS: **Output format** specified with exact markdown template including FAILED CLAIMS, PARTIALLY IMPLEMENTED, CONSISTENCY ISSUES, and VERIFIED CLAIMS table
- PASS: **Critical rules** section present (7 rules, all actionable)
- PASS: **4-phase verification protocol** is thorough (Extraction, Verification, Cross-File, Diff Analysis)
- PASS: **Common failure patterns table** is an excellent reference for the agent
- PASS: **Claim types table** with 9 categories covers the full spectrum

### 2.5 Self-Verification Checklist

- PASS: Present at end of file
- PASS: 16 items, all feasible
- PASS: Conditional items use "(N/A if no such claims)" pattern, which is good
- NIT: Same issue as correctness agent - `{FINDING_ID_PREFIX}` and UUID filename convention not explained in INPUT FORMAT.

### 2.6 Examples

- PASS: 2 examples present with proper `<example>` tags
- PASS: Example 1 directly demonstrates the "fromLabel not implemented" incident
- PASS: Example 2 demonstrates a version bump partial implementation
- PASS: Both examples show the expected return format matching CRITICAL RULES

### 2.7 References

- PASS: No broken references
- PASS: References `gh pr diff` which is a valid CLI tool assumption
- NIT: The "WHY YOU EXIST" section references `convertAMPToMessage()` and specific field names from the ai-maestro codebase. This is fine for documentation/motivation but slightly couples the agent definition to a specific project.

---

## 3. epcp-skeptical-reviewer-agent.md

### 3.1 YAML Frontmatter

**Fields present:** `name`, `description`, `capabilities`
**Fields missing:** `tools`, `model`

- PASS: `name` matches filename convention
- PASS: `description` uses the telescope/microscope metaphor effectively
- PASS: `capabilities` list (6 items) covers holistic review aspects
- WARN: **No `tools` field.** Agent uses Read, Grep, Glob, Write, Bash, and `gh`. Should be declared.
- WARN: **No `model` field.** Inconsistent with epcp-dedup-agent.md.

### 3.2 Tool Declarations

- WARN: No `tools` list in frontmatter.

### 3.3 Description Quality

- PASS: Excellent. Clearly establishes the "external maintainer" persona.
- PASS: The "why you exist" section with the real incident is compelling and instructive.
- PASS: Capabilities list accurately reflects the review scope (UX, breaking changes, cross-file, design judgment).

### 3.4 Prompt Structure

- PASS: **Input format** clearly defined (PR_NUMBER, PR_DESCRIPTION, DIFF_PATH, REPORT_PATH, CORRECTNESS_REPORTS, CLAIMS_REPORT)
- PASS: **Output format** has 5 structured sections (First Impression, Code Quality, Risk Assessment, Test Coverage, Verdict Justification)
- PASS: **Critical rules** (6 rules, actionable)
- PASS: **4-step review protocol** with detailed checklists for each step
- PASS: **Mindset guidelines** (7 items) effectively shape the agent's behavior persona
- PASS: **Common patterns table** showing what swarms miss vs. how this agent catches them
- PASS: **Verdict options** are clearly defined with decision criteria

### 3.5 Self-Verification Checklist

- PASS: Present at end of file
- PASS: 16 items, all feasible and consistent with the review protocol
- NIT: Same `{FINDING_ID_PREFIX}` and UUID filename issue as other agents.

### 3.6 Examples

- PASS: 2 examples with proper `<example>` tags
- PASS: Example 1 shows a REQUEST CHANGES verdict with specific issues found
- PASS: Example 2 shows an APPROVE verdict for a trivial PR
- PASS: Good range coverage (complex PR vs. simple PR)

### 3.7 References

- PASS: References to "Phase 1 correctness reports" and "Phase 2 claims report" are consistent with pipeline architecture
- PASS: No broken file or script references

---

## 4. epcp-dedup-agent.md

### 4.1 YAML Frontmatter

**Fields present:** `name`, `description`, `model`, `tools`
**Fields missing:** `capabilities`

- PASS: `name` matches filename convention
- PASS: `description` is clear and concise
- PASS: `model: sonnet` is explicitly declared (the only agent with this field)
- PASS: `tools` list declares Read, Write, Bash, Grep, Glob (all valid tool names)
- WARN: **No `capabilities` field.** All other 3 agents have `capabilities` lists. This is inconsistent.

### 4.2 Tool Declarations

- PASS: Tools are properly declared: Read, Write, Bash, Grep, Glob
- PASS: All listed tools are valid Claude Code built-in tools
- NIT: Does not list `Edit` tool, but the agent writes entire reports (not editing existing files), so `Write` is appropriate.

### 4.3 Description Quality

- PASS: Clear and actionable. States what it does (deduplicates), how (semantic analysis), and what it produces (final report with counts and verdict).
- WARN: Shorter description than sibling agents. Does not explain WHY deduplication is needed (e.g., "multiple independent agents find the same issue, producing inflated counts").

### 4.4 Prompt Structure

- PASS: **Input format** clearly defined (INTERMEDIATE_REPORT, PASS_NUMBER, OUTPUT_PATH)
- PASS: **Output format** specified with exact markdown template
- PASS: **5-step deduplication algorithm** is detailed and systematic
- PASS: **Verdict rules** are clear and deterministic
- PASS: **Edge cases reference** section with 5 specific scenarios is excellent
- PASS: **Reporting rules** enforce minimal orchestrator response
- PASS: Decision tree for duplicate detection is well-structured (3 conditions, all must be true)
- PASS: "CRITICAL: Two findings are NOT duplicates if" section prevents false merges

### 4.5 Self-Verification Checklist

- PASS: Present at end of file
- PASS: 15 items, all feasible
- PASS: "(N/A if no duplicates found)" conditional items are good
- PASS: Math check item ("final_count = raw_count - duplicates_removed") ensures numerical consistency

### 4.6 Examples

- WARN: **No `<example>` section.** This is the only agent without user/assistant format examples. The "Edge Cases Reference" section provides scenario examples, but these are reference documentation, not input/output interaction examples.

### 4.7 References

- PASS: References `epcp-merge-reports-v2.sh` which exists at `scripts/epcp-merge-reports-v2.sh` in the plugin. VERIFIED.
- PASS: Finding ID format (CC-P4-A0-001, SR-P4-002, MF-001, SF-001, NT-001) is internally consistent.
- PASS: References to CC (correctness), CV (claims), SR (skeptical review) phases match the other 3 agents.

---

## Cross-Agent Consistency Analysis

### Frontmatter Field Consistency

| Field | correctness | claim-verification | skeptical-reviewer | dedup |
|---|---|---|---|---|
| `name` | YES | YES | YES | YES |
| `description` | YES | YES | YES | YES |
| `capabilities` | YES | YES | YES | **NO** |
| `tools` | **NO** | **NO** | **NO** | YES |
| `model` | **NO** | **NO** | **NO** | YES |

**Finding:** The frontmatter schema is inconsistent across agents. Only dedup has `tools` and `model`; only the other three have `capabilities`. Ideally all agents should have a consistent set of fields.

### Finding ID Prefix Convention

| Agent | Expected Prefix | Used in Examples | Declared? |
|---|---|---|---|
| correctness | CC-{NNN} | CC-001, CC-002, CC-003 | Implicitly via output format |
| claim-verification | CV-{NNN} | CV-001, CV-002, CV-003 | Implicitly via output format |
| skeptical-reviewer | SR-{NNN} | SR-001, SR-002, SR-003 | Implicitly via output format |
| dedup | MF/SF/NT-{NNN} | MF-001, SF-001, NT-001 | Explicitly in Step 5 |

**Finding:** The `{FINDING_ID_PREFIX}` placeholder appears in self-verification checklists of correctness, claim-verification, and skeptical-reviewer agents, but is never formally defined as an input parameter. The orchestrator presumably passes this, but it should be documented in INPUT FORMAT.

### Report File Naming Convention

All three non-dedup agents reference `epcp-{type}-P{N}-{uuid}.md` in their self-verification checklists, but this naming convention is not explained in any INPUT FORMAT section. The `P{N}` (pass number) and `{uuid}` components should be documented or the checklist items should reference `REPORT_PATH` instead.

### Pipeline Phase References

| Phase | Agent | ID Prefix | Referenced By |
|---|---|---|---|
| Phase 1 | Code Correctness (swarm) | CC | claim-verification, skeptical-reviewer, dedup |
| Phase 2 | Claim Verification | CV | skeptical-reviewer, dedup |
| Phase 3 | Skeptical Review | SR | dedup |
| Phase 4 | Deduplication | MF/SF/NT | (final output) |

**Finding:** Pipeline phase numbering is consistent across all agents. Cross-references are valid.

---

## Issues Summary

### SHOULD-FIX (0 issues)

None.

### MINOR (5 issues)

| # | Agent(s) | Issue |
|---|---|---|
| M-001 | correctness, claim-verification, skeptical-reviewer | Missing `tools` field in frontmatter. Tools used are only implied by prompt text. |
| M-002 | correctness, claim-verification, skeptical-reviewer | Missing `model` field in frontmatter. Inconsistent with dedup agent which declares `model: sonnet`. |
| M-003 | dedup | Missing `capabilities` field in frontmatter. Inconsistent with the other 3 agents. |
| M-004 | dedup | No `<example>` section with user/assistant interaction format. Only agent without examples. |
| M-005 | all | `{FINDING_ID_PREFIX}` and UUID filename convention referenced in self-verification checklists but never declared in INPUT FORMAT sections. |

### NIT (3 issues)

| # | Agent(s) | Issue |
|---|---|---|
| N-001 | claim-verification | "WHY YOU EXIST" section references ai-maestro-specific function names (convertAMPToMessage, fromLabel, toLabel). Fine for motivation but slightly project-coupled. |
| N-002 | dedup | Description is noticeably shorter than sibling agents. Could benefit from a "why this exists" sentence. |
| N-003 | all | Self-verification checklist reference to `epcp-{type}-P{N}-{uuid}.md` filename format should either be documented in INPUT FORMAT or replaced with `{REPORT_PATH}`. |

---

## Recommendations

1. **Standardize frontmatter schema across all 4 agents.** Add `tools` and `model` to the 3 agents missing them; add `capabilities` to dedup.

2. **Add an `<example>` section to epcp-dedup-agent.md** with at least one user/assistant interaction showing input (intermediate report path) and output (return line).

3. **Document `FINDING_ID_PREFIX` as a formal input parameter** in the INPUT FORMAT sections of correctness, claim-verification, and skeptical-reviewer agents. Alternatively, hardcode the prefixes (CC, CV, SR) since they are already used consistently.

4. **Document the report filename convention** (`epcp-{type}-P{N}-{uuid}.md`) either in each agent's INPUT FORMAT or in a shared pipeline documentation file.

5. **Minor:** Consider adding `capabilities` to dedup agent frontmatter to match siblings.

---

## Conclusion

All 4 agent definitions are well-crafted, production-quality documents. The prompt engineering is strong with clear input/output formats, comprehensive checklists, real-world examples, and explicit scope boundaries. The pipeline design (microscope correctness swarm -> claim verification -> telescope skeptical review -> deduplication) is sound and the cross-references between agents are consistent. The issues found are all MINOR or NIT level -- no blocking problems that would prevent the agents from functioning correctly.
