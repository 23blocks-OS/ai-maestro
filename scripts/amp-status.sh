#!/bin/bash
# =============================================================================
# AMP Status - Show Agent Messaging Status
# =============================================================================
#
# Display your AMP configuration and registration status.
#
# Usage:
#   amp-status
#   amp-status --json
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
JSON_OUTPUT=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --json|-j)
            JSON_OUTPUT=true
            shift
            ;;
        --id)
            shift 2  # Already handled in pre-source parsing
            ;;
        --help|-h)
            echo "Usage: amp-status [--id UUID] [options]"
            echo ""
            echo "Show your AMP agent status and registrations."
            echo ""
            echo "Options:"
            echo "  --id UUID       Operate as this agent (UUID from config.json)"
            echo "  --json, -j      Output as JSON"
            echo "  --help, -h      Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check initialization
if [ ! -f "${AMP_CONFIG}" ]; then
    if [ "$JSON_OUTPUT" = true ]; then
        echo '{"initialized": false}'
    else
        echo "AMP not initialized"
        echo ""
        echo "Run: amp-init"
    fi
    exit 0
fi

# Load configuration
load_config

# Count messages (handles both flat and nested directory structures)
INBOX_COUNT=0
UNREAD_COUNT=0
SENT_COUNT=0

if [ -d "$AMP_INBOX_DIR" ]; then
    # Count all .json files recursively (handles nested sender directories)
    INBOX_COUNT=$(find "$AMP_INBOX_DIR" -name "*.json" -type f 2>/dev/null | wc -l | tr -d ' ')
    # Count unread messages - use grep for performance (avoids spawning jq per file)
    # Messages are "unread" if they contain "unread" as a status value, or have no status at all
    if [ "$INBOX_COUNT" -gt 0 ]; then
        # Count files that contain a "read" status (unread = total - read)
        _read_count=$(find "$AMP_INBOX_DIR" -name "*.json" -type f -exec grep -l '"status"[[:space:]]*:[[:space:]]*"read"' {} + 2>/dev/null | wc -l | tr -d ' ')
        UNREAD_COUNT=$(( INBOX_COUNT - _read_count ))
    fi
fi

if [ -d "$AMP_SENT_DIR" ]; then
    # Count all .json files recursively (handles nested recipient directories)
    SENT_COUNT=$(find "$AMP_SENT_DIR" -name "*.json" -type f 2>/dev/null | wc -l | tr -d ' ')
fi

# Get registrations
REGISTRATIONS=()
if [ -d "$AMP_REGISTRATIONS_DIR" ]; then
    shopt -s nullglob
    for reg_file in "${AMP_REGISTRATIONS_DIR}"/*.json; do
        provider=$(basename "$reg_file" .json)
        address=$(jq -r '.address' "$reg_file")
        registered=$(jq -r '.registeredAt' "$reg_file")
        # Use jq for safe JSON construction (handles special chars in values)
        REGISTRATIONS+=("$(jq -n --arg p "$provider" --arg a "$address" --arg r "$registered" '{provider:$p,address:$a,registeredAt:$r}')")
    done
    shopt -u nullglob
fi

# JSON output
if [ "$JSON_OUTPUT" = true ]; then
    REGS_JSON="[]"
    if [ ${#REGISTRATIONS[@]} -gt 0 ]; then
        REGS_JSON=$(printf '%s\n' "${REGISTRATIONS[@]}" | jq -s '.')
    fi

    # Check security module status
    SECURITY_LOADED=false
    PATTERN_COUNT=0
    if type apply_content_security &>/dev/null; then
        SECURITY_LOADED=true
        PATTERN_COUNT=${#INJECTION_PATTERNS[@]}
    fi

    jq -n \
        --arg name "$AMP_AGENT_NAME" \
        --arg tenant "$AMP_TENANT" \
        --arg address "$AMP_ADDRESS" \
        --arg fingerprint "$AMP_FINGERPRINT" \
        --arg configFile "$AMP_CONFIG" \
        --argjson inbox "$INBOX_COUNT" \
        --argjson unread "$UNREAD_COUNT" \
        --argjson sent "$SENT_COUNT" \
        --argjson registrations "$REGS_JSON" \
        --argjson securityLoaded "$SECURITY_LOADED" \
        --argjson patternCount "$PATTERN_COUNT" \
        '{
            initialized: true,
            agent: {
                name: $name,
                tenant: $tenant,
                address: $address,
                fingerprint: $fingerprint
            },
            messages: {
                inbox: $inbox,
                unread: $unread,
                sent: $sent
            },
            security: {
                moduleLoaded: $securityLoaded,
                contentWrapping: $securityLoaded,
                injectionPatterns: $patternCount
            },
            registrations: $registrations,
            configFile: $configFile
        }'
    exit 0
fi

# Human-readable output
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "AMP Agent Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Identity:"
echo "  Name:        ${AMP_AGENT_NAME}"
echo "  Tenant:      ${AMP_TENANT}"
echo "  Address:     ${AMP_ADDRESS}"
echo "  Fingerprint: ${AMP_FINGERPRINT:0:16}..."
echo ""
echo "Messages:"
echo "  Inbox:       ${INBOX_COUNT} (${UNREAD_COUNT} unread)"
echo "  Sent:        ${SENT_COUNT}"
echo ""

if [ ${#REGISTRATIONS[@]} -gt 0 ]; then
    echo "External Registrations:"
    shopt -s nullglob
    for reg_file in "${AMP_REGISTRATIONS_DIR}"/*.json; do
        provider=$(basename "$reg_file" .json)
        address=$(jq -r '.address' "$reg_file")
        registered=$(jq -r '.registeredAt' "$reg_file")
        echo "  ${provider}:"
        echo "    Address:    ${address}"
        echo "    Registered: ${registered}"
    done
    shopt -u nullglob
    echo ""
else
    echo "External Registrations: None"
    echo "  Register with: amp-register --provider crabmail.ai --tenant <tenant>"
    echo ""
fi

# Security status
SECURITY_LOADED="No"
if type apply_content_security &>/dev/null; then
    SECURITY_LOADED="Yes"
fi
echo "Security:"
echo "  Module loaded: ${SECURITY_LOADED}"
if [ "$SECURITY_LOADED" = "Yes" ]; then
    echo "  Content wrapping: Enabled for external messages"
    echo "  Injection detection: ${#INJECTION_PATTERNS[@]} patterns"
fi
echo ""
echo "Storage: ${AMP_DIR}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
