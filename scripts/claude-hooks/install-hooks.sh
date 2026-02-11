#!/bin/bash
# Install AI Maestro Claude Code Hooks
#
# This script installs hooks that enable the Chat interface to see
# when Claude is waiting for input and other session events.
#
# Usage: ./install-hooks.sh
#
# The hooks are installed to ~/.claude/settings.json (user-level settings)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_SCRIPT="$SCRIPT_DIR/ai-maestro-hook.cjs"
CLAUDE_SETTINGS_DIR="$HOME/.claude"
CLAUDE_SETTINGS_FILE="$CLAUDE_SETTINGS_DIR/settings.json"
STATE_DIR="$HOME/.aimaestro/chat-state"

echo "Installing AI Maestro Claude Code Hooks..."

# Make hook script executable
chmod +x "$HOOK_SCRIPT"

# Create state directory
mkdir -p "$STATE_DIR"

# Create Claude settings directory if needed
mkdir -p "$CLAUDE_SETTINGS_DIR"

# Read existing settings or create empty object
if [ -f "$CLAUDE_SETTINGS_FILE" ]; then
    EXISTING_SETTINGS=$(cat "$CLAUDE_SETTINGS_FILE")
else
    EXISTING_SETTINGS='{}'
fi

# Create the hooks configuration
HOOKS_CONFIG=$(cat << EOF
{
  "hooks": {
    "Notification": [
      {
        "matcher": "idle_prompt|permission_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "node $HOOK_SCRIPT",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node $HOOK_SCRIPT",
            "timeout": 5
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node $HOOK_SCRIPT",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
EOF
)

# Merge hooks into existing settings using Node.js (safe: uses JSON.parse, not eval)
MERGED_SETTINGS=$(node -e "
const existing = JSON.parse(process.argv[1]);
const hooks = JSON.parse(process.argv[2]);

// Merge hooks - add our hooks without removing existing ones
if (!existing.hooks) {
    existing.hooks = {};
}

for (const [event, configs] of Object.entries(hooks.hooks)) {
    if (!existing.hooks[event]) {
        existing.hooks[event] = [];
    }

    // Check if our hook already exists
    const hasOurHook = existing.hooks[event].some(cfg =>
        cfg.hooks?.some(h => h.command?.includes('ai-maestro-hook'))
    );

    if (!hasOurHook) {
        existing.hooks[event].push(...configs);
    }
}

console.log(JSON.stringify(existing, null, 2));
" "$EXISTING_SETTINGS" "$HOOKS_CONFIG")

# Write merged settings
echo "$MERGED_SETTINGS" > "$CLAUDE_SETTINGS_FILE"

echo ""
echo "Hooks installed successfully!"
echo ""
echo "Configuration:"
echo "  Hook script: $HOOK_SCRIPT"
echo "  Settings file: $CLAUDE_SETTINGS_FILE"
echo "  State directory: $STATE_DIR"
echo ""
echo "The Chat interface will now show when Claude is waiting for input."
echo ""
echo "Note: Existing Claude Code sessions need to be restarted for"
echo "the hooks to take effect."
