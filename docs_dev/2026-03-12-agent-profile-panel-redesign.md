# Agent Profile Panel Redesign

**Date:** 2026-03-12
**Status:** Requirements — awaiting approval

## Context

The current `AgentConfigPanel.tsx` is a static display driven by `AgentConfigDraft` props.
It only shows what Haephestos has configured during the creation flow.

The **normal agent profile panel** (shown when selecting an existing agent in the sidebar) needs a complete redesign to become a **live agent inspector** that reads the actual project configuration from disk in real-time.

## Two Distinct Panels

| Panel | Used When | Data Source | Updates |
|-------|-----------|-------------|---------|
| **AgentConfigPanel** (Haephestos) | Agent creation in `/agent-creation` | `.agent.toml` being built | Only from Haephestos output |
| **AgentProfilePanel** (NEW) | Viewing any existing agent in main dashboard | Real project `.claude/` folder | Real-time filesystem polling |

## Requirements

### 1. Discovery: Detect ALL locally installed elements

The panel must scan the agent's project directory and detect:

| Element Type | Source Location | Notes |
|---|---|---|
| Skills | `.claude/skills/` | Local skills only |
| Subagents | `.claude/agents/` | Local agent definitions |
| Hooks | `.claude/hooks/` | Local hooks |
| Rules | `.claude/rules/` | Local rule files |
| Commands | `.claude/commands/` | Slash commands |
| MCP Servers | `.claude/mcp.local.json` | Local MCP config |
| LSP Servers | `.claude/settings.local.json` | LSP config section |
| Plugins (non-role) | `.claude/plugins/` detected via settings | Plugins WITHOUT `.agent.toml` |
| Role-Plugin | `.claude/plugins/` detected via settings | Plugin WITH `.agent.toml` — show name only |
| Settings | `.claude/settings.local.json` | General settings |

**Critical**: Must distinguish Role-Plugins from regular plugins.

**Role-Plugin identification rule (quad-match):**
A plugin is a Role-Plugin if and only if ALL FOUR conditions are met:
1. A file with `.agent.toml` extension exists at the plugin root
2. The filename stem matches the plugin name: `<plugin-name>.agent.toml`
3. The `[agent].name` inside the TOML matches the plugin name
4. A subagent `agents/<plugin-name>-main-agent.md` exists with frontmatter `name: <plugin-name>-main-agent`

Example: plugin `ai-maestro-chief-of-staff`:
- File: `ai-maestro-chief-of-staff.agent.toml` → `[agent].name = "ai-maestro-chief-of-staff"`
- Agent: `agents/ai-maestro-chief-of-staff-main-agent.md` → `name: ai-maestro-chief-of-staff-main-agent`
- Claude CLI: `claude --agent ai-maestro-chief-of-staff-main-agent`

If any mismatch → NOT a Role-Plugin (treated as regular plugin).

**Agent Persona fields (TITLE vs ROLE vs NAME vs AGENTID):**

| Field | Meaning | Example |
|-------|---------|---------|
| TITLE | Governance level | `manager`, `chief-of-staff`, `member` |
| ROLE | Role-Plugin name (specialization) | `ai-maestro-architect` |
| NAME | Unique persona display name | `Peter Bot` |
| AGENTID | Internal UUID (cross-host) | `a1b2c3d4-...` |

TITLE controls governance permissions. ROLE identifies the agent's specialization.
Do NOT confuse them — they are independent.

**Important**: The `.agent.toml` defines the **role-plugin**, NOT a specific persona. The same role-plugin can be used by many AI Maestro personas simultaneously. The TOML must NOT contain persona name/nickname.

**Compatibility**: Most existing Claude Code projects will already have plugins, skills, hooks, etc. installed. AI Maestro must detect all of these when importing a project folder as an agent.

### 2. What NOT to scan

- `.claude/plugins/` directory directly (plugin config comes from settings JSON files)

