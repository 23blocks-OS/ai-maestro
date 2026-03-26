#!/bin/bash
# =============================================================================
# AID Register - Agent Identity Registration
# =============================================================================
#
# Register this agent's identity with a 23blocks Auth server for API access.
# This is a one-time setup that links the agent's Ed25519 identity to a
# company tenant with a specific role and permissions.
#
# Usage:
#   aid-register --auth https://auth.23blocks.com/acme --token <admin_jwt> --role-id 2
#   aid-register --auth https://auth.23blocks.com/acme --token <admin_jwt> --role-id 2 --api-key pk_live_xxx
#
# Prerequisites:
#   - Agent identity initialized (aid-init --auto)
#   - Admin JWT token for the target auth server
#
# =============================================================================

set -e

# Source AID helper for identity, keys, and signing
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/aid-helper.sh"

# =============================================================================
# Arguments
# =============================================================================

AUTH_URL=""
AUTH_TOKEN=""
API_KEY=""
ROLE_ID=""
DESCRIPTION=""
TOKEN_LIFETIME="3600"
AGENT_DISPLAY_NAME=""

show_help() {
    echo "Usage: aid-register --auth <url> --token <jwt> --role-id <id> [options]"
    echo ""
    echo "Register this agent with a 23blocks Auth server for API access."
    echo "Requires an admin JWT token to authorize the registration."
    echo ""
    echo "Required:"
    echo "  --auth, -a URL          Auth server URL (e.g., https://auth.23blocks.com/acme)"
    echo "  --token, -t JWT         Admin JWT token for authorization"
    echo "  --role-id, -r ID        Role ID to assign to this agent"
    echo ""
    echo "Options:"
    echo "  --api-key, -k KEY       API key (X-Api-Key header)"
    echo "  --name, -n NAME         Display name (default: agent name)"
    echo "  --description, -d DESC  Agent description"
    echo "  --lifetime, -l SECS     Token lifetime in seconds (default: 3600)"
    echo "  --help, -h              Show this help"
    echo ""
    echo "Examples:"
    echo "  # Register with an auth server"
    echo "  aid-register -a https://auth.23blocks.com/acme -t eyJ... -r 2"
    echo ""
    echo "  # Register with description and custom lifetime"
    echo "  aid-register -a https://auth.23blocks.com/acme -t eyJ... -r 2 \\"
    echo "    -d 'Handles file management' -l 7200"
    echo ""
    echo "  # Register with API key"
    echo "  aid-register -a https://auth.23blocks.com/acme -t eyJ... -r 2 \\"
    echo "    -k pk_live_sh_eb741284712fe153486b3698"
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --auth|-a)
            AUTH_URL="$2"
            shift 2
            ;;
        --token|-t)
            AUTH_TOKEN="$2"
            shift 2
            ;;
        --api-key|-k)
            API_KEY="$2"
            shift 2
            ;;
        --role-id|-r)
            ROLE_ID="$2"
            shift 2
            ;;
        --name|-n)
            AGENT_DISPLAY_NAME="$2"
            shift 2
            ;;
        --description|-d)
            DESCRIPTION="$2"
            shift 2
            ;;
        --lifetime|-l)
            TOKEN_LIFETIME="$2"
            shift 2
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            echo "Run 'aid-register --help' for usage." >&2
            exit 1
            ;;
    esac
done

# Validate required args
if [ -z "$AUTH_URL" ]; then
    echo "Error: --auth is required" >&2
    exit 1
fi

if [ -z "$AUTH_TOKEN" ]; then
    echo "Error: --token is required (admin JWT for authorization)" >&2
    exit 1
fi

if [ -z "$ROLE_ID" ]; then
    echo "Error: --role-id is required" >&2
    exit 1
fi

# =============================================================================
# Load Agent Identity
# =============================================================================

if ! is_initialized; then
    echo "Error: Agent identity not initialized." >&2
    echo "Run: aid-init --auto" >&2
    exit 1
fi

load_config

PUBLIC_KEY="${AMP_KEYS_DIR}/public.pem"

if [ ! -f "$PUBLIC_KEY" ]; then
    echo "Error: Public key not found at ${PUBLIC_KEY}" >&2
    exit 1
fi

PUBLIC_KEY_PEM=$(cat "$PUBLIC_KEY")
DISPLAY_NAME="${AGENT_DISPLAY_NAME:-$AMP_AGENT_NAME}"

# =============================================================================
# Build Registration Request
# =============================================================================

REGISTER_URL="${AUTH_URL}/agent_registrations"

