#!/bin/bash
# AI Maestro - Send message directly to tmux session
# Supports agent ID, alias, or tmux session name as target

# Source messaging helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/messaging-helper.sh"

if [ $# -lt 2 ]; then
  echo "Usage: send-tmux-message.sh <target> <message> [method]"
  echo ""
  echo "Target can be:"
  echo "  - Agent alias (e.g., 'crm', 'backend-api')"
  echo "  - Agent ID (UUID)"
  echo "  - Tmux session name (e.g., '23blocks-api-crm')"
  echo ""
  echo "Methods:"
  echo "  display  - Show popup notification (default, non-intrusive)"
  echo "  inject   - Inject as comment in terminal"
  echo "  echo     - Echo to terminal output"
  echo ""
  echo "Examples:"
  echo "  send-tmux-message.sh backend-architect 'Need API endpoint'"
  echo "  send-tmux-message.sh crm 'Check your inbox' display"
  echo "  send-tmux-message.sh backend-architect 'Urgent: Fix bug' inject"
  exit 1
fi

TARGET="$1"
MESSAGE="$2"
METHOD="${3:-display}"

# Initialize messaging to get current session info
init_messaging 2>/dev/null
FROM_SESSION="${SESSION:-unknown}"

# Function to resolve target to tmux session name
resolve_target() {
  local target="$1"

  # First, check if it's already a valid tmux session name
  if tmux has-session -t "$target" 2>/dev/null; then
    echo "$target"
    return 0
  fi

  # Try to resolve via API (handles aliases, IDs, partial matches)
  local resolved=$(curl -s "${API_BASE}/api/messages?alias=$target&action=resolve" 2>/dev/null)

  if [ -n "$resolved" ]; then
    local success=$(echo "$resolved" | jq -r '.success // false' 2>/dev/null)

    if [ "$success" = "true" ]; then
      # Get the agentId and try to find matching tmux session
      local agent_id=$(echo "$resolved" | jq -r '.agentId // empty' 2>/dev/null)

      if [ -n "$agent_id" ] && [ "$agent_id" != "null" ]; then
        # Check for structured session name: hostId_agentId
        local host_id=$(echo "$resolved" | jq -r '.hostId // "local"' 2>/dev/null)
        local structured_session="${host_id}_${agent_id}"

        if tmux has-session -t "$structured_session" 2>/dev/null; then
          echo "$structured_session"
          return 0
        fi

        # Look for any session containing this agent ID
        local found_session=$(tmux list-sessions -F "#{session_name}" 2>/dev/null | grep "$agent_id" | head -1)
        if [ -n "$found_session" ]; then
          echo "$found_session"
          return 0
        fi
      fi
    fi
  fi

  # Not found
  return 1
}

# Resolve target to tmux session name
TARGET_SESSION=$(resolve_target "$TARGET")

if [ -z "$TARGET_SESSION" ]; then
  echo "❌ Error: Could not resolve '$TARGET' to a tmux session"
  echo ""
  echo "The target could be:"
  echo "  - An agent alias (e.g., 'crm', 'backend-api')"
  echo "  - An agent ID (UUID)"
  echo "  - A tmux session name"
  echo ""
  echo "Available tmux sessions:"
  tmux list-sessions -F "  - #{session_name}" 2>/dev/null || echo "  (no tmux sessions found)"
  echo ""
  echo "Tip: Use 'send-aimaestro-message.sh' for persistent messages that support alias resolution."
  exit 1
fi

# If we resolved to a different name, show it
if [ "$TARGET" != "$TARGET_SESSION" ]; then
  echo "📍 Resolved '$TARGET' to session '$TARGET_SESSION'"
fi

case "$METHOD" in
  display)
    # Show popup notification (non-intrusive, disappears after a few seconds)
    # tmux display-message is safe - it doesn't execute shell commands
    tmux display-message -t "$TARGET_SESSION" "📬 Message from $FROM_SESSION: $MESSAGE"
    echo "✅ Display message sent to $TARGET_SESSION"
    ;;

  inject)
    # Inject as a comment (appears in terminal history)
    # Use printf %q to safely escape the message for shell
    ESCAPED_FROM=$(printf '%q' "$FROM_SESSION")
    ESCAPED_MSG=$(printf '%q' "$MESSAGE")
    FULL_MESSAGE="echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'; echo '📬 MESSAGE FROM $ESCAPED_FROM'; echo $ESCAPED_MSG; echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'"
    tmux send-keys -t "$TARGET_SESSION" "$FULL_MESSAGE" Enter
    echo "✅ Message injected to $TARGET_SESSION terminal"
    ;;

  echo)
    # Echo to terminal output (visible but doesn't interrupt)
    # Use printf %q to safely escape the message for shell
    ESCAPED_FROM=$(printf '%q' "$FROM_SESSION")
    ESCAPED_MSG=$(printf '%q' "$MESSAGE")
    tmux send-keys -t "$TARGET_SESSION" "" # Focus the pane
    tmux send-keys -t "$TARGET_SESSION" "echo ''" Enter
    tmux send-keys -t "$TARGET_SESSION" "echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'" Enter
    tmux send-keys -t "$TARGET_SESSION" "echo '📬 MESSAGE FROM: $ESCAPED_FROM'" Enter
    tmux send-keys -t "$TARGET_SESSION" "echo $ESCAPED_MSG" Enter
    tmux send-keys -t "$TARGET_SESSION" "echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'" Enter
    tmux send-keys -t "$TARGET_SESSION" "echo ''" Enter
    echo "✅ Message echoed to $TARGET_SESSION terminal"
    ;;

  *)
    echo "❌ Error: Unknown method '$METHOD'"
    echo "Use: display, inject, or echo"
    exit 1
    ;;
esac
