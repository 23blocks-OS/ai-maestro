---
name: ai-maestro-agents-management
description: Create, manage, and orchestrate AI agents using the AI Maestro CLI. Use this skill when the user asks to "create agent", "list agents", "delete agent", "rename agent", "hibernate agent", "wake agent", "install plugin", "show agent", "export agent", or any agent lifecycle management.
allowed-tools: Bash
metadata:
  author: 23blocks
  version: "1.0"
---

# AI Maestro Agent Management

## Purpose
Manage AI agents through the AI Maestro CLI. This skill provides commands for creating, updating, deleting, hibernating, and waking agents. It also handles plugin management and agent import/export.

## CRITICAL: This is an Agent Management Skill

**This skill is for managing other agents**, not for inter-agent communication (use `agent-messaging` skill for that).

### Agent Management Operations
- **Create** - Create new agents with working directories
- **List** - List all agents with their status
- **Show** - Display detailed agent information
- **Update** - Modify agent properties (task, tags)
- **Delete** - Remove agents (with confirmation)
- **Rename** - Rename agents and optionally their folders/sessions
- **Hibernate** - Put agents to sleep (saves resources)
- **Wake** - Wake hibernated agents
- **Plugin** - Install/uninstall Claude Code plugins for agents
- **Export/Import** - Export agents for backup or transfer

## CLI Script

**Script:** `aimaestro-agent.sh` (Bash, macOS/Linux)

**Installation:**
```bash
./install-agent-cli.sh
```

**Requirements:**
- macOS or Linux
- Bash 4.0+
- tmux 3.0+
- jq (for JSON processing)
- curl (for API calls)

---

## PART 1: AGENT LIFECYCLE MANAGEMENT

### 1. List All Agents

**Command:**
```bash
aimaestro-agent.sh list [--status online|offline|hibernated|all] [--format table|json|names] [-q|--quiet] [--json]
```

**What it does:**
- Lists all registered agents
- Shows: name, status, working directory, tags
- Can filter by status (use `all` to include hibernated)
- Supports table (default), JSON, or names-only output

**Shorthand Flags:**
- `-q` / `--quiet` - Same as `--format names`
- `--json` - Same as `--format json`

**Examples:**
```bash
# List all agents
aimaestro-agent.sh list

# List only online agents
aimaestro-agent.sh list --status online

# List all agents including hibernated
aimaestro-agent.sh list --status all

# JSON output for scripting
aimaestro-agent.sh list --format json

# Names only (for scripting)
aimaestro-agent.sh list -q
# or
aimaestro-agent.sh list --format names
```

**Output format (table):**
```
┌────────────────────┬──────────┬─────────────────────────────────┬──────────────┐
│ Agent              │ Status   │ Working Directory               │ Tags         │
├────────────────────┼──────────┼─────────────────────────────────┼──────────────┤
│ backend-api        │ online   │ /Users/dev/projects/backend     │ api, prod    │
│ frontend-dev       │ online   │ /Users/dev/projects/frontend    │ ui           │
│ data-processor     │ hibernated│ /Users/dev/projects/data       │              │
└────────────────────┴──────────┴─────────────────────────────────┴──────────────┘
```

---

### 2. Show Agent Details

**Command:**
```bash
aimaestro-agent.sh show <agent> [--format pretty|json]
```

**What it does:**
- Shows detailed information about a specific agent
- Includes: ID, name, status, sessions, working directory, task description, tags
- Agent can be specified by name, alias, or ID

**Examples:**
```bash
# Show agent details
aimaestro-agent.sh show backend-api

# JSON format
aimaestro-agent.sh show backend-api --format json
```

**Output format:**
```
═══════════════════════════════════════════════════════════════
  Agent: backend-api
═══════════════════════════════════════════════════════════════

  ID:           a1b2c3d4-e5f6-7890-abcd-ef1234567890
  Name:         backend-api
  Status:       online
  Program:      claude-code
  Model:        claude-sonnet-4-20250514

  Working Dir:  /Users/dev/projects/backend

  Task:         Implement REST API endpoints for user management

  Tags:         api, production, critical

  Sessions:
    [0] backend-api (online) - tmux session

═══════════════════════════════════════════════════════════════
```

---

### 3. Create New Agent

**IMPORTANT:** The `--dir` flag is **required**. Always specify where the agent's project folder should be created.

**Command:**
```bash
aimaestro-agent.sh create <name> --dir <path> [options] [-- <program-args>...]
```

