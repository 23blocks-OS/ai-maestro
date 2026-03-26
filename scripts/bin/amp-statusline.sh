#!/bin/bash
# =============================================================================
# AMP Status Line for Claude Code
# =============================================================================
#
# Displays your AMP agent identity and unread message count in the
# Claude Code status bar (the line at the bottom of the terminal).
#
# Usage:
#   amp-statusline.sh --install     # Install into Claude Code settings
#   amp-statusline.sh --uninstall   # Remove from Claude Code settings
#   amp-statusline.sh --test        # Test output with current agent
#   amp-statusline.sh               # Called by Claude Code (reads JSON from stdin)
#
# Agent resolution order:
#   1. AMP_AGENT_ID env var (explicit UUID)
#   2. CLAUDE_AGENT_NAME env var (AI Maestro sets this)
#   3. tmux session name
#   4. Working directory → AI Maestro API lookup
#   5. Working directory → walk up to .claude/settings.local.json for
#      CLAUDE_AGENT_NAME hint
#
# =============================================================================

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
SETTINGS_FILE="${HOME}/.claude/settings.json"

# --- Install / Uninstall / Test ---
case "${1:-}" in
    --install)
        if [ ! -f "$SETTINGS_FILE" ]; then
            echo '{}' > "$SETTINGS_FILE"
        fi

        # Check if statusLine already exists
        EXISTING=$(jq -r '.statusLine.command // empty' "$SETTINGS_FILE" 2>/dev/null)
        if [ -n "$EXISTING" ]; then
            echo "Status line already configured: $EXISTING"
            echo ""
            read -r -p "Replace with AMP status line? [y/N] " CONFIRM
            [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ] && exit 0
        fi

        jq --arg cmd "$SCRIPT_PATH" '.statusLine = { type: "command", command: $cmd }' \
            "$SETTINGS_FILE" > "${SETTINGS_FILE}.tmp" && mv "${SETTINGS_FILE}.tmp" "$SETTINGS_FILE"

        echo "AMP status line installed."
        echo ""
        echo "  Script:   $SCRIPT_PATH"
        echo "  Settings: $SETTINGS_FILE"
        echo ""
        echo "Restart Claude Code to see it. The status bar will show:"
        echo "  your-agent@tenant.provider | N unread"
        echo "  Model | ctx N% | \$cost"
        exit 0
        ;;

    --uninstall)
        if [ ! -f "$SETTINGS_FILE" ]; then
            echo "No settings file found."
            exit 0
        fi
        jq 'del(.statusLine)' "$SETTINGS_FILE" > "${SETTINGS_FILE}.tmp" \
            && mv "${SETTINGS_FILE}.tmp" "$SETTINGS_FILE"
        echo "AMP status line removed. Restart Claude Code."
        exit 0
        ;;

    --test)
        echo '{"model":{"display_name":"Test"},"context_window":{"used_percentage":25},"cost":{"total_cost_usd":0},"workspace":{"current_dir":"'"$PWD"'"}}' \
            | "$SCRIPT_PATH"
        exit 0
        ;;

    --help|-h)
        echo "Usage: amp-statusline.sh [--install | --uninstall | --test]"
        echo ""
        echo "AMP status line for Claude Code."
        echo ""
        echo "Options:"
        echo "  --install    Add AMP status line to Claude Code settings"
        echo "  --uninstall  Remove AMP status line from Claude Code settings"
        echo "  --test       Test output using current working directory"
        echo "  --help       Show this help"
        echo ""
        echo "When called with no arguments, reads Claude Code session JSON"
        echo "from stdin and outputs the status line (called automatically"
        echo "by Claude Code)."
        exit 0
        ;;
esac

# =============================================================================
# Status line output (called by Claude Code via stdin JSON)
# =============================================================================

input=$(cat)

# Extract Claude Code session data
MODEL=$(echo "$input" | jq -r '.model.display_name // "?"')
PCT=$(echo "$input" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)
COST=$(echo "$input" | jq -r '.cost.total_cost_usd // 0')
CWD=$(echo "$input" | jq -r '.workspace.current_dir // empty')

# --- Resolve AMP agent ---
AGENTS_BASE="${HOME}/.agent-messaging/agents"
INDEX_FILE="${AGENTS_BASE}/.index.json"

AGENT_UUID=""
AGENT_NAME=""
AGENT_ADDRESS=""
UNREAD=0

