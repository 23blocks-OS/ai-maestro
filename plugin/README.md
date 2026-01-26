# AI Maestro Plugin for Claude Code

A Claude Code plugin providing skills, hooks, and CLI scripts for AI agent orchestration.

## What's Included

### Skills (5)

| Skill | Description | Behavior |
|-------|-------------|----------|
| `memory-search` | Search conversation history for previous discussions and decisions | Proactive |
| `docs-search` | Search auto-generated documentation for function signatures and APIs | Proactive |
| `graph-query` | Query code graph database to understand relationships and impact | Proactive |
| `agent-messaging` | Send and receive messages between AI agents | On-demand |
| `planning` | Complex task execution with persistent markdown files | On-demand |

### Hooks

| Event | Purpose |
|-------|---------|
| `SessionStart` | Check for unread messages, broadcast session status |
| `Stop` | Update session status when Claude finishes |
| `Notification` | Track idle/permission prompts for Chat UI |

### CLI Scripts (32)

**Messaging:**
- `check-aimaestro-messages.sh` - Check unread messages
- `read-aimaestro-message.sh` - Read and mark message as read
- `send-aimaestro-message.sh` - Send message to another agent
- `reply-aimaestro-message.sh` - Reply to a message
- `forward-aimaestro-message.sh` - Forward a message
- `send-tmux-message.sh` - Send instant tmux notification

**Memory Search:**
- `memory-search.sh` - Search conversation history
- `memory-helper.sh` - Helper functions

**Documentation Search:**
- `docs-search.sh` - Search indexed documentation
- `docs-find-by-type.sh` - Find docs by type (function, class, etc.)
- `docs-get.sh` - Get full document by ID
- `docs-list.sh` - List all indexed documents
- `docs-index.sh` - Index documentation
- `docs-index-delta.sh` - Incremental indexing
- `docs-stats.sh` - Show indexing statistics

**Code Graph:**
- `graph-describe.sh` - Describe a component
- `graph-find-callers.sh` - Find what calls a function
- `graph-find-callees.sh` - Find what a function calls
- `graph-find-related.sh` - Find related components
- `graph-find-associations.sh` - Find model associations
- `graph-find-serializers.sh` - Find serializers for a model
- `graph-find-by-type.sh` - Find by type (model, controller, etc.)
- `graph-find-path.sh` - Find path between components
- `graph-index-delta.sh` - Incremental graph indexing

**Agent Management:**
- `export-agent.sh` - Export agent to portable format
- `import-agent.sh` - Import agent from export
- `list-agents.sh` - List all agents

## Installation

### Option 1: Local Development (--plugin-dir)

```bash
# Clone the repo
git clone https://github.com/23blocks-OS/ai-maestro.git

# Run Claude Code with the plugin
claude --plugin-dir ./ai-maestro/plugin
```

### Option 2: Add to Plugin Marketplace

Add to your marketplace's `plugins.json`:

```json
{
  "plugins": [
    {
      "id": "ai-maestro",
      "name": "AI Maestro",
      "description": "Skills, hooks, and scripts for AI agent orchestration",
      "repository": "https://github.com/23blocks-OS/ai-maestro",
      "path": "plugin"
    }
  ]
}
```

Then install via:
```
/plugin install ai-maestro
```

### Installing CLI Scripts

After plugin installation, add scripts to your PATH:

```bash
# Add to ~/.zshrc or ~/.bashrc
export PATH="$PATH:$CLAUDE_PLUGIN_ROOT/scripts"

# Or copy to ~/.local/bin
cp plugin/scripts/*.sh ~/.local/bin/
```

## Usage

### Skills

Once installed, skills are available with the `ai-maestro:` namespace:

```
/ai-maestro:planning      # Start complex task planning
/ai-maestro:memory-search # Search conversation history
```

Proactive skills (memory-search, docs-search, graph-query) are automatically invoked by Claude when relevant.

### CLI Scripts

```bash
# Check messages
check-aimaestro-messages.sh

# Search memory
memory-search.sh "authentication flow"

# Query code graph
graph-find-callers.sh authenticate
```

### Hooks

Hooks run automatically on their respective events when the plugin is enabled.

## Plugin Structure

```
plugin/
├── .claude-plugin/
│   └── plugin.json          # Manifest
├── hooks/
│   └── hooks.json           # Hook configurations
├── scripts/                 # 32 CLI scripts
│   ├── ai-maestro-hook.cjs
│   ├── memory-*.sh
│   ├── docs-*.sh
│   ├── graph-*.sh
│   ├── *-aimaestro-*.sh
│   └── ...
├── skills/
│   ├── agent-messaging/
│   ├── docs-search/
│   ├── graph-query/
│   ├── memory-search/
│   └── planning/
│       └── templates/
└── README.md
```

## Requirements

- **Claude Code** 1.0.33+
- **AI Maestro service** (optional) - Required for:
  - memory-search (conversation indexing)
  - docs-search (documentation indexing)
  - graph-query (code graph database)
  - agent-messaging (message delivery)
  - hooks (session tracking, Chat UI)
- **planning skill** works standalone without AI Maestro

## Learn More

- [AI Maestro Documentation](https://github.com/23blocks-OS/ai-maestro)
- [Claude Code Skills Guide](https://code.claude.com/docs/en/skills)
- [Claude Code Plugins Guide](https://code.claude.com/docs/en/plugins)
- [Claude Code Hooks Guide](https://code.claude.com/docs/en/hooks)
