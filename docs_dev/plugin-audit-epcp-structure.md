# Plugin Validation Report: emasoft-pr-checking-plugin

**Path:** `/Users/emanuelesabetta/ai-maestro/.claude/plugins/emasoft-pr-checking-plugin/`
**Date:** 2026-02-22
**Validator:** Plugin Validator Agent (Claude Opus 4.6)
**Username checked:** emanuelesabetta (for private path leak detection)

---

## Summary

| Category | Result |
|----------|--------|
| **Manifest (plugin.json)** | PASS (3 required OK, 4 recommended present, 4 recommended absent) |
| **Skills (2)** | PASS (all required fields and sections present) |
| **Agents (4)** | PASS with MINOR warnings (all required fields present, some optional missing) |
| **Scripts (2)** | PASS (executable, shellcheck clean) |
| **Hooks** | N/A (no hooks directory) |
| **MCP Servers** | N/A (no .mcp.json) |
| **Privacy (path leaks)** | PASS (no private paths found) |
| **Cross-references** | PASS (all agent/script refs resolve) |
| **Version consistency** | MAJOR: skill versions (2.0.0) != plugin.json (1.1.0) |
| **Max passes consistency** | MAJOR: README says "max 5 passes", SKILL.md says "max 10" |

**Overall: 0 CRITICAL, 2 MAJOR, 4 MINOR issues**

---

## 1. Manifest Validation (.claude-plugin/plugin.json)

### Required Fields (all PASS)

| Field | Status | Value |
|-------|--------|-------|
| name | PASS | `emasoft-pr-checking-plugin` |
| version | PASS | `1.1.0` (valid semver) |
| description | PASS | Present, descriptive |

### Recommended Fields

| Field | Status | Value |
|-------|--------|-------|
| author | PRESENT | `{"name": "Emasoft", "url": "https://github/Emasoft"}` |
| license | PRESENT | `MIT` |
| keywords | PRESENT | 5 tags |
| homepage | ABSENT | -- |
| repository | ABSENT | -- |
| engines | ABSENT | -- |
| dependencies | ABSENT | -- |

### Optional Sections (declarative manifest entries)

| Section | Status | Note |
|---------|--------|------|
| skills | ABSENT | Skills exist on disk but not declared in plugin.json |
| agents | ABSENT | Agents exist on disk but not declared in plugin.json |
| hooks | ABSENT | No hooks in this plugin |
| mcpServers | ABSENT | No MCP servers in this plugin |

**MINOR [M-001]:** `plugin.json` does not declare `skills` or `agents` sections. While Claude Code may auto-discover them from the directory structure, explicitly listing them in the manifest improves discoverability and allows version pinning.

**MINOR [M-002]:** Missing `homepage` and `repository` fields. These help marketplace users find documentation and report issues.

---

## 2. Skills Validation

### pr-review/SKILL.md

| Check | Status |
|-------|--------|
| Frontmatter present | PASS |
| name field | PASS (`pr-review`) |
| description field | PASS |
| version field | PRESENT (`2.0.0`) |
| author field | PRESENT (`Emasoft`) |
| license field | PRESENT (`MIT`) |
| tags field | PRESENT (4 tags) |
| Instructions section | PASS |
| Examples section | PRESENT |
| Use When section | PRESENT |
| references/ directory | ABSENT |

### pr-review-and-fix/SKILL.md

| Check | Status |
|-------|--------|
| Frontmatter present | PASS |
| name field | PASS (`pr-review-and-fix`) |
| description field | PASS |
| version field | PRESENT (`2.0.0`) |
| author field | PRESENT (`Emasoft`) |
| license field | PRESENT (`MIT`) |
| tags field | PRESENT (5 tags) |
| Instructions section | PASS |
| Examples section | PRESENT |
| Use When section | PRESENT |
| references/ directory | ABSENT |

Both skills are comprehensive and well-structured. The `pr-review-and-fix` skill (900 lines) includes detailed agent recovery protocol, fix protocol, and loop termination logic.

---

## 3. Agents Validation

### epcp-claim-verification-agent.md

| Check | Status |
|-------|--------|
| Frontmatter | PASS |
| name | PASS |
| description | PASS |
| capabilities | PRESENT (5 items) |
| model | ABSENT |
| tools | ABSENT |
| Examples | PRESENT (2 examples) |
| Self-Verification Checklist | PRESENT |
| Critical Rules | PRESENT (7 rules) |
| Output Format | PRESENT |

### epcp-code-correctness-agent.md

| Check | Status |
|-------|--------|
| Frontmatter | PASS |
| name | PASS |
| description | PASS |
| capabilities | PRESENT (5 items) |
| model | ABSENT |
| tools | ABSENT |
| Examples | PRESENT (2 examples) |
| Self-Verification Checklist | PRESENT |
| Critical Rules | PRESENT (6 rules) |
| Output Format | PRESENT |

