#!/bin/bash
# =============================================================================
# AMP Init - Initialize Agent Identity
# =============================================================================
#
# Sets up the agent's identity and cryptographic keys.
#
# Usage:
#   amp-init                     # Interactive mode
#   amp-init --auto              # Auto-detect name from environment
#   amp-init --name myagent      # Specify name directly
#   amp-init --name myagent --tenant mycompany
#
# =============================================================================

set -e

# Source helper functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/amp-helper.sh"

# Parse arguments
NAME=""
TENANT=""
AUTO_DETECT=false
FORCE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --name|-n)
            NAME="$2"
            shift 2
            ;;
        --tenant|-t)
            TENANT="$2"
            shift 2
            ;;
        --auto|-a)
            AUTO_DETECT=true
            shift
            ;;
        --force|-f)
            FORCE=true
            shift
            ;;
        --help|-h)
            echo "Usage: amp-init [options]"
            echo ""
            echo "Initialize your agent identity for the Agent Messaging Protocol."
            echo ""
            echo "Options:"
            echo "  --name, -n NAME      Agent name (e.g., backend-api)"
            echo "  --tenant, -t TENANT  Organization/tenant (auto-detected)"
            echo "  --auto, -a           Auto-detect name from environment"
            echo "  --force, -f          Overwrite existing configuration"
            echo "  --help, -h           Show this help"
            echo ""
            echo "Examples:"
            echo "  amp-init --auto                    # Auto-detect from environment"
            echo "  amp-init --name backend-api       # Set specific name"
            echo "  amp-init -n myagent               # Tenant auto-detected"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Run 'amp-init --help' for usage."
            exit 1
            ;;
    esac
done

# Get organization if not explicitly provided
if [ -z "$TENANT" ]; then
    echo "Detecting organization..."
    ORG=$(get_organization 2>/dev/null) || true

    if [ -n "$ORG" ] && [ "$ORG" != "default" ]; then
        TENANT="$ORG"
        echo "  Organization: ${TENANT}"
    else
        # Fallback to "default" for backward compatibility
        # This allows offline initialization and legacy setups
        TENANT="default"
        echo ""
        echo "⚠️  Note: Organization not configured."
        echo "   Using 'default' tenant for backward compatibility."
        echo ""
        echo "   For full mesh networking, configure your organization:"
        echo "   1. Open the dashboard at ${AMP_MAESTRO_URL:-http://localhost:23000}"
        echo "   2. Complete the organization setup"
        echo "   3. Run 'amp-init --force' to reinitialize"
        echo ""
    fi
fi

# Check if already initialized
if is_initialized && [ "$FORCE" != true ]; then
    load_config
    echo "AMP is already initialized."
    echo ""
    echo "  Agent: ${AMP_AGENT_NAME}"
    echo "  Address: ${AMP_ADDRESS}"
    echo "  Fingerprint: ${AMP_FINGERPRINT}"
    echo ""
    echo "Use --force to reinitialize (will generate new keys)."
    exit 0
fi

# Get name
if [ -z "$NAME" ]; then
    if [ "$AUTO_DETECT" = true ]; then
        NAME=$(detect_agent_name) || true
        if [ -z "$NAME" ]; then
            echo "Error: Cannot auto-detect agent name." >&2
            echo "Set CLAUDE_AGENT_NAME, run inside tmux, or use --name <name>." >&2
            exit 1
        fi
        echo "Auto-detected agent name: ${NAME}"
    else
        # Interactive mode
        echo "Agent Messaging Protocol - Setup"
        echo "================================"
        echo ""

        # Suggest a name
        SUGGESTED=$(detect_agent_name) || true
        if [ -n "$SUGGESTED" ]; then
            echo "Enter your agent name (or press Enter for '${SUGGESTED}'):"
        else
            echo "Enter your agent name:"
        fi
        read -r NAME
        if [ -z "$NAME" ] && [ -n "$SUGGESTED" ]; then
            NAME="$SUGGESTED"
        fi
        if [ -z "$NAME" ]; then
            echo "Error: Agent name is required."
            exit 1
        fi
    fi
fi

# Validate name
if [[ ! "$NAME" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]*$ ]]; then
    echo "Error: Invalid agent name '${NAME}'"
    echo "Name must start with alphanumeric and contain only letters, numbers, underscores, and hyphens (no dots)."
    exit 1
