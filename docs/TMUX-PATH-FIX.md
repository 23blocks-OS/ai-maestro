# tmux PATH Configuration Fix

## The Problem

Scripts in `~/.local/bin/` were not accessible in tmux sessions, even after adding the directory to PATH in `~/.zshrc`.

## Root Cause

**tmux environment isolation** - tmux has a critical behavior that causes PATH issues:

1. **tmux captures environment at server start**: When the tmux server first starts, it captures ALL environment variables (including PATH) and **freezes** them in the server's global environment.

2. **New sessions inherit frozen environment**: When you create new tmux sessions, they inherit the PATH that existed when the tmux **server** started, NOT the current PATH from your shell config files.

3. **Shell config changes don't propagate**: Adding `export PATH="$HOME/.local/bin:$PATH"` to `.zshrc` only affects interactive shells. Since tmux server was already running with the old PATH, new sessions never see the change.

4. **Source ~/.zshrc doesn't help**: Even running `source ~/.zshrc` inside a tmux session only affects that specific shell instance, not the tmux server's global environment or other sessions.

## The Solution

The fix is to use **`.zshenv`** instead of (or in addition to) `.zshrc` for PATH configuration.

### Why .zshenv?

Zsh loads configuration files in this order:

1. **`.zshenv`** - Loaded by ALL zsh shells (interactive, non-interactive, login, tmux)
2. `.zprofile` - Loaded by login shells only
3. `.zshrc` - Loaded by interactive shells only
4. `.zlogin` - Loaded by login shells after .zshrc

**Critical difference for tmux:**
- tmux server spawns non-interactive shells when capturing environment
- Non-interactive shells read `.zshenv` but NOT `.zshrc`
- Therefore, PATH set in `.zshenv` is captured by tmux, but PATH in `.zshrc` is ignored

## Implementation

### 1. Created ~/.zshenv

```bash
# ============================================
# .zshenv - Environment variables for ALL shells
# ============================================
# This file is sourced BEFORE .zshrc and by ALL zsh shells
# (interactive, non-interactive, login, and tmux sessions)
#
# CRITICAL for tmux: tmux captures environment at server start
# PATH set here is available in all tmux sessions automatically

# Add ~/.local/bin to PATH for AI Maestro scripts
export PATH="$HOME/.local/bin:$PATH"
```

### 2. Updated ~/.zshrc (line 174)

Kept the PATH export in `.zshrc` for consistency, but added a note:

```bash
# ============================================
# Custom bin directory - AI Maestro scripts
# ============================================
# Add ~/.local/bin to PATH for custom scripts (must be last to avoid being overridden)
export PATH="$HOME/.local/bin:$PATH"
```

**Note**: The `.zshrc` PATH setting is now redundant (since `.zshenv` runs first), but we keep it for clarity and as a fallback.

### 3. Updated ~/.tmux.conf

Added documentation explaining the issue and solution:

```bash
# ============================================
# PATH Configuration for AI Maestro Scripts
# ============================================
# CRITICAL: Ensure ~/.local/bin is in PATH for all tmux sessions
# This fixes the issue where shell config PATH changes aren't picked up by tmux
#
# EXPLANATION:
# tmux has a quirk: it removes PATH from the default-command to prevent
# shell initialization issues. The solution is to ensure the shell's
# .zshenv sets PATH correctly (which it now does).
#
# For EXISTING sessions, you need to restart the tmux server:
#   tmux kill-server  (WARNING: kills all sessions)
#   tmux              (start fresh)
#
# For NEW sessions after restart, PATH will be correct automatically.
```

## How to Apply the Fix

### Option 1: Restart tmux server (recommended)

This ensures all sessions get the new PATH:

```bash
# WARNING: This will kill ALL tmux sessions
tmux kill-server

# Start a new session
tmux new-session -s my-session
```

### Option 2: Use the helper script

```bash
~/.local/bin/restart-tmux-with-new-path.sh
```

This script:
- Shows current sessions before killing them
- Asks for confirmation
- Safely restarts the tmux server
- Provides instructions for starting new sessions

### Option 3: Manual verification (for existing sessions)

If you can't restart tmux right now, verify the fix will work:

```bash
# Test in a new zsh shell (outside tmux)
zsh -c 'echo $PATH' | grep '.local/bin'
# Should output: /Users/juanpelaez/.local/bin

# Test script discovery
zsh -c 'which amp-send'
# Should output: /Users/juanpelaez/.local/bin/amp-send
```

Then restart tmux when convenient.

## Verification After Restart

After restarting tmux, verify the fix:

```bash
# Start a new tmux session
tmux new-session -s test

# Inside the session, check PATH
echo $PATH | grep '.local/bin'
# Should show /Users/juanpelaez/.local/bin at the beginning

# Test script discovery
which amp-send
# Should output: /Users/juanpelaez/.local/bin/amp-send

# Test running the script
amp-send --help
# Should show the script's help text
```

## Why Our Previous Attempts Failed

1. **Added PATH to end of .zshrc**: tmux doesn't read `.zshrc` when capturing environment
2. **Used `source ~/.zshrc` in session**: Only affects that shell instance, not tmux server
3. **Tried `tmux set-environment -g PATH`**: tmux specifically prevents setting PATH in global environment to avoid breaking shell initialization

## Technical Details

### tmux Environment Variable Handling

tmux has two environment stores:

1. **Global environment** (`tmux set-environment -g`):
   - Captured when tmux server starts
   - Inherited by all new sessions
   - Cannot directly set PATH (tmux blocks it)

2. **Session environment** (`tmux set-environment`):
   - Per-session variables
   - Can override global environment
   - Lost when session ends

### update-environment Option

The `update-environment` option in `.tmux.conf` controls which variables get updated from the parent environment:

```bash
set-option -g update-environment "DISPLAY SSH_ASKPASS SSH_AGENT_PID SSH_CONNECTION WINDOWID XAUTHORITY"
```

**Note**: PATH is intentionally NOT in this list by default, because tmux wants shells to manage their own PATH.

## Best Practices

For tmux-compatible environment setup:

1. **Put critical PATH components in .zshenv**: Ensures they're available in tmux
2. **Put interactive-only config in .zshrc**: Aliases, functions, prompt customization
3. **Put login-only config in .zprofile**: One-time setup like SSH agent

## Related Files

- **`~/.zshenv`** - Created to fix the issue
- **`~/.zshrc`** - Line 174 has PATH export (now redundant but kept for clarity)
- **`~/.tmux.conf`** - Updated with documentation
- **`~/.local/bin/restart-tmux-with-new-path.sh`** - Helper script for safe restart
- **`~/.local/bin/amp-send`** - The script that wasn't being found

## References

- [tmux man page - GLOBAL AND SESSION ENVIRONMENT](https://man.openbsd.org/tmux.1#GLOBAL_AND_SESSION_ENVIRONMENT)
- [Zsh startup files](https://zsh.sourceforge.io/Intro/intro_3.html)
- [tmux environment variables](https://unix.stackexchange.com/questions/75681/why-are-environment-variables-not-propagating-to-tmux)

## Summary

**Problem**: tmux sessions don't inherit PATH from `.zshrc`

**Root Cause**: tmux captures environment before `.zshrc` runs

**Solution**: Move PATH export to `.zshenv` which runs for all shells

**Action Required**: Restart tmux server once to apply the fix

**Result**: All future tmux sessions will have `~/.local/bin` in PATH automatically
