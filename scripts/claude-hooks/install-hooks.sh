#!/bin/bash
# Install AI Maestro Agent Hooks
#
# This script installs hooks for all detected AI coding agents:
#   - Claude Code  (~/.claude/settings.json)
#   - Codex CLI    (~/.codex/hooks.json + config.toml)
#   - Gemini CLI   (~/.gemini/settings.json)
#
# Usage: ./install-hooks.sh [-y]
#
# The same hook script (ai-maestro-hook.cjs) is used for all agents.
# It auto-detects which agent is calling it and returns the correct response format.

set -e

NON_INTERACTIVE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -y|--yes|--non-interactive) NON_INTERACTIVE=true; shift ;;
        *) shift ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_SCRIPT="$SCRIPT_DIR/ai-maestro-hook.cjs"
STATE_DIR="$HOME/.aimaestro/chat-state"
INSTALLED_COUNT=0

echo "Installing AI Maestro Agent Hooks..."
echo ""

# Make hook script executable
chmod +x "$HOOK_SCRIPT"

# Create state directory
mkdir -p "$STATE_DIR"

# --- Helper: merge hooks into a JSON settings file ---
# Usage: merge_hooks_into_settings <settings_file> <hooks_json>
merge_hooks_into_settings() {
    local SETTINGS_FILE="$1"
    local HOOKS_JSON="$2"

    local EXISTING_SETTINGS='{}'
    if [ -f "$SETTINGS_FILE" ]; then
        EXISTING_SETTINGS=$(cat "$SETTINGS_FILE")
    fi

    local MERGED_SETTINGS
    MERGED_SETTINGS=$(node -e "
const existing = JSON.parse(process.argv[1]);
const hooks = JSON.parse(process.argv[2]);

if (!existing.hooks) {
    existing.hooks = {};
}

for (const [event, configs] of Object.entries(hooks.hooks)) {
    if (!existing.hooks[event]) {
        existing.hooks[event] = [];
    }

    const hasOurHook = existing.hooks[event].some(cfg =>
        cfg.hooks?.some(h => h.command?.includes('ai-maestro-hook'))
    );

    if (!hasOurHook) {
        existing.hooks[event].push(...configs);
    }
}

console.log(JSON.stringify(existing, null, 2));
" "$EXISTING_SETTINGS" "$HOOKS_JSON")

    # Write atomically
    local TEMP_SETTINGS
    TEMP_SETTINGS=$(mktemp "${SETTINGS_FILE}.XXXXXX")
    echo "$MERGED_SETTINGS" > "$TEMP_SETTINGS"
    if node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$TEMP_SETTINGS" 2>/dev/null; then
        mv "$TEMP_SETTINGS" "$SETTINGS_FILE"
    else
        rm -f "$TEMP_SETTINGS"
        echo "  ERROR: Merged settings JSON is invalid, keeping original"
        return 1
    fi
}

# ============================================================
# Claude Code
# ============================================================
install_claude_hooks() {
    local SETTINGS_DIR="$HOME/.claude"
    local SETTINGS_FILE="$SETTINGS_DIR/settings.json"

    mkdir -p "$SETTINGS_DIR"

    local HOOKS_CONFIG
    HOOKS_CONFIG=$(cat << HOOKEOF
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
HOOKEOF
)

    if merge_hooks_into_settings "$SETTINGS_FILE" "$HOOKS_CONFIG"; then
        echo "  Claude Code: $SETTINGS_FILE"
        INSTALLED_COUNT=$((INSTALLED_COUNT + 1))
    fi
}

# ============================================================
# Codex CLI
# ============================================================
install_codex_hooks() {
    local SETTINGS_DIR="$HOME/.codex"
    local HOOKS_FILE="$SETTINGS_DIR/hooks.json"
    local CONFIG_FILE="$SETTINGS_DIR/config.toml"

    mkdir -p "$SETTINGS_DIR"

    # Codex uses hooks.json (same format as Claude but different event set)
    local HOOKS_CONFIG
    HOOKS_CONFIG=$(cat << HOOKEOF
{
  "hooks": {
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
HOOKEOF
)

    if merge_hooks_into_settings "$HOOKS_FILE" "$HOOKS_CONFIG"; then
        echo "  Codex CLI:   $HOOKS_FILE"
        INSTALLED_COUNT=$((INSTALLED_COUNT + 1))
    fi

    # Enable hooks feature in config.toml if not already set
    if [ -f "$CONFIG_FILE" ]; then
        if ! grep -q 'codex_hooks' "$CONFIG_FILE" 2>/dev/null; then
            echo "" >> "$CONFIG_FILE"
            echo "[features]" >> "$CONFIG_FILE"
            echo "codex_hooks = true" >> "$CONFIG_FILE"
            echo "  Codex CLI:   enabled codex_hooks in $CONFIG_FILE"
        fi
    else
        cat > "$CONFIG_FILE" << TOMLEOF
[features]
codex_hooks = true
TOMLEOF
        echo "  Codex CLI:   created $CONFIG_FILE with codex_hooks enabled"
    fi
}

# ============================================================
# Gemini CLI
# ============================================================
install_gemini_hooks() {
    local SETTINGS_DIR="$HOME/.gemini"
    local SETTINGS_FILE="$SETTINGS_DIR/settings.json"

    mkdir -p "$SETTINGS_DIR"

    # Gemini uses AfterAgent (equivalent to Stop) and Notification
    local HOOKS_CONFIG
    HOOKS_CONFIG=$(cat << HOOKEOF
{
  "hooks": {
    "AfterAgent": [
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
    "Notification": [
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
HOOKEOF
)

    if merge_hooks_into_settings "$SETTINGS_FILE" "$HOOKS_CONFIG"; then
        echo "  Gemini CLI:  $SETTINGS_FILE"
        INSTALLED_COUNT=$((INSTALLED_COUNT + 1))
    fi
}

# ============================================================
# Detect and install
# ============================================================

# Always install Claude Code (it's the primary agent)
echo "Claude Code:"
install_claude_hooks

# Detect and install Codex CLI
if command -v codex &>/dev/null || [ -d "$HOME/.codex" ]; then
    echo ""
    echo "Codex CLI (detected):"
    install_codex_hooks
fi

# Detect and install Gemini CLI
if command -v gemini &>/dev/null || [ -d "$HOME/.gemini" ]; then
    echo ""
    echo "Gemini CLI (detected):"
    install_gemini_hooks
fi

echo ""
echo "Hooks installed for $INSTALLED_COUNT agent(s)."
echo ""
echo "Configuration:"
echo "  Hook script:    $HOOK_SCRIPT"
echo "  State directory: $STATE_DIR"
echo ""
echo "Agents will now receive AMP inbox notifications between turns"
echo "and the Chat interface will show agent status."
echo ""
echo "Note: Existing agent sessions need to be restarted for"
echo "the hooks to take effect."