### 2b. Global dependencies (read-only section)

Global/user-level element **requirements** from the Role-Plugin's `.agent.toml` `[dependencies]` section are shown at the bottom of the panel, after all local elements. They appear grayed out / read-only — the user manages global elements via Claude Code commands manually (for now). This gives visibility into what the agent depends on globally.

### 3. Tabbed UI Layout

Current layout (single scrollable column with all sections) is replaced by a **multi-row tab bar** + **scrollable tab content area**.

**Tab categories (9 tabs, arranged in 3-4 rows):**

```
Row 1: [ Settings ] [ Role    ] [ Plugins  ]
Row 2: [ Skills   ] [ Agents  ] [ Hooks    ]
Row 3: [ Rules    ] [ Commands] [ MCPs     ]
```

Each tab shows a scrollable list of installed elements of that type.

**Layout structure:**
```
┌──────────────────────────────┐
│  Agent Profile Panel Header  │
│  (name, status, dir)         │
├──────────────────────────────┤
│ ┌─────────┬────────┬───────┐ │
│ │Settings │ Role   │Plugins│ │ ← 3-row tab bar
│ ├─────────┼────────┼───────┤ │
│ │ Skills  │ Agents │ Hooks │ │
│ ├─────────┼────────┼───────┤ │
│ │ Rules   │Commands│ MCPs  │ │
│ └─────────┴────────┴───────┘ │
├──────────────────────────────┤
│                              │
│   Scrollable Tab Content     │ ← fills remaining vertical space
│                              │
│   (list of items for the     │
│    selected tab category)    │
│                              │
│                              │
└──────────────────────────────┘
```

**Tab content behavior:**
- Fills remaining vertical space below tab bar
- Scrollable independently (right scrollbar)
- Shows count badge on each tab
- Active tab highlighted (amber accent)

### 4. Tab Content Details

**Settings tab:**
- All "options" that were previously below the element lists move here
- Agent name, program, model, role, working directory
- Program args, tags
- Toggle for Role-Plugin ON/OFF (with plugin selector dropdown)

**Role tab:**
- If Role-Plugin is enabled: shows plugin name + [Edit in Haephestos] button
- Edit button opens Haephestos chat with the agent's `.agent.toml` loaded in the right panel
- If no Role-Plugin: shows "No Role-Plugin assigned" + [Assign] button
- Role-Plugin details are NOT shown (only name) — details visible via Haephestos

**Plugins tab:**
- Lists all installed plugins EXCEPT Role-Plugins
- Each plugin: name, description, install scope
- Can add/remove plugins

**Skills tab:**
- Lists locally installed skills (from `.claude/skills/`)
- Each skill: name, description (from SKILL.md frontmatter)
- Can add/remove

**Agents tab (subagents):**
- Lists locally installed agent definitions (from `.claude/agents/`)
- Each agent: filename, first-line description

**Hooks tab:**
- Lists locally installed hooks (from `.claude/hooks/`)
- Each hook: filename, event type

**Rules tab:**
- Lists locally installed rules (from `.claude/rules/`)
- Each rule: filename, first-line content

**Commands tab:**
- Lists locally installed commands (from `.claude/commands/`)
- Each command: name, trigger

**MCPs tab:**
- Lists MCP servers from `.claude/mcp.local.json`
- Each MCP: name, command, connection status

### 5. Real-Time Refresh

The panel must reflect changes made via Claude Code while the panel is open.

**Strategy: API polling (simple, reliable)**
- New API endpoint: `GET /api/agents/{id}/local-config`
- Returns all locally installed elements parsed from the agent's `.claude/` folder
- Panel polls every 3-5 seconds
- Diff-based update (only re-render changed sections)

