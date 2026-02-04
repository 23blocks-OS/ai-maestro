#!/bin/bash
#
# AMP Send Message Tool
#
# Sends a message to another agent via AMP protocol.
#
# Usage:
#   amp-send.sh [options] <recipient> <subject> <message>
#
# Options:
#   -a, --agent NAME        Agent name (default: uses first registered agent)
#   -p, --priority LEVEL    Priority: low, normal, high, urgent (default: normal)
#   -t, --type TYPE         Message type: request, response, notification, update (default: request)
#   -r, --reply-to ID       Message ID this is a reply to
#   -d, --directory DIR     Config directory (default: ~/.agent-messaging)
#   -h, --help              Show this help message
#
# Example:
#   amp-send.sh claude@macbook.aimaestro.local "Hello" "Can you help me?"
#   amp-send.sh --agent my-bot --priority high backend "Urgent" "Server is down!"
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default values
CONFIG_DIR="$HOME/.agent-messaging"
AGENT_NAME=""
PRIORITY="normal"
MSG_TYPE="request"
REPLY_TO=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -a|--agent)
      AGENT_NAME="$2"
      shift 2
      ;;
    -p|--priority)
      PRIORITY="$2"
      shift 2
      ;;
    -t|--type)
      MSG_TYPE="$2"
      shift 2
      ;;
    -r|--reply-to)
      REPLY_TO="$2"
      shift 2
      ;;
    -d|--directory)
      CONFIG_DIR="$2"
      shift 2
      ;;
    -h|--help)
      echo "AMP Send Message Tool"
      echo ""
      echo "Usage: amp-send.sh [options] <recipient> <subject> <message>"
      echo ""
      echo "Options:"
      echo "  -a, --agent NAME        Agent name (default: first registered)"
      echo "  -p, --priority LEVEL    low, normal, high, urgent (default: normal)"
      echo "  -t, --type TYPE         request, response, notification, update (default: request)"
      echo "  -r, --reply-to ID       Message ID this is a reply to"
      echo "  -d, --directory DIR     Config directory (default: ~/.agent-messaging)"
      echo "  -h, --help              Show help"
      echo ""
      echo "Example:"
      echo "  amp-send.sh claude@macbook.aimaestro.local \"Hello\" \"Can you help?\""
      exit 0
      ;;
    -*)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
    *)
      break
      ;;
  esac
done

# Get positional arguments
RECIPIENT="${1:-}"
SUBJECT="${2:-}"
MESSAGE="${3:-}"

if [ -z "$RECIPIENT" ] || [ -z "$SUBJECT" ] || [ -z "$MESSAGE" ]; then
  echo -e "${RED}Error: Missing required arguments${NC}"
  echo "Usage: amp-send.sh <recipient> <subject> <message>"
  exit 1
fi

# Find agent config
AGENTS_DIR="${CONFIG_DIR}/agents"

if [ -n "$AGENT_NAME" ]; then
  AGENT_DIR="${AGENTS_DIR}/${AGENT_NAME}"
else
  # Use first available agent
  AGENT_DIR=$(find "$AGENTS_DIR" -maxdepth 1 -type d ! -path "$AGENTS_DIR" | head -1)
  if [ -z "$AGENT_DIR" ]; then
    echo -e "${RED}Error: No registered agents found${NC}"
    echo "Run amp-register.sh first to register an agent."
    exit 1
  fi
  AGENT_NAME=$(basename "$AGENT_DIR")
fi

if [ ! -d "$AGENT_DIR" ]; then
  echo -e "${RED}Error: Agent '${AGENT_NAME}' not found${NC}"
  echo "Available agents:"
  ls -1 "$AGENTS_DIR" 2>/dev/null | sed 's/^/  - /'
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

# Build request body
BODY=$(cat <<EOF
{
  "to": "${RECIPIENT}",
  "subject": "${SUBJECT}",
  "priority": "${PRIORITY}",
  "payload": {
    "type": "${MSG_TYPE}",
    "message": $(echo "$MESSAGE" | jq -Rs .)
  }
EOF
)

if [ -n "$REPLY_TO" ]; then
  BODY="${BODY},\"in_reply_to\": \"${REPLY_TO}\""
fi

BODY="${BODY}}"

# Send message
echo -e "${BLUE}Sending message...${NC}"
echo -e "  From: ${ADDRESS}"
echo -e "  To: ${RECIPIENT}"
echo -e "  Subject: ${SUBJECT}"
echo ""

RESPONSE=$(curl -s -X POST "${API_ENDPOINT}/route" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$BODY")

# Check response
if echo "$RESPONSE" | grep -q '"error"'; then
  ERROR_MSG=$(echo "$RESPONSE" | grep -o '"message"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"message"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
  echo -e "${RED}Error: ${ERROR_MSG}${NC}"
  exit 1
fi

MSG_ID=$(echo "$RESPONSE" | grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
STATUS=$(echo "$RESPONSE" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"status"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
METHOD=$(echo "$RESPONSE" | grep -o '"method"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"method"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

echo -e "${GREEN}✓ Message sent!${NC}"
echo -e "  ID: ${MSG_ID}"
echo -e "  Status: ${STATUS}"
echo -e "  Method: ${METHOD}"
