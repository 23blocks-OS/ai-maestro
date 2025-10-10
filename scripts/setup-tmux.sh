#!/bin/bash

# AI Maestro - tmux Configuration Setup
# This script configures tmux for optimal use with Claude Code and other AI agents

set -e

TMUX_CONF="$HOME/.tmux.conf"
BACKUP_CONF="$HOME/.tmux.conf.backup.$(date +%Y%m%d_%H%M%S)"

echo "🎼 AI Maestro - tmux Configuration Setup"
echo ""

# Backup existing config if it exists
if [ -f "$TMUX_CONF" ]; then
    echo "📋 Backing up existing tmux configuration to:"
    echo "   $BACKUP_CONF"
    cp "$TMUX_CONF" "$BACKUP_CONF"
fi

# Check if our settings already exist
if grep -q "# AI Maestro Configuration" "$TMUX_CONF" 2>/dev/null; then
    echo "✅ AI Maestro configuration already exists in .tmux.conf"
    echo ""
    echo "To reconfigure, remove the '# AI Maestro Configuration' section and run this script again."
    exit 0
fi

echo "⚙️  Adding AI Maestro configuration to $TMUX_CONF..."
echo ""

# Add our configuration
cat >> "$TMUX_CONF" << 'EOF'

# ============================================
# AI Maestro Configuration
# ============================================
# These settings optimize tmux for use with AI coding agents
# like Claude Code, Aider, Cursor, etc.

# Enable mouse support - allows scrolling with mouse wheel
# even when in alternate screen mode (vim, Claude Code, etc.)
set -g mouse on

# Increase scrollback buffer to 50,000 lines
# Default is 2,000 which is too small for long AI conversations
set -g history-limit 50000

# Improve colors for better terminal display
set -g default-terminal "screen-256color"

# Optional: Enable clipboard integration (macOS)
# Uncomment if you want copy/paste to work with system clipboard
# set -g set-clipboard on

# Optional: Easier prefix key (Ctrl-a instead of Ctrl-b)
# Uncomment to use Ctrl-a as prefix (more comfortable for some)
# unbind C-b
# set -g prefix C-a
# bind C-a send-prefix

# ============================================
# End AI Maestro Configuration
# ============================================

EOF

echo "✅ Configuration added successfully!"
echo ""
echo "📝 Settings applied:"
echo "   • Mouse mode: enabled (scroll with mouse wheel)"
echo "   • History limit: 50,000 lines (was 2,000)"
echo "   • Colors: 256-color support"
echo ""
echo "🔄 To apply changes:"
echo "   1. Restart tmux: exit all sessions and start tmux again"
echo "   2. OR reload config in running sessions: tmux source-file ~/.tmux.conf"
echo ""
echo "💡 How to scroll in Claude Code sessions:"
echo "   • Mouse wheel: Just scroll (mouse mode is now enabled)"
echo "   • Keyboard: Ctrl-b [ then arrow keys (press q to exit)"
echo "   • Shift+scroll: Also works in most terminals"
echo ""
echo "🎉 Setup complete! Restart tmux or reload the config."
