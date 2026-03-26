#!/bin/bash
# =============================================================================
# AID Token - Agent Identity
# =============================================================================
#
# Request an API token from a 23blocks Auth server using Agent Identity.
# The agent presents its Agent Identity + proof of possession and receives
# an RS256 JWT that works with any 23blocks API (or any JWT-validating API).
#
# Usage:
#   aid-token --auth https://auth.23blocks.com/acme
#   aid-token --auth https://auth.23blocks.com/acme --scope "files:read files:write"
#   aid-token --auth https://auth.23blocks.com/acme --json
#
# Prerequisites:
#   - Agent identity initialized (aid-init --auto)
#   - Agent registered with the auth server (aid-register)
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
SCOPE=""
OUTPUT_FORMAT="text"
NO_CACHE=false
QUIET=false

show_help() {
    echo "Usage: aid-token --auth <url> [options]"
    echo ""
    echo "Request an API token from a 23blocks Auth server using Agent Identity."
    echo ""
    echo "Required:"
    echo "  --auth, -a URL          Auth server URL (e.g., https://auth.23blocks.com/acme)"
    echo ""
    echo "Options:"
    echo "  --scope, -s SCOPES      Space-separated scopes (default: all registered scopes)"
    echo "  --json, -j              Output as JSON"
    echo "  --no-cache              Skip token cache, always request new token"
    echo "  --quiet, -q             Output only the access token (for piping)"
    echo "  --help, -h              Show this help"
    echo ""
    echo "Examples:"
    echo "  # Get token with all registered scopes"
    echo "  aid-token --auth https://auth.23blocks.com/acme"
    echo ""
    echo "  # Get token with specific scopes"
    echo "  aid-token -a https://auth.23blocks.com/acme -s 'files:read files:write'"
    echo ""
    echo "  # Get just the token string (for scripts)"
    echo "  TOKEN=\$(aid-token -a https://auth.23blocks.com/acme -q)"
    echo "  curl -H \"Authorization: Bearer \$TOKEN\" https://files.23blocks.com/..."
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --auth|-a)
            AUTH_URL="$2"
            shift 2
            ;;
        --scope|-s)
            SCOPE="$2"
            shift 2
            ;;
        --json|-j)
            OUTPUT_FORMAT="json"
            shift
            ;;
        --no-cache)
            NO_CACHE=true
            shift
            ;;
        --quiet|-q)
            OUTPUT_FORMAT="quiet"
            shift
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            echo "Run 'aid-token --help' for usage." >&2
            exit 1
            ;;
    esac
done

if [ -z "$AUTH_URL" ]; then
    echo "Error: --auth is required" >&2
    echo "Run 'aid-token --help' for usage." >&2
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
require_openssl

PRIVATE_KEY="${AMP_KEYS_DIR}/private.pem"
PUBLIC_KEY="${AMP_KEYS_DIR}/public.pem"

if [ ! -f "$PRIVATE_KEY" ] || [ ! -f "$PUBLIC_KEY" ]; then
    echo "Error: Agent keys not found at ${AMP_KEYS_DIR}/" >&2
    exit 1
fi

# =============================================================================
# Token Cache
# =============================================================================

AID_CACHE_DIR="${AMP_DIR}/tokens"
mkdir -p "$AID_CACHE_DIR"

# Derive cache key from auth URL
cache_key_for_auth() {
    echo "$AUTH_URL" | shasum -a 256 | cut -c1-16
}

check_cache() {
    local cache_file="${AID_CACHE_DIR}/$(cache_key_for_auth).json"

    if [ ! -f "$cache_file" ]; then
        return 1
    fi

    local expires_at
    expires_at=$(jq -r '.expires_at // 0' "$cache_file" 2>/dev/null)
    local now
    now=$(date +%s)

    # Check if token is still valid (with 60-second buffer)
    if [ "$expires_at" -gt $((now + 60)) ] 2>/dev/null; then
        # Check if scope matches (if specific scope requested)
        if [ -n "$SCOPE" ]; then
            local cached_scope
            cached_scope=$(jq -r '.scope // ""' "$cache_file" 2>/dev/null)
            if [ "$cached_scope" != "$SCOPE" ]; then
                return 1
            fi
        fi
        cat "$cache_file"
        return 0
    fi

    # Expired — clean up
    rm -f "$cache_file"
    return 1
}

