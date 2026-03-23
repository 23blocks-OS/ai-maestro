# Plugin Governance Audit: claude-plugins-validation
**Date:** 2026-03-10
**Auditor:** Claude Code (Sonnet 4.6)
**Repo:** https://github.com/Emasoft/claude-plugins-validation
**Local clone:** /tmp/claude-plugins-validation
**Plugin version:** 1.10.6

---

## Summary

`claude-plugins-validation` is a dependency plugin providing 190+ rule validation tools for Claude Code plugins. It is a utility/tooling plugin — it has no hooks of its own, makes no API calls to AI Maestro internals, and introduces no hardcoded references to `localhost:23000` or any AI Maestro-specific infrastructure.

**Overall governance alignment: COMPATIBLE with minor manifest gaps.**

The plugin is safe to install alongside AI Maestro. There are no conflicts with AI Maestro hooks, skills, agents, or commands. There are no governance violations. Minor improvements are recommended for full alignment.

---

## Integration Status

### Manifest (`.claude-plugin/plugin.json`) — PASS with gaps

The manifest is structurally valid and well-formed:

```json
{
  "name": "claude-plugins-validation",
  "version": "1.10.6",
  "description": "...",
  "author": { "name": "Emasoft", "email": "..." },
  "homepage": "...",
  "repository": "...",
  "license": "MIT",
  "keywords": [...]
}
```

**Present fields (correct):** `name`, `version`, `description`, `author` (object with name+email), `homepage`, `repository`, `license`, `keywords`.

