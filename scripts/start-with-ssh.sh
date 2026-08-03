#!/bin/bash

# AI Maestro - Startup script with SSH configuration
# This script ensures SSH agent works in tmux sessions before starting the server

echo "[AI Maestro] Starting up..."

# Step 1: Update SSH agent symlink if needed
if [ -S "$SSH_AUTH_SOCK" ] && [ ! -h "$SSH_AUTH_SOCK" ]; then
    echo "[AI Maestro] Creating SSH agent symlink..."
    mkdir -p ~/.ssh
    ln -sf "$SSH_AUTH_SOCK" ~/.ssh/ssh_auth_sock
    echo "[AI Maestro] ✓ SSH symlink created: ~/.ssh/ssh_auth_sock"
else
    echo "[AI Maestro] ✓ SSH symlink already exists"
fi

# Step 2: Pre-flight tmux check
if ! command -v tmux &>/dev/null; then
    echo "[AI Maestro] ✗ WARNING: tmux is not installed — agents will not be able to run"
    echo "[AI Maestro]   Install with: brew install tmux"
fi

# Step 3: Update tmux global environment (if tmux server is running)
if tmux info &>/dev/null; then
    echo "[AI Maestro] Updating tmux SSH environment..."
    tmux setenv -g SSH_AUTH_SOCK ~/.ssh/ssh_auth_sock
    echo "[AI Maestro] ✓ Tmux SSH_AUTH_SOCK updated"
else
    echo "[AI Maestro] ℹ Tmux server not running (will use correct config when started)"
fi

# Step 3b: Ensure Node >= 18 (the claude-agent-sdk crash-loops on older node).
# No-op where the ambient node is already >= 18; only reaches for nvm if it's too old.
NODE_MAJOR=$(node -v 2>/dev/null | sed 's/v\([0-9]*\).*/\1/')
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 18 ] 2>/dev/null; then
    if [ -s "$HOME/.nvm/nvm.sh" ]; then
        echo "[AI Maestro] Node $(node -v 2>/dev/null || echo missing) too old — switching to nvm default/LTS"
        . "$HOME/.nvm/nvm.sh"
        nvm use default >/dev/null 2>&1 || nvm use --lts >/dev/null 2>&1 || nvm use node >/dev/null 2>&1
    fi
fi
echo "[AI Maestro] Node: $(node -v 2>/dev/null || echo missing)"

# Step 4: Start the actual server
echo "[AI Maestro] Starting server..."
exec ./node_modules/.bin/tsx server.mjs