### epcp-dedup-agent.md

| Check | Status |
|-------|--------|
| Frontmatter | PASS |
| name | PASS |
| description | PASS |
| capabilities | ABSENT |
| model | PRESENT (`sonnet`) |
| tools | PRESENT (Read, Write, Bash, Grep, Glob) |
| Examples | ABSENT |
| Self-Verification Checklist | PRESENT |
| Critical Rules | ABSENT |
| Output Format | ABSENT (inline in description) |

**MINOR [M-003]:** `epcp-dedup-agent.md` is missing `<example>` blocks, a `## CRITICAL RULES` section, and a standalone `## OUTPUT FORMAT` section. While the dedup algorithm is well-documented inline, adding examples and explicit output format would improve reliability. The other 3 agents all have these sections.

### epcp-skeptical-reviewer-agent.md

| Check | Status |
|-------|--------|
| Frontmatter | PASS |
| name | PASS |
| description | PASS |
| capabilities | PRESENT (6 items) |
| model | ABSENT |
| tools | ABSENT |
| Examples | PRESENT (2 examples) |
| Self-Verification Checklist | PRESENT |
| Critical Rules | PRESENT (6 rules) |
| Output Format | PRESENT |

**MINOR [M-004]:** Three of four agents (`claim-verification`, `code-correctness`, `skeptical-reviewer`) do not declare `model` or `tools` in their frontmatter. Only `epcp-dedup-agent` specifies `model: sonnet` and `tools: [Read, Write, Bash, Grep, Glob]`. While the orchestrator skill specifies the agent type at spawn time, declaring model/tools in the agent frontmatter makes the agent self-documenting.

---

## 4. Scripts Validation

### epcp-merge-reports.sh (v1, legacy)

| Check | Status |
|-------|--------|
| Executable permission | PASS (`-rwxr-xr-x`) |
| shellcheck | PASS (0 warnings) |
| set -eo pipefail | PASS |
| Temp file cleanup (trap) | PASS |
| Usage header | PASS |
| Exit codes documented | PASS |

### epcp-merge-reports-v2.sh

| Check | Status |
|-------|--------|
| Executable permission | PASS (`-rwxr-xr-x`) |
| shellcheck | PASS (0 warnings) |
| set -eo pipefail | PASS |
| Temp file cleanup (trap) | PASS |
| Atomic write (tmp + mv) | PASS |
| Byte-size integrity check | PASS |
| Source file deletion after verify | PASS |
| UUID-aware filename handling | PASS |
| Usage header | PASS |
| Exit codes documented | PASS |

Both scripts are clean, well-structured, and pass shellcheck with zero warnings.

---

## 5. Hooks Validation

No `hooks/` directory or `hooks.json` found. This plugin does not use hooks, which is appropriate for its design (skills-and-agents-only plugin).

---

## 6. MCP Server Validation

No `.mcp.json` found. This plugin does not define MCP servers, which is appropriate for its design.

---

## 7. Privacy Check

Searched all `.json`, `.md`, and `.sh` files for:
- Username `emanuelesabetta`
- Pattern `/Users/[a-z]` (macOS home paths)

**Result: PASS -- No private path leaks found.**

---

## 8. Cross-Reference Validation

### Agent references in skills

All 4 agents referenced in both skills resolve to actual files:

| Agent | pr-review | pr-review-and-fix | File exists |
|-------|-----------|-------------------|-------------|
| epcp-code-correctness-agent | YES | YES | YES |
| epcp-claim-verification-agent | YES | YES | YES |
| epcp-skeptical-reviewer-agent | YES | YES | YES |
| epcp-dedup-agent | YES | YES | YES |

### Script references in skills

| Script | pr-review | pr-review-and-fix | File exists |
|--------|-----------|-------------------|-------------|
| epcp-merge-reports-v2.sh | YES | YES | YES |
| epcp-merge-reports.sh | YES (legacy ref) | YES (legacy ref) | YES |

### README agent references

| Agent | Referenced | File exists |
|-------|-----------|-------------|
| epcp-code-correctness-agent | YES | YES |
| epcp-claim-verification-agent | YES | YES |
| epcp-skeptical-reviewer-agent | YES | YES |

Note: `epcp-dedup-agent` is not mentioned in README but is referenced in skills. This is acceptable since the dedup agent is an internal implementation detail.

---

## 9. MAJOR Issues

### [MAJ-001] Version Mismatch: plugin.json vs skill versions