**Missing fields (minor gaps):**
- No `buildDate` field (AI Maestro's own plugin includes this; not strictly required but recommended for traceability).
- No `minClaudeVersion` field (not blocking, but recommended for marketplace compatibility).
- No `tags` field at the manifest level (distinct from `keywords`; used by some marketplace implementations).

**Directory auto-discovery:** The manifest does NOT include redundant `commands`, `agents`, or `skills` directory references, which is correct per Claude Code's auto-discovery rules. No structural violations.

### Hooks — NONE (PASS)

The plugin has **no `hooks/hooks.json`** file. It does not register any Claude Code lifecycle hooks. The `git-hooks/` directory contains only git repository hooks (pre-commit, pre-push), which are development tooling for the plugin's own repo — they are not Claude Code hooks and are never loaded by Claude Code.

**AI Maestro hook conflict check:** None. AI Maestro uses `Notification`, `Stop`, `SessionStart`, and `InstructionsLoaded` hooks via `ai-maestro-hook.cjs`. Since `claude-plugins-validation` registers no hooks at all, there is zero possibility of hook conflict.

### Skills — PASS, No Conflicts

The plugin provides 8 skills:

| Skill | Name in SKILL.md |
|-------|-----------------|
| `fix-validation` | fix-validation |
| `install-plugin` | install-plugin |
| `plugin-validation-skill` | plugin-validation-skill |
| `publish-to-marketplace` | publish-to-marketplace |
| `semantic-validation-skill` | semantic-validation-skill |
| `setup-github-marketplace` | setup-github-marketplace |
| `setup-plugin-repo` | setup-plugin-repo |
| `skill-validation-skill` | skill-validation-skill |

**AI Maestro skill conflict check:** AI Maestro installs 7 skills:
- `agent-messaging`, `ai-maestro-agents-management`, `docs-search`, `graph-query`, `memory-search`, `planning`, `team-governance`

None of these names overlap with `claude-plugins-validation` skills. **No conflicts.**

**Global installed skills conflict check:** Among ~200+ globally installed skills, the closest matches are `plugin-security-audit` and `skill-security-audit` (from existing skills). These are distinct from the new plugin's skills. **No conflicts.**

### Agents — PASS, No Conflicts

The plugin provides 4 agents:

| Agent | Model |
|-------|-------|
| `plugin-validator` | sonnet |
| `skill-validation-agent` | sonnet |
| `plugin-fixer` | sonnet |
| `semantic-validator` | opus |

AI Maestro provides no agents via its plugin (its `agents/` directory does not exist). None of these names conflict with any AI Maestro agents. **No conflicts.**

### Commands — PASS, No Conflicts

The plugin provides 20 slash commands, all prefixed with `/cpv-`. This `cpv-` prefix is unique and does not conflict with any AI Maestro commands (which use no fixed prefix). **No conflicts.**

### API / Network Access — PASS

Thorough search across all scripts, skills, and agents found:
- **No references to `localhost:23000`** (the AI Maestro API port)
- **No references to `localhost:3000`**
- **No references to AI Maestro API endpoints** (`/api/messages`, `/api/sessions`, `/api/v1/*`)
- **No references to AI Maestro internals** (`aimaestro`, `AIMAESTRO`, `ai-maestro`)
- **No references to AMP scripts** (`amp-send.sh`, `amp-inbox.sh`, etc.)

The plugin's validation scripts make only local filesystem operations and invoke external linters (`ruff`, `mypy`, `shellcheck`, `eslint`) via subprocess. The `validate_mcp.py` script checks for localhost URLs in *other plugins' MCP configs* — this is validation logic, not the plugin itself calling localhost.

### Skill YAML Frontmatter — MINOR GAPS

Skills were checked for proper `allowed-tools` declarations and `user-invocable` flags:

- `plugin-validation-skill/SKILL.md`: `allowed-tools: Read, Bash(uv*), Bash(python*), Glob, Grep, Write` — **CORRECT**
- `skill-validation-skill/SKILL.md`: `allowed-tools: Read, Bash(uv*), Bash(python*), Glob, Grep`, `user-invocable: false` — **CORRECT**
- Both skills use `Bash(uv*)` and `Bash(python*)` scoped patterns, which is proper (not blanket `Bash`)

**Minor gap:** The `fix-validation` skill's `SKILL.md` was not audited for `allowed-tools` (it includes `Edit` which is correct for a fix workflow). The `semantic-validation-skill` uses `opus` implicitly via the agent — this is the expected expensive opt-in path documented correctly.

### Token Cost Hook (cpv_token_cost.py) — ADVISORY NOTE

The `cpv_token_cost.py` script is designed to operate as a `SubagentStop` hook (reads from stdin) **or** as a CLI tool. If an AI Maestro user installs this plugin and manually adds `cpv_token_cost.py` to their `settings.json` hooks, it would add a new `SubagentStop` handler.

AI Maestro's own hooks do not use `SubagentStop`. However, the user's global `~/.claude/settings.json` currently has `PreToolUse` (Bash, Read, Task) and `PostToolUse` (Write|Edit) hooks — no `SubagentStop` hook. **No actual conflict at installation time.** This is only advisory: if the user follows the token reporter setup instructions, they should verify it doesn't conflict with any future AI Maestro SubagentStop hooks.

### README Accuracy — MOSTLY ACCURATE, one stale reference

The README accurately describes:
- Installation via marketplace (`claude plugin marketplace add emasoft-plugins ...`)
- Usage via slash commands, agents, and skills
- Script interface and exit codes
- Directory structure

**Stale/inaccurate items found:**
1. README lists `bump_version.py` and `check_version_consistency.py` in the Utility Scripts table, but these files do not exist in the cloned repo (`/tmp/claude-plugins-validation/scripts/`). The actual scripts are `publish.py` (handles version bump) and the version check is embedded in the pre-push hook. This is a documentation gap.
2. README installation instructions reference `--scope user` flag for `claude plugin install` — this is correct per Claude Code plugin API.
3. The `scripts/smart_exec.py` is listed in README but exists in the repo — correct.

---

## Conflicts Found

**None confirmed.** The following were investigated and cleared:

| Area | Investigation Result |
|------|---------------------|
| Hook conflicts | No hooks registered — zero risk |
| Skill name conflicts | All 8 skill names unique vs AI Maestro |
| Agent name conflicts | All 4 agent names unique vs AI Maestro |
| Command conflicts | All `/cpv-*` prefixed, no overlaps |
| API hardcoding | No AI Maestro endpoints referenced |
| AMP messaging | No AMP scripts referenced |
| Port conflicts | No localhost:23000 references |
| SubagentStop hook | Not installed by default — advisory only |

---

## Alignment Instructions

### Required Changes (for full governance alignment)

None strictly required. The plugin is compatible as-is.

### Recommended Changes (for better alignment)

**1. Plugin manifest: add `buildDate`**

AI Maestro's own plugin includes `buildDate` for traceability. Add to `.claude-plugin/plugin.json`:
```json
"buildDate": "2026-03-10"
```
This is a quality recommendation, not a blocker.

**2. README: fix stale script names**

`bump_version.py` and `check_version_consistency.py` are listed in the Utility Scripts table but are not present in the repo. Either add these scripts or update the README to reference `publish.py` (which handles version bumping) and remove `check_version_consistency.py`.

**3. cpv_token_cost.py: document SubagentStop hook registration separately**

If users follow the hook setup instructions to add `cpv_token_cost.py` as a `SubagentStop` hook, they should verify it does not conflict with AI Maestro's future SubagentStop additions. The README or the script itself should note this coexistence pattern.

**4. Plugin manifest: consider adding `minClaudeVersion`**

For marketplace compatibility and governance traceability, adding a minimum Claude Code version requirement would clarify deployment constraints.

### Integration Pattern for AI Maestro Agents

AI Maestro agents wanting to use this plugin's validation skills should:

1. Reference skills by their canonical names: `plugin-validation-skill`, `skill-validation-skill`, `fix-validation`
2. Use the slash commands (`/cpv-validate-plugin`, `/cpv-validate-skill`, etc.) rather than calling Python scripts directly
3. Never embed API syntax or call validation scripts from AI Maestro hooks — use the plugin's own agents/commands as the abstraction layer (consistent with the Plugin Abstraction Principle documented in AI Maestro's `docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`)
4. The `plugin-validator` and `plugin-fixer` agents are leaf agents (no sub-agent spawning) — compatible with AI Maestro's orchestration model

### No Action Needed

- The plugin's git-hooks (`git-hooks/pre-commit`, `git-hooks/pre-push`) are development tools for the plugin's own repository. They are not Claude Code hooks and cannot interfere with AI Maestro.
- The `validate_hook.py` script correctly recognizes all Claude Code hook event types including `InstructionsLoaded` (the most recently added event). This means AI Maestro's hooks would pass validation if run through this plugin's validator.
- The `cpv_token_cost.py` SubagentStop integration is an optional user-configured feature, not auto-installed.

---

## Conclusion

`claude-plugins-validation` v1.10.6 is **governance-aligned and safe to use alongside AI Maestro**. It is a pure utility plugin with no hooks, no API dependencies, and no name conflicts. AI Maestro agents can reference its validation skills and slash commands following the Plugin Abstraction Principle. The two plugins are fully independent in their runtime behavior.