save_cache() {
    local response="$1"
    local cache_file="${AID_CACHE_DIR}/$(cache_key_for_auth).json"

    local expires_in
    expires_in=$(echo "$response" | jq -r '.expires_in // 3600')
    local expires_at
    expires_at=$(( $(date +%s) + expires_in ))

    echo "$response" | jq --arg ea "$expires_at" '. + {expires_at: ($ea | tonumber), auth_server: "'"$AUTH_URL"'"}' \
        > "$cache_file"
    chmod 600 "$cache_file"
}

# =============================================================================
# Check cache first
# =============================================================================

if [ "$NO_CACHE" = false ]; then
    cached_response=$(check_cache 2>/dev/null) || true
    if [ -n "$cached_response" ]; then
        case "$OUTPUT_FORMAT" in
            json)
                echo "$cached_response"
                ;;
            quiet)
                echo "$cached_response" | jq -r '.access_token'
                ;;
            *)
                echo "✅ Token (cached)"
                echo ""
                echo "  Auth:       ${AUTH_URL}"
                echo "  Scope:      $(echo "$cached_response" | jq -r '.scope // "all"')"
                echo "  Expires in: $(echo "$cached_response" | jq -r '.expires_in // "?"')s"
                echo "  Agent:      $(echo "$cached_response" | jq -r '.agent_address // "?"')"
                echo ""
                echo "  Access Token:"
                echo "  $(echo "$cached_response" | jq -r '.access_token')"
                ;;
        esac
        exit 0
    fi
fi

# =============================================================================
# Build Agent Identity
# =============================================================================

PUBLIC_KEY_PEM=$(cat "$PUBLIC_KEY")

AGENT_IDENTITY=$(jq -n \
    --arg version "1.0" \
    --arg address "$AMP_ADDRESS" \
    --arg alias "$AMP_AGENT_NAME" \
    --arg public_key "$PUBLIC_KEY_PEM" \
    --arg key_algorithm "Ed25519" \
    --arg fingerprint "$AMP_FINGERPRINT" \
    --arg issued_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg expires_at "$(date -u -v+6m +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '+6 months' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{
        aid_version: $version,
        address: $address,
        alias: $alias,
        public_key: $public_key,
        key_algorithm: $key_algorithm,
        fingerprint: $fingerprint,
        issued_at: $issued_at,
        expires_at: $expires_at
    }')

# Sign the Agent Identity (sign everything except the signature field itself)
IDENTITY_SIGNATURE=$(sign_message "$AGENT_IDENTITY")
if [ -z "$IDENTITY_SIGNATURE" ]; then
    echo "Error: Failed to sign Agent Identity" >&2
    exit 1
fi

# Add signature to identity (use urlsafe base64)
SIGNED_IDENTITY=$(echo "$AGENT_IDENTITY" | jq --arg sig "$IDENTITY_SIGNATURE" '. + {signature: $sig}')

# Base64url encode the signed identity
AGENT_IDENTITY_B64=$(echo -n "$SIGNED_IDENTITY" | base64 | tr '+/' '-_' | tr -d '=\n')

# =============================================================================
# Build Proof of Possession
# =============================================================================

TIMESTAMP=$(date +%s)

# The issuer is the auth server URL
AUTH_ISSUER="$AUTH_URL"

SIGN_INPUT="aid-token-exchange
${TIMESTAMP}
${AUTH_ISSUER}"

# Sign the proof
PROOF_SIGNATURE_B64=$(sign_message "$SIGN_INPUT")
if [ -z "$PROOF_SIGNATURE_B64" ]; then
    echo "Error: Failed to sign proof of possession" >&2
    exit 1
fi