**Required Parameters:**
- `<name>` - Agent name (alphanumeric, hyphens, underscores only)
- `--dir <path>` - **REQUIRED**: Path for the project folder

**Optional Parameters:**
- `-p, --program <program>` - Program to use (default: claude-code)
- `-m, --model <model>` - Model override (e.g., claude-sonnet-4-20250514)
- `-t, --task <description>` - Task description
- `--tags <tag1,tag2,...>` - Comma-separated tags
- `--no-session` - Create agent without tmux session
- `--no-folder` - Don't create the project folder
- `--force-folder` - Use existing folder if it exists (by default, errors if exists)

**Program Arguments:**
Use `--` to pass additional arguments to the program when it starts. Everything after `--` is passed directly to the program.

**Examples:**
```bash
# Create agent with required directory
aimaestro-agent.sh create my-api --dir /Users/dev/projects/my-api

# Create with task and tags
aimaestro-agent.sh create backend-service \
  --dir /Users/dev/projects/backend \
  --task "Implement user authentication with JWT" \
  --tags "api,auth,security"

# Create without session (for background work)
aimaestro-agent.sh create data-processor \
  --dir /Users/dev/projects/data \
  --no-session

# Create in existing folder (force)
aimaestro-agent.sh create frontend-ui \
  --dir /Users/dev/existing-project \
  --force-folder

# Create with program arguments (passed to claude-code)
aimaestro-agent.sh create debug-agent \
  --dir /Users/dev/projects/debug \
  -- --verbose --debug
```

**What it does:**
1. Checks if agent name already exists (fails if duplicate)
2. Creates the project folder at specified path (unless --no-folder)
3. Initializes git repo in the folder
4. Creates CLAUDE.md template
5. Registers agent in AI Maestro
6. Creates tmux session (unless --no-session)

**Error handling:**
- Exits with error if name already exists
- Exits with error if --dir is not specified
- Exits with error if folder exists (unless --force-folder)

---

### 4. Update Agent

**Command:**
```bash
aimaestro-agent.sh update <agent> [options]
```

**Parameters:**
- `<agent>` - Agent name or ID
- `-t, --task <description>` - Update task description
- `-m, --model <model>` - Change AI model
- `--tags <tag1,tag2,...>` - Replace all tags
- `--add-tag <tag>` - Add a single tag
- `--remove-tag <tag>` - Remove a single tag

**Examples:**
```bash
# Update task description
aimaestro-agent.sh update backend-api --task "Focus on payment integration"

# Change model
aimaestro-agent.sh update backend-api --model claude-sonnet-4-20250514

# Replace all tags
aimaestro-agent.sh update backend-api --tags "api,payments,stripe"

# Add a tag
aimaestro-agent.sh update backend-api --add-tag "critical"

# Remove a tag
aimaestro-agent.sh update backend-api --remove-tag "deprecated"
```

---

### 5. Delete Agent

**CRITICAL:** This is a destructive operation. Use with caution.

**Command:**
```bash
aimaestro-agent.sh delete <agent> --confirm [options]
```

**Required Parameters:**
- `<agent>` - Agent name or ID
- `--confirm` - **REQUIRED** confirmation flag (non-interactive)

**Optional Parameters:**
- `--keep-folder` - Don't delete the project folder (reserved for future API support)
- `--keep-data` - Don't delete agent data in registry (reserved for future API support)

**Examples:**
```bash
# Delete agent (requires --confirm)
aimaestro-agent.sh delete my-old-agent --confirm

# Delete but keep project folder (when API supports it)
aimaestro-agent.sh delete old-project --confirm --keep-folder
```

**What it does:**
1. Validates agent exists
2. Kills tmux session if running
3. Removes agent from registry
4. (Future: Optionally preserves folder/data based on flags)

**Note:** The `--keep-folder` and `--keep-data` flags are reserved for future API support. Currently the API doesn't support these options.

---

### 6. Rename Agent

**Command:**
```bash
aimaestro-agent.sh rename <old-name> <new-name> [options]
```

**Parameters:**
- `<old-name>` - Current agent name
- `<new-name>` - New agent name
- `--rename-session` - Also rename the tmux session
- `--rename-folder` - Also rename the project folder
- `-y, --yes` - Skip confirmation (non-interactive)

