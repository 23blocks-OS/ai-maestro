# Claude Code: Agents Frontmatter Reference

Quick-reference tables for defining subagents in `.claude/agents/*.md`.

<table width="100%">
<tr>
<td><a href="../">← Back to Claude Code Best Practice</a></td>
<td align="right"><img src="../!/claude-jumping.svg" alt="Claude" width="60" /></td>
</tr>
</table>

---

## Frontmatter Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique identifier using lowercase letters and hyphens |
| `description` | string | Yes | When to invoke. Use `"PROACTIVELY"` for auto-invocation by Claude |
| `tools` | string/list | No | Comma-separated allowlist of tools (e.g., `Read, Write, Edit, Bash`). Inherits all tools if omitted. Supports `Task(agent_type)` syntax to restrict spawnable subagents |
| `disallowedTools` | string/list | No | Tools to deny, removed from inherited or specified list |
| `model` | string | No | Model alias: `haiku`, `sonnet`, `opus`, or `inherit` (default: `inherit`) |
| `permissionMode` | string | No | Permission mode: `default`, `acceptEdits`, `dontAsk`, `bypassPermissions`, or `plan` |
| `maxTurns` | integer | No | Maximum number of agentic turns before the subagent stops |
| `skills` | list | No | Skill names to preload into agent context at startup (full content injected, not just made available) |
| `mcpServers` | list | No | MCP servers for this subagent — server name strings or inline `{name: config}` objects |
| `hooks` | object | No | Lifecycle hooks scoped to this subagent: `PreToolUse`, `PostToolUse`, `Stop` (converted to `SubagentStop` at runtime) |
| `memory` | string | No | Persistent memory scope: `user`, `project`, or `local` |
| `background` | boolean | No | Set to `true` to always run as a background task (default: `false`) |
| `isolation` | string | No | Set to `"worktree"` to run in a temporary git worktree (auto-cleaned if no changes) |
| `color` | string | No | CLI output color for visual distinction (e.g., `green`, `magenta`) |

---

## Memory Scopes

| Scope | Storage Location | Shared | Version Controlled |
|-------|-----------------|--------|--------------------|
| `user` | `~/.claude/agent-memory/<name>/` | No | No |
| `project` | `.claude/agent-memory/<name>/` | Yes | Yes |
| `local` | `.claude/agent-memory-local/<name>/` | No | No |

See [claude-agent-memory.md](../claude-agent-memory.md) for full details.

---

## Invocation

Agents are invoked via the **Task tool**, never via bash commands:

```
Task(subagent_type="agent-name", description="...", prompt="...", model="haiku")
```

Or from a command file that delegates to an agent.

---

## Example: Minimal Agent

```yaml
---
name: code-reviewer
description: Reviews code for quality issues
tools: Read, Grep, Glob
model: haiku
---

Review the code for quality issues and report findings.
```

## Example: Full-Featured Agent (All Fields)

```yaml
---
name: deploy-manager
description: Use this agent PROACTIVELY for deployment pipelines and release management
tools: Read, Write, Edit, Bash, Grep, Glob, Task(monitor, rollback)
disallowedTools: NotebookEdit
model: sonnet
permissionMode: acceptEdits
maxTurns: 25
skills:
  - deploy-checklist
  - rollback-procedures
mcpServers:
  - slack
  - name: pagerduty
    command: npx
    args: ["-y", "@pagerduty/mcp-server"]
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate-deploy-command.sh"
  PostToolUse:
    - matcher: "Write"
      hooks:
        - type: command
          command: "./scripts/log-file-changes.sh"
  Stop:
    - hooks:
        - type: command
          command: "./scripts/notify-deploy-complete.sh"
memory: project
background: false
isolation: worktree
color: blue
---

You are a deployment manager. Follow the deploy-checklist skill for
pre-flight checks and use rollback-procedures if any step fails.
Notify the team via Slack when deployment completes.
```

---

## Scope and Priority

When multiple subagents share the same name, the higher-priority location wins:

| Location | Scope | Priority |
|----------|-------|----------|
| `--agents` CLI flag | Current session | 1 (highest) |
| `.claude/agents/` | Current project | 2 |
| `~/.claude/agents/` | All your projects | 3 |
| Plugin's `agents/` directory | Where plugin is enabled | 4 (lowest) |

---

## Agents in This Repository

| Agent | Model | Tools | Skills | Memory |
|-------|-------|-------|--------|--------|
| `weather` | sonnet | WebFetch, Read, Write | weather-fetcher, weather-transformer | project |
| `presentation-curator` | sonnet | Read, Write, Edit, Grep, Glob | vibe-to-agentic-framework, presentation-structure, presentation-styling | — |

---

## Sources

- [Create custom subagents — Claude Code Docs](https://code.claude.com/docs/en/sub-agents)
- [Claude Code CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
