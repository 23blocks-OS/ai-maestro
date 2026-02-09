# AI Maestro Plugin for Claude Code

A Claude Code plugin providing skills, hooks, and CLI scripts for AI agent orchestration.

## Choose Your Installation Method

There are **two ways** to use AI Maestro tools with Claude Code:

| Method | What You Get | AI Maestro Service Required? | Best For |
|--------|--------------|------------------------------|----------|
| **Plugin Marketplace** | 5 skills + 3 hooks | **4 of 5 skills need service** | Quick skill access, trying it out |
| **Full Installation** | Service + Dashboard + Skills + Scripts | Installs the service | Full AI agent orchestration |

### Method 1: Plugin Marketplace (Skills Only)

**Install in 2 commands:**
```bash
/plugin marketplace add 23blocks-OS/ai-maestro
/plugin install ai-maestro@ai-maestro-marketplace
```

> **IMPORTANT:** This installs skills only. **4 of 5 skills require the AI Maestro service running on localhost:23000.** Only the `planning` skill works standalone.

| Skill | Works Without Service? | Description |
|-------|------------------------|-------------|
| `planning` | **YES** | Complex task planning with markdown files |
| `memory-search` | NO - needs service | Search conversation history |
| `docs-search` | NO - needs service | Search auto-generated documentation |
| `graph-query` | NO - needs service | Query code relationships |
| `agent-messaging` | NO - needs service | Send/receive messages between agents |

**If you only want the planning skill**, the marketplace install is perfect.

**If you want all skills to work**, install the full AI Maestro service first (Method 2).

### Method 2: Full Installation (Service + Skills + Scripts)

**One command installs everything:**
```bash
curl -fsSL https://raw.githubusercontent.com/23blocks-OS/ai-maestro/main/scripts/remote-install.sh | sh
```

This installs:
- AI Maestro service (runs on localhost:23000)
- Web dashboard for managing AI agents
- 32 CLI scripts in your PATH (`~/.local/bin/`)
- 5 Claude Code skills (`~/.claude/skills/`)
- All prerequisites (Node.js, tmux, etc. if needed)

**After installation:**
1. Start AI Maestro: `cd ~/ai-maestro && yarn dev`
2. Open dashboard: http://localhost:23000
3. All 5 skills will work

---

## What's Included

### Skills (5)

| Skill | Description | Requires Service? |
|-------|-------------|-------------------|
| `memory-search` | Search conversation history for previous discussions | YES |
| `docs-search` | Search auto-generated documentation for APIs | YES |
| `graph-query` | Query code graph to understand relationships | YES |
| `agent-messaging` | Send and receive messages between AI agents | YES |
| `planning` | Complex task execution with persistent markdown files | **NO - Standalone** |

### Hooks (3)

| Event | Purpose | Requires Service? |
|-------|---------|-------------------|
| `SessionStart` | Check for unread messages, broadcast session status | YES |
| `Stop` | Update session status when Claude finishes | YES |
| `Notification` | Track idle/permission prompts for Chat UI | YES |

### CLI Scripts (32)

Scripts are included in the plugin but **not installed to your PATH** via marketplace.

To use scripts from command line, either:
1. Install the full AI Maestro (recommended)
2. Or manually copy: `cp plugin/scripts/*.sh ~/.local/bin/`

**Messaging (AMP):**
- `amp-inbox.sh` - Check inbox for messages
- `amp-read.sh <id>` - Read a specific message
- `amp-send.sh <to> <subject> <message>` - Send a message
- `amp-reply.sh <id> <message>` - Reply to a message
- `amp-delete.sh <id>` - Delete a message
- `amp-init.sh --auto` - Initialize agent identity

**Memory Search:**
- `memory-search.sh` - Search conversation history

**Documentation Search:**
- `docs-search.sh` - Search indexed documentation
- `docs-find-by-type.sh` - Find docs by type
- `docs-index.sh` - Index documentation

**Code Graph:**
- `graph-describe.sh` - Describe a component
- `graph-find-callers.sh` - Find what calls a function
- `graph-find-callees.sh` - Find what a function calls
- `graph-find-related.sh` - Find related components

---

## Usage

### Using Skills

Once installed, skills are available with the `ai-maestro:` namespace:

```
/ai-maestro:planning      # Start complex task planning (works standalone)
/ai-maestro:memory-search # Search conversation history (needs service)
```

Proactive skills (memory-search, docs-search, graph-query) are automatically invoked by Claude when relevant - **but only if the service is running**.

### The Planning Skill (Standalone)

The `planning` skill is the only one that works without AI Maestro service:

```
> "Use the planning skill for this complex refactoring task"

Creates:
- task_plan.md   - Your implementation plan
- findings.md    - Research and discoveries
- progress.md    - Step-by-step progress tracking
```

This skill prevents goal drift during long tasks by keeping plans in persistent files.

---

## Troubleshooting

### "Skills not working" or "Connection refused"

This means the AI Maestro service isn't running. You have two options:

**Option A: Start the service**
```bash
cd ~/ai-maestro && yarn dev
# Service runs at http://localhost:23000
```

**Option B: Use only the planning skill**

The `planning` skill works without the service. Other skills require it.

### "Scripts not found in PATH"

The marketplace installation doesn't add scripts to your PATH. Either:
1. Install full AI Maestro: `curl -fsSL https://raw.githubusercontent.com/23blocks-OS/ai-maestro/main/scripts/remote-install.sh | sh`
2. Or manually: `cp ~/.claude/plugins/cache/ai-maestro-marketplace/ai-maestro/*/scripts/*.sh ~/.local/bin/`

---

## Plugin Structure

```
plugin/
├── .claude-plugin/
│   └── plugin.json          # Manifest
├── hooks/
│   └── hooks.json           # Hook configurations
├── scripts/                 # 32 CLI scripts
│   ├── memory-*.sh
│   ├── docs-*.sh
│   ├── graph-*.sh
│   └── *-aimaestro-*.sh
├── skills/
│   ├── agent-messaging/     # Needs service
│   ├── docs-search/         # Needs service
│   ├── graph-query/         # Needs service
│   ├── memory-search/       # Needs service
│   └── planning/            # STANDALONE
│       └── templates/
└── README.md
```

---

## Learn More

- [AI Maestro Documentation](https://github.com/23blocks-OS/ai-maestro)
- [Full Installation Guide](https://github.com/23blocks-OS/ai-maestro#-quick-start)
- [Claude Code Plugins Guide](https://docs.anthropic.com/en/docs/claude-code/plugins)