**What the API parses:**
- `.claude/skills/` — list subdirectories, read SKILL.md frontmatter
- `.claude/agents/` — list .md files
- `.claude/hooks/` — list files, parse event types
- `.claude/rules/` — list .md files
- `.claude/commands/` — list .md files
- `.claude/mcp.local.json` — parse MCP server entries
- `.claude/settings.local.json` — parse settings, LSP, plugin references
- Identify Role-Plugin by checking for `.agent.toml` in referenced plugins

### 6. Role-Plugin Standard Location

**Convention needed:** Where does `.agent.toml` live inside a Role-Plugin?

**Convention:** `<plugin-root>/<plugin-name>.agent.toml`

```
ai-maestro-chief-of-staff/                              ← plugin name
├── .claude-plugin/
│   └── plugin.json                                     ← name: "ai-maestro-chief-of-staff"
├── ai-maestro-chief-of-staff.agent.toml                ← filename stem matches plugin name
├── agents/
│   └── ai-maestro-chief-of-staff-main-agent.md         ← REQUIRED: <plugin-name>-main-agent.md
├── skills/
│   └── ...
└── hooks/
    └── ...
```

**Quad-match rule:**
```
plugin.json name == filename stem == [agent].name in TOML
  AND agents/<plugin-name>-main-agent.md exists with matching frontmatter name
```

All four must match → Role-Plugin. Any mismatch → regular plugin.
The main agent file is what `claude --agent <plugin-name>-main-agent` loads.

Names must always be kebab-case. The panel uses this to separate the two categories.

**PSS schema issue filed:** https://github.com/Emasoft/perfect-skill-suggester/issues/1

### 7. Haephestos ↔ Role-Plugin Relationship

- Role-Plugins can ONLY be modified by Haephestos
- Haephestos regenerates the entire plugin from the `.agent.toml` profile file alone
- If elements referenced in the profile are not found, Haephestos:
  1. Searches in user's home folder and subfolders
  2. If still not found, asks the user for a URL to download it
- The `.agent.toml` is the single source of truth for the Role-Plugin

**Haephestos scope (CRITICAL):**
- Haephestos creates **Personas WITH new or customized Role-Plugins**
- Haephestos can create a **new Persona with an existing Role-Plugin** (if user asks)
- Haephestos CANNOT create a Persona without a Role-Plugin
- Haephestos CANNOT create a Role-Plugin without also creating a Persona for it
- Any Role-Plugin created for a Persona can be immediately reused by other Personas

### 8. Import Flow

When a user imports an existing project folder as an agent:
1. AI Maestro scans `.claude/` in that folder
2. Detects all locally installed elements
3. Populates the agent profile panel immediately
4. From now on, local element management happens via:
   - The agent profile panel (add/remove UI)
   - Claude Code commands (which the panel detects in real-time)
5. Global elements are still managed via Claude Code commands manually (for now)

## API Design

### `GET /api/agents/{id}/local-config`

Returns the full local configuration for an agent's project directory.

```typescript
interface AgentLocalConfig {
  workingDirectory: string
  skills: Array<{ name: string; path: string; description?: string }>
  agents: Array<{ name: string; path: string; description?: string }>
  hooks: Array<{ name: string; path: string; eventType?: string }>
  rules: Array<{ name: string; path: string; preview?: string }>
  commands: Array<{ name: string; path: string; trigger?: string }>
  mcpServers: Array<{ name: string; command?: string; args?: string[] }>
  lspServers: Array<{ name: string; command: string; languages: string[] }>
  plugins: Array<{ name: string; path: string; description?: string }>
  rolePlugin: { name: string; profilePath: string } | null
  globalDependencies: {  // from Role-Plugin .agent.toml [dependencies]
    plugins: string[]
    skills: string[]
    mcpServers: string[]
    scripts: string[]
    hooks: string[]
    tools: string[]
  } | null
  settings: Record<string, unknown>
  lastScanned: string  // ISO timestamp
}
```

### `POST /api/agents/{id}/local-config/install`

Install a local element (skill, hook, rule, command, plugin).