**Examples:**
```bash
# Rename agent only
aimaestro-agent.sh rename my-api backend-api -y

# Rename agent and tmux session
aimaestro-agent.sh rename my-api backend-api --rename-session -y

# Rename everything (agent, session, folder)
aimaestro-agent.sh rename my-api backend-api --rename-session --rename-folder -y
```

---

### 7. Hibernate Agent

**Command:**
```bash
aimaestro-agent.sh hibernate <agent>
```

**What it does:**
- Saves agent state
- Kills the tmux session (frees resources)
- Agent can be woken later with full context

**Examples:**
```bash
# Hibernate an agent
aimaestro-agent.sh hibernate backend-api
```

---

### 8. Wake Agent

**Command:**
```bash
aimaestro-agent.sh wake <agent> [--attach]
```

**Parameters:**
- `<agent>` - Agent name or ID
- `--attach` - Attach to tmux session after waking

**Examples:**
```bash
# Wake agent
aimaestro-agent.sh wake backend-api

# Wake and attach to session
aimaestro-agent.sh wake backend-api --attach
```

---

### 8a. Restart Agent

**Command:**
```bash
aimaestro-agent.sh restart <agent> [--wait <seconds>]
```

**What it does:**
- Hibernates the agent, waits, then wakes it
- Useful after installing plugins or marketplaces that require a restart
- Verifies the agent comes back online after restart

**Parameters:**
- `<agent>` - Agent name or ID (cannot be the current session)
- `--wait <seconds>` - Wait time between hibernate and wake (default: 3)

**Examples:**
```bash
# Restart an agent after plugin installation
aimaestro-agent.sh restart backend-api

# Restart with longer wait time (for slow systems)
aimaestro-agent.sh restart backend-api --wait 5
```

**Note:** Cannot restart the current session (yourself). To restart the current session, exit Claude Code and run `claude` again.

---

### 9. Session Management

**Commands:**
```bash
aimaestro-agent.sh session add <agent> [--role <role>]
aimaestro-agent.sh session remove <agent> [--index <n>] [--all]
aimaestro-agent.sh session exec <agent> <command...>
```

**Add session:**
```bash
# Add a new session to agent
aimaestro-agent.sh session add backend-api

# Add session with specific role
aimaestro-agent.sh session add backend-api --role "reviewer"
```

**Remove session:**
```bash
# Remove primary session (index 0)
aimaestro-agent.sh session remove backend-api

# Remove specific session by index
aimaestro-agent.sh session remove backend-api --index 1

# Remove all sessions
aimaestro-agent.sh session remove backend-api --all
```

**Execute command in session:**
```bash
# Send command to agent's session
aimaestro-agent.sh session exec backend-api "git status"
```

---

## PART 2: PLUGIN MANAGEMENT

### 10. Install Plugin for Agent

**Command:**
```bash
aimaestro-agent.sh plugin install <agent> <plugin> [--scope user|project|local] [--plugin-dir] [--no-restart]
```

**Parameters:**
- `<agent>` - Agent name or ID
- `<plugin>` - Plugin name or path
- `--scope` - Installation scope (default: local)
  - `user` - Global for all projects
  - `project` - For this project only
  - `local` - Local only (recommended for per-agent)
- `--plugin-dir` - Use `--plugin-dir` mode (session-only loading)
- `--no-restart` - Don't automatically restart the agent after install

**Restart Behavior:**
- **Remote agent**: Automatically hibernates and wakes the agent to apply changes
- **Current agent (self)**: Shows instructions to manually restart Claude Code
- If plugin is already installed, the command continues without error

**Examples:**
```bash
# Install plugin with local scope (auto-restart remote agents)
aimaestro-agent.sh plugin install backend-api my-plugin

# Install with user scope
aimaestro-agent.sh plugin install backend-api my-plugin --scope user

# Session-only loading (doesn't persist)
aimaestro-agent.sh plugin install backend-api /path/to/plugin --plugin-dir

# Install without automatic restart
aimaestro-agent.sh plugin install backend-api my-plugin --no-restart
```

---

### 11. Uninstall Plugin

**Command:**
```bash
aimaestro-agent.sh plugin uninstall <agent> <plugin> [--scope user|project|local] [--force|-f]
```

**Parameters:**
- `<agent>` - Agent name or ID
- `<plugin>` - Plugin name
- `--scope` - Plugin scope (default: local)
- `--force, -f` - Force removal even if corrupt (deletes cache folder and updates config files)