# Proof = signature bytes + timestamp string, then base64url encode
# Decode signature from base64, append timestamp, re-encode as base64url
PROOF_B64=$(
    {
        echo -n "$PROOF_SIGNATURE_B64" | base64 -d
        echo -n "$TIMESTAMP"
    } | base64 | tr '+/' '-_' | tr -d '=\n'
)

# =============================================================================
# Token Request
# =============================================================================

# Build the OAuth token endpoint URL
TOKEN_URL="${AUTH_URL}/oauth/token"

# Build form body
FORM_DATA="grant_type=urn%3Aaid%3Aagent-identity&agent_identity=${AGENT_IDENTITY_B64}&proof=${PROOF_B64}"
if [ -n "$SCOPE" ]; then
    ENCODED_SCOPE=$(echo -n "$SCOPE" | jq -sRr @uri)
    FORM_DATA="${FORM_DATA}&scope=${ENCODED_SCOPE}"
fi

# Make the request
HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "$TOKEN_URL" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "$FORM_DATA" \
    --connect-timeout 10 \
    --max-time 30 \
    2>/dev/null) || {
    echo "Error: Failed to connect to auth server at ${TOKEN_URL}" >&2
    exit 1
}

# Split response body and HTTP status
HTTP_BODY=$(echo "$HTTP_RESPONSE" | sed '$d')
HTTP_STATUS=$(echo "$HTTP_RESPONSE" | tail -1)

# =============================================================================
# Handle Response
# =============================================================================

if [ "$HTTP_STATUS" = "200" ]; then
    # Cache the successful response
    save_cache "$HTTP_BODY"

    case "$OUTPUT_FORMAT" in
        json)
            echo "$HTTP_BODY" | jq --arg auth "$AUTH_URL" '. + {auth_server: $auth}'
            ;;
        quiet)
            echo "$HTTP_BODY" | jq -r '.access_token'
            ;;
        *)
            echo "✅ Token obtained"
            echo ""
            echo "  Auth:       ${AUTH_URL}"
            echo "  Scope:      $(echo "$HTTP_BODY" | jq -r '.scope // "all"')"
            echo "  Expires in: $(echo "$HTTP_BODY" | jq -r '.expires_in // "?"')s"
            echo "  Agent:      $(echo "$HTTP_BODY" | jq -r '.agent_address // "?"')"
            echo ""
            echo "  Access Token:"
            echo "  $(echo "$HTTP_BODY" | jq -r '.access_token')"
            ;;
    esac
    exit 0
else
    # Error response
    ERROR=$(echo "$HTTP_BODY" | jq -r '.error // "unknown_error"' 2>/dev/null)
    ERROR_DESC=$(echo "$HTTP_BODY" | jq -r '.error_description // "Unknown error"' 2>/dev/null)

    if [ "$OUTPUT_FORMAT" = "json" ]; then
        echo "$HTTP_BODY" | jq --arg status "$HTTP_STATUS" '. + {http_status: ($status | tonumber)}'
    elif [ "$OUTPUT_FORMAT" = "quiet" ]; then
        echo "Error: ${ERROR}" >&2
    else
        echo "❌ Token request failed (HTTP ${HTTP_STATUS})" >&2
        echo "" >&2
        echo "  Error:       ${ERROR}" >&2
        echo "  Description: ${ERROR_DESC}" >&2
        echo "" >&2

        case "$ERROR" in
            invalid_grant)
                echo "  → Agent Identity signature may be invalid or expired." >&2
                echo "    Check that your agent keys match the registration." >&2
                ;;
            invalid_proof)
                echo "  → Proof of possession failed. Check system clock sync." >&2
                ;;
            agent_not_registered)
                echo "  → This agent is not registered with the auth server." >&2
                echo "    Run: aid-register --auth ${AUTH_URL}" >&2
                ;;
            invalid_scope)
                echo "  → Requested scopes exceed your permissions." >&2
                echo "    Try without --scope to get all available scopes." >&2
                ;;
            agent_suspended)
                echo "  → This agent has been suspended. Contact the admin." >&2
                ;;
        esac
    fi
    exit 1
fi
