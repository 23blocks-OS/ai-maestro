#!/bin/bash
# =============================================================================
# AMP Register - Register with External Provider
# =============================================================================
#
# Register your agent with an external AMP provider (like Crabmail).
# This enables sending/receiving messages with agents on other providers.
#
# Usage:
#   amp-register --provider crabmail.ai --user-key uk_xxx
#   amp-register --provider crabmail.ai --user-key uk_xxx --name myagent
#
# For providers that don't require user key (legacy):
#   amp-register --provider myprovider.com --tenant mycompany
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

# Helper function to get API URL for known providers
get_provider_api() {
    local provider="$1"
    case "$provider" in
        crabmail.ai|crabmail) echo "https://api.crabmail.ai" ;;
        *) echo "" ;;
    esac
}

# Helper function to check if provider requires user key
provider_requires_user_key() {
    local provider="$1"
    case "$provider" in
        crabmail.ai|crabmail) return 0 ;;  # true
        *) return 1 ;;  # false
    esac
}

# Parse arguments
PROVIDER=""
TENANT=""
NAME=""
API_URL=""
USER_KEY=""
FORCE=false

show_help() {
    echo "Usage: amp-register --provider <provider> --user-key <key> [options]"
    echo ""
    echo "Register your agent with an external AMP provider."
    echo ""
    echo "Required:"
    echo "  --provider, -p PROVIDER   Provider domain (e.g., crabmail.ai)"
    echo ""
    echo "Authentication (one of):"
    echo "  --user-key, -k KEY        User Key from provider dashboard (e.g., uk_xxx)"
    echo "  --token TOKEN             Alias for --user-key"
    echo "  --tenant, -t TENANT       Organization name (legacy, for providers without user keys)"
    echo ""
    echo "Options:"
    echo "  --name, -n NAME           Agent name (default: from local config)"
    echo "  --api-url, -a URL         Custom API URL (for self-hosted providers)"
    echo "  --force, -f               Re-register even if already registered"
    echo "  --id UUID                 Operate as this agent (UUID from config.json)"
    echo "  --help, -h                Show this help"
    echo ""
    echo "Supported providers:"
    echo "  - crabmail.ai            Crabmail (requires --user-key)"
    echo ""
    echo "Examples:"
    echo "  # Register with Crabmail (get user key from dashboard)"
    echo "  amp-register --provider crabmail.ai --user-key uk_dXNyXzEyMzQ1"
    echo ""
    echo "  # Register with custom name"
    echo "  amp-register -p crabmail.ai -k uk_xxx -n backend-api"
    echo ""
    echo "  # Legacy: Provider without user key auth"
    echo "  amp-register -p myprovider.com -t mycompany"
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --provider|-p)
            PROVIDER="$2"
            shift 2
            ;;
        --tenant|-t)
            TENANT="$2"
            shift 2
            ;;
        --user-key|-k|--token)
            USER_KEY="$2"
            shift 2
            ;;
        --name|-n)
            NAME="$2"
            shift 2
            ;;
        --api-url|-a)
            API_URL="$2"
            shift 2
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
        *)
            echo "Unknown option: $1"
            echo "Run 'amp-register --help' for usage."
            exit 1
            ;;
    esac
done

# Validate required arguments
if [ -z "$PROVIDER" ]; then
    echo "Error: Provider required (--provider)"
    echo ""
    show_help
    exit 1
fi

# Normalize provider name for lookups
PROVIDER_LOWER=$(echo "$PROVIDER" | tr '[:upper:]' '[:lower:]')

# Check if provider requires user key
if provider_requires_user_key "$PROVIDER_LOWER"; then
    if [ -z "$USER_KEY" ]; then
        echo "Error: ${PROVIDER} requires a User Key for registration"
        echo ""
        echo "Get your User Key from the ${PROVIDER} dashboard, then run:"
        echo "  amp-register --provider ${PROVIDER} --user-key uk_xxx"
        echo ""
        exit 1
    fi
    # Validate user key format
    if [[ ! "$USER_KEY" =~ ^uk_ ]]; then
        echo "Error: Invalid User Key format. Expected: uk_xxx"
        exit 1
    fi
elif [ -z "$TENANT" ] && [ -z "$USER_KEY" ]; then
    echo "Error: Either --user-key or --tenant required"
    echo ""
    show_help
    exit 1
fi

# Require local initialization first
require_init

# Use local agent name if not specified
if [ -z "$NAME" ]; then
    NAME="$AMP_AGENT_NAME"
fi

