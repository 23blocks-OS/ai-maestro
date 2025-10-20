#!/bin/bash

# forward-aimaestro-message.sh
# Forward a message from the current session to another session
#
# Usage:
#   forward-aimaestro-message.sh <message-id> <recipient-session> "[optional note]"
#
# Examples:
#   forward-aimaestro-message.sh msg-123456 backend-architect
#   forward-aimaestro-message.sh msg-123456 frontend-dev "FYI - frontend related"
#   forward-aimaestro-message.sh latest backend-architect "Please handle this"
#
# Note: Use "latest" as message-id to forward the most recent message in inbox

set -e

MESSAGE_DIR="$HOME/.aimaestro/messages"
CURRENT_SESSION=$(tmux display-message -p '#S' 2>/dev/null || echo "unknown")

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to show usage
show_usage() {
  echo "Usage: forward-aimaestro-message.sh <message-id|latest> <recipient-session> \"[optional note]\""
  echo ""
  echo "Examples:"
  echo "  forward-aimaestro-message.sh msg-123456 backend-architect"
  echo "  forward-aimaestro-message.sh latest frontend-dev \"Please review\""
  echo ""
  echo "Use 'latest' to forward the most recent message"
  exit 1
}

# Check arguments
if [ $# -lt 2 ]; then
  echo -e "${RED}❌ Error: Missing required arguments${NC}"
  show_usage
fi

MESSAGE_ID="$1"
RECIPIENT="$2"
FORWARD_NOTE="${3:-}"

# Check if current session is known
if [ "$CURRENT_SESSION" = "unknown" ]; then
  echo -e "${RED}❌ Error: Not running in a tmux session${NC}"
  exit 1
fi

# Check if forwarding to same session
if [ "$CURRENT_SESSION" = "$RECIPIENT" ]; then
  echo -e "${RED}❌ Error: Cannot forward message to the same session${NC}"
  exit 1
fi

# Get inbox directory
INBOX_DIR="$MESSAGE_DIR/inbox/$CURRENT_SESSION"

if [ ! -d "$INBOX_DIR" ]; then
  echo -e "${RED}❌ Error: Inbox not found for session: $CURRENT_SESSION${NC}"
  exit 1
fi

# Resolve message ID (handle "latest" keyword)
if [ "$MESSAGE_ID" = "latest" ]; then
  # Get most recent message in inbox
  LATEST_FILE=$(ls -t "$INBOX_DIR"/*.json 2>/dev/null | head -1)
  if [ -z "$LATEST_FILE" ]; then
    echo -e "${RED}❌ Error: No messages found in inbox${NC}"
    exit 1
  fi
  MESSAGE_ID=$(basename "$LATEST_FILE" .json)
  echo -e "${BLUE}📬 Forwarding latest message: $MESSAGE_ID${NC}"
fi

# Check if message file exists
MESSAGE_FILE="$INBOX_DIR/${MESSAGE_ID}.json"
if [ ! -f "$MESSAGE_FILE" ]; then
  echo -e "${RED}❌ Error: Message not found: $MESSAGE_ID${NC}"
  exit 1
fi

# Read original message details using jq
if ! command -v jq &> /dev/null; then
  echo -e "${RED}❌ Error: jq is required but not installed${NC}"
  echo "Install with: brew install jq"
  exit 1
fi

ORIGINAL_FROM=$(jq -r '.from' "$MESSAGE_FILE")
ORIGINAL_TO=$(jq -r '.to' "$MESSAGE_FILE")
ORIGINAL_SUBJECT=$(jq -r '.subject' "$MESSAGE_FILE")
ORIGINAL_MESSAGE=$(jq -r '.content.message' "$MESSAGE_FILE")
ORIGINAL_TIMESTAMP=$(jq -r '.timestamp' "$MESSAGE_FILE")
ORIGINAL_PRIORITY=$(jq -r '.priority' "$MESSAGE_FILE")

# Generate new message ID
NEW_MESSAGE_ID="msg-$(date +%s)-$(LC_ALL=C tr -dc 'a-z0-9' < /dev/urandom | head -c 7)"

# Create recipient's inbox directory if it doesn't exist
RECIPIENT_INBOX="$MESSAGE_DIR/inbox/$RECIPIENT"
mkdir -p "$RECIPIENT_INBOX"

# Build forwarded content
FORWARDED_CONTENT=""
if [ -n "$FORWARD_NOTE" ]; then
  FORWARDED_CONTENT="$FORWARD_NOTE

"
fi

FORWARDED_CONTENT+="--- Forwarded Message ---
From: $ORIGINAL_FROM
To: $ORIGINAL_TO
Sent: $(date -j -f "%Y-%m-%dT%H:%M:%S" "${ORIGINAL_TIMESTAMP%.*}" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "$ORIGINAL_TIMESTAMP")
Subject: $ORIGINAL_SUBJECT

$ORIGINAL_MESSAGE
--- End of Forwarded Message ---"

# Escape JSON special characters
FORWARDED_CONTENT_JSON=$(echo "$FORWARDED_CONTENT" | jq -Rs .)
FORWARD_NOTE_JSON=$(echo "$FORWARD_NOTE" | jq -Rs .)

# Create forwarded message JSON
cat > "$RECIPIENT_INBOX/${NEW_MESSAGE_ID}.json" <<EOF
{
  "id": "$NEW_MESSAGE_ID",
  "from": "$CURRENT_SESSION",
  "to": "$RECIPIENT",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "subject": "Fwd: $ORIGINAL_SUBJECT",
  "priority": "$ORIGINAL_PRIORITY",
  "status": "unread",
  "content": {
    "type": "notification",
    "message": $FORWARDED_CONTENT_JSON
  },
  "forwardedFrom": {
    "originalMessageId": "$MESSAGE_ID",
    "originalFrom": "$ORIGINAL_FROM",
    "originalTo": "$ORIGINAL_TO",
    "originalTimestamp": "$ORIGINAL_TIMESTAMP",
    "forwardedBy": "$CURRENT_SESSION",
    "forwardedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "forwardNote": $FORWARD_NOTE_JSON
  }
}
EOF

# Create copy in sender's sent folder
SENT_DIR="$MESSAGE_DIR/sent/$CURRENT_SESSION"
mkdir -p "$SENT_DIR"
cp "$RECIPIENT_INBOX/${NEW_MESSAGE_ID}.json" "$SENT_DIR/fwd_${NEW_MESSAGE_ID}.json"

# Send tmux notification to recipient
NOTIFICATION_TEXT="📬 Forwarded message from $CURRENT_SESSION: Fwd: $ORIGINAL_SUBJECT"
tmux send-keys -t "$RECIPIENT" "echo ''" C-m 2>/dev/null || true
tmux send-keys -t "$RECIPIENT" "echo '$NOTIFICATION_TEXT'" C-m 2>/dev/null || true
tmux send-keys -t "$RECIPIENT" "echo ''" C-m 2>/dev/null || true

# Success message
echo -e "${GREEN}✅ Message forwarded successfully${NC}"
echo -e "${BLUE}📨 Original: $ORIGINAL_SUBJECT${NC}"
echo -e "${BLUE}📬 To: $RECIPIENT${NC}"
echo -e "${BLUE}🆔 Forwarded Message ID: $NEW_MESSAGE_ID${NC}"

if [ -n "$FORWARD_NOTE" ]; then
  echo -e "${YELLOW}📝 Note: $FORWARD_NOTE${NC}"
fi
