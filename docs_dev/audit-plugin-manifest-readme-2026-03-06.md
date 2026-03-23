# AI Maestro Plugin Audit: Manifest, README, and Structure

**Date:** 2026-03-06
**Plugin path:** `plugin/plugins/ai-maestro/`
**Submodule repo:** `https://github.com/23blocks-OS/ai-maestro-plugins.git`

---

## 1. plugin.json Completeness

**Current contents:**
```json
{
  "name": "ai-maestro",
  "version": "1.0.0",
  "author": { "name": "23blocks" },
  "homepage": "https://github.com/23blocks-OS/ai-maestro",
  "license": "MIT"
}
```

### Findings

| Field | Status | Severity |
|-------|--------|----------|
| `name` | PRESENT, valid kebab-case | OK |
| `version` | PRESENT, valid semver | OK |
| `description` | **MISSING** | MINOR (recommended by validator) |
| `keywords` | **MISSING** | INFO (known field, not used) |
| `author` | PRESENT, valid object with `name` | OK |
| `homepage` | PRESENT, valid string | OK |
| `license` | PRESENT, valid string | OK |
| `repository` | **MISSING** | INFO (would help discoverability) |
| `commands` | **MISSING** | N/A (plugin has no commands/) |
| `agents` | **MISSING** | N/A (plugin has no agents/) |
| `skills` | **MISSING** | INFO (skills exist at `skills/` but not declared in manifest) |
| `hooks` | **MISSING** | OK (hooks/hooks.json is auto-loaded by Claude Code, so this is correct) |

**Key issue:** The `description` field is recommended by the validation script (line 108) and its absence will trigger a MINOR warning. Adding a one-line description would fix this.

**Note on `skills`:** The manifest does not declare the `skills` path, but Claude Code auto-discovers `skills/` at the plugin root, so this is functionally OK. However, declaring it would be more explicit.

---

## 2. Validator Compliance Check

Based on `validate_plugin.py` (v1.7.5), running against this plugin would produce:

| Check | Expected Result |
|-------|-----------------|
| `validate_manifest` | PASS (name present), MINOR (description missing) |
| `validate_structure` | PASS (.claude-plugin exists, skills/, hooks/, scripts/ present) |
| `validate_hooks` | Depends on hook validator (see section 6) |
| `validate_skills` | Depends on skill validator (7 skills) |
| `validate_readme` | PASS (README.md exists) |
| `validate_license` | **MINOR** (no LICENSE file in plugin dir) |
| `validate_no_local_paths` | Unknown (not checked in this audit) |
| `validate_gitignore` | **MINOR** (no .gitignore in plugin dir) |

---

## 3. README.md Accuracy

**Current content (9 lines):**
```
# AI Maestro Plugin

Built from plugin.manifest.json with 2 sources.

**Skills:** 6 | **Scripts:** 44

Built at: 2026-02-20T18:24:27Z

See the [main repo](https://github.com/23blocks-OS/ai-maestro-plugins) for source files and build instructions.
```

### Findings

| Issue | Severity | Detail |
|-------|----------|--------|
| **Wrong skill count** | ERROR | Claims 6 skills, but there are **7 skills** (agent-messaging, ai-maestro-agents-management, docs-search, graph-query, memory-search, planning, team-governance). The `team-governance` skill was added 2026-02-27 AFTER the build date. |
| **Script count correct** | OK | Claims 44 scripts, actual is 44. |
| **No description of skills** | MAJOR | Does not list or describe any of the 7 skills. |
| **No description of scripts** | MAJOR | Does not list or describe any of the 44 scripts. |
| **No description of hooks** | MAJOR | Does not mention the 4 hook events (Notification, Stop, SessionStart, InstructionsLoaded). |
| **No installation instructions** | MINOR | No guidance on how to install the plugin. |
| **No usage instructions** | MINOR | No guidance on how to use the plugin features. |
| **Build date stale** | INFO | Build date is 2026-02-20 but files were modified as recently as 2026-03-05. |
| **Boilerplate feel** | INFO | Looks auto-generated and not intended for end users. |
| **Only 9 lines** | MAJOR | Insufficient for a plugin with 7 skills, 44 scripts, and 4 hook events. |

---

## 4. Missing Files

| File | Status | Severity |
|------|--------|----------|
| `LICENSE` | **MISSING** from plugin dir | MINOR (validator checks for it) |
| `CHANGELOG` or `CHANGELOG.md` | **MISSING** from plugin dir | INFO (not validated but good practice) |
| `.gitignore` | **MISSING** from plugin dir | MINOR (validator checks for it) |
| `commands/` dir | Not present | OK (plugin uses skills+scripts, not commands) |
| `agents/` dir | Not present | OK (plugin has no agent definitions) |
| `docs/` dir | Not present | INFO (optional per validator) |
| `rules/` dir | Not present | INFO (optional per validator) |

**Note:** LICENSE and CHANGELOG exist in the parent ai-maestro repo, but NOT in the plugin subdirectory itself. The validator checks inside the plugin root.

---

## 5. Installed Plugin Status

