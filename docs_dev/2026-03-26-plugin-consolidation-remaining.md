# Plugin Consolidation — Remaining Work

**Date:** 2026-03-26
**Session:** feature/team-governance

## What's Done

### Architecture
- Submodule removed from ai-maestro main repo
- Scripts moved to `scripts/` in main repo
- Marketplace (`ai-maestro-plugins`) is manifest-only, all 9 plugins reference GitHub repos
- `Emasoft/ai-maestro-plugin` repo created with 9 skills, 32 scripts, hooks
- Forks created: `Emasoft/claude-plugin`, `Emasoft/agent-identity`

### CI/CD
- All 9 plugin repos have standardized workflows: `validate.yml`, `release.yml`, `notify-marketplace.yml`
- Marketplace has `update-versions.yml` + `validate.yml`
- All use CPV uvx remote validation (no local scripts)
- Quality gate: blocks on CRITICAL + MAJOR, allows MINOR

### Installers
- All installers updated: scripts from `scripts/`, plugins from marketplace
- No standalone skill installation — all skills from plugins

## What's Remaining

### 1. Fix CPV validation issues in ai-maestro-plugin
82 MAJOR + 89 MINOR issues. Use CPV's built-in fix skills:
```
/cpv-fix-validation  ← reads validation report, applies fixes one by one
```
Main problems: oversized SKILL.md files (split into references), unscoped Bash.
Must fix ALL issues (MAJOR + MINOR) — strict validation required.
Run on: `/tmp/ai-maestro-plugin-prep` (local clone) or clone `Emasoft/ai-maestro-plugin`

### 2. Fix CPV validation in ai-maestro-programmer-agent
1 MAJOR issue (pre-existing)

### 3. Version tagging for all plugins
**CRITICAL REQUIREMENT:** Every push must correspond to a version bump + tag.
- Each plugin needs: bump version in plugin.json → commit → tag v*.*.* → push
- The release.yml workflow triggers on tags and creates GitHub Releases
- The marketplace update-versions.yml picks up new versions

### 4. Create PRs for the 3 repos we don't control
- `Emasoft/ai-maestro-plugins` → `23blocks-OS/ai-maestro-plugins` (feat/add-role-plugins)
- `Emasoft/claude-plugin` → `agentmessaging/claude-plugin` (feat/add-marketplace-workflows)
- `Emasoft/agent-identity` → `agentmessaging/agent-identity` (feat/add-marketplace-workflows)

### 5. Update CLAUDE.md with final architecture
- Remove any remaining references to old structure
- Document the 9-plugin marketplace architecture
- Document the CI/CD pipeline

## Key Rules
- Every push = version bump + tag
- All MAJOR and MINOR issues must be fixed (strict validation)
- Each plugin is in its own GitHub repo
- Marketplace is manifest-only
- Scripts in main repo `scripts/`, installed to `~/.local/bin/`
- Plugins installed from marketplace via `claude plugin install`
- emasoft-* and ai-maestro-* ecosystems are completely separate
