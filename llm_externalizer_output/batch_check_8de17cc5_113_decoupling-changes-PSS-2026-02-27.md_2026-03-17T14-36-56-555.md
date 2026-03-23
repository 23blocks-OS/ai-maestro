# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:36:56.555Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/decoupling-changes-PSS-2026-02-27.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/decoupling-changes-PSS-2026-02-27.md
Line 1: # Decoupling Changes — PSS (perfect-skill-suggester) v1.9.5
Line 3: **Date:** 2026-02-27
Line 7: Plugin skills should reference AI Maestro's global skills by name (not embed API syntax).
Line 12: The PSS plugin is **substantially compliant** with the Plugin Abstraction Principle. Of 15 audited files, only **2 isolated violations** exist, both in `skills/pss-agent-toml/SKILL.md`:
Line 20: | **V1** | `skills/pss-agent-toml/SKILL.md` | MODERATE | LOCAL_REGISTRY | ~214–256 | Embeds `cat ~/.claude/cache/skill-index.json \| python3 -c "..."` to directly parse the skill index cache | Replace with documented call to PSS binary search mode: `"$BINARY_PATH" --search "<term>" [--type=X] [--category=Y]` |
Line 21: | **V2** | `skills/pss-agent-toml/SKILL.md` | LOW | API_SYNTAX | ~406, 407, 419 | Hardcodes `gh api repos/<owner>/<repo>/contents/...` endpoint paths directly in skill text | Replace endpoint paths with prose: "Fetch the plugin manifest from the GitHub repository using `gh api`..." |
Line 38: - If cache schema/location changes in AI Maestro, code silently breaks
Line 47: - The PSS Rust binary MUST support `--search` flag (or equivalent)
Line 48: - Skill MUST NOT embed raw index-parsing code
Line 49: - Skill MUST describe WHAT to search for (semantics), not HOW to parse the index (implementation)
Line 71: - No explicit `/repos/<owner>/<repo>/contents/<path>` patterns in skill text
Line 72: - Instructions describe goal ("fetch manifest"), not API path
Line 73: - Agent implementation MAY use exact endpoint paths (implementation is allowed), but skill spec should not
Line 83: - ✓ `skills/pss-usage/SKILL.md` — Purely instructional, references PSS commands by name
Line 86: - ✓ `agents/pss-agent-profiler.md` — Correctly calls PSS Rust binary via `${BINARY_PATH}`
Line 89: - ✓ `commands/pss-setup-agent.md` — Platform detection and binary path resolution (implementation detail, allowed in commands)
Line 90: - ✓ `commands/pss-status.md` — Local filesystem checks only, no API calls
Line 91: - ✓ `commands/pss-reindex-skills.md` — Calls plugin-local scripts and OS tools only
Line 94: - ✓ `scripts/pss_hook.py` — Calls PSS Rust binary via subprocess, no AI Maestro API
Line 95: - ✓ `scripts/pss_discover.py` — Reads local filesystem only
Line 96: - ✓ `scripts/pss_setup.py` — Calls cargo and PSS binary only
Line 97: - ✓ `scripts/pss_generate.py` — Pure filesystem operations
Line 98: - ✓ `scripts/pss_build.py` — Calls cargo, cross, docker only
Line 99: - ✓ `scripts/pss_cleanup.py` — Pure filesystem operations
Line 100: - ✓ `scripts/pss_merge_queue.py` — Atomically merges `.pss` files into index
Line 103: - ✓ `hooks/hooks.json` — Calls plugin-local `pss_hook.py` (no AI Maestro API)
Line 104: - ✓ `.claude-plugin/plugin.json` — Standard manifest, no API endpoints
Line 108: The PSS plugin demonstrates **strong isolation** from AI Maestro:
Line 110: - **No curl calls to localhost:23000** — 0 instances
Line 111: - **No AI Maestro API endpoints** embedded anywhere
Line 112: - **No hardcoded governance rules** (roles, policies, approval chains)
Line 113: - **No AMP messaging** (`amp-send.sh`, `amp-inbox.sh`) — correct, PSS doesn't need inter-agent communication
Line 114: - **No Bearer tokens or API key patterns** — correct
Line 115: - **Hooks call plugin-local scripts only** (`pss_hook.py`) — correct architecture
Line 116: - **Scripts call globally-installed tools** (cargo, cross, docker) or plugin-local binary — correct pattern
Line 117: - **`CLAUDE_PLUGIN_ROOT` used consistently** for plugin-relative paths — best practice
Line 121: **Proposal:** PSS could optionally query AI Maestro's `team-governance` skill to enrich skill suggestions with team context:
Line 124: Team context: ai-team-governance --agent="<name>" --list-policies
Line 127: - PSS currently suggests skills without considering team governance policies
Line 128: - If an agent must follow a team approval chain, PSS could pre-filter suggestions
Line 129: - This would require PSS to call a global skill (not the API directly)
Line 137: | **1** | Add `--search` flag to PSS Rust binary | PSS maintainer | Sprint N |
Line 138: | **2** | Update `skills/pss-agent-toml/SKILL.md` with V1 fix | PSS maintainer | Sprint N+1 |
Line 139: | **3** | Update skill with V2 polish (gh API prose) | PSS maintainer | Sprint N+1 |
Line 140: | **4** (Optional) | Integrate `team-governance` skill for enrichment | PSS maintainer | v2.0 backlog |
Line 146: - [ ] V1 fix: `pss-agent-toml/SKILL.md` uses `--search` flag, no inline Python parsing
Line 147: - [ ] V2 fix: `pss-agent-toml/SKILL.md` references gh API by goal, not endpoint path
Line 148: - [ ] Re-audit: `decoupling-audit-PSS-raw.md` shows 0 violations (only optional enhancements remain)
Line 149: - [ ] Backward compatibility: PSS binary must accept old queries during transition period (if needed)
Line 150: - [ ] Tests pass: Run PSS E2E tests to confirm skill/agent/command workflows still work
Line 154: - **Raw Audit:** `docs_dev/decoupling-audit-PSS-raw.md`
Line 155: - **Plugin Abstraction Principle:** `docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`
Line 156: - **PSS Plugin:** `plugin/plugins/ai-maestro/` (git submodule)
```