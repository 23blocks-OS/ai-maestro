#!/bin/bash
# =============================================================================
# AID Init — Initialize Agent Identity
# =============================================================================
#
# Create an Ed25519 identity for this agent. Generates a keypair and config
# at ~/.agent-messaging/agents/<name>/.
#
# If AMP is also installed, both protocols share the same identity directory.
# If AMP is not installed, AID works standalone.
#
# Usage:
#   aid-init --auto                  # Auto-detect name from environment
#   aid-init --name my-agent         # Specify agent name
#
# =============================================================================

set -e

# Source AID helper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/aid-helper.sh"

# =============================================================================
# Arguments
# =============================================================================

AGENT_NAME=""
AUTO_MODE=false
FORCE=false

show_help() {
    echo "Usage: aid-init [options]"
    echo ""
    echo "Initialize an Ed25519 identity for this agent."
    echo ""
    echo "Options:"
    echo "  --auto              Auto-detect agent name from environment"
    echo "  --name, -n NAME    Specify agent name"
    echo "  --force, -f        Overwrite existing identity"
    echo "  --help, -h         Show this help"
    echo ""
    echo "Examples:"
    echo "  aid-init --auto"
    echo "  aid-init --name support-agent"
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --auto)
            AUTO_MODE=true
            shift
            ;;
        --name|-n)
            AGENT_NAME="$2"
            shift 2
            ;;
        --force|-f)
            FORCE=true
            shift
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

# =============================================================================
# Resolve Agent Name
# =============================================================================

if [ "$AUTO_MODE" = true ] && [ -z "$AGENT_NAME" ]; then
    # Try environment variables
    if [ -n "${CLAUDE_AGENT_NAME:-}" ]; then
        AGENT_NAME="$CLAUDE_AGENT_NAME"
    elif [ -n "${TMUX:-}" ]; then
        AGENT_NAME=$(tmux display-message -p '#S' 2>/dev/null || true)
        AGENT_NAME="${AGENT_NAME%_[0-9]*}"
    fi

    # Fallback: hostname-based
    if [ -z "$AGENT_NAME" ]; then
        AGENT_NAME="agent-$(hostname -s 2>/dev/null | tr '[:upper:]' '[:lower:]' || echo 'default')"
    fi
fi

if [ -z "$AGENT_NAME" ]; then
    echo "Error: Agent name required. Use --name <name> or --auto" >&2
    exit 1
fi

# Sanitize name (lowercase, alphanumeric + hyphens)
AGENT_NAME=$(echo "$AGENT_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')

echo ""
echo "Initializing Agent Identity..."
echo "  Name: ${AGENT_NAME}"
echo ""

# =============================================================================
# Check Existing Identity
# =============================================================================

AGENT_DIR="${AID_AGENTS_BASE}/${AGENT_NAME}"

if [ -f "${AGENT_DIR}/config.json" ] && [ "$FORCE" != true ]; then
    echo "Agent identity already exists at ${AGENT_DIR}" >&2
    echo "" >&2
    echo "  Use --force to overwrite, or use the existing identity." >&2
    echo "  Current identity:" >&2
    echo "    Name:        $(jq -r '.agent.name // .name // "?"' "${AGENT_DIR}/config.json" 2>/dev/null)" >&2
    echo "    Address:     $(jq -r '.agent.address // .address // "?"' "${AGENT_DIR}/config.json" 2>/dev/null)" >&2
    echo "    Fingerprint: $(jq -r '.agent.fingerprint // .fingerprint // "?"' "${AGENT_DIR}/config.json" 2>/dev/null)" >&2
    exit 1
fi

# =============================================================================
# Generate Identity
# =============================================================================

require_openssl

mkdir -p "${AGENT_DIR}/keys"
mkdir -p "${AGENT_DIR}/api_registrations"
mkdir -p "${AGENT_DIR}/tokens"

echo "  Generating Ed25519 keypair..."
AMP_KEYS_DIR="${AGENT_DIR}/keys"
FINGERPRINT=$(generate_keypair "${AMP_KEYS_DIR}")

# Build address
TENANT="${AGENT_TENANT:-default}"
ADDRESS="${AGENT_NAME}@${TENANT}.local"

# Save config (compatible with AMP format)
jq -n \
    --arg name "$AGENT_NAME" \
    --arg tenant "$TENANT" \
    --arg address "$ADDRESS" \
    --arg fingerprint "$FINGERPRINT" \
    --arg created "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{
        version: "1.0",
        agent: {
            name: $name,
            tenant: $tenant,
            address: $address,
            fingerprint: $fingerprint,
            createdAt: $created
        }
    }' > "${AGENT_DIR}/config.json"

# Update index file for multi-agent resolution
INDEX_FILE="${AID_AGENTS_BASE}/.index.json"
if [ -f "$INDEX_FILE" ]; then
    jq --arg name "$AGENT_NAME" --arg dir "$AGENT_NAME" '. + {($name): $dir}' "$INDEX_FILE" > "${INDEX_FILE}.tmp"
    mv "${INDEX_FILE}.tmp" "$INDEX_FILE"
else
    jq -n --arg name "$AGENT_NAME" --arg dir "$AGENT_NAME" '{($name): $dir}' > "$INDEX_FILE"
fi

# Write human-readable identity file
cat > "${AGENT_DIR}/IDENTITY.md" <<EOF
# Agent Identity

- **Name**: ${AGENT_NAME}
- **Address**: ${ADDRESS}
- **Fingerprint**: ${FINGERPRINT}
- **Created**: $(date -u +%Y-%m-%dT%H:%M:%SZ)
- **Key Algorithm**: Ed25519

## Public Key

\`\`\`
$(cat "${AMP_KEYS_DIR}/public.pem")
\`\`\`
EOF

echo "  Identity created."
echo ""
echo "  Agent:       ${AGENT_NAME}"
echo "  Address:     ${ADDRESS}"
echo "  Fingerprint: ${FINGERPRINT}"
echo "  Directory:   ${AGENT_DIR}"
echo ""
echo "  Next steps:"
echo "    # Register with an auth server"
echo "    aid-register --auth https://auth.example.com/tenant \\"
echo "      --token <admin_jwt> --role-id 2"
echo ""
echo "    # Or check your identity"
echo "    aid-status"