fi

# Normalize name to lowercase
NAME=$(echo "$NAME" | tr '[:upper:]' '[:lower:]')

echo ""
echo "Initializing AMP identity..."

# Handle --force re-init: preserve existing UUID if available
AGENT_UUID=""
if is_initialized && [ "$FORCE" = true ]; then
    EXISTING_UUID=$(jq -r '.agent.id // empty' "$AMP_CONFIG" 2>/dev/null)
    if [ -n "$EXISTING_UUID" ]; then
        AGENT_UUID="$EXISTING_UUID"
        echo "  Preserving existing agent ID: ${AGENT_UUID}"
    fi
fi

# Generate client-side UUID for new agents
if [ -z "$AGENT_UUID" ]; then
    AGENT_UUID=$(generate_uuid)
fi

# Set AMP_DIR to UUID-based path
AMP_DIR="${AMP_AGENTS_BASE}/${AGENT_UUID}"

# Re-derive all dependent paths (since AMP_DIR changed)
AMP_CONFIG="${AMP_DIR}/config.json"
AMP_KEYS_DIR="${AMP_DIR}/keys"
AMP_MESSAGES_DIR="${AMP_DIR}/messages"
AMP_INBOX_DIR="${AMP_MESSAGES_DIR}/inbox"
AMP_SENT_DIR="${AMP_MESSAGES_DIR}/sent"
AMP_REGISTRATIONS_DIR="${AMP_DIR}/registrations"
AMP_ATTACHMENTS_DIR="${AMP_DIR}/attachments"

# Ensure directories exist
ensure_amp_dirs

# Generate keypair
ROTATION_MODE=false
if [ "$FORCE" = true ] && [ -f "${AMP_KEYS_DIR}/private.pem" ]; then
    # Existing keys found — generate to temp dir for rotation
    ROTATION_MODE=true
    TEMP_KEYS_DIR=$(mktemp -d)
    trap 'rm -rf "$TEMP_KEYS_DIR"' EXIT
    echo "  Generating new Ed25519 keypair (rotation mode)..."
    FINGERPRINT=$(generate_keypair_to "$TEMP_KEYS_DIR")
else
    echo "  Generating Ed25519 keypair..."
    FINGERPRINT=$(generate_keypair)
fi

# =============================================================================
# Verify fingerprint uniqueness across all local agents
# =============================================================================
# Two agents sharing a keypair is a security violation: either can forge
# messages as the other, and revoking one key silently revokes both.
INDEX_FILE="${AMP_AGENTS_BASE}/.index.json"
if [ -f "$INDEX_FILE" ]; then
    while IFS= read -r _entry; do
        _existing_name=$(echo "$_entry" | jq -r '.key')
        _existing_uuid=$(echo "$_entry" | jq -r '.value')
        # Skip self (--force re-init)
        [ "$_existing_uuid" = "$AGENT_UUID" ] && continue
        _existing_cfg="${AMP_AGENTS_BASE}/${_existing_uuid}/config.json"
        if [ -f "$_existing_cfg" ]; then
            _existing_fp=$(jq -r '.agent.fingerprint // empty' "$_existing_cfg" 2>/dev/null)
            if [ -n "$_existing_fp" ] && [ "$_existing_fp" = "$FINGERPRINT" ]; then
                echo "" >&2
                echo "Error: Generated keypair has the same fingerprint as existing agent '${_existing_name}'." >&2
                echo "  Fingerprint: ${FINGERPRINT}" >&2
                echo "  Existing UUID: ${_existing_uuid}" >&2
                echo "" >&2
                echo "This should never happen with proper key generation." >&2
                echo "If you copied keys from another agent, generate fresh ones with: amp-init --force" >&2
                # Clean up the directory we just created if it's new
                if [ ! -f "${AMP_DIR}/config.json" ]; then
                    rm -rf "$AMP_DIR"
                fi
                exit 1
            fi
        fi
    done < <(jq -c 'to_entries[]' "$INDEX_FILE" 2>/dev/null)
fi

# Save configuration
echo "  Saving configuration..."
ADDRESS=$(save_config "$NAME" "$TENANT" "$FINGERPRINT" "$AGENT_UUID")

