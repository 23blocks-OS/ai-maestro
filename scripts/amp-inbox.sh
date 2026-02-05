#!/bin/bash
#
# AMP Inbox Tool
#
# Check and manage incoming messages for an AMP agent.
#
# Usage:
#   amp-inbox.sh [options] [command]
#
# Commands:
#   list                    List pending messages (default)
#   read <id>               Read a specific message
#   ack <id>                Acknowledge (delete) a message
#   ack-all                 Acknowledge all pending messages
#
# Options:
#   -a, --agent NAME        Agent name (default: first registered)
#   -l, --limit N           Max messages to list (default: 10)
#   -d, --directory DIR     Config directory (default: ~/.agent-messaging)
#   -h, --help              Show help
#
# Example:
#   amp-inbox.sh                          # List pending messages
#   amp-inbox.sh read msg_123456_abc      # Read specific message
#   amp-inbox.sh ack msg_123456_abc       # Acknowledge message
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Default values
CONFIG_DIR="$HOME/.agent-messaging"
AGENT_NAME=""
LIMIT=10
COMMAND="list"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -a|--agent)
      AGENT_NAME="$2"
      shift 2
      ;;
    -l|--limit)
      LIMIT="$2"
      shift 2
      ;;
    -d|--directory)
      CONFIG_DIR="$2"
      shift 2
      ;;
    -h|--help)
      echo "AMP Inbox Tool"
      echo ""
      echo "Usage: amp-inbox.sh [options] [command]"
      echo ""
      echo "Commands:"
      echo "  list                    List pending messages (default)"
      echo "  read <id>               Read a specific message"
      echo "  ack <id>                Acknowledge (delete) a message"
      echo "  ack-all                 Acknowledge all pending messages"
      echo ""
      echo "Options:"
      echo "  -a, --agent NAME        Agent name (default: first registered)"
      echo "  -l, --limit N           Max messages to list (default: 10)"
      echo "  -d, --directory DIR     Config directory (default: ~/.agent-messaging)"
      echo "  -h, --help              Show help"
      exit 0
      ;;
    list|read|ack|ack-all)
      COMMAND="$1"
      shift
      break
      ;;
    -*)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
    *)
      COMMAND="$1"
      shift
      break
      ;;
  esac
done

# Get remaining arguments
MSG_ID="${1:-}"

# Find agent config
AGENTS_DIR="${CONFIG_DIR}/agents"

if [ -n "$AGENT_NAME" ]; then
  AGENT_DIR="${AGENTS_DIR}/${AGENT_NAME}"
else
  AGENT_DIR=$(find "$AGENTS_DIR" -maxdepth 1 -type d ! -path "$AGENTS_DIR" 2>/dev/null | head -1)
  if [ -z "$AGENT_DIR" ]; then
    echo -e "${RED}Error: No registered agents found${NC}"
    echo "Run amp-register.sh first to register an agent."
    exit 1
  fi
  AGENT_NAME=$(basename "$AGENT_DIR")
fi

if [ ! -d "$AGENT_DIR" ]; then
  echo -e "${RED}Error: Agent '${AGENT_NAME}' not found${NC}"
  exit 1
fi

# Load config
CONFIG_FILE="${AGENT_DIR}/config.json"
API_KEY_FILE="${AGENT_DIR}/api_key"

if [ ! -f "$CONFIG_FILE" ] || [ ! -f "$API_KEY_FILE" ]; then
  echo -e "${RED}Error: Agent config incomplete${NC}"
  exit 1
fi

