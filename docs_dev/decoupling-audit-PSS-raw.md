# PSS Plugin - Plugin Abstraction Principle Audit
Generated: 2026-02-27
Auditor: file-search-specialist agent

---

## SUMMARY

Overall assessment: **MOSTLY COMPLIANT** with isolated, low-severity issues.

The PSS plugin is architecturally well-separated. Scripts call a local Rust binary (not the AI Maestro API). Hooks call `pss_hook.py` (not `amp-send.sh` or aimaestro endpoints). No hardcoded governance rules exist. No `curl` calls to localhost. No AI Maestro API endpoints embedded anywhere.

However, there are several issues that need addressing, primarily in the `pss-agent-toml` SKILL.md:

---

## FILE-BY-FILE FINDINGS

---

### 1. `skills/pss-agent-toml/SKILL.md`

**Violation type: LOCAL_REGISTRY (Moderate)**

**Section: Phase 2, Step 2.2 — "Search for additional candidates"** (lines ~214–256)

The skill embeds a full inline Python one-liner that directly reads and queries the local skill-index.json cache file:

```bash
cat ~/.claude/cache/skill-index.json | python3 -c "
import json, sys
idx = json.load(sys.stdin)
...
"
```

This is a LOCAL_REGISTRY access pattern — the skill bypasses the PSS binary and directly queries the internal index cache. This violates the Plugin Abstraction Principle because:
- It hardcodes the internal cache path (`~/.claude/cache/skill-index.json`)
- It duplicates query logic already in the Rust binary (`--incomplete-mode` or standard queries)
- If the cache schema or location changes in AI Maestro, this inline code silently breaks

**What needs to change:** Replace the raw `cat | python3 -c` block with a documented call to the PSS binary's search mode (e.g., `"$BINARY_PATH" --search "<term>" [--type=X]`). If the binary doesn't support search mode yet, that binary feature should be added and this skill updated to use it. The skill should describe WHAT to search for (semantics), not embed raw index-parsing code.

---

**Violation type: API_SYNTAX (Minor)**

**Section: Phase 4, Steps 4.3 and 4.4** (lines ~406–421)

The skill embeds raw `gh api` CLI calls with explicit GitHub API endpoint paths:

```
Line 406: `gh api repos/<owner>/<repo>/contents/.claude-plugin/plugin.json`
Line 407: `gh api repos/<owner>/<repo>/contents/skills/<name>/SKILL.md`
Line 419: `gh api repos/<owner>/<repo>/contents/skills` or `/agents`
```

These are GitHub REST API endpoint URL patterns embedded directly in the skill. While `gh api` is a standard tool (not the AI Maestro API), embedding full endpoint URL patterns is a form of API_SYNTAX hardcoding — the skill instructs the agent on HOW to call the API rather than WHAT to accomplish.

**What needs to change:** These are borderline acceptable since `gh api` is a standard globally-installed GitHub CLI tool. However, the skill could be improved by saying "Fetch the plugin manifest from the GitHub repository using the gh CLI" rather than spelling out the exact endpoint paths. The current form is verbose but not critically wrong. Severity: LOW.

---

**Violation type: MISSING_SKILL_REF (Low)**

**Section: Overview and Prerequisites** (lines ~40–43)

The skill mentions `/pss-reindex-skills` and `/pss-setup-agent` as self-referential slash commands within the PSS plugin — this is fine. However, the skill never references any AI Maestro skills for capabilities it doesn't own (e.g., when instructing the agent to detect team governance settings or validate agent configurations against team policies). There is no reference to `team-governance` or `ai-maestro-agents-management` skills.

**Assessment:** Not a direct violation since the skill's scope (building .agent.toml profiles) is legitimately self-contained and does not overlap with governance concerns. No governance-checking is attempted, so no delegation is needed. CLEAN.

---

### 2. `skills/pss-usage/SKILL.md`

**VERDICT: NO VIOLATIONS**

