#!/bin/bash
# =============================================================================
# AID Status - Agent Identity Status
# =============================================================================
#
# Show registered auth servers, cached tokens, and agent identity info.
#
# Usage:
#   aid-status              # Human-readable output
#   aid-status --json       # JSON output
#
# =============================================================================

set -e

# Source AID helper for identity
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/aid-helper.sh"

FORMAT="text"

while [[ $# -gt 0 ]]; do
    case $1 in
        --json|-j)
            FORMAT="json"
            shift
            ;;
        --help|-h)
            echo "Usage: aid-status [options]"
            echo ""
            echo "Show agent identity status — identity, registrations, and cached tokens."
            echo ""
            echo "Options:"
            echo "  --json, -j     Output as JSON"
            echo "  --help, -h     Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

# =============================================================================
# Load Identity
# =============================================================================

if ! is_initialized; then
    echo "Error: Agent identity not initialized. Run: aid-init --auto" >&2
    exit 1
fi

load_config

AID_REG_DIR="${AMP_DIR}/api_registrations"
AID_CACHE_DIR="${AMP_DIR}/tokens"

# =============================================================================
# Gather Info
# =============================================================================

# Registrations
REGISTRATIONS="[]"
if [ -d "$AID_REG_DIR" ]; then
    for reg_file in "$AID_REG_DIR"/*.json; do
        [ -f "$reg_file" ] || continue
        REGISTRATIONS=$(echo "$REGISTRATIONS" | jq --slurpfile r "$reg_file" '. + $r')
    done
fi

# Cached tokens
TOKENS="[]"
NOW=$(date +%s)
if [ -d "$AID_CACHE_DIR" ]; then
    for token_file in "$AID_CACHE_DIR"/*.json; do
        [ -f "$token_file" ] || continue
        expires_at=$(jq -r '.expires_at // 0' "$token_file" 2>/dev/null)
        auth_server=$(jq -r '.auth_server // "?"' "$token_file" 2>/dev/null)
        scope=$(jq -r '.scope // ""' "$token_file" 2>/dev/null)

        if [ "$expires_at" -gt "$NOW" ] 2>/dev/null; then
            remaining=$(( expires_at - NOW ))
            TOKENS=$(echo "$TOKENS" | jq --arg auth "$auth_server" --arg sc "$scope" --argjson rem "$remaining" \
                '. + [{auth_server: $auth, scope: $sc, expires_in: $rem, status: "valid"}]')
        else
            # Clean up expired tokens
            rm -f "$token_file"
        fi
    done
fi

REG_COUNT=$(echo "$REGISTRATIONS" | jq 'length')
TOKEN_COUNT=$(echo "$TOKENS" | jq 'length')

# =============================================================================
# Output
# =============================================================================

if [ "$FORMAT" = "json" ]; then
    jq -n \
        --arg name "$AMP_AGENT_NAME" \
        --arg address "$AMP_ADDRESS" \
        --arg fingerprint "$AMP_FINGERPRINT" \
        --argjson registrations "$REGISTRATIONS" \
        --argjson tokens "$TOKENS" \
        '{
            agent: {name: $name, address: $address, fingerprint: $fingerprint},
            registrations: $registrations,
            cached_tokens: $tokens
        }'
else
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "AID STATUS — Agent Identity"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "  Agent:       ${AMP_AGENT_NAME}"
    echo "  Address:     ${AMP_ADDRESS}"
    echo "  Fingerprint: ${AMP_FINGERPRINT}"
    echo ""

    echo "  Auth Server Registrations: ${REG_COUNT}"
    if [ "$REG_COUNT" -gt 0 ]; then
        echo "$REGISTRATIONS" | jq -r '.[] | "    - \(.auth_server) (role: \(.role_id), status: \(.status))"'
    else
        echo "    (none — run: aid-register --auth <url> --token <jwt> --role-id <id>)"
    fi
    echo ""

    echo "  Cached Tokens: ${TOKEN_COUNT}"
    if [ "$TOKEN_COUNT" -gt 0 ]; then
        echo "$TOKENS" | jq -r '.[] | "    - \(.auth_server) [\(.scope)] expires in \(.expires_in)s"'
    else
        echo "    (none — run: aid-token --auth <url>)"
    fi
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
fi