REQUEST_BODY=$(jq -n \
    --arg name "$DISPLAY_NAME" \
    --arg amp_address "$AMP_ADDRESS" \
    --arg amp_fingerprint "$AMP_FINGERPRINT" \
    --arg amp_public_key "$PUBLIC_KEY_PEM" \
    --arg key_algorithm "Ed25519" \
    --argjson role_id "$ROLE_ID" \
    --arg description "$DESCRIPTION" \
    --argjson token_lifetime "$TOKEN_LIFETIME" \
    '{
        agent_registration: {
            name: $name,
            amp_address: $amp_address,
            amp_fingerprint: $amp_fingerprint,
            amp_public_key: $amp_public_key,
            key_algorithm: $key_algorithm,
            role_id: $role_id,
            description: $description,
            token_lifetime: $token_lifetime
        }
    }')

# =============================================================================
# Send Registration Request
# =============================================================================

echo "Registering agent with auth server..."
echo "  Agent:    ${AMP_ADDRESS}"
echo "  Auth:     ${AUTH_URL}"
echo "  Role ID:  ${ROLE_ID}"
echo ""

# Build curl headers
CURL_HEADERS=(
    -H "Authorization: Bearer ${AUTH_TOKEN}"
    -H "Content-Type: application/json"
)

if [ -n "$API_KEY" ]; then
    CURL_HEADERS+=(-H "X-Api-Key: ${API_KEY}")
fi

HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "$REGISTER_URL" \
    "${CURL_HEADERS[@]}" \
    -d "$REQUEST_BODY" \
    --connect-timeout 10 \
    --max-time 30 \
    2>/dev/null) || {
    echo "Error: Failed to connect to auth server at ${REGISTER_URL}" >&2
    exit 1
}

# Split response
HTTP_BODY=$(echo "$HTTP_RESPONSE" | sed '$d')
HTTP_STATUS=$(echo "$HTTP_RESPONSE" | tail -1)

# =============================================================================
# Handle Response
# =============================================================================

if [ "$HTTP_STATUS" = "201" ]; then
    UNIQUE_ID=$(echo "$HTTP_BODY" | jq -r '.data.id // .data.attributes.unique_id // "?"')
    REG_NAME=$(echo "$HTTP_BODY" | jq -r '.data.attributes.name // "?"')
    REG_STATUS=$(echo "$HTTP_BODY" | jq -r '.data.attributes.status // "?"')

    # Save registration info locally
    AID_REG_DIR="${AMP_DIR}/api_registrations"
    mkdir -p "$AID_REG_DIR"

    AUTH_HOST=$(echo "$AUTH_URL" | sed 's|https\?://||' | cut -d/ -f1)
    REG_FILE="${AID_REG_DIR}/${AUTH_HOST}.json"

    jq -n \
        --arg auth_server "$AUTH_URL" \
        --arg unique_id "$UNIQUE_ID" \
        --arg name "$REG_NAME" \
        --arg status "$REG_STATUS" \
        --arg registered_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --argjson role_id "$ROLE_ID" \
        '{
            auth_server: $auth_server,
            agent_unique_id: $unique_id,
            name: $name,
            status: $status,
            role_id: $role_id,
            registered_at: $registered_at
        }' > "$REG_FILE"
    chmod 600 "$REG_FILE"

    echo "✅ Agent registered successfully"
    echo ""
    echo "  Unique ID:  ${UNIQUE_ID}"
    echo "  Name:       ${REG_NAME}"
    echo "  Status:     ${REG_STATUS}"
    echo "  Auth:       ${AUTH_URL}"
    echo ""
    echo "  Registration saved to: ${REG_FILE}"
    echo ""
    echo "  Next step: Request a token with:"
    echo "    aid-token --auth ${AUTH_URL}"

elif [ "$HTTP_STATUS" = "422" ]; then
    ERROR_DETAIL=$(echo "$HTTP_BODY" | jq -r '.errors[0].detail // .error // "Validation failed"' 2>/dev/null)
    echo "❌ Registration failed — validation error" >&2
    echo "" >&2
    echo "  Detail: ${ERROR_DETAIL}" >&2
    echo "" >&2

    if echo "$ERROR_DETAIL" | grep -qi "already"; then
        echo "  → This agent may already be registered with this auth server." >&2
        echo "    Use the admin API to check existing registrations." >&2
    fi
    exit 1

elif [ "$HTTP_STATUS" = "401" ] || [ "$HTTP_STATUS" = "403" ]; then
    echo "❌ Registration failed — authorization error (HTTP ${HTTP_STATUS})" >&2
    echo "" >&2
    echo "  Your admin token may be expired or lack the 'agent_registrations:write' scope." >&2
    exit 1

else
    ERROR=$(echo "$HTTP_BODY" | jq -r '.errors[0].detail // .error // "Unknown error"' 2>/dev/null)
    echo "❌ Registration failed (HTTP ${HTTP_STATUS})" >&2
    echo "" >&2
    echo "  Error: ${ERROR}" >&2
    exit 1
fi