**Examples:**
```bash
# Uninstall plugin
aimaestro-agent.sh plugin uninstall backend-api my-plugin

# Force uninstall (useful for corrupt plugins)
aimaestro-agent.sh plugin uninstall backend-api my-plugin --force
# or
aimaestro-agent.sh plugin uninstall backend-api my-plugin -f
```

---

### 12. List Agent Plugins

**Command:**
```bash
aimaestro-agent.sh plugin list <agent>
```

**Examples:**
```bash
# List plugins for agent
aimaestro-agent.sh plugin list backend-api
```

**Note:** Output format is determined by the underlying `claude plugin list` command.

---

### 13. Enable/Disable Plugins

**Commands:**
```bash
aimaestro-agent.sh plugin enable <agent> <plugin> [--scope user|project|local]
aimaestro-agent.sh plugin disable <agent> <plugin> [--scope user|project|local]
```

**Examples:**
```bash
# Enable plugin
aimaestro-agent.sh plugin enable backend-api debug-tools

# Disable plugin
aimaestro-agent.sh plugin disable backend-api debug-tools
```

---

### 14. Validate Plugin

**Command:**
```bash
aimaestro-agent.sh plugin validate <agent> <plugin-path>
```

**What it does:**
- Validates plugin structure before installation
- Checks for manifest.json
- Verifies required fields

---

### 15. Reinstall Plugin

**Command:**
```bash
aimaestro-agent.sh plugin reinstall <agent> <plugin> [--scope user|project|local]
```

**What it does:**
- Uninstalls and reinstalls plugin
- Preserves enabled/disabled state
- Useful for fixing corrupt installations

---

### 16. Clean Plugin Cache

**Command:**
```bash
aimaestro-agent.sh plugin clean <agent> [--dry-run|-n]
```

**Parameters:**
- `<agent>` - Agent name or ID (required)
- `--dry-run, -n` - Show what would be cleaned without actually removing

**What it does:**
- Validates all installed plugins for the agent
- Identifies plugins that fail validation
- Reports or removes orphaned cache directories
- Cleans up stale entries in config files

---

### 17. Plugin Marketplace Management

**Commands:**
```bash
aimaestro-agent.sh plugin marketplace list <agent>
aimaestro-agent.sh plugin marketplace add <agent> <url> [--no-restart]
aimaestro-agent.sh plugin marketplace remove <agent> <name> [--force|-f]
aimaestro-agent.sh plugin marketplace update <agent> [<name>]
```

**Add Marketplace Options:**
- `--no-restart` - Don't automatically restart the agent after adding

**Restart Behavior (add):**
- **Remote agent**: Automatically hibernates and wakes the agent to apply changes
- **Current agent (self)**: Shows instructions to manually restart Claude Code
- If marketplace is already installed, the command continues without error

**Examples:**
```bash
# List known marketplaces for agent
aimaestro-agent.sh plugin marketplace list backend-api

# Add a marketplace (auto-restart remote agents)
aimaestro-agent.sh plugin marketplace add backend-api github:owner/marketplace

# Add a marketplace without auto-restart
aimaestro-agent.sh plugin marketplace add backend-api https://example.com/marketplace --no-restart

# Update all marketplaces
aimaestro-agent.sh plugin marketplace update backend-api

# Remove marketplace
aimaestro-agent.sh plugin marketplace remove backend-api my-marketplace --force
```

---

## PART 3: EXPORT/IMPORT

### 18. Export Agent

**Command:**
```bash
aimaestro-agent.sh export <agent> [-o <output-file>]
```

**Parameters:**
- `<agent>` - Agent name or ID
- `-o, --output <file>` - Output file path (default: `<agent>.agent.json`)

**Reserved flags (not yet implemented):**
- `--include-data` - Include agent database (memory, graph) - *reserved for future*
- `--include-folder` - Include project folder as archive - *reserved for future*

**Examples:**
```bash
# Basic export
aimaestro-agent.sh export backend-api

# Export with custom filename
aimaestro-agent.sh export backend-api -o backup/backend-$(date +%Y%m%d).json
```

**Note:** Currently exports agent configuration only. Data and folder archiving will be added in a future release.

---

### 19. Import Agent

**Command:**
```bash
aimaestro-agent.sh import <file> [--name <new-name>] [--dir <new-dir>]
```

**Parameters:**
- `<file>` - Export file to import
- `--name <new-name>` - Override agent name
- `--dir <new-dir>` - Override working directory

