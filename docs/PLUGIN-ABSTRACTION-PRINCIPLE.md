# Plugin Abstraction Principle

All AI Maestro functionality is exposed through two abstraction layers. External plugins MUST use these layers — never call the API directly.

---

## The Principle

**Plugins describe WHAT to do. AI Maestro skills and scripts describe HOW to do it.**

When the API or script syntax changes, only the AI Maestro skills and scripts need updating. All plugins automatically inherit the changes without modification.

---

## Two-Layer Architecture

```
┌─────────────────────────────┐
│     External Plugin          │
│  (AMAMA, AMCOS, PSS, etc.)  │
├──────────────┬──────────────┤
│ Plugin Skill │ Plugin Hook  │
│ "Use the     │ Calls global │
│  team-gov    │  scripts:    │
│  skill"      │ aimaestro-   │
│              │ agent.sh     │
└──────┬───────┴──────┬───────┘
       │              │
       ▼              ▼
┌──────────────┐ ┌──────────────┐
│ Global Skill │ │Global Script │
│ (canonical   │ │ (CLI wrapper │
│  API syntax) │ │  around API) │
└──────┬───────┘ └──────┬───────┘
       │              │
       ▼              ▼
┌─────────────────────────────┐
│     AI Maestro API           │
│  (HTTP endpoints)            │
└─────────────────────────────┘
```

**Layer 1: Skills** (for agents during conversations)
- AI Maestro installs global skills that teach agents the canonical API syntax
- Plugin skills reference these global skills by name
- Agents read the global skill at runtime to learn current syntax

**Layer 2: Scripts** (for hooks and automation)
- AI Maestro installs global scripts that wrap API calls into CLI commands
- Plugin hooks call these global scripts
- Scripts handle auth, endpoints, error handling internally

---

## Global Skills Reference

| Skill Name | What It Covers | Installed At |
|------------|---------------|--------------|
| `team-governance` | Team CRUD, COS assignment, governance requests, transfers, auth headers, permission matrix | `~/.claude/skills/team-governance/` |
| `ai-maestro-agents-management` | Agent lifecycle: create, list, show, update, delete, rename, hibernate, wake, plugin/skill management | `~/.claude/skills/ai-maestro-agents-management/` |
| `agent-messaging` | AMP messaging: send, inbox, read, reply, delete, register with providers, team discovery | `~/.claude/skills/agent-messaging/` |

---

## Global Scripts Reference

| Script | What It Wraps | Installed At |
|--------|--------------|--------------|
| `aimaestro-agent.sh` | Agent lifecycle CLI (delegates to agent-*.sh modules) | `~/.local/bin/` |
| `amp-send.sh` | Send AMP messages | `~/.local/bin/` |
| `amp-inbox.sh` | Check message inbox | `~/.local/bin/` |
| `amp-read.sh` | Read specific message | `~/.local/bin/` |
| `amp-reply.sh` | Reply to message | `~/.local/bin/` |
| `amp-delete.sh` | Delete message | `~/.local/bin/` |
| `amp-init.sh` | Initialize agent identity | `~/.local/bin/` |
| `amp-register.sh` | Register with external provider | `~/.local/bin/` |
| `amp-fetch.sh` | Fetch from external providers | `~/.local/bin/` |
| `amp-status.sh` | Show agent AMP status | `~/.local/bin/` |
| `amp-identity.sh` | Show agent identity | `~/.local/bin/` |

---

## Rules for External Plugins

### Rule 1: Plugin Skills MUST NOT Embed API Syntax

Plugin skills describe functionality and reference the global AI Maestro skill by name.

**CORRECT:**
```markdown
## Creating a Team

To create a team for your agents, use the `team-governance` skill installed by AI Maestro.
The skill teaches the correct API patterns with proper authentication headers.

Refer to: `~/.claude/skills/team-governance/SKILL.md` → "Team Management" section
```

**WRONG:**
```markdown
## Creating a Team

Run the following command:
curl -s -X POST "http://localhost:23000/api/teams" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-team", "type": "open"}'
```

### Rule 2: Plugin Hooks/Scripts MUST NOT Call the API Directly

Plugin hooks call globally-installed AI Maestro scripts, never `curl` or `fetch()`.

**CORRECT:**
```bash
# In plugin hook script
aimaestro-agent.sh create --name "$AGENT_NAME" --dir "$WORKDIR"
amp-send "$TARGET_AGENT" "Status Update" "Agent created successfully"
```

**WRONG:**
```bash
# In plugin hook script
curl -X POST "http://localhost:23000/api/agents/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"$AGENT_NAME\"}"
```

### Rule 3: Governance Rules Are Discovered at Runtime

Plugins MUST NOT hardcode governance rules, permission matrices, or role restrictions. Agents discover these by reading the `team-governance` skill at runtime.

**CORRECT:**
```markdown
Before performing governance operations, check your permissions by following
the "Role Check" section in the `team-governance` skill.
```

**WRONG:**
```markdown
Only MANAGER agents can create closed teams. COS agents can only manage
their own team. Normal agents have no governance permissions.
```

### Rule 4: AI Maestro's Own Plugin Is the Exception

The AI Maestro plugin (`plugin/plugins/ai-maestro/`) IS the provider of these abstractions. Its skills contain the canonical syntax. Its scripts make the actual API calls. This is by design.

---

## Declaring Dependencies

The Claude Code plugin.json spec does not have a `dependencies` field. Use the `description` field to declare skill dependencies:

```json
{
  "name": "my-plugin",
  "description": "Team management plugin. Requires AI Maestro skills: team-governance, ai-maestro-agents-management, agent-messaging."
}
```

In plugin skill SKILL.md files, add a prerequisites section:

```markdown
## Prerequisites

This skill requires the following AI Maestro skills to be installed:
- `team-governance` — For team and governance operations
- `ai-maestro-agents-management` — For agent lifecycle management
- `agent-messaging` — For inter-agent communication
```

---

## Governance Discovery Pattern

Agents can discover current governance configuration at runtime:

```bash
# Check if governance is configured
curl -s "http://localhost:23000/api/governance" | jq .
# Returns: hasPassword, hasManager, managerId, organization, hosts

# Check available teams
curl -s "http://localhost:23000/api/teams" | jq .
```

These discovery endpoints are taught in the `team-governance` skill. Plugins should instruct agents to use the skill rather than embedding these URLs.

---

## Migration Guide for Existing Plugins

To migrate an existing plugin to follow this principle:

1. **Find all `curl` commands** in plugin skills, commands, and agent definitions
2. **Replace with skill references**: "Follow the `team-governance` skill for this operation"
3. **Find all `curl`/`fetch` calls** in plugin hooks and scripts
4. **Replace with global script calls**: `aimaestro-agent.sh`, `amp-send.sh`, etc.
5. **Remove hardcoded governance rules** from plugin agent personas
6. **Add prerequisites section** to plugin skills listing required AI Maestro skills
7. **Update plugin.json description** to declare skill dependencies

---

## Benefits

| Scenario | Without Principle | With Principle |
|----------|-------------------|----------------|
| API endpoint changes | Update ALL plugins | Update 1 global skill |
| New auth header required | Update ALL plugin scripts | Update 1 global script |
| New governance rule | Update ALL plugin agents | Update 1 skill, agents discover at runtime |
| New feature added | Plugins unaware until updated | Agents discover via skill |
| 100 plugins in ecosystem | 100 update cycles per change | 1 update, 0 plugin changes |

---

*This principle is foundational to the AI Maestro plugin ecosystem. All plugins submitted to the marketplace should follow these rules.*
