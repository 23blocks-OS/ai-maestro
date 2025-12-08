# Creating Agents via Terminal for AI Maestro

This guide explains how to create agents via terminal commands (using tmux sessions) that will automatically appear in the AI Maestro web interface.

## Quick Start

Create a new tmux session with Claude Code running:

```bash
# Create a detached agent
tmux new-session -s my-agent-name -d
tmux send-keys -t my-agent-name 'claude' C-m

# Or create an interactive agent
tmux new-session -s my-agent-name
# Then manually run: claude
```

The dashboard will auto-discover this agent within ~10 seconds.

## Hierarchical Organization

Use forward slashes in agent names to create organized hierarchies in the dashboard:

```bash
# Creates: Category "project" → Subcategory "backend" → Agent "api"
tmux new-session -s project/backend/api -d
tmux send-keys -t project/backend/api 'claude' C-m

# Creates: Category "fluidmind" → Subcategory "agents" → Agent "backend-architect"
tmux new-session -s fluidmind/agents/backend-architect -d
tmux send-keys -t fluidmind/agents/backend-architect 'claude' C-m

# Single level (no hierarchy)
tmux new-session -s quick-test -d
tmux send-keys -t quick-test 'claude' C-m
```

## Benefits of Terminal-Based Agent Creation

### Full Claude Code CLI Features
When creating agents in a regular terminal, you get:
- **File upload/download support** - Send files to Claude, receive generated files
- **Full keyboard shortcuts** - All native terminal shortcuts work
- **Better copy/paste** - Native terminal clipboard integration
- **Stable connection** - Not dependent on browser tab staying open

### Dashboard Monitoring
Once the agent appears in the dashboard, you can:
- **Monitor multiple agents** - See all agents at a glance
- **Quick switching** - Click to jump between different Claude agents
- **Agent notes** - Add notes to track what each agent is working on
- **Hierarchical organization** - Group related agents by project/category

## Recommended Workflow

1. **Create agent in terminal** for full CLI features:
   ```bash
   tmux new-session -s myproject/feature/implementation
   claude
   # Use Claude Code with full features (file uploads, etc.)
   ```

2. **Monitor in dashboard**:
   - Open AI Maestro in browser (http://localhost:3000)
   - Agent appears under "myproject" → "feature" → "implementation"
   - Add notes about current task
   - Switch to other agents as needed

3. **Detach and reattach**:
   ```bash
   # In tmux session, press: Ctrl-b d (detach)
   # Later, reattach from terminal:
   tmux attach-session -t myproject/feature/implementation
   # Or click the agent in the dashboard
   ```

## Agent Naming Rules

Agent names (which become tmux session names) must follow these rules:
- Alphanumeric characters: `a-z`, `A-Z`, `0-9`
- Hyphens: `-`
- Underscores: `_`
- Forward slashes: `/` (for hierarchy)

**Valid examples:**
- `my-session`
- `project_alpha`
- `team/backend/api-v2`
- `test123`

**Invalid examples:**
- `my session` (spaces not allowed)
- `project@backend` (special chars not allowed)
- `user's-session` (apostrophes not allowed)

## Common Use Cases

### Working with File Uploads
```bash
# Create agent for file-heavy work
tmux new-session -s analysis/data-processing
claude
# Now you can upload CSV files, images, etc. directly in the terminal
```

### Long-Running Tasks
```bash
# Start an agent for a complex refactoring
tmux new-session -s refactor/auth-system -d
tmux send-keys -t refactor/auth-system 'claude' C-m
# Detach and monitor progress in the dashboard
# Agent keeps running even if you close the terminal
```

### Team/Project Organization
```bash
# Organize by team and project
tmux new-session -s frontend/dashboard/components
tmux new-session -s frontend/dashboard/api-integration
tmux new-session -s backend/api/authentication
tmux new-session -s backend/api/data-layer
# All agents appear organized in the dashboard hierarchy
```

## Troubleshooting

### Agent not appearing in dashboard
- Wait up to 10 seconds (auto-refresh interval)
- Manually refresh the browser
- Check session exists: `tmux list-sessions`

### Can't connect to agent
- Verify agent name: `tmux list-sessions`
- Check Claude is running: `tmux attach -t agent-name` (then detach with Ctrl-b d)
- Check dashboard is running: http://localhost:3000

### Lost agents after reboot
tmux sessions don't persist across system restarts. You'll need to recreate your agents.

## Best Practices

1. **Use descriptive hierarchical names** - Makes it easy to find agents later
2. **Start Claude immediately** - Send the `claude` command right after agent creation
3. **Add notes in dashboard** - Document what each agent is working on
4. **Clean up old agents** - Delete finished agents: `tmux kill-session -t agent-name`
5. **Use consistent naming** - Establish a naming convention for your projects

## Example: Complete Setup

```bash
# Create a full project structure
tmux new-session -s myapp/frontend/components -d
tmux send-keys -t myapp/frontend/components 'cd ~/projects/myapp/frontend && claude' C-m

tmux new-session -s myapp/frontend/styling -d
tmux send-keys -t myapp/frontend/styling 'cd ~/projects/myapp/frontend && claude' C-m

tmux new-session -s myapp/backend/api -d
tmux send-keys -t myapp/backend/api 'cd ~/projects/myapp/backend && claude' C-m

tmux new-session -s myapp/backend/database -d
tmux send-keys -t myapp/backend/database 'cd ~/projects/myapp/backend && claude' C-m

# Now open http://localhost:3000
# All agents appear organized under "myapp" category
```
