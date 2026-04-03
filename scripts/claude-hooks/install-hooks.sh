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

# Parse arguments
FORCE=false
while [[ $# -gt 0 ]]; do
    case $1 in
        -y|--yes|--non-interactive) shift ;;
        --force) FORCE=true; shift ;;
        *) shift ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Use the comprehensive 8-state hook from parent scripts/ directory
HOOK_SCRIPT="$(cd "$SCRIPT_DIR/.." && pwd)/ai-maestro-hook.cjs"
# Escape for JSON embedding (backslash-escape quotes and backslashes)
HOOK_SCRIPT_JSON=$(printf '%s' "$HOOK_SCRIPT" | sed 's/\\/\\\\/g; s/"/\\"/g')
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

# Create the hooks configuration — all events AI Maestro monitors for the 8-state model
HOOKS_CONFIG=$(cat << EOF
{
  "hooks": {
    "Notification": [
      {
        "matcher": "idle_prompt|permission_prompt|elicitation_dialog",
        "hooks": [
          {
            "type": "command",
            "command": "node $HOOK_SCRIPT_JSON",
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
            "command": "node $HOOK_SCRIPT_JSON",
            "timeout": 5
          }
        ]
      }
    ],
    "StopFailure": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node $HOOK_SCRIPT_JSON",
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
            "command": "node $HOOK_SCRIPT_JSON",
            "timeout": 5
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node $HOOK_SCRIPT_JSON",
            "timeout": 5
          }
        ]
      }
    ],
    "SubagentStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node $HOOK_SCRIPT_JSON",
            "timeout": 5
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node $HOOK_SCRIPT_JSON",
            "timeout": 5
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node $HOOK_SCRIPT_JSON",
            "timeout": 5
          }
        ]
      }
    ],
    "PostCompact": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node $HOOK_SCRIPT_JSON",
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

const force = process.argv[3] === 'true';
const conflicts = [];

for (const [event, configs] of Object.entries(hooks.hooks)) {
    if (!existing.hooks[event]) {
        existing.hooks[event] = [];
    }

    for (const newCfg of configs) {
        const newMatcher = newCfg.matcher || '';
        const newCmd = newCfg.hooks?.[0]?.command || '';

        // Find entry with same matcher AND command containing ai-maestro-hook
        const idx = existing.hooks[event].findIndex(cfg => {
            const m = cfg.matcher || '';
            const c = cfg.hooks?.[0]?.command || '';
            return m === newMatcher && c.includes('ai-maestro-hook');
        });

        if (idx !== -1) {
            // Exact duplicate (same event + same matcher + our hook command)
            if (force) {
                existing.hooks[event][idx] = newCfg;
            } else {
                conflicts.push(event + (newMatcher ? ':' + newMatcher : ''));
            }
        } else {
            // New entry (different event, different matcher, or not our hook)
            existing.hooks[event].push(newCfg);
        }
    }
}

if (conflicts.length > 0) {
    process.stderr.write('ERROR: ai-maestro hooks already exist for: ' + conflicts.join(', ') + '\\n');
    process.stderr.write('Use --force to overwrite existing hooks.\\n');
    process.exit(1);
}

console.log(JSON.stringify(existing, null, 2));
" "$EXISTING_SETTINGS" "$HOOKS_CONFIG" "$FORCE")

# Write merged settings atomically: write to temp file, validate JSON, then move
TEMP_SETTINGS=$(mktemp "${CLAUDE_SETTINGS_FILE}.XXXXXX")
trap 'rm -f "$TEMP_SETTINGS"' EXIT INT TERM
echo "$MERGED_SETTINGS" > "$TEMP_SETTINGS"
# Validate JSON before replacing (uses process.argv to avoid shell injection)
if node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$TEMP_SETTINGS" 2>/dev/null; then
    mv "$TEMP_SETTINGS" "$CLAUDE_SETTINGS_FILE"
else
    rm -f "$TEMP_SETTINGS"
    echo "ERROR: Merged settings JSON is invalid, keeping original"
    exit 1
fi

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