```typescript
interface InstallRequest {
  type: 'skill' | 'hook' | 'rule' | 'command' | 'plugin' | 'mcp'
  name: string
  source: string  // path or URL
}
```

### `POST /api/agents/{id}/local-config/uninstall`

Remove a local element.

```typescript
interface UninstallRequest {
  type: 'skill' | 'hook' | 'rule' | 'command' | 'plugin' | 'mcp'
  name: string
}
```

## Implementation Order

1. **API**: `GET /api/agents/{id}/local-config` — filesystem scanner
2. **Component**: `AgentProfilePanel.tsx` — new component with tabbed UI
3. **Hook**: `useAgentLocalConfig(agentId)` — polling hook (3-5s interval)
4. **Integration**: Wire into main dashboard sidebar (replace current simple panel)
5. **Install/Uninstall API**: Add mutation endpoints
6. **Role-Plugin toggle**: Settings tab toggle + dependency checking
7. **Haephestos bridge**: Edit button → open Haephestos with agent's profile

## Haephestos ↔ Role-Plugin Regeneration

Role-Plugins can ONLY be modified by Haephestos. The workflow:

1. Haephestos reads the `.agent.toml` profile file
2. Regenerates the entire plugin structure from the profile alone
3. If elements referenced in the profile are not found locally:
   - Haephestos searches the user's home folder and subfolders
   - If still not found, asks the user for a URL to download it
4. The `.agent.toml` is the single source of truth — the plugin is derived from it

## Open Questions

1. ~~**Role-Plugin `.agent.toml` location**~~ — **RESOLVED**: `<plugin-root>/<plugin-name>.agent.toml` with triple-match rule (plugin name == filename stem == `[agent].name`)
2. ~~**Install/uninstall mechanism**~~ — **RESOLVED**: Always use the AI Maestro API. Many agents are on different hosts, so direct folder manipulation is not possible. The API handles remote operations via the headless router on each host.
3. ~~**Global elements display**~~ — **RESOLVED**: Yes. Global/user-level element requirements (from the `.agent.toml` `[dependencies]` section) are shown in a section at the end of the other elements, as they appear in the TOML file. Read-only, grayed out — users manage global elements via Claude Code commands manually (for now).
4. ~~**LSP servers**~~ — **RESOLVED**: `.lsp.json` at plugin root (per Anthropic docs at code.claude.com/docs/en/plugins-reference.md). Can also be inline in `plugin.json` as `lspServers`. Key fields: `command`, `extensionToLanguage` (required), plus optional `args`, `transport`, `env`, `initializationOptions`, `settings`, etc.

## Claude Code Plugin File Locations (Official Reference)

From https://code.claude.com/docs/en/plugins-reference.md:

| Component | Default Location | Notes |
|-----------|-----------------|-------|
| Manifest | `.claude-plugin/plugin.json` | Optional — name derived from dir if absent |
| Commands | `commands/` | Legacy; use `skills/` for new |
| Agents | `agents/` | Markdown files |
| Skills | `skills/` | `<name>/SKILL.md` structure |
| Hooks | `hooks/hooks.json` | Or inline in plugin.json |
| MCP servers | `.mcp.json` | Or inline in plugin.json |
| LSP servers | `.lsp.json` | Or inline in plugin.json as `lspServers` |
| Settings | `settings.json` | Default config, only `agent` settings currently |

**Plugin installation scopes:**

| Scope | Settings file | Use case |
|-------|--------------|----------|
| `user` | `~/.claude/settings.json` | Personal, all projects |
| `project` | `.claude/settings.json` | Shared via VCS |
| `local` | `.claude/settings.local.json` | Project-specific, gitignored |
| `managed` | Managed settings | Read-only |

**Plugin CLI commands:**
- `claude plugin install <plugin> --scope local` — install
- `claude plugin uninstall <plugin> --scope local` — remove
- `claude plugin enable/disable <plugin> --scope local` — toggle
- `claude plugin update <plugin> --scope local` — update