# Get API URL (PROVIDER_LOWER already set above)
if [ -z "$API_URL" ]; then
    API_URL=$(get_provider_api "$PROVIDER_LOWER")
    if [ -z "$API_URL" ]; then
        # Assume standard API URL format
        API_URL="https://api.${PROVIDER_LOWER}"
    fi
fi

# Check if already registered
REG_FILE="${AMP_REGISTRATIONS_DIR}/${PROVIDER_LOWER}.json"
if [ -f "$REG_FILE" ] && [ "$FORCE" != true ]; then
    echo "Already registered with ${PROVIDER}"
    echo ""
    EXISTING=$(cat "$REG_FILE")
    echo "  Address: $(echo "$EXISTING" | jq -r '.address')"
    echo "  Registered: $(echo "$EXISTING" | jq -r '.registeredAt')"
    echo ""
    echo "Use --force to re-register."
    exit 0
fi

echo "Registering with ${PROVIDER}..."
echo ""
echo "  Provider: ${PROVIDER}"
echo "  API:      ${API_URL}"
if [ -n "$USER_KEY" ]; then
    echo "  Auth:     User Key (${USER_KEY:0:6}...)"
fi
if [ -n "$TENANT" ]; then
    echo "  Tenant:   ${TENANT}"
fi
echo "  Name:     ${NAME}"
echo ""

# Get public key
PUBLIC_KEY_HEX=$(get_public_key_hex)
if [ -z "$PUBLIC_KEY_HEX" ]; then
    echo "Error: Could not read public key"
    exit 1
fi

# Get PEM-encoded public key (API expects PEM, not hex)
PUBLIC_KEY_PEM=$(cat "${AMP_KEYS_DIR}/public.pem")

# Build registration request based on auth method
if [ -n "$USER_KEY" ]; then
    # User Key auth: tenant comes from the key, not the request
    REG_REQUEST=$(jq -n \
        --arg name "$NAME" \
        --arg publicKey "$PUBLIC_KEY_PEM" \
        '{
            name: $name,
            public_key: $publicKey,
            key_algorithm: "Ed25519"
        }')

    # Build auth header
    AUTH_HEADER="Authorization: Bearer ${USER_KEY}"
else
    # Legacy: tenant in request body
    REG_REQUEST=$(jq -n \
        --arg name "$NAME" \
        --arg tenant "$TENANT" \
        --arg publicKey "$PUBLIC_KEY_PEM" \
        '{
            name: $name,
            tenant: $tenant,
            public_key: $publicKey,
            key_algorithm: "Ed25519"
        }')

    AUTH_HEADER=""
fi

