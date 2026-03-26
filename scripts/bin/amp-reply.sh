#!/bin/bash
# =============================================================================
# AMP Reply - Reply to a Message
# =============================================================================
#
# Reply to a message in your inbox.
#
# Usage:
#   amp-reply <message-id> <reply-message>
#   amp-reply <message-id> <reply-message> --priority high
#
# =============================================================================

# Note: set -e is inherited from amp-helper.sh; read_message failure handled via || true

# Pre-source: extract --id to set agent identity before helper resolves it
_amp_prev=""
for _amp_arg in "$@"; do
    if [ "$_amp_prev" = "--id" ]; then
        export CLAUDE_AGENT_ID="$_amp_arg"
        break
    fi
    _amp_prev="$_amp_arg"
done
unset _amp_prev _amp_arg

# Source helper functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/amp-helper.sh"

# Parse arguments
MESSAGE_ID=""
REPLY_MESSAGE=""
PRIORITY=""
TYPE="response"
ATTACH_FILES=()

show_help() {
    echo "Usage: amp-reply <message-id> <reply-message> [options]"
    echo ""
    echo "Reply to a message."
    echo ""
    echo "Arguments:"
    echo "  message-id      The message ID to reply to"
    echo "  reply-message   Your reply message"
    echo ""
    echo "Options:"
    echo "  --priority, -p PRIORITY   Override priority (default: same as original)"
    echo "  --type, -t TYPE           Message type (default: response)"
    echo "  --attach, -a FILE         Attach a file (can be repeated)"
    echo "  --id UUID                 Operate as this agent (UUID from config.json)"
    echo "  --help, -h                Show this help"
    echo ""
    echo "Examples:"
    echo "  amp-reply msg_1234567890_abc \"Got it, working on it\""
    echo "  amp-reply msg_1234567890_abc \"Urgent update\" --priority urgent"
    echo "  amp-reply msg_1234567890_abc \"See attached\" --attach report.pdf"
}

# Parse positional and optional arguments
POSITIONAL=()
while [[ $# -gt 0 ]]; do
    case $1 in
        --priority|-p)
            PRIORITY="$2"
            shift 2
            ;;
        --type|-t)
            TYPE="$2"
            shift 2
            ;;
        --attach|-a)
            ATTACH_FILES+=("$2")
            shift 2
            ;;
        --id)
            shift 2  # Already handled in pre-source parsing
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        -*)
            echo "Unknown option: $1"
            echo "Run 'amp-reply --help' for usage."
            exit 1
            ;;
        *)
            POSITIONAL+=("$1")
            shift
            ;;
    esac
done

# Check positional arguments
if [ ${#POSITIONAL[@]} -lt 2 ]; then
    echo "Error: Missing required arguments."
    echo ""
    show_help
    exit 1
fi

MESSAGE_ID="${POSITIONAL[0]}"
REPLY_MESSAGE="${POSITIONAL[1]}"

# Validate message ID
validate_message_id "$MESSAGE_ID" || {
    echo "Error: Invalid message ID format: ${MESSAGE_ID}"
    exit 1
}

# Require initialization
require_init

# Read the original message
ORIGINAL=$(read_message "$MESSAGE_ID" "inbox" 2>/dev/null) || true

if [ -z "$ORIGINAL" ]; then
    echo "Error: Message not found: ${MESSAGE_ID}"
    echo ""
    echo "Make sure the message ID is correct. Use 'amp-inbox' to list messages."
    exit 1
fi

# Extract original message details
ORIGINAL_FROM=$(echo "$ORIGINAL" | jq -r '.envelope.from')
ORIGINAL_SUBJECT=$(echo "$ORIGINAL" | jq -r '.envelope.subject')
ORIGINAL_PRIORITY=$(echo "$ORIGINAL" | jq -r '.envelope.priority')
ORIGINAL_THREAD=$(echo "$ORIGINAL" | jq -r '.envelope.thread_id // empty')

# Use original priority if not overridden
if [ -z "$PRIORITY" ]; then
    PRIORITY="$ORIGINAL_PRIORITY"
fi

# Build reply subject
if [[ "$ORIGINAL_SUBJECT" != Re:* ]]; then
    REPLY_SUBJECT="Re: ${ORIGINAL_SUBJECT}"
else
    REPLY_SUBJECT="$ORIGINAL_SUBJECT"
fi

# Create the reply using amp-send
echo "Sending reply to ${ORIGINAL_FROM}..."
echo ""

# Build send command (propagate thread_id from original message for correct threading)
SEND_ARGS=(
    "$ORIGINAL_FROM"
    "$REPLY_SUBJECT"
    "$REPLY_MESSAGE"
    --priority "$PRIORITY"
    --type "$TYPE"
    --reply-to "$MESSAGE_ID"
    --thread-id "$ORIGINAL_THREAD"
)

# Forward attachment flags
for attach_file in "${ATTACH_FILES[@]}"; do
    SEND_ARGS+=(--attach "$attach_file")
done

"${SCRIPT_DIR}/amp-send.sh" "${SEND_ARGS[@]}"