- **Severity:** MAJOR
- **plugin.json version:** `1.1.0`
- **pr-review SKILL.md version:** `2.0.0`
- **pr-review-and-fix SKILL.md version:** `2.0.0`
- **Impact:** Version mismatch between the plugin manifest and its skills creates confusion about which version is current. Marketplace consumers and automated tools rely on `plugin.json` version as the source of truth. Skills declaring `2.0.0` while the plugin declares `1.1.0` suggests the skills were updated without bumping the plugin version.
- **Fix:** Either bump `plugin.json` to `2.0.0` or align skill versions to `1.1.0`. The plugin version should be >= the highest skill version.

### [MAJ-002] Max Passes Inconsistency: README (5) vs SKILL.md (10)

- **Severity:** MAJOR
- **README.md line 39:** "Loops until zero issues remain (max 5 passes)."
- **README.md line 45:** "The loop terminates when a review pass finds zero issues or 5 passes are reached."
- **pr-review-and-fix SKILL.md line 91-92:** `MAX_PASSES = 10`
- **pr-review-and-fix SKILL.md line 30:** "max 10"
- **pr-review-and-fix SKILL.md line 641:** "Maximum 10 passes."
- **Impact:** Users reading the README expect 5 max passes, but the actual skill implementation uses 10. This is a documentation-vs-implementation discrepancy -- the exact type of "claim mismatch" that this plugin's own epcp-claim-verification-agent is designed to catch.
- **Fix:** Update README to say "max 10 passes" (matching the SKILL.md), or change SKILL.md to 5 if that was the intended limit.

---

## 10. MINOR Issues

### [M-001] plugin.json does not declare skills/agents sections

Skills and agents exist on disk but are not listed in the manifest. Declaring them improves discoverability.

### [M-002] Missing homepage and repository fields in plugin.json

These help marketplace consumers find docs and report issues.

### [M-003] epcp-dedup-agent.md missing examples, critical rules, and output format sections

The other 3 agents all have these sections. Adding them to the dedup agent would improve consistency and reliability.

### [M-004] Three agents missing model/tools frontmatter

Only the dedup agent declares `model` and `tools`. Adding these to all agents makes them self-documenting.

---

## 11. File Structure Summary

```
emasoft-pr-checking-plugin/
  .claude-plugin/
    plugin.json              # Manifest (1.1.0)
  agents/
    epcp-claim-verification-agent.md   # Phase 2 agent
    epcp-code-correctness-agent.md     # Phase 1 swarm agent
    epcp-dedup-agent.md                # Phase 4 dedup agent
    epcp-skeptical-reviewer-agent.md   # Phase 3 agent
  scripts/
    epcp-merge-reports.sh              # v1 merge script (legacy)
    epcp-merge-reports-v2.sh           # v2 merge script (current)
  skills/
    pr-review/
      SKILL.md                         # Review-only pipeline (v2.0.0)
    pr-review-and-fix/
      SKILL.md                         # Review+fix iterative pipeline (v2.0.0)
  .gitignore                           # .DS_Store only
  LICENSE                              # MIT
  README.md                            # Plugin documentation
```

---

## 12. Quality Assessment

### Strengths

1. **Comprehensive agent design**: Each agent has a clear role, well-defined input/output format, self-verification checklist, and critical rules. The separation of concerns (microscope/fact-checker/telescope) is well thought out.
2. **UUID-based collision prevention**: Both the filename convention (UUID in filename) and finding ID convention (agent-prefixed) prevent race conditions between parallel agents.
3. **Two-stage merge pipeline**: Separating simple concatenation (bash) from semantic deduplication (AI agent) is a robust design that avoids both over-engineering the bash script and under-utilizing AI capabilities.
4. **Agent recovery protocol**: The pr-review-and-fix skill includes a thorough 5-step recovery protocol for lost agents, with special handling for context compaction, version collisions, and partial fix commits.
5. **Shell script quality**: Both merge scripts pass shellcheck with zero warnings, use `set -eo pipefail`, clean up temp files via trap, and the v2 script uses atomic writes and byte-size integrity verification.
6. **No private path leaks**: Clean of hardcoded user paths.

### Weaknesses

1. Version mismatch between plugin.json and skills (MAJ-001)
2. Max passes documentation inconsistency (MAJ-002)
3. Dedup agent is less thoroughly documented than its peers (M-003)
4. No declarative agent/skill registration in manifest (M-001)
5. Legacy v1 merge script is still shipped alongside v2 -- could cause confusion about which to use

---

## Verdict

**0 CRITICAL, 2 MAJOR, 4 MINOR issues.**

The plugin is well-designed and functional. The two MAJOR issues are both documentation/version consistency problems -- no functional bugs were found. Fix the version mismatch (MAJ-001) and max passes inconsistency (MAJ-002) before publishing to a marketplace.
