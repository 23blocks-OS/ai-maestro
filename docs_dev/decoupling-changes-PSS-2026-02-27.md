# Decoupling Changes — PSS (perfect-skill-suggester) v1.9.5
**Date:** 2026-02-27

---

## Design Principle

Plugin skills should reference AI Maestro's global skills by name (not embed API syntax).
Plugin hooks should call global scripts (not curl).

See: `docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`

---

## Executive Summary

The PSS plugin is **substantially compliant** with the Plugin Abstraction Principle. Of 15 audited files, only **2 isolated violations** exist, both in `skills/pss-agent-toml/SKILL.md`:

| Violation | Severity | Type | Status |
|-----------|----------|------|--------|
| Inline index-parsing code (lines ~214–256) | MODERATE | LOCAL_REGISTRY | Requires fix |
| Hardcoded gh API endpoint paths (lines ~406–421) | LOW | API_SYNTAX | Borderline acceptable |

All other files (scripts, hooks, agents, commands) are clean.

---

## Violations Table

| # | File | Severity | Type | Lines | Current Behavior | Required Change |
|---|------|----------|------|-------|------------------|-----------------|
| **V1** | `skills/pss-agent-toml/SKILL.md` | MODERATE | LOCAL_REGISTRY | ~214–256 | Embeds `cat ~/.claude/cache/skill-index.json \| python3 -c "..."` to directly parse the skill index cache | Replace with documented call to PSS binary search mode: `"$BINARY_PATH" --search "<term>" [--type=X] [--category=Y]` |
| **V2** | `skills/pss-agent-toml/SKILL.md` | LOW | API_SYNTAX | ~406, 407, 419 | Hardcodes `gh api repos/<owner>/<repo>/contents/...` endpoint paths directly in skill text | Replace endpoint paths with prose: "Fetch the plugin manifest from the GitHub repository using `gh api`..." |

---

## Change Specifications

### Violation V1: Replace Inline Index Search Code

**File:** `/path/to/plugin/skills/pss-agent-toml/SKILL.md`

**Section:** Phase 2, Step 2.2 — "Search for additional candidates"

**Current Content (lines ~214–256):**
```bash
cat ~/.claude/cache/skill-index.json | python3 -c "
import json, sys
idx = json.load(sys.stdin)
...
# [parsed output]
"
```

**Why This Violates the Principle:**
- Hardcodes internal cache path (`~/.claude/cache/skill-index.json`)
- Duplicates query logic already in the PSS Rust binary
- If cache schema/location changes in AI Maestro, code silently breaks
- Bypasses the PSS binary's official query interface

**Required Change:**
Replace the inline Python code block with:

```bash
"$BINARY_PATH" --search "<search_term>" [--type=skill|agent|command|rule|mcp|lsp] [--category=<category>] [--language=<lang>]
```

**Acceptance Criteria:**
- The PSS Rust binary MUST support `--search` flag (or equivalent)
- Skill MUST NOT embed raw index-parsing code
- Skill MUST describe WHAT to search for (semantics), not HOW to parse the index (implementation)

**Priority:** HIGH — Fix before next release

---

### Violation V2: Simplify gh API Endpoint Paths

**File:** `/path/to/plugin/skills/pss-agent-toml/SKILL.md`

**Section:** Phase 4, Steps 4.3 and 4.4

**Current Content (lines ~406, 407, 419):**
```bash
gh api repos/<owner>/<repo>/contents/.claude-plugin/plugin.json
gh api repos/<owner>/<repo>/contents/skills/<name>/SKILL.md
gh api repos/<owner>/<repo>/contents/skills (or /agents)
```

**Why This Is Borderline:**
- `gh api` is a standard globally-installed GitHub CLI tool (not AI Maestro API)
- Embedding full endpoint URL patterns is API_SYNTAX hardcoding
- Skill instructs HOW to call API rather than WHAT to accomplish

**Required Change:**
Replace specific endpoint paths with prose instructions:

```markdown
> Fetch the plugin manifest from the GitHub repository using `gh api` with the repository contents endpoint.
> Navigate the skills/ and agents/ directories to extract SKILL.md and agent definitions.
```

**Acceptance Criteria:**
- No explicit `/repos/<owner>/<repo>/contents/<path>` patterns in skill text
- Instructions describe goal ("fetch manifest"), not API path
- Agent implementation MAY use exact endpoint paths (implementation is allowed), but skill spec should not

**Priority:** MEDIUM — Nice-to-have for polish, not blocking

