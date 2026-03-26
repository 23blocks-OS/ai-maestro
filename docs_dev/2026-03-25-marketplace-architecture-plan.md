# AI Maestro Marketplace Architecture Plan

## Principle: Separation of Concerns

Each plugin lives in its own GitHub repo. The marketplace is just a manifest that references them.

## Marketplace: 23blocks-OS/ai-maestro-plugins

Lists 9 plugins from their respective repos:

### Core (3 plugins)
| Plugin | Repo | Description |
|--------|------|-------------|
| `ai-maestro` | `23blocks-OS/ai-maestro-plugin` (NEW repo, extract from marketplace) | Agent management, memory, graph, docs, planning, governance, kanban, MCP discovery, hooks |
| `agent-messaging` | `agentmessaging/claude-plugin` | AMP messaging commands + skill |
| `agent-identity` | `agentmessaging/agent-identity` | AID authentication skill + scripts |

### Role Plugins (6 plugins)
| Plugin | Repo |
|--------|------|
| `ai-maestro-assistant-manager-agent` | `Emasoft/ai-maestro-assistant-manager-agent` |
| `ai-maestro-chief-of-staff` | `Emasoft/ai-maestro-chief-of-staff` |
| `ai-maestro-architect-agent` | `Emasoft/ai-maestro-architect-agent` |
| `ai-maestro-integrator-agent` | `Emasoft/ai-maestro-integrator-agent` |
| `ai-maestro-orchestrator-agent` | `Emasoft/ai-maestro-orchestrator-agent` |
| `ai-maestro-programmer-agent` | `Emasoft/ai-maestro-programmer-agent` |

### Dependencies (NOT in marketplace, installed separately)
| Plugin | Repo | Notes |
|--------|------|-------|
| `claude-plugins-validation` | `Emasoft/claude-plugins-validation` | Plugin management tools |
| `perfect-skill-suggester` | `Emasoft/perfect-skill-suggester` | Agent profiling |
| `code-auditor-agent` | `Emasoft/code-auditor-agent` | Code review |

## What Needs to Happen

### 1. Revert the merge in the submodule
- Remove: agent-identity skill (belongs to agent-identity plugin)
- Remove: 12 AMP commands (belong to agent-messaging plugin)
- Remove: AID scripts (aid-*.sh) (belong to agent-identity plugin)
- Remove: amp-statusline.sh (belongs to agent-messaging plugin)
- KEEP: team-governance skill (belongs to ai-maestro core)
- KEEP: team-kanban, debug-hooks, mcp-discovery (ai-maestro core)
- Revert plugin.json to not list AMP commands or agent-identity skill

### 2. Create new repo: 23blocks-OS/ai-maestro-plugin
- Move `plugins/ai-maestro/` content to this new repo
- The marketplace repo becomes MANIFEST ONLY (no embedded plugin code)

### 3. Update marketplace.json
- All 9 plugins reference external GitHub repos
- No `source: ./plugins/ai-maestro` (local path) — all GitHub URLs

### 4. Update installer
- Install 3 core plugins: ai-maestro, agent-messaging, agent-identity
- All from the same marketplace (23blocks-OS/ai-maestro-plugins)

### 5. What I CANNOT do (needs user)
- Create `23blocks-OS/ai-maestro-plugin` GitHub repo
- Push to `23blocks-OS/*` or `agentmessaging/*` repos
- Only CAN push to `Emasoft/*` forks