API_ENDPOINT=$(grep -o '"endpoint"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" | sed 's/.*"endpoint"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
API_KEY=$(cat "$API_KEY_FILE")
ADDRESS=$(grep -o '"address"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" | sed 's/.*"address"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

# Execute command
case $COMMAND in
  list)
    echo -e "${BLUE}📬 Inbox for ${ADDRESS}${NC}"
    echo ""

    RESPONSE=$(curl -s "${API_ENDPOINT}/messages/pending?limit=${LIMIT}" \
      -H "Authorization: Bearer ${API_KEY}")

    if echo "$RESPONSE" | grep -q '"error"'; then
      ERROR_MSG=$(echo "$RESPONSE" | grep -o '"message"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"message"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
      echo -e "${RED}Error: ${ERROR_MSG}${NC}"
      exit 1
    fi

    COUNT=$(echo "$RESPONSE" | grep -o '"count"[[:space:]]*:[[:space:]]*[0-9]*' | sed 's/.*"count"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/')
    REMAINING=$(echo "$RESPONSE" | grep -o '"remaining"[[:space:]]*:[[:space:]]*[0-9]*' | sed 's/.*"remaining"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/')

    if [ "$COUNT" = "0" ] || [ -z "$COUNT" ]; then
      echo -e "${GREEN}📭 No pending messages${NC}"
      exit 0
    fi

    echo -e "Found ${YELLOW}${COUNT}${NC} pending message(s)"
    if [ "$REMAINING" != "0" ] && [ -n "$REMAINING" ]; then
      echo -e "(${REMAINING} more not shown)"
    fi
    echo ""

    # Parse and display messages
    echo "$RESPONSE" | python3 -c "
import sys
import json

data = json.load(sys.stdin)
for msg in data.get('messages', []):
    env = msg.get('envelope', {})
    payload = msg.get('payload', {})

    msg_id = env.get('id', 'unknown')
    from_addr = env.get('from', 'unknown')
    subject = env.get('subject', '(no subject)')
    priority = env.get('priority', 'normal')
    timestamp = env.get('timestamp', '')[:16].replace('T', ' ')
    msg_type = payload.get('type', 'message')

    priority_icon = {'urgent': '🔴', 'high': '🟠', 'normal': '🔵', 'low': '⚪'}.get(priority, '🔵')

    print(f'{priority_icon} [{msg_id[:20]}...]')
    print(f'   From: {from_addr}')
    print(f'   Subject: {subject}')
    print(f'   Time: {timestamp}')
    print()
" 2>/dev/null || echo "$RESPONSE" | jq -r '.messages[] | "[\(.envelope.id)] From: \(.envelope.from)\n  Subject: \(.envelope.subject)\n"' 2>/dev/null || echo "$RESPONSE"
    ;;

  read)
    if [ -z "$MSG_ID" ]; then
      echo -e "${RED}Error: Message ID required${NC}"
      echo "Usage: amp-inbox.sh read <message-id>"
      exit 1
    fi

    RESPONSE=$(curl -s "${API_ENDPOINT}/messages/pending?limit=100" \
      -H "Authorization: Bearer ${API_KEY}")

    # Find the specific message
    MESSAGE=$(echo "$RESPONSE" | python3 -c "
import sys
import json

data = json.load(sys.stdin)
msg_id = '${MSG_ID}'

for msg in data.get('messages', []):
    if msg.get('envelope', {}).get('id', '').startswith(msg_id) or msg.get('envelope', {}).get('id') == msg_id:
        print(json.dumps(msg))
        break
" 2>/dev/null)

    if [ -z "$MESSAGE" ] || [ "$MESSAGE" = "null" ]; then
      echo -e "${RED}Error: Message not found${NC}"
      exit 1
    fi

    echo "$MESSAGE" | python3 -c "
import sys
import json

msg = json.load(sys.stdin)
env = msg.get('envelope', {})
payload = msg.get('payload', {})

print('═' * 60)
print(f'Message ID: {env.get(\"id\", \"unknown\")}')
print(f'From: {env.get(\"from\", \"unknown\")}')
print(f'To: {env.get(\"to\", \"unknown\")}')
print(f'Subject: {env.get(\"subject\", \"(no subject)\")}')
print(f'Priority: {env.get(\"priority\", \"normal\")}')
print(f'Time: {env.get(\"timestamp\", \"\")}')
print(f'Type: {payload.get(\"type\", \"message\")}')
print('═' * 60)
print()
print(payload.get('message', ''))
print()
if payload.get('context'):
    print('--- Context ---')
    print(json.dumps(payload['context'], indent=2))
"
    ;;

  ack)
    if [ -z "$MSG_ID" ]; then
      echo -e "${RED}Error: Message ID required${NC}"
      echo "Usage: amp-inbox.sh ack <message-id>"
      exit 1
    fi

    RESPONSE=$(curl -s -X DELETE "${API_ENDPOINT}/messages/pending?id=${MSG_ID}" \
      -H "Authorization: Bearer ${API_KEY}")

    if echo "$RESPONSE" | grep -q '"acknowledged"[[:space:]]*:[[:space:]]*true'; then
      echo -e "${GREEN}✓ Message acknowledged${NC}"
    elif echo "$RESPONSE" | grep -q '"error"'; then
      ERROR_MSG=$(echo "$RESPONSE" | grep -o '"message"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"message"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
      echo -e "${RED}Error: ${ERROR_MSG}${NC}"
      exit 1
    else
      echo "$RESPONSE"
    fi
    ;;

  ack-all)
    # Get all message IDs
    RESPONSE=$(curl -s "${API_ENDPOINT}/messages/pending?limit=100" \
      -H "Authorization: Bearer ${API_KEY}")

    IDS=$(echo "$RESPONSE" | python3 -c "
import sys
import json

data = json.load(sys.stdin)
ids = [msg['envelope']['id'] for msg in data.get('messages', [])]
print(json.dumps(ids))
" 2>/dev/null)

    if [ "$IDS" = "[]" ]; then
      echo -e "${GREEN}No messages to acknowledge${NC}"
      exit 0
    fi

    ACK_RESPONSE=$(curl -s -X POST "${API_ENDPOINT}/messages/pending" \
      -H "Authorization: Bearer ${API_KEY}" \
      -H "Content-Type: application/json" \
      -d "{\"ids\": ${IDS}}")

    ACK_COUNT=$(echo "$ACK_RESPONSE" | grep -o '"acknowledged"[[:space:]]*:[[:space:]]*[0-9]*' | sed 's/.*"acknowledged"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/')

    if [ -n "$ACK_COUNT" ]; then
      echo -e "${GREEN}✓ Acknowledged ${ACK_COUNT} message(s)${NC}"
    else
      echo "$ACK_RESPONSE"
    fi
    ;;

  *)
    echo -e "${RED}Unknown command: ${COMMAND}${NC}"
    echo "Use 'amp-inbox.sh --help' for usage"
    exit 1
    ;;
esac
