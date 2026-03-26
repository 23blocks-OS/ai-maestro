#!/bin/bash
# =============================================================================
# AMP Download - Download Message Attachments
# =============================================================================
#
# Download attachments from a message.
#
# Usage:
#   amp-download <message-id> [attachment-id|--all] [options]
#
# Examples:
#   amp-download msg_123_abc --all
#   amp-download msg_123_abc att_456_def
#   amp-download msg_123_abc --all --dest ~/Downloads
#   amp-download msg_123_abc att_456_def --sent
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
ATTACHMENT_ID=""
DOWNLOAD_ALL=false
DEST_DIR=""
BOX="inbox"

show_help() {
    echo "Usage: amp-download <message-id> [attachment-id|--all] [options]"
    echo ""
    echo "Download attachments from a message."
    echo ""
    echo "Arguments:"
    echo "  message-id       The message ID (from amp-inbox or amp-read)"
    echo "  attachment-id    Specific attachment ID to download"
    echo ""
    echo "Options:"
    echo "  --all             Download all attachments from the message"
    echo "  --dest, -d DIR    Destination directory (default: ~/.agent-messaging/attachments/<msg-id>/)"
    echo "  --sent, -s        Download from sent folder instead of inbox"
    echo "  --id UUID         Operate as this agent (UUID from config.json)"
    echo "  --help, -h        Show this help"
    echo ""
    echo "Examples:"
    echo "  amp-download msg_123_abc --all"
    echo "  amp-download msg_123_abc att_456_def"
    echo "  amp-download msg_123_abc --all --dest ~/Downloads"
}

POSITIONAL=()
while [[ $# -gt 0 ]]; do
    case $1 in
        --all)
            DOWNLOAD_ALL=true
            shift
            ;;
        --dest|-d)
            DEST_DIR="$2"
            shift 2
            ;;
        --sent|-s)
            BOX="sent"
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
            echo "Run 'amp-download --help' for usage."
            exit 1
            ;;
        *)
            POSITIONAL+=("$1")
            shift
            ;;
    esac
done

# Parse positional args
if [ ${#POSITIONAL[@]} -lt 1 ]; then
    echo "Error: Message ID required."
    echo ""
    show_help
    exit 1
fi

MESSAGE_ID="${POSITIONAL[0]}"

if [ ${#POSITIONAL[@]} -ge 2 ]; then
    ATTACHMENT_ID="${POSITIONAL[1]}"
fi

# Must have --all or a specific attachment ID
if [ "$DOWNLOAD_ALL" = false ] && [ -z "$ATTACHMENT_ID" ]; then
    echo "Error: Specify an attachment ID or use --all"
    echo ""
    show_help
    exit 1
fi

# Require initialization
require_init

# Read the message (set -e exits on failure automatically)
MESSAGE=$(read_message "$MESSAGE_ID" "$BOX")

# Get attachments
ATTACHMENTS=$(echo "$MESSAGE" | jq '.payload.attachments // []')
ATT_COUNT=$(echo "$ATTACHMENTS" | jq 'length')

if [ "$ATT_COUNT" -eq 0 ]; then
    echo "No attachments found in message ${MESSAGE_ID}"
    exit 0
fi

# Default destination
if [ -z "$DEST_DIR" ]; then
    DEST_DIR="${AMP_ATTACHMENTS_DIR}/${MESSAGE_ID}"
fi
mkdir -p "$DEST_DIR"
chmod 700 "$DEST_DIR"

# Find API credentials for download
DL_API_URL=""
DL_API_KEY=""
for provider_file in "${AMP_REGISTRATIONS_DIR}"/*.json; do
    [ -f "$provider_file" ] || continue
    prov=$(jq -r '.provider // empty' "$provider_file" 2>/dev/null)
    if [ "$prov" = "aimaestro.local" ] || [ "$prov" = "${AMP_PROVIDER_DOMAIN}" ]; then
        DL_API_URL=$(jq -r '.apiUrl // empty' "$provider_file" 2>/dev/null)
        DL_API_KEY=$(jq -r '.apiKey // empty' "$provider_file" 2>/dev/null)
        break
    fi
done

# Download attachments
DOWNLOADED=0
FAILED=0

download_single_attachment() {
    local att_json="$1"

    local att_id
    att_id=$(echo "$att_json" | jq -r '.id')
    local att_filename
    att_filename=$(echo "$att_json" | jq -r '.filename')
    local att_size
    att_size=$(echo "$att_json" | jq -r '.size')
    local att_scan
    att_scan=$(echo "$att_json" | jq -r '.scan_status // "unknown"')

    # Warn about suspicious/rejected files
    if [ "$att_scan" = "rejected" ]; then
        echo "  ⚠️  SKIPPING ${att_filename}: rejected by security scan!"
        FAILED=$((FAILED + 1))
        return 1
    fi

    if [ "$att_scan" = "suspicious" ]; then
        echo "  ⚠️  WARNING: ${att_filename} flagged as suspicious by security scan!"
        echo "      Skipping — requires human approval before download."
        FAILED=$((FAILED + 1))
        return 1
    fi

    if [ "$att_scan" = "basic_clean" ]; then
        echo "  ℹ️  Note: ${att_filename} passed basic checks only (no AV scan)"
    elif [ "$att_scan" = "unscanned" ]; then
        echo "  ⚠️  Warning: ${att_filename} was not scanned (local delivery)"
    elif [ "$att_scan" = "pending" ] || [ "$att_scan" = "unknown" ]; then
        echo "  ⚠️  Warning: ${att_filename} scan status is '${att_scan}'"
    fi

    echo "  Downloading: ${att_filename} ($(format_file_size "$att_size"))..."

    local result
    result=$(download_attachment "$att_json" "$DEST_DIR" "$DL_API_URL" "$DL_API_KEY")

    if [ $? -eq 0 ]; then
        echo "  ✅ Saved: ${result}"
        DOWNLOADED=$((DOWNLOADED + 1))
    else
        echo "  ❌ Failed: ${att_filename}"
        FAILED=$((FAILED + 1))
    fi
}

if [ "$DOWNLOAD_ALL" = true ]; then
    echo "Downloading ${ATT_COUNT} attachment(s) from ${MESSAGE_ID}..."
    echo ""

    while read -r att; do
        download_single_attachment "$att"
    done < <(echo "$ATTACHMENTS" | jq -c '.[]')
else
    # Download specific attachment
    validate_attachment_id "$ATTACHMENT_ID" || exit 1

    ATT_JSON=$(echo "$ATTACHMENTS" | jq --arg id "$ATTACHMENT_ID" '.[] | select(.id == $id)')
    if [ -z "$ATT_JSON" ] || [ "$ATT_JSON" = "null" ]; then
        echo "Error: Attachment '${ATTACHMENT_ID}' not found in message ${MESSAGE_ID}"
        echo ""
        echo "Available attachments:"
        echo "$ATTACHMENTS" | jq -r '.[] | "  \(.id)  \(.filename)"'
        exit 1
    fi

    download_single_attachment "$ATT_JSON"
fi

echo ""
if [ "$DOWNLOAD_ALL" = true ]; then
    echo "Results: ${DOWNLOADED} downloaded, ${FAILED} failed"
fi
echo "Download directory: ${DEST_DIR}"