# Create IDENTITY.md for agent context recovery
echo "  Creating identity file..."
IDENTITY_FILE=$(create_identity_file "$NAME" "$TENANT" "$ADDRESS" "$FINGERPRINT")

# =============================================================================
# Auto-register AMP identity / rotate keys with providers
# =============================================================================
_DO_FRESH_REGISTRATION=false
REGISTRATION_OK=false

if [ "$ROTATION_MODE" = true ]; then
    # === KEY ROTATION PATH ===
    echo "  Rotating keys with providers..."
    NEW_PUBLIC_KEY_PEM=$(cat "${TEMP_KEYS_DIR}/public.pem")
    OLD_PRIVATE_KEY="${AMP_KEYS_DIR}/private.pem"

    # Create proof: sign new public key PEM with OLD private key
    PROOF_TMP=$(mktemp); PROOF_SIG_TMP=$(mktemp)
    trap 'rm -rf "$TEMP_KEYS_DIR" "$PROOF_TMP" "$PROOF_SIG_TMP"' EXIT
    printf '%s' "$NEW_PUBLIC_KEY_PEM" > "$PROOF_TMP"

    PROOF=""
    if $OPENSSL_BIN pkeyutl -sign -inkey "$OLD_PRIVATE_KEY" -rawin \
        -in "$PROOF_TMP" -out "$PROOF_SIG_TMP" 2>/dev/null; then
        PROOF=$(base64 < "$PROOF_SIG_TMP" | tr -d '\n')
    fi

    ROTATION_FAILED=false

    if [ -n "$PROOF" ]; then
        for reg_file in "${AMP_REGISTRATIONS_DIR}"/*.json; do
            [ -f "$reg_file" ] || continue
            REG_API_KEY=$(jq -r '.apiKey // empty' "$reg_file" 2>/dev/null)
            REG_API_URL=$(jq -r '.apiUrl // empty' "$reg_file" 2>/dev/null)
            REG_PROVIDER=$(jq -r '.provider // empty' "$reg_file" 2>/dev/null)
            [ -z "$REG_API_KEY" ] || [ -z "$REG_API_URL" ] && continue

            echo "  Rotating keys with ${REG_PROVIDER}..."
            ROTATE_REQUEST=$(jq -n \
                --arg newKey "$NEW_PUBLIC_KEY_PEM" \
                --arg proof "$PROOF" \
                '{ new_public_key: $newKey, key_algorithm: "Ed25519", proof: $proof }')

            ROTATE_RESPONSE=$(curl -s -w "\n%{http_code}" --connect-timeout 5 -X POST \
                "${REG_API_URL}/auth/rotate-keys" \
                -H "Authorization: Bearer ${REG_API_KEY}" \
                -H "Content-Type: application/json" \
                -d "$ROTATE_REQUEST" 2>&1) || true

            ROTATE_HTTP=$(echo "$ROTATE_RESPONSE" | tail -n1)
            ROTATE_BODY=$(echo "$ROTATE_RESPONSE" | sed '$d')

            if [ "$ROTATE_HTTP" = "200" ] || [ "$ROTATE_HTTP" = "201" ]; then
                NEW_API_KEY=$(echo "$ROTATE_BODY" | jq -r '.api_key // empty')
                if [ -n "$NEW_API_KEY" ]; then
                    jq --arg fp "$FINGERPRINT" --arg key "$NEW_API_KEY" \
                        '.fingerprint = $fp | .apiKey = $key' "$reg_file" > "${reg_file}.tmp" \
                        && mv "${reg_file}.tmp" "$reg_file"
                else
                    jq --arg fp "$FINGERPRINT" '.fingerprint = $fp' "$reg_file" > "${reg_file}.tmp" \
                        && mv "${reg_file}.tmp" "$reg_file"
                fi
                chmod 600 "$reg_file"
                echo "  ✅ Keys rotated with ${REG_PROVIDER}"
                REGISTRATION_OK=true
            elif [ "$ROTATE_HTTP" = "000" ] || [ -z "$ROTATE_HTTP" ]; then
                echo "  ⚠️  ${REG_PROVIDER} not reachable — skipping"
                ROTATION_FAILED=true
            else
                ROTATE_ERROR=$(echo "$ROTATE_BODY" | jq -r '.message // .error // "Unknown"' 2>/dev/null)
                echo "  ⚠️  Rotation failed with ${REG_PROVIDER} (HTTP ${ROTATE_HTTP}): ${ROTATE_ERROR}"
                ROTATION_FAILED=true
            fi
        done
    else
        echo "  ⚠️  Could not create rotation proof (signing failed)"
        ROTATION_FAILED=true
    fi

    if [ "$ROTATION_FAILED" = true ]; then
        echo ""
        echo "  ⚠️  Some providers could not rotate keys."
        echo "     Provider registrations may be stale. Re-register with: amp-register.sh"
    fi

    # Swap new keys into place
    cp "${TEMP_KEYS_DIR}/private.pem" "${AMP_KEYS_DIR}/private.pem"
    chmod 600 "${AMP_KEYS_DIR}/private.pem"
    cp "${TEMP_KEYS_DIR}/public.pem" "${AMP_KEYS_DIR}/public.pem"
    chmod 644 "${AMP_KEYS_DIR}/public.pem"

    # If no registrations existed, try fresh registration
    if ! ls "${AMP_REGISTRATIONS_DIR}"/*.json &>/dev/null; then
        _DO_FRESH_REGISTRATION=true
    fi
else
    _DO_FRESH_REGISTRATION=true
fi

if [ "$_DO_FRESH_REGISTRATION" = true ]; then
    # === FRESH REGISTRATION ===
    echo "  Registering AMP identity..."

    # Get the PEM-encoded public key
    PUBLIC_KEY_PEM=$(cat "${AMP_KEYS_DIR}/public.pem")

    # Build registration request
    REG_REQUEST=$(jq -n \
        --arg name "$NAME" \
        --arg tenant "$TENANT" \
        --arg publicKey "$PUBLIC_KEY_PEM" \
        --arg agentId "$AGENT_UUID" \
        '{
            name: $name,
            tenant: $tenant,
            public_key: $publicKey,
            key_algorithm: "Ed25519",
            agent_id: $agentId
        }')

    # Try to register with local AI Maestro
    REG_RESPONSE=$(curl -s -w "\n%{http_code}" --connect-timeout 3 -X POST \
        "${AMP_MAESTRO_URL}/api/v1/register" \
        -H "Content-Type: application/json" \
        -d "$REG_REQUEST" 2>&1) || true

    REG_HTTP_CODE=$(echo "$REG_RESPONSE" | tail -n1)
    REG_BODY=$(echo "$REG_RESPONSE" | sed '$d')

    if [ "$REG_HTTP_CODE" = "200" ] || [ "$REG_HTTP_CODE" = "201" ]; then
        # Parse registration response
        REG_API_KEY=$(echo "$REG_BODY" | jq -r '.api_key // empty')
        REG_ADDRESS=$(echo "$REG_BODY" | jq -r '.address // empty')
        REG_AGENT_ID=$(echo "$REG_BODY" | jq -r '.agent_id // empty')
        REG_PROVIDER_NAME=$(echo "$REG_BODY" | jq -r '.provider.name // "aimaestro.local"')
        REG_PROVIDER_ENDPOINT=$(echo "$REG_BODY" | jq -r '.provider.endpoint // empty')

        if [ -n "$REG_API_KEY" ]; then
            # Save registration file
            ensure_amp_dirs
            REG_FILE="${AMP_REGISTRATIONS_DIR}/${REG_PROVIDER_NAME}.json"

            jq -n \
                --arg provider "$REG_PROVIDER_NAME" \
                --arg apiUrl "${REG_PROVIDER_ENDPOINT:-${AMP_MAESTRO_URL}/api/v1}" \
                --arg agentName "$NAME" \
                --arg tenant "$TENANT" \
                --arg address "${REG_ADDRESS:-$ADDRESS}" \
                --arg apiKey "$REG_API_KEY" \
                --arg providerAgentId "$REG_AGENT_ID" \
                --arg fingerprint "$FINGERPRINT" \
                --arg registeredAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
                '{
                    provider: $provider,
                    apiUrl: $apiUrl,
                    agentName: $agentName,
                    tenant: $tenant,
                    address: $address,
                    apiKey: $apiKey,
                    providerAgentId: $providerAgentId,
                    fingerprint: $fingerprint,
                    registeredAt: $registeredAt
                }' > "$REG_FILE"

            chmod 600 "$REG_FILE"
            REGISTRATION_OK=true
            echo "  ✅ AMP identity registered (cross-host routing enabled)"
        else
            echo "  ⚠️  AMP registration succeeded but no API key returned"
        fi

    elif [ "$REG_HTTP_CODE" = "409" ]; then
        # Agent name already registered - this is fine (re-init scenario)
        echo "  ℹ️  AMP identity already registered"
        # Check if we already have a registration file
        for reg_file in "${AMP_REGISTRATIONS_DIR}"/*.json; do
            [ -f "$reg_file" ] || continue
            provider=$(jq -r '.provider // empty' "$reg_file" 2>/dev/null)
            if [[ "$provider" == *"aimaestro"* ]] || [[ "$provider" == *".local"* ]]; then
                REGISTRATION_OK=true
                break
            fi
        done

    elif [ "$REG_HTTP_CODE" = "000" ] || [ -z "$REG_HTTP_CODE" ]; then
        echo "  ⚠️  AMP provider not reachable at ${AMP_MAESTRO_URL}"
        echo "     Cross-host routing will not work until connected."
        echo "     Start the server and run: amp-init --force"

    else
        REG_ERROR=$(echo "$REG_BODY" | jq -r '.message // .error // "Unknown error"' 2>/dev/null)
        echo "  ⚠️  AMP registration failed (HTTP ${REG_HTTP_CODE}): ${REG_ERROR}"
        echo "     Local messaging works, but cross-host routing requires registration."
    fi
fi

# Update identity file with registration info
if [ "$REGISTRATION_OK" = true ]; then
    IDENTITY_FILE=$(create_identity_file "$NAME" "$TENANT" "$ADDRESS" "$FINGERPRINT")
fi

# =============================================================================
# Update .index.json for local agent discovery
# =============================================================================
# The index maps agent names to their directory names, enabling filesystem
# delivery between co-located agents. Without this entry, other local agents
# cannot discover this agent for direct message delivery.
AGENTS_BASE_DIR="${HOME}/.agent-messaging/agents"
INDEX_FILE="${AGENTS_BASE_DIR}/.index.json"

# Get the directory name (last component of AMP_DIR)
AGENT_DIR_NAME=$(basename "$AMP_DIR")

if [ -f "$INDEX_FILE" ]; then
    # Add or update this agent's entry
    jq --arg name "$NAME" --arg dir "$AGENT_DIR_NAME" '.[$name] = $dir' "$INDEX_FILE" > "${INDEX_FILE}.tmp" \
        && mv "${INDEX_FILE}.tmp" "$INDEX_FILE"
else
    # Create new index file
    jq -n --arg name "$NAME" --arg dir "$AGENT_DIR_NAME" '{($name): $dir}' > "$INDEX_FILE"
fi

echo ""
echo "✅ AMP initialized successfully!"
echo ""
echo "  Agent ID:    ${AGENT_UUID}"
echo "  Agent Name:  ${NAME}"
echo "  Tenant:      ${TENANT}"
echo "  Address:     ${ADDRESS}"
echo "  Fingerprint: ${FINGERPRINT}"
if [ "$REGISTRATION_OK" = true ]; then
    echo "  Mesh:        ✅ Enabled (AMP identity registered)"
else
    echo "  Mesh:        ❌ Not registered (filesystem delivery only)"
fi
echo ""
echo "Files created:"
echo "  Keys:     ${AMP_KEYS_DIR}/"
echo "  Config:   ${AMP_CONFIG}"
echo "  Identity: ${IDENTITY_FILE}"
echo ""
echo "Quick commands:"
echo "  amp-inbox.sh              # Check your inbox"
echo "  amp-send.sh <to> \"Subj\" \"Msg\"  # Send a message"
echo "  amp-status.sh             # Check your status"
echo ""
echo "For Claude Code agents:"
echo "  Your identity is persisted in: ${IDENTITY_FILE}"
echo "  Run 'cat ${IDENTITY_FILE}' to recover your identity after context reset."
echo ""
echo "Optional: Add to your project's CLAUDE.md:"
echo "  ## Agent Messaging"
echo "  This agent uses AMP. Identity: \`${ADDRESS}\`."
echo "  Run \`cat ~/.agent-messaging/IDENTITY.md\` for details."
