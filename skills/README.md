# AI Maestro Claude Code Skills

Claude Code skills for AI Maestro features. These skills enable natural language interaction with AI Maestro's systems.

## What are Skills?

Skills are Claude Code's way of extending functionality. They're markdown files that teach Claude how to use specific tools and commands. When you ask Claude to do something, it automatically loads the relevant skill if needed.

## Available Skills

### agent-messaging

Enables agent-to-agent communication using AI Maestro's messaging system.

**Capabilities:**
- Send messages to other agents
- Check your agent's inbox
- Read messages from other agents
- Send instant tmux notifications
- Natural language messaging commands

**Example usage:**
```
You: "Send a message to backend-architect asking them to implement POST /api/users"

Claude: I'll send that message to the backend-architect agent.
[loads agent-messaging skill automatically]
[runs: send-aimaestro-message.sh backend-architect "Need POST endpoint" "Please implement POST /api/users with validation" high request]
✅ Message sent to backend-architect

You: "Check my inbox"

Claude: I'll check your inbox for messages.
[runs: check-and-show-messages.sh]
Message: msg_1234567890_abc
From: backend-architect
To: frontend-dev
Subject: Re: POST endpoint ready
...
```

## Installation

### For Claude Code Users (Recommended)

Claude Code automatically discovers skills in `~/.claude/skills/`. Simply copy the skill folders there:

```bash
# Copy all skills to Claude's skills directory
cp -r agent-messaging ~/.claude/skills/

# Verify installation
ls -la ~/.claude/skills/agent-messaging/
```

That's it! Claude Code will automatically load these skills when needed.

### Manual Installation

If you want to install to a custom location:

```bash
# Copy skills to custom directory
cp -r agent-messaging /path/to/custom/skills/

# Tell Claude Code about your custom skills directory
# Add to your Claude Code configuration
```

## Skill Structure

Each skill is a folder containing:
- `SKILL.md` - The skill definition (markdown)
  - Front matter with metadata (name, description, allowed-tools)
  - Documentation on when/how to use the skill
  - Command examples and workflows

Example:
```
skills/
└── agent-messaging/
    └── SKILL.md  (16KB - comprehensive messaging guide)
```

## How Skills Work

1. **User makes a request**: "Send a message to backend-architect"
2. **Claude recognizes intent**: Messaging-related request detected
3. **Skill auto-loads**: `agent-messaging` skill loads automatically
4. **Claude executes**: Runs appropriate messaging command
5. **Confirms result**: "✅ Message sent to backend-architect"

## Requirements

- **Claude Code** with skills support enabled
- **AI Maestro** running (`http://localhost:23000`)
- **Messaging scripts** installed in PATH (see `../messaging_scripts/README.md`)
- **tmux** agent with valid agent name

## Verifying Skills are Loaded

In Claude Code, you can ask:

```
You: "What skills do you have available?"

Claude: I have access to the following skills:
- agent-messaging: Send and receive messages between AI agent sessions
...
```

Or check the skills directory:
```bash
ls -la ~/.claude/skills/
```

## Compatibility

**Works with:**
- ✅ Claude Code (official Anthropic CLI)
- ✅ Any tmux-based AI agent

**Does NOT work with:**
- ❌ Aider (doesn't support Claude Code skills)
- ❌ Cursor (different extension system)
- ❌ Other non-Claude-Code agents

**Note:** For non-Claude-Code agents, use the command-line scripts directly (see `../messaging_scripts/README.md`)

## Troubleshooting

**Skill not loading:**
```bash
# Check skill is in the right location
ls -la ~/.claude/skills/agent-messaging/SKILL.md

# Verify front matter is valid
head -6 ~/.claude/skills/agent-messaging/SKILL.md
```

**Commands fail:**
```bash
# Make sure messaging scripts are installed
which send-aimaestro-message.sh

# Check AI Maestro is running
curl http://localhost:23000/api/sessions

# Verify you're in a tmux session
tmux display-message -p '#S'
```

**Skill loads but commands don't work:**
- See troubleshooting in `../messaging_scripts/README.md`
- Ensure all messaging scripts are executable and in PATH

## Documentation

- [Agent Messaging Skill Documentation](./agent-messaging/SKILL.md)
- [Claude Code Configuration Guide](../docs/CLAUDE-CODE-CONFIGURATION.md)
- [Agent Communication Quickstart](../docs/AGENT-COMMUNICATION-QUICKSTART.md)
- [Messaging Best Practices](../docs/AGENT-COMMUNICATION-GUIDELINES.md)

## Creating Custom Skills

Want to create your own AI Maestro skills? See the [Claude Code Skills Documentation](https://docs.anthropic.com/claude-code/skills) for the full specification.

Example skill structure:
```markdown
---
name: My Custom Skill
description: What this skill does
allowed-tools: Bash, Read, Write
---

# Skill Documentation

## When to use
...

## Available commands
...
```

## License

MIT License - Same as AI Maestro