**Examples:**
```bash
# Basic import
aimaestro-agent.sh import backend-api.agent.json

# Import with new name
aimaestro-agent.sh import backup.json --name new-backend

# Import with new directory
aimaestro-agent.sh import backup.json --dir /Users/dev/projects/new-location
```

---

## PART 4: SKILL MANAGEMENT

### 20. List Agent Skills

**Command:**
```bash
aimaestro-agent.sh skill list <agent>
```

---

### 21. Add Skill to Agent

**Command:**
```bash
aimaestro-agent.sh skill add <agent> <skill-id> [--type marketplace|custom] [--path <path>]
```

**Parameters:**
- `<agent>` - Agent name or ID
- `<skill-id>` - Skill identifier
- `--type` - Skill type: `marketplace` (default) or `custom`
- `--path` - Path for custom skill (required when `--type custom`)

**Examples:**
```bash
# Add marketplace skill
aimaestro-agent.sh skill add backend-api git-workflow

# Add custom skill from path
aimaestro-agent.sh skill add backend-api my-skill --type custom --path ~/skills/my-skill
```

---

### 22. Remove Skill from Agent

**Command:**
```bash
aimaestro-agent.sh skill remove <agent> <skill-id>
```

---

## Decision Guide

**Use `create` when:**
- Starting a new project/agent
- Need isolated working environment
- Want git-initialized folder

**Use `hibernate` when:**
- Agent not needed for a while
- Want to free system resources
- Need to preserve agent state

**Use `wake` when:**
- Resuming work on hibernated agent
- Need agent context back

**Use `update` when:**
- Changing task focus
- Managing tags for organization

**Use `plugin install` when:**
- Adding Claude Code extensions to agent
- Need agent-specific tools

**Use `export/import` when:**
- Backing up agent configuration
- Moving agent to another machine
- Sharing agent setup with team

---

## Error Handling

**Agent not found:**
```bash
# List available agents
aimaestro-agent.sh list

# Check specific name
aimaestro-agent.sh show <name>
```

**Name already exists:**
```bash
# The create command checks for name collisions
# Use a different name or delete existing agent first
aimaestro-agent.sh delete old-name --confirm
aimaestro-agent.sh create new-name --dir /path
```

**Script not found:**
```bash
# Check installation
which aimaestro-agent.sh

# Verify PATH includes ~/.local/bin
echo $PATH | tr ':' '\n' | grep local/bin
```

**API not running:**
```bash
# Check AI Maestro status
curl http://localhost:23000/api/hosts/identity

# Start AI Maestro
cd /path/to/ai-maestro && yarn dev
```

---

## Examples by Scenario

### Scenario 1: Set Up New Development Environment
```bash
# Create main backend agent
aimaestro-agent.sh create backend-api \
  --dir ~/projects/my-app/backend \
  --task "Build REST API with Node.js and TypeScript" \
  --tags "api,typescript,backend"

# Create frontend agent
aimaestro-agent.sh create frontend-ui \
  --dir ~/projects/my-app/frontend \
  --task "Build React dashboard" \
  --tags "react,frontend,ui"

# List all agents
aimaestro-agent.sh list
```

### Scenario 2: End of Day - Save Resources
```bash
# Hibernate non-essential agents
aimaestro-agent.sh hibernate frontend-ui
aimaestro-agent.sh hibernate data-processor

# Keep critical agent running
# (backend-api stays online)

# Check status
aimaestro-agent.sh list --status hibernated
```

### Scenario 3: Resume Work Next Day
```bash
# Wake needed agents
aimaestro-agent.sh wake frontend-ui --attach
```

### Scenario 4: Backup Before Major Changes
```bash
# Export agent configuration
aimaestro-agent.sh export backend-api \
  -o backups/backend-$(date +%Y%m%d).json

# Make risky changes...

# If needed, delete and reimport
aimaestro-agent.sh delete backend-api --confirm
aimaestro-agent.sh import backups/backend-20250201.json
```

### Scenario 5: Share Agent Configuration
```bash
# Export for sharing (no personal data)
aimaestro-agent.sh export template-api -o team/api-template.json

# Team member imports
aimaestro-agent.sh import team/api-template.json \
  --name my-new-api \
  --dir ~/projects/my-api
```

### Scenario 6: Install Marketplace and Plugins on Remote Agent
```bash
# Add marketplace to remote agent (auto-restarts)
aimaestro-agent.sh plugin marketplace add data-processor github:my-org/ai-plugins

# Install plugin from that marketplace (auto-restarts)
aimaestro-agent.sh plugin install data-processor data-analysis-tool

# Verify agent is back online
aimaestro-agent.sh show data-processor
```