---

## Clean Files (No Changes Required)

The following files passed full audit and require **no changes**:

### Skills
- ✓ `skills/pss-usage/SKILL.md` — Purely instructional, references PSS commands by name

### Agents
- ✓ `agents/pss-agent-profiler.md` — Correctly calls PSS Rust binary via `${BINARY_PATH}`

### Commands
- ✓ `commands/pss-setup-agent.md` — Platform detection and binary path resolution (implementation detail, allowed in commands)
- ✓ `commands/pss-status.md` — Local filesystem checks only, no API calls
- ✓ `commands/pss-reindex-skills.md` — Calls plugin-local scripts and OS tools only

### Scripts
- ✓ `scripts/pss_hook.py` — Calls PSS Rust binary via subprocess, no AI Maestro API
- ✓ `scripts/pss_discover.py` — Reads local filesystem only
- ✓ `scripts/pss_setup.py` — Calls cargo and PSS binary only
- ✓ `scripts/pss_generate.py` — Pure filesystem operations
- ✓ `scripts/pss_build.py` — Calls cargo, cross, docker only
- ✓ `scripts/pss_cleanup.py` — Pure filesystem operations
- ✓ `scripts/pss_merge_queue.py` — Atomically merges `.pss` files into index

### Configuration
- ✓ `hooks/hooks.json` — Calls plugin-local `pss_hook.py` (no AI Maestro API)
- ✓ `.claude-plugin/plugin.json` — Standard manifest, no API endpoints

---

## Notable Compliance

The PSS plugin demonstrates **strong isolation** from AI Maestro:

- **No curl calls to localhost:23000** — 0 instances
- **No AI Maestro API endpoints** embedded anywhere
- **No hardcoded governance rules** (roles, policies, approval chains)
- **No AMP messaging** (`amp-send.sh`, `amp-inbox.sh`) — correct, PSS doesn't need inter-agent communication
- **No Bearer tokens or API key patterns** — correct
- **Hooks call plugin-local scripts only** (`pss_hook.py`) — correct architecture
- **Scripts call globally-installed tools** (cargo, cross, docker) or plugin-local binary — correct pattern
- **`CLAUDE_PLUGIN_ROOT` used consistently** for plugin-relative paths — best practice

---

## Optional Enhancement

**Scope:** Out-of-scope for decoupling, but architecturally interesting.

**Proposal:** PSS could optionally query AI Maestro's `team-governance` skill to enrich skill suggestions with team context:

```bash
# Example (pseudo-code, not required)
Team context: ai-team-governance --agent="<name>" --list-policies
# Returns: role, allowed-skills, approval-chain
# PSS filters candidates based on team policies
```

**Rationale:**
- PSS currently suggests skills without considering team governance policies
- If an agent must follow a team approval chain, PSS could pre-filter suggestions
- This would require PSS to call a global skill (not the API directly)

**Status:** OPTIONAL — Not blocking decoupling. Can be added in v2.0 if needed.

---

## Implementation Roadmap

| Phase | Task | Owner | ETA |
|-------|------|-------|-----|
| **1** | Add `--search` flag to PSS Rust binary | PSS maintainer | Sprint N |
| **2** | Update `skills/pss-agent-toml/SKILL.md` with V1 fix | PSS maintainer | Sprint N+1 |
| **3** | Update skill with V2 polish (gh API prose) | PSS maintainer | Sprint N+1 |
| **4** (Optional) | Integrate `team-governance` skill for enrichment | PSS maintainer | v2.0 backlog |

---

## Verification Checklist

After implementing changes:

- [ ] V1 fix: `pss-agent-toml/SKILL.md` uses `--search` flag, no inline Python parsing
- [ ] V2 fix: `pss-agent-toml/SKILL.md` references gh API by goal, not endpoint path
- [ ] Re-audit: `decoupling-audit-PSS-raw.md` shows 0 violations (only optional enhancements remain)
- [ ] Backward compatibility: PSS binary must accept old queries during transition period (if needed)
- [ ] Tests pass: Run PSS E2E tests to confirm skill/agent/command workflows still work

---

## References

- **Raw Audit:** `docs_dev/decoupling-audit-PSS-raw.md`
- **Plugin Abstraction Principle:** `docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`
- **PSS Plugin:** `plugin/plugins/ai-maestro/` (git submodule)

---

**Document Revision:** 1.0
**Status:** Ready for implementation
**Last Updated:** 2026-02-27