This file is purely instructional. It references PSS commands (`/pss-status`, `/pss-reindex-skills`, `/pss-setup-agent`) by name. No embedded API syntax, no curl calls, no hardcoded governance, no localhost references. Clean separation.

---

### 3. `agents/pss-agent-profiler.md`

**Violation type: LOCAL_REGISTRY (Minor)**

**Section: Step 3 — "Build Agent Descriptor and Invoke Rust Binary"** (lines ~63–70)

The agent embeds inline bash to determine a temp directory via python3:

```bash
PSS_TMPDIR=$(python3 -c "import tempfile; print(tempfile.gettempdir())")
PSS_INPUT="${PSS_TMPDIR}/pss-agent-profile-input-$$.json"
```

This is not a violation per se — it's a local filesystem operation, not an API call. CLEAN.

**Violation type: LOCAL_REGISTRY (Moderate)**

**Section: Step 3 — Implicit binary path convention** (lines ~94–98)

The agent references `${BINARY_PATH}` which is resolved from `CLAUDE_PLUGIN_ROOT` — this is correct pattern (uses plugin-relative paths). However, the agent assumes Step 3 builds a JSON file via heredoc (`cat > "${PSS_INPUT}" << 'ENDJSON'`) which relies on shell heredoc syntax. This is implementation detail leakage into the agent spec.

**Assessment:** Borderline. This is an agent definition file that must be executable — embedding bash command patterns is expected. Not a violation of the Plugin Abstraction Principle since it's calling the PSS binary (internal), not the AI Maestro API (external). CLEAN.

**VERDICT: NO VIOLATIONS** — The agent correctly calls its own Rust binary, uses `${CLAUDE_PLUGIN_ROOT}` for paths, and does not call any AI Maestro API endpoints or embed governance rules.

---

### 4. `commands/pss-setup-agent.md`

**Violation type: API_SYNTAX (Minor)**

**Section: Step 5 — Validate CLAUDE_PLUGIN_ROOT** (lines ~53–67)

The command embeds inline Python code blocks:

```python
import os
from pathlib import Path
plugin_root_str = os.environ.get("CLAUDE_PLUGIN_ROOT")
...
```

And:

```python
import platform, os
system = platform.system()
machine = platform.machine()
...
PLATFORM_MAP = { ... }
BINARY = os.path.join(plugin_root, "rust", "skill-suggester", "bin", binary_name)
```

These are implementation patterns (platform detection, binary path resolution) embedded directly in the command spec. This is borderline: commands legitimately include execution instructions, and these call no external APIs. The PLATFORM_MAP dictionary is a hardcoded map of OS/arch strings → binary names.

**Assessment:** This is internal plugin logic (path resolution), not AI Maestro API syntax. The `PLATFORM_MAP` is a plugin-internal constant. Not a violation of the Plugin Abstraction Principle as defined. CLEAN by a narrow margin.

**VERDICT: NO VIOLATIONS** — No localhost, no curl, no AI Maestro API calls, no hardcoded governance.

---

### 5. `commands/pss-status.md`

**VERDICT: NO VIOLATIONS**

The command uses:
- Bash to check local file existence: `~/.claude/cache/skill-index.json` (local filesystem, not API)
- `stat` to check file modification time (OS tool, not API)
- References `${CLAUDE_PLUGIN_ROOT}/scripts/pss_test_e2e.py` (plugin-relative path, correct)
- The `curl` pattern that appears: NONE found

**curl reference check:** The `curl` search returned no results in this file. CLEAN.

---

### 6. `commands/pss-reindex-skills.md`

**Violation type: LOCAL_REGISTRY (Low)**

**Section: Phase 0 — Backup procedure** (lines ~183–212)

The command hardcodes `~/.claude/cache/skill-index.json` and `~/.claude/cache/skill-checklist.md` as explicit paths in bash code blocks. These are correct local filesystem paths for PSS's own cache, not AI Maestro API endpoints. CLEAN.