### Scenario 7: Install Marketplace on Current Agent (Self)
```bash
# When installing on the current agent, manual restart is needed
aimaestro-agent.sh plugin marketplace add current-agent github:my-org/plugins

# Script will show restart instructions:
#   "Claude Code restart required for the marketplace to be available"
#   1. Exit Claude Code with '/exit' or Ctrl+C
#   2. Run 'claude' again in your terminal

# After restarting, install plugins
aimaestro-agent.sh plugin install current-agent my-plugin
```

---

## Troubleshooting

### Plugin/Marketplace Issues

**Plugin not available after install:**
```bash
# For remote agents, restart manually
aimaestro-agent.sh restart backend-api

# For current agent (self), exit and restart Claude Code
# Type '/exit' or Ctrl+C, then run 'claude' again
```

**Marketplace already installed error (non-blocking):**
The script handles this gracefully and continues. If you see "Marketplace appears to be already configured", subsequent operations will still work.

**Failed to add marketplace:**
```bash
# Check the full error from Claude CLI
# The script shows verbatim errors from claude command

# Common issues:
# 1. Invalid URL or GitHub path
# 2. Network connectivity issues
# 3. Marketplace repository doesn't exist

# Try manually:
cd /path/to/agent/working/dir
claude plugin marketplace add github:owner/repo
```

**Plugin install fails silently:**
```bash
# Check if claude CLI is installed
which claude

# Check claude version
claude --version

# Try direct install to see full error:
cd /path/to/agent/working/dir
claude plugin install my-plugin --scope local 2>&1
```

### Restart Issues

**Agent not restarting properly:**
```bash
# Check agent status
aimaestro-agent.sh show backend-api

# Try manual hibernate and wake
aimaestro-agent.sh hibernate backend-api
sleep 5
aimaestro-agent.sh wake backend-api

# Check tmux sessions
tmux ls
```

**Cannot restart current session:**
```
Error: Cannot restart the current session (yourself)
```
This is expected. You cannot restart your own session from within it.
- Exit Claude Code with `/exit` or Ctrl+C
- Run `claude` again in your terminal

**Wake fails after hibernate:**
```bash
# Check if tmux is running
tmux ls

# Check AI Maestro API
curl http://localhost:23000/api/agents

# Try manual wake with attach to see errors
tmux new-session -s backend-api
```

### API Issues

**API not responding:**
```bash
# Check if AI Maestro is running
curl http://localhost:23000/api/hosts/identity

# Check PM2 status
pm2 status ai-maestro

# Restart AI Maestro
pm2 restart ai-maestro
# or
cd /path/to/ai-maestro && yarn dev
```

**Agent not found:**
```bash
# List all known agents
aimaestro-agent.sh list

# Check if agent is registered
curl http://localhost:23000/api/agents | jq '.agents[].name'

# Agent may have been deleted or never created
```

### Permission Issues

**Permission denied on agent directory:**
```bash
# Check directory permissions
ls -la /path/to/agent/dir

# Ensure you own the directory
sudo chown -R $(whoami) /path/to/agent/dir
```

**tmux session access denied:**
```bash
# Check tmux socket
ls -la /tmp/tmux-*/

# Ensure correct user
whoami
tmux ls
```

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| "Agent name required" | Missing agent argument | Add agent name/ID: `cmd <agent>` |
| "Agent working directory not found" | Directory deleted or moved | Update agent or recreate |
| "Working directory does not exist" | Directory path invalid | Check path exists |
| "Claude CLI is required" | claude not installed | Install: `npm i -g @anthropic-ai/claude-code` |
| "Failed to add marketplace" | Invalid source or network error | Check URL/path and network |
| "Session index must be a non-negative integer" | Invalid --index value | Use 0, 1, 2, etc. |
| "Cannot restart the current session" | Trying to restart self | Exit and restart manually |
| "Failed to get API base URL" | API configuration issue | Check AI Maestro is running |

---

## References

- [AI Maestro Documentation](https://github.com/23blocks-OS/ai-maestro)
- [Agent Registry Architecture](https://github.com/23blocks-OS/ai-maestro/blob/main/docs/AGENT-REGISTRY.md)
- [Plugin Development](https://github.com/23blocks-OS/ai-maestro/blob/main/docs/PLUGIN-DEVELOPMENT.md)
