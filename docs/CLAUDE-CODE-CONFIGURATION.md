# Claude Code Configuration Guide

This document covers Claude Code configuration options for AI Maestro, including research findings, implementation strategies, and the agent messaging skill.

---

## Table of Contents

1. [Configuration Options Overview](#configuration-options-overview)
2. [Research Findings (2025)](#research-findings-2025)
3. [Skills vs Slash Commands vs CLAUDE.md](#skills-vs-slash-commands-vs-claudemd)
4. [Agent Messaging Skill Implementation](#agent-messaging-skill-implementation)
5. [Alternative Approaches](#alternative-approaches)
6. [Best Practices](#best-practices)
7. [References](#references)

---

## Configuration Options Overview

Claude Code supports three main configuration mechanisms:

| Mechanism | Scope | Invocation | Use Case |
|-----------|-------|------------|----------|
| **Skills** | Global or Project | Model-invoked (automatic) | Extend Claude's capabilities with tools |
| **Slash Commands** | Global or Project | User-invoked (explicit) | Frequently-used prompts |
| **CLAUDE.md** | Project | Always loaded | Project context and conventions |

---

## Research Findings (2025)

### Skills (Introduced October 2025)

**What are Skills?**
- Modular capabilities that extend Claude's functionality
- **Model-invoked** - Claude autonomously decides when to use them
- Based on matching user requests against skill descriptions
- Portable across Claude apps, Claude Code, and API

**Key Features:**
- **Automatic activation** - No explicit command needed
- **Progressive disclosure** - Only a few dozen tokens upfront, full details loaded when needed
- **Portability** - Same format everywhere
- **Supporting files** - Can include scripts, templates, documentation

**File Structure:**
```
~/.claude/skills/my-skill/
├── SKILL.md          # Main skill definition
├── reference.md      # Optional supporting docs
├── examples.md       # Optional examples
└── scripts/          # Optional utility scripts
    └── helper.py
```

**SKILL.md Format:**
```yaml
---
name: Skill Name
description: Brief description of what this skill does and when to use it
allowed-tools: Bash, Read, Grep  # Optional tool restrictions
---

# Skill Name

## Instructions
Clear, step-by-step guidance for Claude.
```

**Storage Locations:**
- **Personal (Global)**: `~/.claude/skills/` - Available across all projects
- **Project-Specific**: `.claude/skills/` - Shared with team via git
- **Plugin Skills**: Installed via plugins, automatically available

---

### Slash Commands

**What are Slash Commands?**
- User-invoked prompts defined as Markdown files
- Explicitly called by typing `/command-name`
- Support arguments via `$ARGUMENTS` or positional `$1`, `$2`, etc.

**File Structure:**
```
~/.claude/commands/my-command.md
.claude/commands/project-command.md
```

**Format:**
```markdown
---
description: Brief description
allowed-tools: Bash(git add:*), Bash(git status:*)
argument-hint: [parameter]
model: claude-3-5-haiku-20241022
---

Your command instructions here.

Use $ARGUMENTS for all arguments, or $1, $2 for positional.
```

**Storage Locations:**
- **User-scoped**: `~/.claude/commands/` - Available in all projects
- **Project-scoped**: `.claude/commands/` - Shared with team

**Usage:**
```bash
claude
> /my-command arg1 arg2
```

---

### CLAUDE.md

**What is CLAUDE.md?**
- Project-specific context file that Claude automatically reads
- Provides project overview, conventions, architecture, and guidelines
- Always loaded, no invocation needed

**File Structure:**
```
CLAUDE.md              # Root project context (highest priority)
.claude/CLAUDE.md      # Alternative location
some-dir/CLAUDE.md     # Directory-specific context
```

**Hierarchical Loading:**
- Global: `~/.claude/CLAUDE.md` - Applies to all projects
- Project: `CLAUDE.md` or `.claude/CLAUDE.md` - Project-specific
- Nested: `subdir/CLAUDE.md` - Most specific, highest priority

**Format:**
```markdown
# Project Name

## Overview
Brief description of the project.

## Technology Stack
- Framework: Next.js 14
- Language: TypeScript

## Folder Structure
- `app/` - Next.js app router pages
- `components/` - React components

## Development Conventions
- Use TypeScript strict mode
- Components use kebab-case filenames
```

**Best Practices:**
- Use short, declarative bullet points
- Avoid redundancy (folder named "components" doesn't need explanation)
- Focus on non-obvious conventions and decisions
- Update as project evolves

---

## Skills vs Slash Commands vs CLAUDE.md

### Comparison Matrix

| Feature | Skills | Slash Commands | CLAUDE.md |
|---------|--------|----------------|-----------|
| **Invocation** | Automatic (model decides) | Manual (`/command`) | Always loaded |
| **Scope** | Global or Project | Global or Project | Project only |
| **Use Case** | Extend capabilities | Reusable prompts | Project context |
| **Arguments** | Via natural language | Via `$ARGUMENTS` | N/A |
| **Tool Access** | Can execute tools | Can execute tools | Read-only context |
| **Discoverability** | Via description matching | Must know command name | Always visible |
| **Portability** | Cross-platform | Claude Code only | Claude Code only |
| **Best For** | New capabilities | Frequent tasks | Project knowledge |

### When to Use Each

#### Use Skills When:
- ✅ You want Claude to automatically use a capability
- ✅ The capability should work across all projects
- ✅ Natural language invocation is preferred
- ✅ You need tool execution (bash, file operations)
- ✅ Capability is modular and standalone

**Example:** Agent messaging, code review templates, deployment workflows

#### Use Slash Commands When:
- ✅ You want explicit control over invocation
- ✅ Command is frequently used with similar patterns
- ✅ You need to pass specific arguments
- ✅ Command is project-specific or team workflow

**Example:** `/deploy production`, `/create-component Button`, `/run-tests unit`

#### Use CLAUDE.md When:
- ✅ Providing project background and context
- ✅ Documenting architectural decisions
- ✅ Defining coding conventions and standards
- ✅ Explaining project structure and dependencies
- ✅ Information should always be available to Claude

**Example:** Tech stack, folder structure, naming conventions, git workflow

---

## Agent Messaging Skill Implementation

### Why We Chose Skills

For AI Maestro's agent messaging system, we implemented a **Global Skill** because:

1. **Natural language** - Users can say "send a message to backend" without learning commands
2. **Auto-activated** - Claude recognizes messaging intent automatically
3. **Cross-project** - Works in all projects, not just AI Maestro
4. **Modular** - Easy to update and maintain
5. **Portable** - Works in terminal and VS Code

### Implementation

**Location:** `~/.claude/skills/agent-messaging/SKILL.md`

**Capability:** Enables Claude to send messages between AI agent sessions using:
- File-based persistent messaging (`amp-send`)
- Instant tmux notifications (`send-tmux-message.sh`)
- Decision logic for choosing the right method

### Usage Examples

**Natural Language Invocation:**

```bash
claude

# Example 1: Simple message
> Send a message to backend-architect asking them to implement a POST /api/users endpoint

# Claude automatically:
# 1. Recognizes this is a messaging request
# 2. Activates the agent-messaging skill
# 3. Chooses appropriate method (file-based)
# 4. Executes: amp-send backend-architect "Need API endpoint" "..."
# 5. Confirms message sent

# Example 2: Urgent notification
> Urgent: notify frontend-dev that the build is failing

# Claude automatically:
# 1. Detects urgency
# 2. Uses both instant + file-based messaging
# 3. Executes: send-tmux-message.sh frontend-dev "Build failing!"
# 4. Then: amp-send frontend-dev "Build failed" "..." urgent notification

# Example 3: Progress update
> Send an update to project-lead that I'm 75% done with the authentication system

# Claude automatically:
# 1. Recognizes this as a progress update
# 2. Chooses file-based with 'update' type
# 3. Executes: amp-send project-lead "Auth: 75% complete" "..." normal update
```

**No explicit commands needed!** Just describe what you want to communicate.

### Skill Configuration

The skill includes:

1. **Clear description** - Tells Claude when to activate (keywords: "send message", "notify", "alert", "tell")
2. **Tool restrictions** - Limited to `Bash` (no file modifications)
3. **Decision logic** - When to use file-based vs instant
4. **Error handling** - Checks for session existence, AI Maestro availability
5. **Comprehensive examples** - All scenarios covered

### Verification

**Check if skill is installed:**
```bash
ls -la ~/.claude/skills/agent-messaging/SKILL.md
```

**Test in Claude Code:**
```bash
claude
> What skills are available?
# Should list "AI Maestro Agent Messaging"

> Send a message to backend-architect saying hello
# Should execute the messaging command
```

---

## Alternative Approaches

### Option 2: Project-Specific CLAUDE.md

If you only need messaging in specific projects, add to `.claude/CLAUDE.md`:

```markdown
## Inter-Agent Communication

This project uses AI Maestro for agent coordination.

**When the user says "send a message to [session]"**, use these tools:

### File-Based Messages (Persistent, Structured)
```bash
amp-send <session> <subject> <message> [priority] [type]
```

**Parameters:**
- `priority`: low | normal | high | urgent
- `type`: request | response | notification | update

**Examples:**
```bash
amp-send backend-architect "Need API" "Please implement POST /api/users" high request
amp-send frontend-dev "Build failed" "Tests failing" urgent notification
```

### Instant Notifications (Real-time)
```bash
send-tmux-message.sh <session> <message> [method]
```

**Methods:** display (popup) | inject (history) | echo (output)

**Examples:**
```bash
send-tmux-message.sh backend-architect "Check your inbox!"
send-tmux-message.sh frontend-dev "Urgent!" echo
```

### Decision Guide
- **Detailed/structured** → Use file-based
- **Urgent/immediate** → Use instant
- **Both** → Use both methods

See: [Communication Quickstart](./docs/AGENT-COMMUNICATION-QUICKSTART.md)
```

**Pros:**
- ✅ Project-scoped (only loads for AI Maestro)
- ✅ Can be committed to git
- ✅ Team-shared

**Cons:**
- ❌ Only works in this project
- ❌ Less detailed than a full Skill
- ❌ Not automatically invoked (needs explicit mention)

---

### Option 3: Custom Slash Command

Create `~/.claude/commands/send-message.md`:

```markdown
---
description: Send a message to another AI agent session
argument-hint: <session> <message>
allowed-tools: Bash
---

Send a message using AI Maestro's messaging system.

**Arguments:**
- $1: Target session name
- $2+: Message content

**Logic:**
1. Parse target session from $1
2. Combine remaining arguments as message
3. Detect urgency (keywords: urgent, critical, emergency, production, down, failing)
4. If urgent: Use both instant + file-based
5. Otherwise: Use file-based only

**Execute:**
```bash
# Urgent: Both methods
if [urgent detected]; then
  send-tmux-message.sh $1 "🚨 Urgent: Check inbox!"
  amp-send $1 "Urgent notification" "$message" urgent notification
else
  amp-send $1 "Message from Claude" "$message" normal notification
fi
```

**Confirm:** Tell user message was sent to [session].
```

**Usage:**
```bash
claude
> /send-message backend-architect Need help with API endpoint
> /send-message frontend-dev Urgent: Build failing!
```

**Pros:**
- ✅ Explicit control
- ✅ Works across all projects
- ✅ Simple argument passing

**Cons:**
- ❌ Requires learning command syntax
- ❌ Less natural than Skills
- ❌ User must remember to invoke

---

## Best Practices

### For Skills

1. **Write specific descriptions**
   - Include both functionality AND usage triggers
   - Example: "Use this skill when the user asks to 'send a message', 'notify', or 'alert' another session"
   - Vague descriptions reduce discoverability

2. **Keep skills focused**
   - One skill = one capability
   - Don't create mega-skills that do everything

3. **Use allowed-tools restrictively**
   - Only grant necessary tool access
   - Example: `allowed-tools: Bash` (no file writes)

4. **Include comprehensive examples**
   - Show all usage scenarios
   - Include error handling

5. **Test activation behavior**
   - Try various phrasings to ensure Claude recognizes the skill
   - Ask "What skills are available?" to verify

6. **Version control** (for project skills)
   - Commit `.claude/skills/` to git
   - Document changes in SKILL.md

### For Slash Commands

1. **Use descriptive names**
   - `/deploy-production` not `/dp`
   - `/create-component` not `/cc`

2. **Provide argument hints**
   - `argument-hint: <env> [branch]`
   - Helps users remember syntax

3. **Handle missing arguments**
   - Provide helpful error messages
   - Show usage examples

4. **Document in README**
   - List available commands
   - Show examples for each

### For CLAUDE.md

1. **Keep it concise**
   - Short bullet points, not essays
   - Focus on non-obvious information

2. **Update regularly**
   - Reflect current project state
   - Remove outdated conventions

3. **Use hierarchical structure**
   - Main CLAUDE.md for project overview
   - Subdirectory CLAUDE.md for specific areas

4. **Avoid redundancy**
   - Don't explain obvious things
   - Focus on architectural decisions and "why"

---

## Testing & Verification

### Test the Agent Messaging Skill

**Step 1: Verify installation**
```bash
ls -la ~/.claude/skills/agent-messaging/SKILL.md
```

**Step 2: Check Claude recognizes it**
```bash
claude
> What skills are available?
# Should list: "AI Maestro Agent Messaging"
```

**Step 3: Test natural language invocation**
```bash
# Create test sessions first
tmux new-session -d -s test-backend
tmux new-session -d -s test-frontend

# In Claude Code
claude
> Send a message to test-backend saying "Hello from Claude!"

# Expected behavior:
# 1. Claude recognizes messaging intent
# 2. Activates agent-messaging skill
# 3. Executes: amp-send test-backend "Message from Claude" "Hello from Claude!" normal notification
# 4. Confirms: "✅ Message sent to test-backend"
```

**Step 4: Test urgent detection**
```bash
claude
> Urgent: notify test-frontend that there's a critical bug

# Expected behavior:
# 1. Claude detects urgency
# 2. Uses both instant + file-based
# 3. Executes both commands
# 4. Confirms both sent
```

**Step 5: Verify messages received**
```bash
# Check file-based inbox
ls ~/.agent-messaging/messages/inbox/test-backend/

# Check message content
cat ~/.agent-messaging/messages/inbox/test-backend/*.json | jq

# Or use the check script
amp-inbox
```

### Troubleshooting

**Skill not activating?**
- Check description is clear and includes trigger keywords
- Try more explicit phrasing: "use the agent messaging skill to send..."
- Verify allowed-tools includes Bash

**Commands not found?**
- Check PATH: `which amp-send`
- Ensure `.zshenv` includes `~/.local/bin` (see TROUBLESHOOTING.md)

**AI Maestro not running?**
- Start the server: `cd ~/path/to/agents-web && yarn dev`
- Verify: `curl http://localhost:23000/api/sessions`

---

## Configuration Files Reference

### Current AI Maestro Configuration

**Global Skill (Implemented):**
```
~/.claude/skills/agent-messaging/SKILL.md
```

**Project CLAUDE.md (Existing):**
```
/Users/juanpelaez/23blocks/webApps/agents-web/CLAUDE.md
```

**Shell Scripts (Installed):**
```
~/.local/bin/amp-send
~/.local/bin/send-tmux-message.sh
~/.local/bin/amp-inbox
~/.local/bin/check-new-messages-arrived.sh
```

**Documentation:**
```
docs/AGENT-COMMUNICATION-QUICKSTART.md
docs/AGENT-COMMUNICATION-GUIDELINES.md
docs/AGENT-COMMUNICATION-ARCHITECTURE.md
docs/AGENT-MESSAGING-GUIDE.md
docs/CLAUDE-CODE-CONFIGURATION.md  ← This file
```

---

## References

### Official Documentation
- [Claude Code Best Practices (Anthropic)](https://www.anthropic.com/engineering/claude-code-best-practices)
- [Agent Skills Documentation](https://docs.claude.com/en/docs/claude-code/skills)
- [Slash Commands Documentation](https://docs.claude.com/en/docs/claude-code/slash-commands)
- [Claude Skills Announcement](https://www.anthropic.com/news/skills)

### Community Resources
- [awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) - Curated list of commands, files, and workflows
- [Claude Code Cheat Sheet (Shipyard)](https://shipyard.build/blog/claude-code-cheat-sheet/)
- [Claude Skills Guide for Non-Developers](https://skywork.ai/blog/ai-agent/claude-skills-guide-non-developers/)

### AI Maestro Documentation
- [Agent Communication Quickstart](./AGENT-COMMUNICATION-QUICKSTART.md)
- [Agent Communication Guidelines](./AGENT-COMMUNICATION-GUIDELINES.md)
- [Agent Communication Architecture](./AGENT-COMMUNICATION-ARCHITECTURE.md)
- [Agent Messaging Guide](./AGENT-MESSAGING-GUIDE.md)

---

## Appendix: Complete Skill File

The complete `~/.claude/skills/agent-messaging/SKILL.md` file is available at:
```
~/.claude/skills/agent-messaging/SKILL.md
```

Key sections:
1. YAML frontmatter with name, description, allowed-tools
2. Purpose and when to use
3. Available tools (file-based + instant)
4. Decision guide
5. Message type and priority guidelines
6. Scenario-based examples
7. Workflow steps
8. Error handling

To view:
```bash
cat ~/.claude/skills/agent-messaging/SKILL.md
```

To edit:
```bash
nano ~/.claude/skills/agent-messaging/SKILL.md
```

---

## Changelog

### 2025-01-17
- Created initial documentation based on Claude Code 2025 research
- Implemented global agent-messaging skill
- Documented Skills vs Slash Commands vs CLAUDE.md
- Added testing and verification procedures

---

**Made with ♥ for AI Maestro**
*Enhancing agent coordination through intelligent configuration*
