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

# Step 2: Update tmux global environment (if tmux server is running)
if tmux info &>/dev/null; then
    echo "[AI Maestro] Updating tmux SSH environment..."
    tmux setenv -g SSH_AUTH_SOCK ~/.ssh/ssh_auth_sock
    echo "[AI Maestro] ✓ Tmux SSH_AUTH_SOCK updated"
else
    echo "[AI Maestro] ℹ Tmux server not running (will use correct config when started)"
fi

# Step 3: Start the actual server
echo "[AI Maestro] Starting server..."
exec node server.mjs