**Section: Step 5a and 8a — Validation** (lines ~435–436, ~641–642)

```bash
cd "${PLUGIN_ROOT}" && uv run --with pyyaml python scripts/validate_plugin.py . --verbose
```

This calls a plugin-local validation script via `uv run`. Correct pattern. CLEAN.

**Section: Step 8d — Domain aggregation** (line ~714)

```bash
python3 "${PLUGIN_ROOT}/scripts/pss_aggregate_domains.py" --verbose
```

Plugin-relative path. Correct. CLEAN.

**VERDICT: NO VIOLATIONS** — All script calls are to plugin-local scripts or standard OS tools. No AI Maestro API calls. No governance hardcoding.

---

### 7. `scripts/pss_hook.py`

**VERDICT: NO VIOLATIONS**

The hook script:
- Calls the PSS Rust binary via `subprocess.run()` (lines 736–754) — plugin-internal, correct
- Reads local files: `~/.claude/cache/skill-index.json` (plugin cache) and transcript path (injected by Claude Code) — local filesystem, not API
- Does NOT call `amp-send.sh`, `aimaestro-agent.sh`, or any AI Maestro API endpoint
- The `curl` references found (lines 123, 112, 267 in pss_setup.py and pss_build.py) are Rustup installation instructions in user-facing error messages, NOT API calls

The subprocess call calls `str(binary_path)` — the PSS Rust binary. This is the correct pattern: hooks/scripts call globally-installed scripts or plugin-local binaries, not the AI Maestro API.

**Curl references in error messages:**
- `pss_setup.py` line 123: `"curl --proto '=https' --tlsv1.2 ... sh.rustup.rs | sh"` — user-facing help text, not an API call
- `pss_build.py` lines 112, 267: same rustup installation instructions

These are NOT violations — they are user-facing help strings showing how to install Rust, not actual curl calls made by the script.

---

### 8. `scripts/pss_discover.py`

**VERDICT: NO VIOLATIONS**

Reads local filesystem only (`~/.claude.json`, `~/.claude/`, `~/.mcp.json`, etc.). No subprocess network calls. No AI Maestro API calls. No curl. No localhost.

---

### 9. `scripts/pss_setup.py`

**VERDICT: NO VIOLATIONS** (with caveat on curl in error messages)

- `subprocess.run(["cargo", "--version"])` — calls cargo (globally installed tool), correct
- `subprocess.run([str(binary_path), "--version"])` — calls PSS binary, correct
- `subprocess.run([sys.executable, str(validator)])` — calls plugin-local script, correct
- `subprocess.run([sys.executable, str(test_script), "--verbose"])` — correct

Curl references are in printed error message strings only (lines 123, etc.) — not actual network calls.

---

### 10. `scripts/pss_generate.py`

**VERDICT: NO VIOLATIONS**

Pure filesystem operations. Reads `.md` files, writes `.pss` JSON files to temp queue. No network calls, no API calls, no governance hardcoding.

---

### 11. `scripts/pss_build.py`

**VERDICT: NO VIOLATIONS** (with caveat on curl in error messages)

- `subprocess.run(["cargo", "build", ...])` — calls cargo (globally installed tool), correct
- `subprocess.run(["cross", "build", ...])` — calls cross (globally installed tool), correct
- `subprocess.run(["docker", "info"])` — calls docker to check if running, correct
- Curl references are in printed error message strings only (help text for users to install Rust)

---

### 12. `scripts/pss_cleanup.py`

**VERDICT: NO VIOLATIONS**

Pure filesystem operations. No network, no API, no subprocess calls.

---

### 13. `scripts/pss_merge_queue.py`

**VERDICT: NO VIOLATIONS**

Reads `.pss` files, writes `skill-index.json` atomically. Uses `fcntl` for file locking. No network, no API, no subprocess. Purely local file operations.

---

### 14. `hooks/hooks.json`