# Send registration request
echo "Sending registration request..."
if [ -n "$AUTH_HEADER" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/v1/register" \
        -H "Content-Type: application/json" \
        -H "$AUTH_HEADER" \
        -d "$REG_REQUEST" 2>&1)
else
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/v1/register" \
        -H "Content-Type: application/json" \
        -d "$REG_REQUEST" 2>&1)
fi

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Check response
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    # Parse response
    AGENT_ID=$(echo "$BODY" | jq -r '.agent_id // .agentId // empty')
    API_KEY=$(echo "$BODY" | jq -r '.api_key // .apiKey // empty')
    ADDRESS=$(echo "$BODY" | jq -r '.address // empty')
    SHORT_ADDRESS=$(echo "$BODY" | jq -r '.short_address // .shortAddress // empty')
    RESP_TENANT=$(echo "$BODY" | jq -r '.tenant // empty')

    if [ -z "$API_KEY" ]; then
        echo "Error: Provider did not return API key"
        echo "Response: $BODY"
        exit 1
    fi

    # Use tenant from response if available (for user key auth)
    if [ -n "$RESP_TENANT" ]; then
        TENANT="$RESP_TENANT"
    fi

    # Build external address if not returned
    if [ -z "$ADDRESS" ]; then
        if [ -n "$TENANT" ]; then
            ADDRESS="${NAME}@${TENANT}.${PROVIDER_LOWER}"
        else
            ADDRESS="${NAME}@${PROVIDER_LOWER}"
        fi
    fi

    # Extract route_url from provider response (if available)
    ROUTE_URL=$(echo "$BODY" | jq -r '.provider.route_url // empty')

    # Save registration
    ensure_amp_dirs

    jq -n \
        --arg provider "$PROVIDER_LOWER" \
        --arg apiUrl "$API_URL" \
        --arg routeUrl "$ROUTE_URL" \
        --arg agentName "$NAME" \
        --arg tenant "$TENANT" \
        --arg address "$ADDRESS" \
        --arg shortAddress "$SHORT_ADDRESS" \
        --arg apiKey "$API_KEY" \
        --arg providerAgentId "$AGENT_ID" \
        --arg fingerprint "$AMP_FINGERPRINT" \
        --arg registeredAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '{
            provider: $provider,
            apiUrl: $apiUrl,
            routeUrl: $routeUrl,
            agentName: $agentName,
            tenant: $tenant,
            address: $address,
            shortAddress: $shortAddress,
            apiKey: $apiKey,
            providerAgentId: $providerAgentId,
            fingerprint: $fingerprint,
            registeredAt: $registeredAt
        }' > "$REG_FILE"

    # Secure the registration file (contains API key)
    chmod 600 "$REG_FILE"

    # Update IDENTITY.md with new address
    echo "Updating identity file..."
    update_identity_file > /dev/null

    # Add AMP address to agent's collection via AI Maestro API (best-effort)
    MAESTRO_AGENT_ID=$(jq -r '.agent.id // empty' "$AMP_CONFIG" 2>/dev/null)
    AMP_MAESTRO_CALLBACK="${AMP_MAESTRO_URL:-}"
    if [ -n "$MAESTRO_AGENT_ID" ] && [ -n "$AMP_MAESTRO_CALLBACK" ]; then
        curl -s -X POST "${AMP_MAESTRO_CALLBACK}/api/agents/${MAESTRO_AGENT_ID}/amp/addresses" \
            -H "Content-Type: application/json" \
            -d "$(jq -n \
                --arg address "$ADDRESS" \
                --arg provider "$PROVIDER_LOWER" \
                --arg type "cloud" \
                --arg tenant "$TENANT" \
                '{address:$address,provider:$provider,type:$type,tenant:$tenant}')" \
            >/dev/null 2>&1 || true
    fi

    echo ""
    echo "✅ Registration successful!"
    echo ""
    echo "  External Address: ${ADDRESS}"
    echo "  Provider Agent ID: ${AGENT_ID:-N/A}"
    echo ""
    echo "Your identity file has been updated with this new address."
    echo "Run 'cat ${AMP_DIR}/IDENTITY.md' to see all your addresses."
    echo ""
    echo "You can now send and receive messages via ${PROVIDER}:"
    echo "  amp-send alice@acme.${PROVIDER_LOWER} \"Hello\" \"Message\""

elif [ "$HTTP_CODE" = "401" ]; then
    ERROR_MSG=$(echo "$BODY" | jq -r '.message // .error // "Unauthorized"' 2>/dev/null)
    echo "Error: Authentication failed - ${ERROR_MSG}"
    echo ""
    if [ -n "$USER_KEY" ]; then
        echo "Your User Key may be invalid or expired."
        echo "Get a new User Key from the ${PROVIDER} dashboard."
    else
        echo "This provider may require a User Key for registration."
        echo "Try: amp-register --provider ${PROVIDER} --user-key uk_xxx"
    fi
    exit 1

elif [ "$HTTP_CODE" = "403" ]; then
    ERROR_MSG=$(echo "$BODY" | jq -r '.message // .error // "Forbidden"' 2>/dev/null)
    echo "Error: Access denied - ${ERROR_MSG}"
    echo ""
    echo "This may mean:"
    echo "  - Your subscription is inactive"
    echo "  - You've reached your agent limit"
    echo "  - Your account needs verification"
    echo ""
    echo "Check your account at ${PROVIDER}"
    exit 1

elif [ "$HTTP_CODE" = "409" ]; then
    echo "Error: Agent already registered with this provider"
    echo ""
    echo "If you want to re-register, contact the provider to reset your registration,"
    echo "or use a different agent name."
    exit 1

elif [ "$HTTP_CODE" = "400" ]; then
    ERROR_MSG=$(echo "$BODY" | jq -r '.error // .message // "Bad request"' 2>/dev/null)
    echo "Error: Registration failed - ${ERROR_MSG}"
    exit 1

else
    echo "Error: Registration failed (HTTP ${HTTP_CODE})"
    ERROR_MSG=$(echo "$BODY" | jq -r '.error // .message // empty' 2>/dev/null)
    if [ -n "$ERROR_MSG" ]; then
        echo "  ${ERROR_MSG}"
    fi

    # Check if provider is reachable
    if [ "$HTTP_CODE" = "000" ]; then
        echo ""
        echo "Could not connect to ${API_URL}"
        echo "Check your internet connection and try again."
    fi

    exit 1
fi
