#!/bin/bash
# AI Maestro - Send message directly to tmux session

if [ $# -lt 2 ]; then
  echo "Usage: send-tmux-message.sh <target_session> <message> [method]"
  echo ""
  echo "Methods:"
  echo "  display  - Show popup notification (default, non-intrusive)"
  echo "  inject   - Inject as comment in terminal"
  echo "  echo     - Echo to terminal output"
  echo ""
  echo "Examples:"
  echo "  send-tmux-message.sh backend-architect 'Need API endpoint'"
  echo "  send-tmux-message.sh backend-architect 'Check your inbox' display"
  echo "  send-tmux-message.sh backend-architect 'Urgent: Fix bug' inject"
  exit 1
fi

TARGET_SESSION="$1"
MESSAGE="$2"
METHOD="${3:-display}"

# Get current session
FROM_SESSION=$(tmux display-message -p '#S' 2>/dev/null)
if [ -z "$FROM_SESSION" ]; then
  FROM_SESSION="unknown"
fi

# Check if target session exists
if ! tmux has-session -t "$TARGET_SESSION" 2>/dev/null; then
  echo "❌ Error: Session '$TARGET_SESSION' not found"
  echo "Available sessions:"
  tmux list-sessions -F "  - #{session_name}"
  exit 1
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
