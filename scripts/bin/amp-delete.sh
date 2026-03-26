#!/bin/bash
# =============================================================================
# AMP Delete - Delete a Message
# =============================================================================
#
# Delete a message from your inbox or sent folder.
#
# Usage:
#   amp-delete <message-id>
#   amp-delete <message-id> --sent
#
# =============================================================================

set -e

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
BOX="inbox"
FORCE=false

show_help() {
    echo "Usage: amp-delete <message-id> [options]"
    echo ""
    echo "Delete a message from inbox or sent folder."
    echo ""
    echo "Arguments:"
    echo "  message-id      The message ID to delete"
    echo ""
    echo "Options:"
    echo "  --sent, -s      Delete from sent folder (default: inbox)"
    echo "  --force, -f     Delete without confirmation"
    echo "  --id UUID       Operate as this agent (UUID from config.json)"
    echo "  --help, -h      Show this help"
    echo ""
    echo "Examples:"
    echo "  amp-delete msg_1234567890_abc123"
    echo "  amp-delete msg_1234567890_abc123 --sent"
    echo "  amp-delete msg_1234567890_abc123 --force"
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --sent|-s)
            BOX="sent"
            shift
            ;;
        --force|-f)
            FORCE=true
            shift
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
            echo "Run 'amp-delete --help' for usage."
            exit 1
            ;;
        *)
            if [ -z "$MESSAGE_ID" ]; then
                MESSAGE_ID="$1"
            else
                echo "Error: Unexpected argument: $1"
                exit 1
            fi
            shift
            ;;
    esac
done

# Require message ID
if [ -z "$MESSAGE_ID" ]; then
    echo "Error: Message ID required"
    echo ""
    echo "Usage: amp-delete <message-id>"
    echo ""
    echo "Get message IDs from: amp-inbox"
    exit 1
fi

# Security: validate message ID format (prevent path traversal)
if ! validate_message_id "$MESSAGE_ID"; then
    exit 1
fi

# Require initialization
require_init

# Find the message file (searches flat and nested structures)
if [ "$BOX" = "inbox" ]; then
    MSG_FILE=$(find_message_file "$MESSAGE_ID" "$AMP_INBOX_DIR")
else
    MSG_FILE=$(find_message_file "$MESSAGE_ID" "$AMP_SENT_DIR")
fi

if [ -z "$MSG_FILE" ] || [ ! -f "$MSG_FILE" ]; then
    echo "Error: Message not found: ${MESSAGE_ID}"
    echo ""
    echo "Check the message ID and folder (inbox/sent)."
    exit 1
fi

# Show message info before deleting
MESSAGE=$(cat "$MSG_FILE")
from=$(echo "$MESSAGE" | jq -r '.envelope.from')
to=$(echo "$MESSAGE" | jq -r '.envelope.to')
subject=$(echo "$MESSAGE" | jq -r '.envelope.subject')
timestamp=$(echo "$MESSAGE" | jq -r '.envelope.timestamp')

echo "Message to delete:"
echo ""
echo "  ID:      ${MESSAGE_ID}"
if [ "$BOX" = "inbox" ]; then
    echo "  From:    ${from}"
else
    echo "  To:      ${to}"
fi
echo "  Subject: ${subject}"
echo "  Date:    ${timestamp}"
echo ""

# Confirm deletion
if [ "$FORCE" != true ]; then
    read -p "Are you sure you want to delete this message? [y/N] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled."
        exit 0
    fi
fi

# Delete the message
rm "$MSG_FILE"

# Clean up downloaded attachments for this message
if [ -d "${AMP_ATTACHMENTS_DIR}/${MESSAGE_ID}" ]; then
    rm -rf "${AMP_ATTACHMENTS_DIR}/${MESSAGE_ID}"
fi

# Clean up empty sender/recipient directory
_parent_dir=$(dirname "$MSG_FILE")
if [ "$_parent_dir" != "$AMP_INBOX_DIR" ] && [ "$_parent_dir" != "$AMP_SENT_DIR" ]; then
    rmdir "$_parent_dir" 2>/dev/null || true
fi

echo "✅ Message deleted"