The ai-maestro plugin is **NOT listed** in `~/.claude/plugins/installed_plugins.json`. This means it is either:
- Installed via a different mechanism (submodule, manual symlink)
- Not registered with the Claude Code plugin system
- Managed outside the marketplace install flow

This is expected for a first-party plugin bundled as a git submodule.

---

## 6. hooks.json Analysis

**Structure:**
```json
{
  "description": "...",
  "hooks": {
    "Notification": [...],
    "Stop": [...],
    "SessionStart": [...],
    "InstructionsLoaded": [...]
  }
}
```

### Findings

| Issue | Severity | Detail |
|-------|----------|--------|
| **Top-level `description` field** | WARNING | The Claude Code plugin spec expects hooks.json to have only `hooks` at the top level. The `description` field is non-standard and may be ignored or cause a warning from the validator. |
| **`Notification` hook event** | UNKNOWN | Need to verify `Notification` is a valid hook event in the Claude Code plugin spec. Standard events include: `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`, `InstructionsLoaded`, `Notification`. If valid, OK. |
| **`matcher` field on Notification** | OK | Uses `idle_prompt|permission_prompt` which is a valid matcher pattern for Notification hooks. |
| **Single script for all hooks** | OK | All 4 hook events delegate to `ai-maestro-hook.cjs`. This is a valid pattern. |
| **5-second timeout** | OK | Reasonable timeout for a hook script. |
| **`${CLAUDE_PLUGIN_ROOT}` usage** | OK | Correctly uses the plugin root variable for portability. |
| **No `Stop` matcher** | OK | Stop hooks don't need matchers. |

---

## 7. Unreferenced Scripts

The following 16 scripts exist in `scripts/` but are NOT referenced by any skill SKILL.md or hooks.json:

| Script | Likely Purpose | Risk |
|--------|---------------|------|
| `amp-delete.sh` | AMP: delete message | Should be in agent-messaging skill |
| `amp-download.sh` | AMP: download attachment | Should be in agent-messaging skill |
| `amp-fetch.sh` | AMP: fetch from providers | Should be in agent-messaging skill |
| `amp-helper.sh` | AMP: shared utilities | Used by other amp-* scripts internally |
| `amp-identity.sh` | AMP: identity management | Should be in agent-messaging skill |
| `amp-inbox.sh` | AMP: check inbox | Should be in agent-messaging skill |
| `amp-init.sh` | AMP: initialize identity | Should be in agent-messaging skill |
| `amp-read.sh` | AMP: read message | Should be in agent-messaging skill |
| `amp-register.sh` | AMP: register with provider | Should be in agent-messaging skill |
| `amp-reply.sh` | AMP: reply to message | Should be in agent-messaging skill |
| `amp-security.sh` | AMP: security utilities | Used by other amp-* scripts internally |
| `amp-send.sh` | AMP: send message | Should be in agent-messaging skill |
| `amp-status.sh` | AMP: check status | Should be in agent-messaging skill |
| `export-agent.sh` | Export agent config | Should be in agents-management skill |
| `import-agent.sh` | Import agent config | Should be in agents-management skill |
| `list-agents.sh` | List agents | Should be in agents-management skill |

**Root cause:** The `agent-messaging` SKILL.md does not reference any `amp-*.sh` scripts by filename. It likely describes the AMP commands conceptually but the grep for `.sh` references returned nothing. This means the skill describes functionality without explicitly naming the backing scripts, OR uses a different referencing mechanism (e.g., `amp-send` without the `.sh` extension).

Similarly, `export-agent.sh`, `import-agent.sh`, and `list-agents.sh` are not referenced in the `ai-maestro-agents-management` SKILL.md by their filenames.

---

## 8. File Permissions

All 44 `.sh` files in `scripts/` are executable (`-rwxr-xr-x`). The `.cjs` file is also executable. No permission issues found.

---

## 9. Submodule Configuration

| Check | Status |
|-------|--------|
| `.gitmodules` entry | OK - points to `https://github.com/23blocks-OS/ai-maestro-plugins.git` |
| Submodule path | `plugin` (correct) |
| Submodule error | WARNING - `fatal: no submodule mapping found in .gitmodules for path 'plugins/amp-messaging'` - there is a nested path `plugins/amp-messaging` that has submodule metadata but no `.gitmodules` entry. This is a broken nested submodule reference. |
| Remotes | `origin` = 23blocks-OS, `fork` = Emasoft (both configured) |

---

## Summary of Issues by Severity

### CRITICAL (0)
None.

### MAJOR (4)
1. README.md is only 9 lines - insufficient for the plugin's scope
2. README claims 6 skills but there are 7 (team-governance added after build)
3. README does not describe any skills, scripts, or hooks
4. Broken nested submodule reference for `plugins/amp-messaging`

### MINOR (4)
1. plugin.json missing `description` field (recommended by validator)
2. No LICENSE file in plugin directory (validator checks for it)
3. No .gitignore in plugin directory (validator checks for it)
4. 16 scripts not referenced by any skill SKILL.md or hooks.json

### INFO (4)
1. No CHANGELOG in plugin directory
2. No `docs/` or `rules/` directories
3. Plugin not in installed_plugins.json (expected for submodule)
4. README build date (2026-02-20) is stale vs latest file changes (2026-03-05)
