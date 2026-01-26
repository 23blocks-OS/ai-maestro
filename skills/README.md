# AI Maestro Claude Code Skills

Claude Code skills that give AI agents superpowers. These skills enable proactive knowledge retrieval, inter-agent communication, and code understanding.

## Why Skills Matter

Skills transform AI agents from simple code assistants into **knowledge-aware systems** that:
- **Remember** past conversations and decisions
- **Understand** codebase structure and relationships
- **Communicate** with other agents asynchronously
- **Learn** from auto-generated documentation

## Available Skills (5)

| Skill | Purpose | Behavior |
|-------|---------|----------|
| [memory-search](#memory-search) | Search conversation history | **PROACTIVE** - Auto-triggers on user instructions |
| [docs-search](#docs-search) | Search code documentation | **PROACTIVE** - Auto-triggers before implementing |
| [graph-query](#graph-query) | Query code relationships | **PROACTIVE** - Auto-triggers when reading files |
| [agent-messaging](#agent-messaging) | Inter-agent communication | On-demand messaging |
| [planning](#planning) | Complex task execution | On-demand for multi-step tasks |

### Two Types of "Memory"

| Skill | Problem Solved | Timescale |
|-------|----------------|-----------|
| **memory-search** | Recall: "What did we discuss before?" | Days/weeks/months |
| **planning** | Execution: "What am I supposed to do next?" | Minutes/hours |

Both are needed. Memory recalls the past. Planning keeps you focused in the present.

---

## memory-search

**Search your conversation history to find previous discussions, decisions, and context.**

This skill enables agents to remember what was discussed before. When a user gives you any instruction, you should FIRST search your memory for relevant context.

### When It Triggers (Automatic)

- User says "continue working on X" → Search for "X"
- User mentions a previous decision → Search for that topic
- User references "what we discussed" → Search for context
- Starting any new task → Search for related history

### Key Commands

```bash
# Hybrid search (recommended)
memory-search.sh "authentication flow"

# Semantic search (find related concepts)
memory-search.sh "error handling" --mode semantic

# Exact term matching
memory-search.sh "PaymentService" --mode term

# Filter by role
memory-search.sh "requirements" --role user
```

### Why It Matters

Without memory search:
- You repeat explanations the user already heard
- You contradict previous decisions
- You miss context that changes the approach
- You start over instead of continuing

**Memory search takes 1 second. Frustrating the user is much worse.**

---

## docs-search

**Search auto-generated documentation for function signatures, class definitions, and API specs.**

This skill helps agents understand the codebase before implementing. When a user asks you to modify or create code, you should FIRST search the documentation.

### When It Triggers (Automatic)

- User says "implement X function" → Search for existing patterns
- User mentions a class/service → Search for its documentation
- Before calling unfamiliar functions → Search for signatures
- Creating new components → Search for existing examples

### Key Commands

```bash
# Semantic search
docs-search.sh "authentication flow"

# Keyword search (exact match)
docs-search.sh --keyword "UserController"

# Find by type
docs-find-by-type.sh function
docs-find-by-type.sh class
docs-find-by-type.sh interface

# Get full document
docs-get.sh doc-abc123
```

### Why It Matters

Without doc search:
- You use wrong function signatures → runtime errors
- You miss existing implementations → duplicate code
- You violate documented patterns → inconsistency
- You misunderstand APIs → build the wrong thing

**Doc search takes 1 second. Redoing work takes hours.**

---

## graph-query

**Query the code graph database to understand relationships and impact of changes.**

This skill helps agents understand code structure BEFORE making changes. Every time you read a code file, you should IMMEDIATELY query the graph.

### When It Triggers (Automatic)

- After reading ANY code file → Query for dependencies
- Before modifying a function → Find all callers
- When changing a model → Find serializers and associations
- Before refactoring → Understand the impact

### Key Commands

```bash
# Describe a component
graph-describe.sh User

# Find callers/callees
graph-find-callers.sh process_payment
graph-find-callees.sh authenticate

# Find related components
graph-find-related.sh PaymentService

# Find model associations
graph-find-serializers.sh User
graph-find-associations.sh Order

# Find by type
graph-find-by-type.sh model
graph-find-by-type.sh controller
```

### Why It Matters

Without graph queries:
- You miss serializers that need updating when you change a model
- You break callers when you change a function signature
- You miss child classes that inherit your changes
- You overlook associations that depend on this model

**The graph query takes 1 second. A broken deployment takes hours to fix.**

---

## agent-messaging

**Send and receive messages between AI agents asynchronously.**

This skill enables multi-agent collaboration. Agents can request work from each other, share updates, and coordinate on complex tasks.

### When To Use

- Need work from another agent → Send a request
- Completed a task for someone → Send a response
- Something urgent happened → Send instant notification
- Checking for requests → Check your inbox

### Key Commands

```bash
# Check inbox for unread messages
check-aimaestro-messages.sh

# Read specific message (auto-marks as read)
read-aimaestro-message.sh msg-1234567890

# Send message to another agent
send-aimaestro-message.sh backend-architect "Need API endpoint" "Please implement POST /api/users" high request

# Send instant notification
send-tmux-message.sh backend-architect "Check your inbox!"

# Reply to a message
reply-aimaestro-message.sh msg-1234567890 "Endpoint ready at routes/users.ts"
```

### Message Types

| Type | Use When |
|------|----------|
| `request` | Need someone to do something |
| `response` | Answering a request |
| `notification` | FYI, no action needed |
| `update` | Progress report |

### Priority Levels

| Priority | Response Time |
|----------|---------------|
| `urgent` | < 15 minutes |
| `high` | < 1 hour |
| `normal` | < 4 hours |
| `low` | When available |

---

## planning

**Stay focused during complex, multi-step tasks using persistent markdown files.**

This skill solves the EXECUTION problem - losing focus after many tool calls. It uses the "Manus-style" 3-file pattern to maintain goals, track progress, and prevent repeated errors.

### When To Use

- Multi-step tasks (3+ steps)
- Research projects
- Building features
- Any task with >5 tool calls
- Work that spans multiple sessions

### The 3-File Pattern

Create these in your **project root**:

| File | Purpose | Update When |
|------|---------|-------------|
| `task_plan.md` | Goals, phases, decisions, errors | After each phase |
| `findings.md` | Research, discoveries, resources | During research |
| `progress.md` | Session log, test results | Throughout session |

### Quick Start

```bash
# Copy templates to project
cat ~/.claude/skills/planning/templates/task_plan.md > task_plan.md
cat ~/.claude/skills/planning/templates/findings.md > findings.md
cat ~/.claude/skills/planning/templates/progress.md > progress.md

# Then edit task_plan.md with your specific goal
```

### The 6 Rules

| Rule | Description |
|------|-------------|
| **Create Plan First** | Never start complex tasks without task_plan.md |
| **Read Before Decide** | Re-read plan before major decisions |
| **Update After Act** | Mark phases complete, log errors |
| **2-Action Rule** | After 2 searches, write findings immediately |
| **Log ALL Errors** | Every error in plan prevents repetition |
| **Never Repeat Failures** | Change approach after failure |

### Core Principle

```
Context Window = RAM (volatile, limited)
Filesystem = Disk (persistent, unlimited)

→ Important things get written to disk.
```

### Why It Matters

Without planning files:
- You forget the original goal after 50 tool calls
- You lose track of which phase you're in
- You repeat the same errors
- You can't resume after /clear

**Creating a plan takes 30 seconds. Losing focus wastes hours.**

---

## Installation

### Quick Install (Recommended)

```bash
# From AI Maestro directory
./install-skills.sh

# This copies all skills to ~/.claude/skills/
# and installs required scripts to ~/.local/bin/
```

### Manual Install

```bash
# Copy skills to Claude's directory
cp -r skills/memory-search ~/.claude/skills/
cp -r skills/docs-search ~/.claude/skills/
cp -r skills/graph-query ~/.claude/skills/
cp -r skills/agent-messaging ~/.claude/skills/
cp -r skills/planning ~/.claude/skills/

# Verify installation
ls -la ~/.claude/skills/
```

### Verify Skills

```bash
# Check all skills are installed
ls ~/.claude/skills/*/SKILL.md

# Should show:
# ~/.claude/skills/agent-messaging/SKILL.md
# ~/.claude/skills/docs-search/SKILL.md
# ~/.claude/skills/graph-query/SKILL.md
# ~/.claude/skills/memory-search/SKILL.md
# ~/.claude/skills/planning/SKILL.md
```

---

## The Proactive Pattern

Three of the four skills follow a **proactive pattern** - they should trigger automatically without the user asking:

```
1. User gives instruction
2. Agent IMMEDIATELY searches/queries relevant sources
3. Agent now has full context
4. Agent proceeds with informed implementation
```

### Example Flow

```
User: "Fix the authentication bug in UserController"

Agent thinking:
1. memory-search.sh "authentication bug"     → What did we discuss before?
2. docs-search.sh "UserController"           → What's the documented behavior?
3. [Reads the file]
4. graph-find-callers.sh authenticate        → What depends on this?

Now agent has:
- Previous context from memory
- Documentation for the class
- Understanding of dependencies
- Ready to fix without breaking things
```

---

## Script Locations

All scripts are installed to `~/.local/bin/`. If commands aren't found:

```bash
# Check PATH
echo $PATH | tr ':' '\n' | grep local

# Verify scripts exist
ls ~/.local/bin/memory-*.sh
ls ~/.local/bin/docs-*.sh
ls ~/.local/bin/graph-*.sh
ls ~/.local/bin/*-aimaestro-*.sh
```

---

## Requirements

- **Claude Code** (official Anthropic CLI)
- **AI Maestro** running (default port 23000)
- **tmux** session (for agent identity)
- Scripts installed in `~/.local/bin/` (via installer)

---

## Troubleshooting

### Scripts not found

```bash
# Check if ~/.local/bin is in PATH
which memory-search.sh

# If not found, add to your shell config:
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### AI Maestro not running

```bash
# Check if running (identity endpoint returns host info)
curl http://127.0.0.1:23000/api/hosts/identity

# Start it
pm2 start ai-maestro
```

### Skill not loading

```bash
# Verify skill file exists
cat ~/.claude/skills/memory-search/SKILL.md | head -10

# Check front matter format
# Should start with:
# ---
# name: ...
# description: ...
# allowed-tools: Bash
# ---
```

---

## Skill Documentation

- [Memory Search Skill](./memory-search/SKILL.md) - Search conversation history (Recall)
- [Docs Search Skill](./docs-search/SKILL.md) - Search code documentation
- [Graph Query Skill](./graph-query/SKILL.md) - Query code relationships
- [Agent Messaging Skill](./agent-messaging/SKILL.md) - Inter-agent communication
- [Planning Skill](./planning/SKILL.md) - Complex task execution (Execution)

---

## License

MIT License - Same as AI Maestro
