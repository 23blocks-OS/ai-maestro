# Cross-Client Skill Installation Spec

**Date:** 2026-03-26
**Problem:** The ai-maestro-plugin contains 9 skills that all agents need. Claude agents get them via `claude plugin install ai-maestro`. Codex/Gemini agents have no plugin system — skills must be copied directly.

## Architecture

### Source of Truth
The ai-maestro-plugin repo (`Emasoft/ai-maestro-plugin`) on GitHub contains the canonical skill files:
```
skills/
  ai-maestro-agents-management/SKILL.md + references/
  agent-messaging/SKILL.md + references/
  team-governance/SKILL.md + references/
  team-kanban/SKILL.md + references/
  memory-search/SKILL.md + references/
  graph-query/SKILL.md + references/
  docs-search/SKILL.md + references/
  planning/SKILL.md + references/
  mcp-discovery/SKILL.md + references/
  debug-hooks/SKILL.md + references/  (Claude-only — skip for non-Claude)
```

### Target Directories per Client

| Client | Project Skills | User Skills | Agent-Specific |
|--------|---------------|-------------|---------------|
| Claude | N/A (plugin system) | N/A (plugin system) | N/A |
| Codex | `{workDir}/.codex/skills/` | `~/.codex/skills/` | N/A |
| Gemini | `{workDir}/.gemini/skills/` | `~/.gemini/skills/` | N/A |

### Installation Strategy

**On agent creation** (when `agent.program` is not Claude):
1. Detect client type from `agent.program`
2. Download skills from GitHub: `gh api repos/Emasoft/ai-maestro-plugin/tarball/main`
3. Extract only the `skills/` directory
4. Copy each skill folder to the agent's working directory under the client-specific path
5. Skip Claude-specific skills (debug-hooks — uses Claude hooks API)

**On marketplace update** (when plugin version changes):
1. Re-download and overwrite the skill folders
2. Only update agent dirs that are online/active

### Implementation

#### New service: `services/cross-client-skill-service.ts`

```typescript
import { detectClientType, ClientType } from '@/lib/client-capabilities'

const SKILL_REPO = 'Emasoft/ai-maestro-plugin'
const CLAUDE_ONLY_SKILLS = ['debug-hooks']  // Skip for non-Claude

interface SkillInstallResult {
  installed: string[]
  skipped: string[]
  errors: Array<{ skill: string; error: string }>
}

/**
 * Install ai-maestro skills into a non-Claude agent's working directory.
 * Downloads from GitHub, copies to the client-specific skill path.
 */
export async function installSkillsForClient(
  clientType: ClientType,
  workingDirectory: string
): Promise<SkillInstallResult> {
  if (clientType === 'claude') {
    return { installed: [], skipped: ['claude uses plugin system'], errors: [] }
  }

  const skillPath = getSkillPath(clientType, workingDirectory)
  if (!skillPath) {
    return { installed: [], skipped: [], errors: [{ skill: '*', error: `No skill path for ${clientType}` }] }
  }

  // Download skills from GitHub
  const skills = await downloadSkillsFromGitHub()

  const result: SkillInstallResult = { installed: [], skipped: [], errors: [] }

  for (const skill of skills) {
    if (CLAUDE_ONLY_SKILLS.includes(skill.name)) {
      result.skipped.push(skill.name)
      continue
    }

    try {
      // Copy skill folder to target path
      await copySkillToDir(skill, path.join(skillPath, skill.name))
      result.installed.push(skill.name)
    } catch (err) {
      result.errors.push({ skill: skill.name, error: err.message })
    }
  }

  return result
}

function getSkillPath(clientType: ClientType, workDir: string): string | null {
  switch (clientType) {
    case 'codex': return path.join(workDir, '.codex', 'skills')
    case 'gemini': return path.join(workDir, '.gemini', 'skills')
    case 'cursor': return path.join(workDir, '.cursor', 'skills')
    default: return null
  }
}
```

#### Hook into agent creation

In `services/agents-core-service.ts` → `createAgent()`:
```typescript
// After agent is created, install skills for non-Claude clients
const clientType = detectClientType(agent.program)
if (clientType !== 'claude' && clientType !== 'aider') {
  try {
    const { installSkillsForClient } = await import('@/services/cross-client-skill-service')
    await installSkillsForClient(clientType, agent.workingDirectory)
  } catch (err) {
    console.warn(`[agents] Failed to install skills for ${clientType} agent:`, err)
  }
}
```

#### API endpoint for manual install

`POST /api/agents/{id}/install-skills` — manually trigger skill installation for an existing agent.

#### Script support

New script `scripts/install-client-skills.sh`:
```bash
#!/usr/bin/env bash
# Install ai-maestro skills into a non-Claude agent's skill directory
# Usage: install-client-skills.sh <client-type> <working-dir>
#   client-type: codex | gemini | cursor
#   working-dir: agent's project directory
```

### Codex Agent Files (.toml)

Codex also supports custom agents via `~/.codex/agents/*.toml`. The role-plugin agents could be converted to TOML format:

```toml
# ~/.codex/agents/programmer.toml
[agent]
name = "programmer"
model = "gpt-5.4"
instructions = """
You are a programmer agent...
"""
```

This is a SEPARATE concern from skills — agents define personas, skills define capabilities. For now, we only handle skills.

### What NOT to Install

- **Hooks** (hooks.json) — Claude-specific, no equivalent in Codex/Gemini
- **Commands** (.md slash commands) — Claude-specific format
- **MCP servers** — Codex has MCP support but config format differs
- **Rules** — Claude-specific .md rules
- **Role-plugins** — Claude-specific plugin system

### Skill Compatibility Notes

Most ai-maestro skills reference `curl` commands to AI Maestro's REST API. These work with ANY client since the API is client-agnostic. The skills that use Claude-specific tools (like `Bash(amp-*:*)` scoped tools) may need adaptation for Codex/Gemini.

For now: install as-is. The `allowed-tools` frontmatter field is ignored by non-Claude clients — they parse only `name` and `description`.

### Update Flow

When ai-maestro-plugins marketplace is updated:
1. Dashboard detects new version via marketplace polling
2. For Claude agents: `claude plugin update ai-maestro`
3. For Codex/Gemini agents: re-run `installSkillsForClient()` to overwrite skill folders
