# Creating External tmux Sessions for AI Maestro

This guide explains how to create tmux sessions outside the dashboard that will automatically appear in the AI Maestro web interface.

## Quick Start

Create a new tmux session with Claude Code running:

```bash
# Create a detached session
tmux new-session -s my-session-name -d
tmux send-keys -t my-session-name 'claude' C-m

# Or create an interactive session
tmux new-session -s my-session-name
# Then manually run: claude
```

The dashboard will auto-discover this session within ~10 seconds.

## Hierarchical Organization

Use forward slashes in session names to create organized hierarchies in the dashboard:

```bash
# Creates: Category "project" → Subcategory "backend" → Session "api"
tmux new-session -s project/backend/api -d
tmux send-keys -t project/backend/api 'claude' C-m

# Creates: Category "fluidmind" → Subcategory "agents" → Session "backend-architect"
tmux new-session -s fluidmind/agents/backend-architect -d
tmux send-keys -t fluidmind/agents/backend-architect 'claude' C-m

# Single level (no hierarchy)
tmux new-session -s quick-test -d
tmux send-keys -t quick-test 'claude' C-m
```

## Benefits of External Session Creation

### Full Claude Code CLI Features
When creating sessions in a regular terminal, you get:
- **File upload/download support** - Send files to Claude, receive generated files
- **Full keyboard shortcuts** - All native terminal shortcuts work
- **Better copy/paste** - Native terminal clipboard integration
- **Stable connection** - Not dependent on browser tab staying open

### Dashboard Monitoring
Once the session appears in the dashboard, you can:
- **Monitor multiple sessions** - See all sessions at a glance
- **Quick switching** - Click to jump between different Claude sessions
- **Session notes** - Add notes to track what each session is working on
- **Hierarchical organization** - Group related sessions by project/category

## Recommended Workflow

1. **Create session in terminal** for full CLI features:
   ```bash
   tmux new-session -s myproject/feature/implementation
   claude
   # Use Claude Code with full features (file uploads, etc.)
   ```

2. **Monitor in dashboard**:
   - Open AI Maestro in browser (http://localhost:3000)
   - Session appears under "myproject" → "feature" → "implementation"
   - Add notes about current task
   - Switch to other sessions as needed

3. **Detach and reattach**:
   ```bash
   # In tmux session, press: Ctrl-b d (detach)
   # Later, reattach from terminal:
   tmux attach-session -t myproject/feature/implementation
   # Or click the session in the dashboard
   ```

## Session Naming Rules

tmux session names must follow these rules:
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
# Create session for file-heavy work
tmux new-session -s analysis/data-processing
claude
# Now you can upload CSV files, images, etc. directly in the terminal
```

### Long-Running Tasks
```bash
# Start a session for a complex refactoring
tmux new-session -s refactor/auth-system -d
tmux send-keys -t refactor/auth-system 'claude' C-m
# Detach and monitor progress in the dashboard
# Session keeps running even if you close the terminal
```

### Team/Project Organization
```bash
# Organize by team and project
tmux new-session -s frontend/dashboard/components
tmux new-session -s frontend/dashboard/api-integration
tmux new-session -s backend/api/authentication
tmux new-session -s backend/api/data-layer
# All sessions appear organized in the dashboard hierarchy
```

## Troubleshooting

### Session not appearing in dashboard
- Wait up to 10 seconds (auto-refresh interval)
- Manually refresh the browser
- Check session exists: `tmux list-sessions`

### Can't connect to session
- Verify session name: `tmux list-sessions`
- Check Claude is running: `tmux attach -t session-name` (then detach with Ctrl-b d)
- Check dashboard is running: http://localhost:3000

### Lost session after reboot
tmux sessions don't persist across system restarts. You'll need to recreate them.

## Best Practices

1. **Use descriptive hierarchical names** - Makes it easy to find sessions later
2. **Start Claude immediately** - Send the `claude` command right after session creation
3. **Add notes in dashboard** - Document what each session is working on
4. **Clean up old sessions** - Delete finished sessions: `tmux kill-session -t session-name`
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
# All sessions appear organized under "myapp" category
```
