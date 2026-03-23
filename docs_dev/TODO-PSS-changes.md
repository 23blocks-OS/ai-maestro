# TODO: PSS Plugin Changes
**Generated:** 2026-02-27
**Source:** `docs_dev/consolidated-aimaestro-violations-2026-02-27.md` (Section 3) + `docs_dev/decoupling-audit-PSS-raw.md`
**Scope:** PSS plugin only — 2 violations, both in `skills/pss-agent-toml/SKILL.md`
**Note:** PSS has no server dependencies (zero curl calls to localhost, zero AI Maestro API calls).

---

### TODO-PSS1: Replace Inline Index-Parsing Python Block with PSS Binary Search Flag
- **File:** `skills/pss-agent-toml/SKILL.md`
- **Lines:** ~214–256 (Phase 2, Step 2.2 — "Search for additional candidates")
- **Priority:** P1
- **Depends on:** PSS Rust binary must gain a `--search` flag (PSS maintainer task, prerequisite). No AI Maestro server dependency.
- **Current:** The skill embeds a raw `cat ~/.claude/cache/skill-index.json | python3 -c "import json, sys; idx = json.load(sys.stdin); ..."` block. This hardcodes the internal cache path (`~/.claude/cache/skill-index.json`), duplicates query logic already owned by the PSS Rust binary, and will silently break if the cache schema or location ever changes.
- **Change:** Remove the entire inline `cat | python3` block. Replace it with a call to the PSS binary's new search mode:
  ```bash
  "$BINARY_PATH" --search "<search_term>" [--type=skill|agent|command|rule|mcp|lsp] [--category=<category>] [--language=<lang>]
  ```
  The skill text should describe WHAT to search for (semantics and candidate criteria), not HOW to parse the index file. If the `--search` flag is not yet available in the binary, add a note that manual index inspection is a temporary fallback and should be removed once the flag ships. Do not leave the inline Python block as a fallback in the published skill.
- **Verify:**
  1. `grep -n "skill-index.json\|python3 -c\|import json, sys" skills/pss-agent-toml/SKILL.md` returns zero results.
  2. `grep -n 'BINARY_PATH.*--search' skills/pss-agent-toml/SKILL.md` returns at least one match in the Phase 2, Step 2.2 section.
  3. Running `"$BINARY_PATH" --search "some-term"` against a built PSS binary returns candidate results without errors.

---

### TODO-PSS2: Replace Explicit gh API Endpoint Paths with Prose Instructions
- **File:** `skills/pss-agent-toml/SKILL.md`
- **Lines:** ~406, 407, 419 (Phase 4, Steps 4.3 and 4.4)
- **Priority:** P2
- **Depends on:** None (PSS has no server dependencies)
- **Current:** The skill embeds explicit GitHub REST API endpoint patterns directly in the instruction text:
  ```
  gh api repos/<owner>/<repo>/contents/.claude-plugin/plugin.json
  gh api repos/<owner>/<repo>/contents/skills/<name>/SKILL.md
  gh api repos/<owner>/<repo>/contents/skills   (or /agents)
  ```
  These spell out HOW to call the API (full URL path templates) rather than WHAT to accomplish, which is a low-severity API_SYNTAX violation of the Plugin Abstraction Principle.
- **Change:** Replace the three lines containing explicit `/repos/<owner>/<repo>/contents/<path>` patterns with prose instructions that describe the goal. Example replacement:
  ```markdown
  Fetch the plugin manifest from the GitHub repository using `gh api` with the
  repository contents endpoint. Navigate the `skills/` and `agents/` directories
  to extract SKILL.md files and agent definitions as needed.
  ```
  The `gh api` tool reference is acceptable (it is a standard globally-installed CLI); only the spelled-out endpoint path templates need to be replaced with descriptive prose.
- **Verify:**
  1. `grep -n 'repos/<owner>/<repo>/contents' skills/pss-agent-toml/SKILL.md` returns zero results.
  2. The Phase 4 Steps 4.3 and 4.4 sections still convey the intent (fetch plugin manifest, read skills/agents directories from GitHub) to a reader of the skill.
  3. No functional capability described in Phase 4 has been removed — only the explicit endpoint path syntax has been replaced with prose.

---

## Summary Table

| ID | File | Lines | Violation Type | Severity | Priority | Depends On |
|----|------|-------|---------------|----------|----------|-----------|
| PSS1 | `skills/pss-agent-toml/SKILL.md` | ~214–256 | LOCAL_REGISTRY | MODERATE | P1 | PSS binary `--search` flag |
| PSS2 | `skills/pss-agent-toml/SKILL.md` | ~406, 407, 419 | API_SYNTAX | LOW | P2 | None |

## Implementation Sequence

1. **PSS maintainer**: Add `--search [--type] [--category] [--language]` flag to the PSS Rust binary.
2. **PSS1**: Once `--search` flag exists, update `skills/pss-agent-toml/SKILL.md` lines ~214–256 to call the binary instead of the inline Python block.
3. **PSS2**: Independently (no prerequisites), update lines ~406, 407, 419 to replace explicit `gh api` path templates with prose instructions.

Both changes are confined to a single file (`skills/pss-agent-toml/SKILL.md`) and have no dependencies on the AI Maestro server.
