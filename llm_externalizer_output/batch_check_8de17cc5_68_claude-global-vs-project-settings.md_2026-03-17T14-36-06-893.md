# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:36:06.893Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/anthropic_official_documentation/claude-global-vs-project-settings.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/anthropic_official_documentation/claude-global-vs-project-settings.md
Line 1: # Claude Code: Global vs Project-Level Features
Line 3: A comprehensive comparison of which Claude Code features are global-only (`~/.claude/`) versus which have both global and project-level (`.claude/`) equivalents.
Line 7: <td><a href="../">← Back to Claude Code Best Practice</a></td>
Line 18: Claude Code uses a **scope hierarchy** where some features exist at both the global (`~/.claude/`) and project (`.claude/`) levels, while others are exclusively global. The design principle: things that are *personal state* or *cross-project coordination* live globally; things that are *team-shareable project config* can live at the project level.
Line 21: - `~/.claude/` is your **user-level home** (global, all projects)
Line 22: - `.claude/` inside a repo is your **project-level home** (scoped to that project)
Line 36: | **Auto Memory** | `~/.claude/projects/<hash>/memory/` | Claude's self-written learnings per project (personal, never shared) |
Line 40: | **MCP User Servers** | `~/.claude.json` (`mcpServers` key) | Personal MCP servers across all projects |
Line 41: | **Preferences/Cache** | `~/.claude.json` | Theme, model, output style, session state |
Line 48: | **CLAUDE.md** | `~/.claude/CLAUDE.md` | `./CLAUDE.md` or `.claude/CLAUDE.md` | Project overrides global |
Line 49: | **Settings** | `~/.claude/settings.json` | `.claude/settings.json` + `.claude/settings.local.json` | Project > Global |
Line 50: | **Rules** | `~/.claude/rules/*.md` | `.claude/rules/*.md` | Project overrides |
Line 51: | **Agents/Subagents** | `~/.claude/agents/*.md` | `.claude/agents/*.md` | Project overrides |
Line 52: | **Commands** | `~/.claude/commands/*.md` | `.claude/commands/*.md` | Both available |
Line 53: | **Skills** | `~/.claude/skills/` | `.claude/skills/` | Both available |
Line 54: | **Hooks** | `~/.claude/hooks/` | `.claude/hooks/` | Both execute |
Line 55: | **MCP Servers** | `~/.claude.json` (user scope) | `.mcp.json` (project scope) | Three scopes: local > project > user |
Line 64: | 2 | `.claude/settings.local.json` | Project | No (git-ignored) | Personal project-specific |
Line 65: | 3 | `.claude/settings.json` | Project | Yes (committed) | Team-shared settings |
Line 66: | 4 | `~/.claude/settings.local.json` | User | N/A | Personal global overrides |
Line 67: | 5 | `~/.claude/settings.json` | User | N/A | Global personal settings |
Line 74: ### Global Scope (`~/.claude/`)
Line 76: ~/.claude/
Line 77: ├── settings.json              # User-level settings (all projects)
Line 78: ├── settings.local.json        # Personal overrides
Line 79: ├── CLAUDE.md                  # User memory (all projects)
Line 80: ├── agents/                    # User subagents (available to all projects)
Line 82: ├── rules/                     # User-level modular rules
Line 84: ├── commands/                  # User-level commands
Line 86: ├── skills/                    # User-level skills
Line 88: ├── tasks/                     # GLOBAL-ONLY: Task lists
Line 90: ├── teams/                     # GLOBAL-ONLY: Agent team configs
Line 93: ├── projects/                  # GLOBAL-ONLY: Per-project auto-memory
Line 97: ├── keybindings.json           # GLOBAL-ONLY: Keyboard shortcuts
Line 98: └── hooks/                     # User-level hooks
Line 102: ~/.claude.json                 # GLOBAL-ONLY: MCP servers, OAuth, preferences, caches
Line 105: ### Project Scope (`.claude/`)
Line 107: .claude/
Line 108: ├── settings.json              # Team-shared settings
Line 109: ├── settings.local.json        # Personal project overrides (git-ignored)
Line 110: ├── CLAUDE.md                  # Project memory (alternative to ./CLAUDE.md)
Line 111: ├── agents/                    # Project subagents
Line 113: ├── rules/                     # Project-level modular rules
Line 115: ├── commands/                  # Custom slash commands
Line 117: ├── skills/                    # Custom skills
Line 121: ├── hooks/                     # Project-level hooks
Line 124: └── plugins/                   # Installed plugins
Line 126: .mcp.json                      # Project-scoped MCP servers (repo root)
Line 130: Introduced in **Claude Code v2.1.16** (January 22, 2026), replacing the deprecated TodoWrite system.
Line 134: Tasks are stored at `~/.claude/tasks/` on the local filesystem (not in a cloud database). This makes task state auditable, version-controllable, and crash-recoverable.
Line 156: All sessions sharing the same ID see task updates in real-time, enabling parallel workstreams and session resumption.
Line 164: | Storage | In-memory only | File system (`~/.claude/tasks/`) |
Line 169: Announced **February 5, 2026** as an experimental feature. Agent Teams allow multiple Claude Code sessions to coordinate on shared work.
Line 173: // In ~/.claude/settings.json
Line 179: Team configs live at `~/.claude/teams/{team-name}/` and support modes:
Line 196: Auto-memory (`~/.claude/projects/<hash>/memory/`) is a notable hybrid: it's *about* a specific project but stored *globally* because it represents personal learning rather than team-shareable configuration.
Line 200: - [Claude Code Settings Documentation](https://code.claude.com/docs/en/settings)
Line 201: - [Orchestrate Teams of Claude Code Sessions](https://code.claude.com/docs/en/agent-teams)
Line 202: - [What are Tasks in Claude Code - ClaudeLog](https://claudelog.com/faqs/what-are-tasks-in-claude-code/)
Line 203: - [Claude Code Task Management - ClaudeFast](https://claudefa.st/blog/guide/development/task-management)
Line 204: - [Claude Code Tasks Update - VentureBeat](https://venturebeat.com/orchestration/claude-codes-tasks-update-lets-agents-work-longer-and-coordinate-across)
Line 205: - [Where Are Claude Code Global Settings - ClaudeLog](https://claudelog.com/faqs/where-are-claude-code-global-settings/)
Line 206: - [Claude Opus 4.6 Agent Teams - VentureBeat](https://venturebeat.com/technology/anthropics-claude-opus-4-6-brings-1m-token-context-and-agent-teams-to-take)
Line 207: - [How to Set Up Claude Code Agent Teams (Full Walkthrough) - r/ClaudeCode](https://www.reddit.com/r/ClaudeCode/comments/1qz8tyy/how_to_set_up_claude_code_agent_teams_full/)
Line 208: - [Anthropic replaced Claude Code's old 'Todos' with Tasks - r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1qkjznp/anthropic_