**VERDICT: NO VIOLATIONS**

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "type": "command", "command": "python3 \"${CLAUDE_PLUGIN_ROOT}/scripts/pss_hook.py\"" }
    ]
  }
}
```

The hook calls `python3 "${CLAUDE_PLUGIN_ROOT}/scripts/pss_hook.py"` — this is a plugin-local script, not an AI Maestro API endpoint. Correct pattern. No localhost URL. No curl. No API endpoint embedded.

---

### 15. `.claude-plugin/plugin.json`

**VERDICT: NO VIOLATIONS**

Standard manifest file. No API endpoints. No governance hardcoding. References only local plugin resource paths.

---

## CONSOLIDATED VIOLATIONS TABLE

| # | File | Violation Type | Severity | Line(s) | Description |
|---|------|---------------|----------|---------|-------------|
| 1 | `skills/pss-agent-toml/SKILL.md` | LOCAL_REGISTRY | MODERATE | ~214–256 | Inline `cat ~/.claude/cache/skill-index.json \| python3 -c "..."` block embeds raw index-parsing code instead of delegating to the PSS binary's search mode |
| 2 | `skills/pss-agent-toml/SKILL.md` | API_SYNTAX | LOW | ~406, 407, 419 | `gh api repos/<owner>/<repo>/contents/...` endpoint paths embedded directly (borderline — gh CLI is standard tool, but endpoint patterns are spelled out) |

---

## WHAT IS CLEAN (Notable)

- **No curl calls to localhost:23000** anywhere in any script or hook
- **No AI Maestro API endpoints** embedded in any skill, agent, command, hook, or script
- **No hardcoded governance rules** anywhere (no role restrictions, no policy checks, no team lead approval requirements)
- **No amp-send.sh / amp-inbox.sh calls** in hooks/scripts (correct: PSS doesn't need messaging)
- **No `Authorization: Bearer` or `Content-Type: application/json` header patterns** in any skill/agent/command
- **Hooks call plugin-local scripts only** (`pss_hook.py`) — not globally-installed AI Maestro scripts (correct for PSS's use case)
- **Scripts call plugin-local binary or globally-installed tools** (cargo, cross, docker, uv) — correct pattern
- The `CLAUDE_PLUGIN_ROOT` environment variable is used consistently and correctly for plugin-relative paths

---

## PRIORITY FIXES

### Fix 1 (MODERATE): Replace inline index search code in `skills/pss-agent-toml/SKILL.md`

**Current (lines ~214-256):**
```bash
cat ~/.claude/cache/skill-index.json | python3 -c "import json, sys; ..."
```

**Proposed fix:** Add a `--search` or `--query` flag to the PSS Rust binary, and update the skill to instruct:
```bash
"$BINARY_PATH" --search "<term>" [--type=skill|agent|command|rule|mcp|lsp] [--category=X] [--language=Y]
```

Or, if the binary cannot be extended, at minimum document that the agent should use the binary's existing candidate generation (Phase 2.1) as the primary search mechanism, and only fall back to manual index inspection if necessary — removing the embedded Python parsing code from the skill spec.

### Fix 2 (LOW): Simplify gh API calls in `skills/pss-agent-toml/SKILL.md`

**Current (lines ~406, 407, 419):**
```
gh api repos/<owner>/<repo>/contents/.claude-plugin/plugin.json
```

**Proposed fix:** Replace with prose instruction:
> "Fetch the plugin manifest from the GitHub repository using `gh api` with the repository contents endpoint, then read the skills/agents directories."

This keeps the semantic intent without embedding the exact API path pattern.

---

## VERDICT

The PSS plugin is **substantially compliant** with the Plugin Abstraction Principle. It correctly avoids calling the AI Maestro API from hooks/scripts, embeds no governance rules, and uses plugin-local paths throughout. The two issues found are minor-to-moderate and limited to one skill file (`skills/pss-agent-toml/SKILL.md`).