# Priority 1: Explicit agent ID
if [ -n "${AMP_AGENT_ID:-}" ]; then
    AGENT_UUID="$AMP_AGENT_ID"

# Priority 2: Agent name from env
elif [ -n "${CLAUDE_AGENT_NAME:-}" ]; then
    AGENT_NAME="$CLAUDE_AGENT_NAME"

# Priority 3: tmux session name
elif [ -n "${TMUX:-}" ]; then
    AGENT_NAME=$(tmux display-message -p '#S' 2>/dev/null)

# Priority 4: Working directory → AI Maestro API
elif [ -n "$CWD" ]; then
    MAESTRO_AGENT=$(curl -s --connect-timeout 1 "${AMP_MAESTRO_URL:-http://localhost:23000}/api/agents" 2>/dev/null | \
        jq -r --arg cwd "$CWD" '
            .agents[] |
            select((.workingDirectory // .session.workingDirectory // "") as $wd |
                $wd != "" and ($cwd == $wd or ($cwd | startswith($wd + "/"))))
            | .name' 2>/dev/null | head -1)
    [ -n "$MAESTRO_AGENT" ] && AGENT_NAME="$MAESTRO_AGENT"
fi

# Priority 5: Walk up directories for .claude/settings.local.json hint
if [ -z "$AGENT_UUID" ] && [ -z "$AGENT_NAME" ] && [ -n "$CWD" ]; then
    _dir="$CWD"
    while [ "$_dir" != "/" ] && [ "$_dir" != "$HOME" ]; do
        _settings="${_dir}/.claude/settings.local.json"
        if [ -f "$_settings" ]; then
            _hint=$(grep -o 'CLAUDE_AGENT_NAME=[a-zA-Z0-9_-]*' "$_settings" 2>/dev/null | head -1 | cut -d= -f2)
            if [ -n "$_hint" ]; then
                AGENT_NAME="$_hint"
                break
            fi
        fi
        _dir=$(dirname "$_dir")
    done
fi

# Resolve name → UUID via index
if [ -z "$AGENT_UUID" ] && [ -n "$AGENT_NAME" ] && [ -f "$INDEX_FILE" ]; then
    AGENT_UUID=$(jq -r --arg n "$AGENT_NAME" '.[$n] // empty' "$INDEX_FILE" 2>/dev/null)
    # Case-insensitive fallback
    if [ -z "$AGENT_UUID" ]; then
        _lower=$(echo "$AGENT_NAME" | tr '[:upper:]' '[:lower:]')
        AGENT_UUID=$(jq -r --arg n "$_lower" \
            'to_entries[] | select(.key | ascii_downcase == $n) | .value' \
            "$INDEX_FILE" 2>/dev/null | head -1)
    fi
fi

# Read identity and count unread
if [ -n "$AGENT_UUID" ]; then
    CONFIG_FILE="${AGENTS_BASE}/${AGENT_UUID}/config.json"
    if [ -f "$CONFIG_FILE" ]; then
        AGENT_ADDRESS=$(jq -r '.agent.address // empty' "$CONFIG_FILE" 2>/dev/null)
    fi

    INBOX_DIR="${AGENTS_BASE}/${AGENT_UUID}/messages/inbox"
    if [ -d "$INBOX_DIR" ]; then
        while IFS= read -r -d '' msg_file; do
            STATUS=$(jq -r '.local.status // .metadata.status // "unread"' "$msg_file" 2>/dev/null)
            [ "$STATUS" = "unread" ] && UNREAD=$((UNREAD + 1))
        done < <(find "$INBOX_DIR" -name '*.json' -type f -print0 2>/dev/null)
    fi
fi

# --- Build status line ---
if [ -n "$AGENT_ADDRESS" ]; then
    AMP_PART="$AGENT_ADDRESS"
    if [ "$UNREAD" -gt 0 ]; then
        AMP_PART="$AMP_PART | \033[33m${UNREAD} unread\033[0m"
    else
        AMP_PART="$AMP_PART | 0 unread"
    fi
else
    AMP_PART="AMP: not configured (run amp-init)"
fi

COST_FMT=$(printf '%.2f' "$COST")

if [ "$PCT" -ge 80 ]; then
    CTX="\033[31m${PCT}%\033[0m"
elif [ "$PCT" -ge 50 ]; then
    CTX="\033[33m${PCT}%\033[0m"
else
    CTX="${PCT}%"
fi

echo -e "$AMP_PART"
echo -e "$MODEL | ctx $CTX | \$$COST_FMT"
