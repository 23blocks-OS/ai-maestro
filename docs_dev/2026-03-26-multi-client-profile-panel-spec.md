# Multi-Client Profile Panel Spec

**Date:** 2026-03-26
**Status:** Research complete, implementation deferred

## Problem

The profile panel assumes Claude Code. Non-Claude clients have different capability sets. The panel must adapt per client.

## Client Capabilities Matrix (March 2026)

| Feature | Claude Code | Codex CLI | Gemini CLI | Aider | Cursor |
|---------|:-----------:|:---------:|:----------:|:-----:|:------:|
| **Skills** (SKILL.md) | Yes | Yes | Yes | No | Via Copilot |
| **Plugins** | Yes (full) | Yes (limited) | Extensions | No | Extensions |
| **Agents/Subagents** | Yes (.claude/agents/) | Yes (.codex/agents/ TOML) | No | No | No |
| **Hooks** | Yes | User prompt hook | No | No | No |
| **Rules** | Yes (.claude/rules/) | No | No | No | .cursor/rules |
| **MCP Servers** | Yes | Yes (via Agents SDK) | Deprecated | No | No |
| **LSP** | Yes | No | No | No | Native |
| **Commands** | Yes (.claude/commands/) | Via $skill | No | No | No |
| **Role-Plugins** | Yes (marketplace) | No | No | No | No |
| **Custom Instructions** | CLAUDE.md | config.toml | GEMINI.md | .aider.conf.yml | .cursor/rules |

## Skill Storage Locations

| Client | Project Skills | User Skills | Config |
|--------|---------------|-------------|--------|
| Claude | `.claude/skills/` | `~/.claude/skills/` | `settings.local.json` |
| Codex | `.codex/skills/` | `~/.codex/skills/` | `config.toml` `[[skills.config]]` |
| Gemini | `.gemini/skills/` | `~/.gemini/skills/` or `~/.agents/skills/` | N/A (auto-discovery) |
| Aider | N/A | N/A | `.aider.conf.yml` |
| Cursor | Via Copilot agent skills | Via VS Code | `.cursor/rules` |

## Codex Subagents (NEW - March 2026 GA)

- Custom agents as TOML files in `~/.codex/agents/`
- 3 types: explorer, worker, default
- Config: `[agents]` section in `config.toml`
- `agents.max_depth` controls nesting (default: 1)
- Spawned via `spawn_agent`, managed via `/agent` CLI command
- Custom instructions + model per agent

## Profile Panel Adaptation Rules

### Client Detection
```typescript
type ClientType = 'claude' | 'codex' | 'gemini' | 'aider' | 'cursor' | 'unknown'

function detectClient(program: string): ClientType {
  const p = program.toLowerCase()
  if (p.includes('claude')) return 'claude'
  if (p.includes('codex')) return 'codex'
  if (p.includes('gemini')) return 'gemini'
  if (p.includes('aider')) return 'aider'
  if (p.includes('cursor')) return 'cursor'
  return 'unknown'
}
```

### Tab Visibility

| Tab | Claude | Codex | Gemini | Aider | Unknown |
|-----|:------:|:-----:|:------:|:-----:|:-------:|
| Role | Yes | No | No | No | No |
| Plugins | Yes | Limited | Extensions | No | No |
| Skills | Yes | Yes | Yes | No | Yes |
| Agents | Yes | Yes (TOML) | No | No | No |
| Hooks | Yes | Limited | No | No | No |
| Rules | Yes | No | No | No | No |
| Commands | Yes | No | No | No | No |
| MCP | Yes | Yes | No | No | No |

### Skill Scanner per Client

Each client needs a different scanner:

**Claude:** Read `settings.local.json` → `enabledPlugins` → resolve paths → scan skill dirs
**Codex:** Read `~/.codex/config.toml` → parse `[[skills.config]]` entries + scan `~/.codex/skills/` + `.codex/skills/`
**Gemini:** Scan `~/.gemini/skills/` + `.gemini/skills/` + `~/.gemini/extensions/*/skills/`
**Aider:** No skills — show "Skills not supported by this client"
**Unknown:** Show generic message

## Implementation Steps (Deferred)

1. Add `ClientType` type and `detectClient()` to `types/agent.ts`
2. Create `ClientCapabilities` constant map in `lib/client-capabilities.ts`
3. Update `AgentProfilePanel.tsx` to filter TABS by client capabilities
4. Create client-specific skill scanners in `services/agent-local-config-service.ts`
5. Update `RoleTab.tsx` — hide for non-Claude clients
6. Update agent creation UI — show client-specific config options
7. For Codex: add TOML agent editor (read/write `~/.codex/agents/*.toml`)

## Sources

- [Codex Skills](https://developers.openai.com/codex/skills)
- [Codex CLI Reference](https://developers.openai.com/codex/cli/reference)
- [Codex Subagents](https://developers.openai.com/codex/subagents)
- [Gemini CLI Skills](https://geminicli.com/docs/cli/skills/)
- [Gemini Skills Tutorial](https://codelabs.developers.google.com/gemini-cli/how-to-create-agent-skills-for-gemini-cli)
- [Agent Skills Open Standard](https://code.visualstudio.com/docs/copilot/customization/agent-skills)
