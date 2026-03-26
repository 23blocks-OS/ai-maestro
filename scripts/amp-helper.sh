#!/bin/bash
# =============================================================================
# AMP Helper Functions
# Agent Messaging Protocol - Core utilities for all AMP scripts
# =============================================================================
#
# This file provides common functions for:
# - Configuration management
# - Key generation and signing
# - Message creation and storage
# - Provider routing (local vs external)
#
# Storage: ~/.agent-messaging/
# =============================================================================

set -e

# Source security module
SCRIPT_DIR_HELPER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR_HELPER}/amp-security.sh" ]; then
    source "${SCRIPT_DIR_HELPER}/amp-security.sh"
fi

# =============================================================================
# OpenSSL Auto-Detection
# =============================================================================
# macOS ships with LibreSSL which doesn't support Ed25519.
# We auto-detect a compatible OpenSSL binary (Homebrew or system).

_detect_openssl() {
    # Homebrew paths (Intel Mac, Apple Silicon, Linux linuxbrew)
    local candidates=(
        "/usr/local/opt/openssl@3/bin/openssl"
        "/opt/homebrew/opt/openssl@3/bin/openssl"
        "/usr/local/opt/openssl/bin/openssl"
        "/opt/homebrew/opt/openssl/bin/openssl"
        "/home/linuxbrew/.linuxbrew/opt/openssl@3/bin/openssl"
    )

    # Quick check: if system openssl is OpenSSL 3.x+, Ed25519 is supported
    if command -v openssl &>/dev/null; then
        local ver
        ver=$(openssl version 2>/dev/null || true)
        if [[ "$ver" == OpenSSL\ 3.* ]] || [[ "$ver" == OpenSSL\ 1.1.1* ]]; then
            echo "openssl"
            return 0
        fi
    fi

    # Search Homebrew paths (check version string, not key generation)
    for candidate in "${candidates[@]}"; do
        if [ -x "$candidate" ]; then
            local ver
            ver=$("$candidate" version 2>/dev/null || true)
            if [[ "$ver" == OpenSSL\ 3.* ]] || [[ "$ver" == OpenSSL\ 1.1.1* ]]; then
                echo "$candidate"
                return 0
            fi
        fi
    done

    # Nothing found
    echo ""
    return 1
}

# Detect once and cache
OPENSSL_BIN=$(_detect_openssl)

OPENSSL_AVAILABLE=true
if [ -z "$OPENSSL_BIN" ]; then
    OPENSSL_AVAILABLE=false
    # Don't exit here - operations not requiring signing (inbox, status) can still work
fi

# Require OpenSSL for operations that need signing/verification
require_openssl() {
    if [ "$OPENSSL_AVAILABLE" != "true" ]; then
        echo "Error: No Ed25519-capable OpenSSL found." >&2
        echo "" >&2
        echo "macOS ships with LibreSSL which lacks Ed25519 support." >&2
        echo "Install OpenSSL 3 via Homebrew:" >&2
        echo "  brew install openssl@3" >&2
        echo "" >&2
        exit 1
    fi
}

# Configuration
#
# Per-Agent Isolation:
#   Each agent gets its own AMP directory at ~/.agent-messaging/agents/<uuid>/
#   with a name symlink: ~/.agent-messaging/agents/<name> -> <uuid>
#   This ensures inboxes, sent folders, keys, and config are completely isolated
#   and survive agent renames.
#
# Resolution order for AMP_DIR:
#   1. Explicit AMP_DIR env var (set by AI Maestro wake/create routes)
#   2. CLAUDE_AGENT_ID env var → ~/.agent-messaging/agents/<uuid>/
#   3. CLAUDE_AGENT_NAME env var → ~/.agent-messaging/agents/<name>/
#      (symlink resolves to UUID dir if migrated)
#   4. tmux session name → ~/.agent-messaging/agents/<name>/
#      If the directory doesn't exist, it is auto-created.
#
AMP_AGENTS_BASE="${HOME}/.agent-messaging/agents"

# Case-insensitive name-to-UUID lookup via .index.json
_index_lookup() {
    local name="$1"
    local index_file="${2:-${AMP_AGENTS_BASE}/.index.json}"
    [ -f "$index_file" ] || return 1
    local uuid
    uuid=$(jq -r --arg name "$name" '.[$name] // empty' "$index_file" 2>/dev/null)
    if [ -n "$uuid" ]; then echo "$uuid"; return 0; fi
    # Case-insensitive fallback (spec: "Addresses are case-insensitive")
    local lower_name
    lower_name=$(echo "$name" | tr '[:upper:]' '[:lower:]')
    uuid=$(jq -r --arg name "$lower_name" \
        'to_entries[] | select(.key | ascii_downcase == $name) | .value' \
        "$index_file" 2>/dev/null | head -1)
    if [ -n "$uuid" ]; then echo "$uuid"; return 0; fi
    return 1
}

if [ -z "${AMP_DIR:-}" ]; then
    _amp_resolved=false

    # Priority 1: AMP_DIR already set (AI Maestro sets this)
    # (handled by the outer if)

    # Priority 2: CLAUDE_AGENT_ID env var (UUID → direct directory)
    #   --id <uuid> sets this in pre-source parsing (see each script)
    if [ -n "${CLAUDE_AGENT_ID:-}" ]; then
        AMP_DIR="${AMP_AGENTS_BASE}/${CLAUDE_AGENT_ID}"
        _amp_resolved=true
    fi

    # Priority 3: CLAUDE_AGENT_NAME env var or tmux → index lookup
    if [ "$_amp_resolved" = false ]; then
        _amp_agent_name=""
        if [ -n "${CLAUDE_AGENT_NAME:-}" ]; then
            _amp_agent_name="${CLAUDE_AGENT_NAME}"
        elif [ -n "${TMUX:-}" ]; then
            _amp_agent_name=$(tmux display-message -p '#S' 2>/dev/null || true)
            _amp_agent_name="${_amp_agent_name%_[0-9]*}"
        fi

        if [ -n "$_amp_agent_name" ]; then
            _amp_uuid=$(_index_lookup "$_amp_agent_name" 2>/dev/null) || true
            if [ -n "$_amp_uuid" ]; then
                AMP_DIR="${AMP_AGENTS_BASE}/${_amp_uuid}"
            else
                # Fallback: legacy name-based dir (pre-migration)
                AMP_DIR="${AMP_AGENTS_BASE}/${_amp_agent_name}"
            fi
            _amp_resolved=true
        fi
        unset _amp_agent_name _amp_uuid
    fi

    # Priority 4: Single agent auto-select (convenience for solo setups)
    if [ "$_amp_resolved" = false ]; then
        _amp_index_file="${AMP_AGENTS_BASE}/.index.json"
        if [ -f "$_amp_index_file" ]; then
            _amp_count=$(jq 'length' "$_amp_index_file" 2>/dev/null || echo "0")
            if [ "$_amp_count" = "1" ]; then
                _amp_uuid=$(jq -r 'to_entries[0].value' "$_amp_index_file" 2>/dev/null)
                if [ -n "$_amp_uuid" ]; then
                    AMP_DIR="${AMP_AGENTS_BASE}/${_amp_uuid}"
                    _amp_resolved=true
                fi
            elif [ "$_amp_count" != "0" ]; then
                echo "Error: Multiple AMP agents found. Use --id <uuid>" >&2
                echo "" >&2
                echo "Available agents:" >&2
                while IFS= read -r _entry; do
                    _e_name=$(echo "$_entry" | jq -r '.key')
                    _e_uuid=$(echo "$_entry" | jq -r '.value')
                    _e_addr=""
                    _e_cfg="${AMP_AGENTS_BASE}/${_e_uuid}/config.json"
                    if [ -f "$_e_cfg" ]; then
                        _e_addr=$(jq -r '.agent.address // empty' "$_e_cfg" 2>/dev/null)
                    fi
                    if [ -n "$_e_addr" ]; then
                        printf "  %-45s %s\n" "$_e_addr" "$_e_uuid" >&2
                    else
                        printf "  %-45s %s\n" "$_e_name" "$_e_uuid" >&2
                    fi
                done < <(jq -c 'to_entries[]' "$_amp_index_file" 2>/dev/null)
                echo "" >&2
                echo "Example: amp-inbox.sh --id <uuid-from-above>" >&2
                exit 1
            fi
        fi
        unset _amp_index_file _amp_count _amp_uuid
    fi

    if [ "$_amp_resolved" = false ]; then
        echo "Error: AMP not initialized." >&2
        echo "Run: amp-init.sh --name <your-agent-name>" >&2
        exit 1
    fi
    unset _amp_resolved

    # Auto-create per-agent directory if it doesn't exist
    if [ ! -d "$AMP_DIR" ]; then
        mkdir -p "${AMP_DIR}/keys"
        mkdir -p "${AMP_DIR}/messages/inbox"
        mkdir -p "${AMP_DIR}/messages/sent"
        mkdir -p "${AMP_DIR}/registrations"
        chmod 700 "${AMP_DIR}/keys"
    fi
fi

AMP_CONFIG="${AMP_DIR}/config.json"
AMP_KEYS_DIR="${AMP_DIR}/keys"
AMP_MESSAGES_DIR="${AMP_DIR}/messages"
AMP_INBOX_DIR="${AMP_MESSAGES_DIR}/inbox"
AMP_SENT_DIR="${AMP_MESSAGES_DIR}/sent"
AMP_REGISTRATIONS_DIR="${AMP_DIR}/registrations"
AMP_ATTACHMENTS_DIR="${AMP_DIR}/attachments"

# Attachment limits
AMP_MAX_ATTACHMENT_SIZE="${AMP_MAX_ATTACHMENT_SIZE:-26214400}"  # 25 MB default
AMP_MAX_ATTACHMENTS="${AMP_MAX_ATTACHMENTS:-10}"
AMP_BLOCKED_MIME_TYPES=(
    # Executables (MUST block per spec)
    "application/x-executable"
    "application/x-msdos-program"
    "application/x-msdownload"
    "application/x-dosexec"
    "application/vnd.microsoft.portable-executable"
    "application/x-mach-o-executable"
    # Scripts (MUST block per spec)
    "application/x-sh"
    "application/x-shellscript"
    "application/x-csh"
    "application/x-perl"
    "application/x-python-code"
    "application/hta"
    "application/x-bat"
    # Packages with executable content (SHOULD block per spec)
    "application/java-archive"
    "application/vnd.apple.installer+xml"
    "application/x-rpm"
    "application/x-deb"
    "application/x-msi"
)
AMP_MAX_TOTAL_ATTACHMENT_SIZE="${AMP_MAX_TOTAL_ATTACHMENT_SIZE:-104857600}"  # 100 MB total

# AI Maestro connection
AMP_MAESTRO_URL="${AMP_MAESTRO_URL:-http://localhost:23000}"

# Provider domain (AMP v1)
AMP_PROVIDER_DOMAIN="${AMP_PROVIDER_DOMAIN:-aimaestro.local}"
AMP_LOCAL_DOMAIN="${AMP_PROVIDER_DOMAIN}"

# =============================================================================
# Directory Setup
# =============================================================================

ensure_amp_dirs() {
    mkdir -p "${AMP_DIR}"
    mkdir -p "${AMP_KEYS_DIR}"
    mkdir -p "${AMP_MESSAGES_DIR}/inbox"
    mkdir -p "${AMP_MESSAGES_DIR}/sent"
    mkdir -p "${AMP_REGISTRATIONS_DIR}"
    mkdir -p "${AMP_ATTACHMENTS_DIR}"

    # Secure permissions for keys and attachments directories
    chmod 700 "${AMP_KEYS_DIR}"
    chmod 700 "${AMP_ATTACHMENTS_DIR}"
}

# =============================================================================
# Organization (AI Maestro Integration)
# =============================================================================

# Get organization from AI Maestro
# Returns organization name or empty string if not set
# Falls back to "default" if AI Maestro is unreachable (for offline use)
get_organization() {
    local response
    local org

    # First check if we have a cached org in config
    if [ -f "${AMP_CONFIG}" ]; then
        local cached_tenant
        cached_tenant=$(jq -r '.agent.tenant // empty' "${AMP_CONFIG}" 2>/dev/null)
        if [ -n "$cached_tenant" ] && [ "$cached_tenant" != "default" ]; then
            echo "$cached_tenant"
            return 0
        fi
    fi

    # Try to fetch from AI Maestro
    response=$(curl -sf --connect-timeout 2 "${AMP_MAESTRO_URL}/api/organization" 2>/dev/null) || true

    if [ -n "$response" ]; then
        org=$(echo "$response" | jq -r '.organization // empty' 2>/dev/null)
        if [ -n "$org" ] && [ "$org" != "null" ]; then
            echo "$org"
            return 0
        fi
    fi

    # Fallback for offline use - return "default" instead of failing
    echo "default"
    return 0
}

# Check if organization is set in AI Maestro
is_organization_set() {
    local org
    org=$(get_organization 2>/dev/null)
    [ -n "$org" ]
}

# =============================================================================
# Identity File Management
# =============================================================================

# Create or update IDENTITY.md file
# This file helps agents rediscover their identity after context reset
# Supports multiple addresses across providers
create_identity_file() {
    local name="$1"
    local tenant="$2"
    local primary_address="$3"
    local fingerprint="$4"

    local identity_file="${AMP_DIR}/IDENTITY.md"
    local updated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    # Build addresses section - collect all registered addresses
    local addresses_section=""
    local all_addresses="${primary_address}"
    local provider_count=0

    # Start with primary/local address
    addresses_section="| **Local (AI Maestro)** | \`${primary_address}\` | Primary |"

    # Check for external provider registrations
    if [ -d "${AMP_REGISTRATIONS_DIR}" ]; then
        # Use find to avoid glob expansion issues when directory is empty
        while IFS= read -r reg_file; do
            [ -z "$reg_file" ] && continue
            if [ -f "$reg_file" ]; then
                local provider=$(jq -r '.provider // empty' "$reg_file" 2>/dev/null)
                local ext_address=$(jq -r '.address // empty' "$reg_file" 2>/dev/null)

                if [ -n "$ext_address" ] && [ -n "$provider" ]; then
                    provider_count=$((provider_count + 1))
                    addresses_section="${addresses_section}
| **${provider}** | \`${ext_address}\` | External |"
                    all_addresses="${all_addresses}, ${ext_address}"
                fi
            fi
        done < <(find "${AMP_REGISTRATIONS_DIR}" -maxdepth 1 -name "*.json" -type f 2>/dev/null)
    fi

    # Build a concise summary for CLAUDE.md
    local claude_md_snippet="This agent uses AMP. Primary: \`${primary_address}\`"
    if [ "$provider_count" -gt 0 ]; then
        claude_md_snippet="${claude_md_snippet} (+${provider_count} external)"
    fi

    cat > "${identity_file}" << EOF
# Agent Messaging Protocol (AMP) Identity

This agent is configured for inter-agent messaging using AMP.

## Core Identity

| Field | Value |
|-------|-------|
| **Name** | ${name} |
| **Tenant** | ${tenant} |
| **Fingerprint** | ${fingerprint} |
| **Last Updated** | ${updated_at} |

## My Addresses

You have **$((provider_count + 1)) address(es)** - use the appropriate one based on recipient:

| Provider | Address | Type |
|----------|---------|------|
${addresses_section}

**Which address to use:**
- Local address → for agents in your AI Maestro mesh
- External address → for agents on that specific provider

## Files Location

| File | Path |
|------|------|
| Identity File | ${identity_file} |
| Private Key | ${AMP_KEYS_DIR}/private.pem |
| Public Key | ${AMP_KEYS_DIR}/public.pem |
| Config | ${AMP_CONFIG} |
| Registrations | ${AMP_REGISTRATIONS_DIR}/ |
| Inbox | ${AMP_INBOX_DIR}/ |
| Sent | ${AMP_SENT_DIR}/ |

## Quick Commands

\`\`\`bash
# Check your identity (run this first!)
amp-identity.sh

# Check your inbox
amp-inbox.sh

# Send a message (local)
amp-send.sh alice "Subject" "Message body"

# Send a message (external - uses your external address automatically)
amp-send.sh bob@acme.crabmail.ai "Subject" "Message body"

# Read a specific message
amp-read.sh <message-id>

# Reply to a message
amp-reply.sh <message-id> "Reply message"

# Check full status
amp-status.sh

# Register with new provider
amp-register.sh --provider crabmail.ai --tenant ${tenant}
\`\`\`

## For Claude Code Agents

If you are a Claude Code agent and want to persist your AMP identity in your project,
you can add the following line to your project's CLAUDE.md:

\`\`\`markdown
## Agent Messaging
${claude_md_snippet}
Run \`cat ~/.agent-messaging/IDENTITY.md\` for details or use the \`agent-messaging\` skill.
\`\`\`

## Skill Usage

Use natural language with the \`agent-messaging\` skill:
- "Check my messages"
- "Send a message to alice about the deployment"
- "Reply to the last message"
- "What's my AMP identity?"

---
*Generated by AMP on ${updated_at}*
*Addresses: ${all_addresses}*
EOF

    chmod 644 "${identity_file}"
    echo "${identity_file}"
}

# Update IDENTITY.md after registration changes
# Call this after amp-register to refresh the file
update_identity_file() {
    if ! is_initialized; then
        return 1
    fi

    load_config

    create_identity_file "$AMP_AGENT_NAME" "$AMP_TENANT" "$AMP_ADDRESS" "$AMP_FINGERPRINT"
}

# Read identity from config.json and registrations
# Returns identity info as JSON including all addresses
get_identity() {
    # First try config.json (authoritative)
    if [ -f "${AMP_CONFIG}" ]; then
        local name=$(jq -r '.agent.name // empty' "${AMP_CONFIG}" 2>/dev/null)
        local tenant=$(jq -r '.agent.tenant // empty' "${AMP_CONFIG}" 2>/dev/null)
        local address=$(jq -r '.agent.address // empty' "${AMP_CONFIG}" 2>/dev/null)
        local fingerprint=$(jq -r '.agent.fingerprint // empty' "${AMP_CONFIG}" 2>/dev/null)

        if [ -n "$name" ]; then
            # Build addresses array with primary
            local addresses_json="[{\"provider\": \"local\", \"address\": \"${address}\", \"type\": \"primary\"}]"

            # Add external addresses from registrations
            if [ -d "${AMP_REGISTRATIONS_DIR}" ]; then
                while IFS= read -r reg_file; do
                    [ -z "$reg_file" ] && continue
                    if [ -f "$reg_file" ]; then
                        local provider=$(jq -r '.provider // empty' "$reg_file" 2>/dev/null)
                        local ext_address=$(jq -r '.address // empty' "$reg_file" 2>/dev/null)

                        if [ -n "$ext_address" ] && [ -n "$provider" ]; then
                            addresses_json=$(echo "$addresses_json" | jq \
                                --arg provider "$provider" \
                                --arg address "$ext_address" \
                                '. + [{provider: $provider, address: $address, type: "external"}]')
                        fi
                    fi
                done < <(find "${AMP_REGISTRATIONS_DIR}" -maxdepth 1 -name "*.json" -type f 2>/dev/null)
            fi

            jq -n \
                --arg name "$name" \
                --arg tenant "$tenant" \
                --arg primary_address "$address" \
                --arg fingerprint "$fingerprint" \
                --arg config_path "${AMP_CONFIG}" \
                --arg identity_path "${AMP_DIR}/IDENTITY.md" \
                --arg keys_dir "${AMP_KEYS_DIR}" \
                --argjson addresses "$addresses_json" \
                '{
                    initialized: true,
                    name: $name,
                    tenant: $tenant,
                    fingerprint: $fingerprint,
                    primary_address: $primary_address,
                    addresses: $addresses,
                    address_count: ($addresses | length),
                    paths: {
                        config: $config_path,
                        identity: $identity_path,
                        keys: $keys_dir
                    }
                }'
            return 0
        fi
    fi

    # Not initialized
    jq -n '{initialized: false, message: "AMP not initialized. Run: amp-init --auto"}'
    return 1
}

# Check identity and print summary (for agent context recovery)
check_identity() {
    local format="${1:-text}"  # text or json

    if ! is_initialized; then
        if [ "$format" = "json" ]; then
            echo '{"initialized": false, "message": "AMP not initialized. Run: amp-init --auto"}'
        else
            echo "❌ AMP not initialized"
            echo ""
            echo "Run 'amp-init --auto' to set up your agent identity."
        fi
        return 1
    fi

    load_config

    if [ "$format" = "json" ]; then
        get_identity
    else
        echo "✅ AMP Identity Verified"
        echo ""
        echo "  Name:        ${AMP_AGENT_NAME}"
        echo "  Tenant:      ${AMP_TENANT}"
        echo "  Fingerprint: ${AMP_FINGERPRINT}"
        echo ""
        echo "  Addresses:"
        echo "    Local:     ${AMP_ADDRESS}"

        # Show external addresses
        local ext_count=0
        if [ -d "${AMP_REGISTRATIONS_DIR}" ]; then
            while IFS= read -r reg_file; do
                [ -z "$reg_file" ] && continue
                if [ -f "$reg_file" ]; then
                    local provider=$(jq -r '.provider // empty' "$reg_file" 2>/dev/null)
                    local ext_address=$(jq -r '.address // empty' "$reg_file" 2>/dev/null)

                    if [ -n "$ext_address" ] && [ -n "$provider" ]; then
                        printf "    %-10s %s\n" "${provider}:" "${ext_address}"
                        ext_count=$((ext_count + 1))
                    fi
                fi
            done < <(find "${AMP_REGISTRATIONS_DIR}" -maxdepth 1 -name "*.json" -type f 2>/dev/null)
        fi

        echo ""
        echo "  Identity file: ${AMP_DIR}/IDENTITY.md"

        if [ "$ext_count" -eq 0 ]; then
            echo ""
            echo "  Tip: Register with external providers to message agents globally:"
            echo "       amp-register.sh --provider crabmail.ai --tenant ${AMP_TENANT}"
        fi

        echo ""
        echo "Commands: amp-inbox.sh | amp-send.sh | amp-status.sh"
    fi
    return 0
}

# Get organization or fail with helpful message
require_organization() {
    local org
    org=$(get_organization 2>/dev/null)

    if [ -z "$org" ]; then
        echo "Error: Organization not configured in AI Maestro." >&2
        echo "" >&2
        echo "Before using AMP, you must configure your organization:" >&2
        echo "  1. Open AI Maestro at ${AMP_MAESTRO_URL}" >&2
        echo "  2. Complete the organization setup" >&2
        echo "" >&2
        return 1
    fi

    echo "$org"
}

# =============================================================================
# Configuration
# =============================================================================

# Load or create config
load_config() {
    if [ ! -f "${AMP_CONFIG}" ]; then
        return 1
    fi

    # Validate config has expected structure before loading (SEC-05)
    local _has_agent
    _has_agent=$(jq -r 'has("agent")' "${AMP_CONFIG}" 2>/dev/null)
    if [ "$_has_agent" != "true" ]; then
        echo "Warning: Config file missing 'agent' object, skipping auto-fix" >&2
        return 1
    fi

    # Export config values
    AMP_AGENT_NAME=$(jq -r '.agent.name // empty' "${AMP_CONFIG}" 2>/dev/null)
    AMP_TENANT=$(jq -r '.agent.tenant // "default"' "${AMP_CONFIG}" 2>/dev/null)
    AMP_ADDRESS=$(jq -r '.agent.address // empty' "${AMP_CONFIG}" 2>/dev/null)
    AMP_FINGERPRINT=$(jq -r '.agent.fingerprint // empty' "${AMP_CONFIG}" 2>/dev/null)

    if [ -z "${AMP_AGENT_NAME}" ]; then
        return 1
    fi

    # ── Name & address mismatch detection ──
    # If the config name OR address doesn't match the expected agent name,
    # the config was likely poisoned by a bad amp-init (e.g. git repo name
    # fallback). Auto-fix: update the config to match the authoritative name.
    #
    # The expected name comes from (in priority order):
    #   1. CLAUDE_AGENT_NAME env var (set by AI Maestro)
    #   2. Directory basename (only if it's NOT a UUID — UUID dirs are stable,
    #      the name lives in config.json)
    local _expected_name _addr_local_part _needs_fix=false
    _expected_name=""

    # If CLAUDE_AGENT_NAME is set, it's authoritative
    if [ -n "${CLAUDE_AGENT_NAME:-}" ]; then
        _expected_name="${CLAUDE_AGENT_NAME}"
    else
        # Use directory basename only if it doesn't look like a UUID
        local _dir_basename
        _dir_basename=$(basename "$AMP_DIR")
        if [[ ! "$_dir_basename" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
            _expected_name="$_dir_basename"
        fi
    fi

    _addr_local_part="${AMP_ADDRESS%%@*}"

    if [ -n "$_expected_name" ]; then
        if [ "$AMP_AGENT_NAME" != "$_expected_name" ]; then
            echo "  ⚠️  AMP name mismatch: config='${AMP_AGENT_NAME}' expected='${_expected_name}'" >&2
            _needs_fix=true
        elif [ "$_addr_local_part" != "$_expected_name" ]; then
            echo "  ⚠️  AMP address mismatch: address='${AMP_ADDRESS}' expected='${_expected_name}@...'" >&2
            _needs_fix=true
        fi

        if [ "$_needs_fix" = true ]; then
            echo "  Auto-fixing config to match agent identity..." >&2
            local _new_address
            _new_address=$(save_config "$_expected_name" "$AMP_TENANT" "$AMP_FINGERPRINT")
            AMP_AGENT_NAME="$_expected_name"
            AMP_ADDRESS="$_new_address"
            echo "  ✅ Fixed: name='${AMP_AGENT_NAME}' address='${AMP_ADDRESS}'" >&2
        fi
    fi

    return 0
}

# Save config
save_config() {
    local name="$1"
    local tenant="${2:-default}"
    local fingerprint="$3"
    local agent_id="${4:-}"

    # Build address: name@tenant.aimaestro.local
    local address="${name}@${tenant}.${AMP_PROVIDER_DOMAIN}"

    jq -n \
        --arg name "$name" \
        --arg tenant "$tenant" \
        --arg address "$address" \
        --arg fingerprint "$fingerprint" \
        --arg agent_id "$agent_id" \
        --arg provider_domain "$AMP_PROVIDER_DOMAIN" \
        --arg maestro_url "$AMP_MAESTRO_URL" \
        --arg created "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '{
            version: "1.1",
            agent: (
                {
                    name: $name,
                    tenant: $tenant,
                    address: $address,
                    fingerprint: $fingerprint,
                    createdAt: $created
                } + if $agent_id != "" then {id: $agent_id} else {} end
            ),
            provider: {
                domain: $provider_domain,
                maestro_url: $maestro_url
            }
        }' > "${AMP_CONFIG}"

    echo "${address}"
}

# Check if initialized
is_initialized() {
    [ -f "${AMP_CONFIG}" ] && [ -f "${AMP_KEYS_DIR}/private.pem" ]
}

# =============================================================================
# Key Management
# =============================================================================

# Generate Ed25519 keypair
generate_keypair() {
    require_openssl
    ensure_amp_dirs

    local private_key="${AMP_KEYS_DIR}/private.pem"
    local public_key="${AMP_KEYS_DIR}/public.pem"

    # Generate private key
    $OPENSSL_BIN genpkey -algorithm Ed25519 -out "${private_key}" 2>/dev/null
    chmod 600 "${private_key}"

    # Extract public key
    $OPENSSL_BIN pkey -in "${private_key}" -pubout -out "${public_key}" 2>/dev/null
    chmod 644 "${public_key}"

    # Calculate fingerprint
    local fingerprint
    fingerprint=$($OPENSSL_BIN pkey -in "${private_key}" -pubout -outform DER 2>/dev/null | \
                  $OPENSSL_BIN dgst -sha256 -binary | base64)

    echo "SHA256:${fingerprint}"
}

# Generate Ed25519 keypair to a specified directory (for key rotation)
generate_keypair_to() {
    local target_dir="$1"
    require_openssl
    mkdir -p "$target_dir"

    local private_key="${target_dir}/private.pem"
    local public_key="${target_dir}/public.pem"

    # Generate private key
    $OPENSSL_BIN genpkey -algorithm Ed25519 -out "${private_key}" 2>/dev/null
    chmod 600 "${private_key}"

    # Extract public key
    $OPENSSL_BIN pkey -in "${private_key}" -pubout -out "${public_key}" 2>/dev/null
    chmod 644 "${public_key}"

    # Calculate fingerprint
    local fingerprint
    fingerprint=$($OPENSSL_BIN pkey -in "${private_key}" -pubout -outform DER 2>/dev/null | \
                  $OPENSSL_BIN dgst -sha256 -binary | base64)

    echo "SHA256:${fingerprint}"
}

# Generate UUIDv4 — client-generated, globally unique, no coordination needed
generate_uuid() {
    if command -v uuidgen &>/dev/null; then
        uuidgen | tr '[:upper:]' '[:lower:]'
    else
        # Fallback: generate from /dev/urandom (works on any POSIX system)
        od -x /dev/urandom | head -1 | awk '{print $2$3"-"$4"-4"substr($5,2)"-"substr($6,1,1)"a"substr($6,2)"-"$7$8$9}'
    fi
}

# Get public key hex (for registration)
get_public_key_hex() {
    local public_key="${AMP_KEYS_DIR}/public.pem"

    if [ ! -f "${public_key}" ]; then
        echo "Error: No public key found" >&2
        return 1
    fi

    # Extract raw public key bytes and convert to hex
    $OPENSSL_BIN pkey -pubin -in "${public_key}" -outform DER 2>/dev/null | \
        tail -c 32 | xxd -p | tr -d '\n'
}

# Sign a message
sign_message() {
    require_openssl
    local message="$1"
    local private_key="${AMP_KEYS_DIR}/private.pem"

    if [ ! -f "${private_key}" ]; then
        echo "Error: No private key found" >&2
        return 1
    fi

    # Use temporary files for signing (OpenSSL 3.x has issues with Ed25519 + stdin)
    local tmp_msg=$(mktemp)
    local tmp_sig=$(mktemp)
    trap 'rm -f "$tmp_msg" "$tmp_sig"' RETURN

    echo -n "${message}" > "$tmp_msg"
    # Note: Ed25519 keys require -rawin flag for raw message signing
    if $OPENSSL_BIN pkeyutl -sign -inkey "${private_key}" -rawin -in "$tmp_msg" -out "$tmp_sig" 2>/dev/null; then
        base64 < "$tmp_sig" | tr -d '\n'
    fi
}

# Verify a signature
verify_signature() {
    local message="$1"
    local signature="$2"
    local public_key_file="$3"

    # Use temporary files for verification (Ed25519 requires -rawin flag)
    local tmp_msg=$(mktemp)
    local tmp_sig=$(mktemp)
    trap 'rm -f "$tmp_msg" "$tmp_sig"' RETURN

    echo -n "${message}" > "$tmp_msg"
    echo -n "${signature}" | base64 -d > "$tmp_sig"

    # Note: Ed25519 keys require -rawin flag for raw message verification
    if $OPENSSL_BIN pkeyutl -verify -pubin -inkey "${public_key_file}" -rawin -in "$tmp_msg" -sigfile "$tmp_sig" 2>/dev/null; then
        return 0
    fi
    return 1
}

# =============================================================================
# Address Parsing
# =============================================================================

# Parse AMP address: name@[scope.]tenant.provider
# Sets: ADDR_NAME, ADDR_TENANT, ADDR_PROVIDER, ADDR_SCOPE, ADDR_IS_LOCAL
#
# WARNING: This function uses GLOBAL variables. Each call overwrites the previous
# ADDR_* values. Callers MUST read results immediately before calling again.
#
# Matches the server's parseAMPAddress() logic:
#   - Provider is always the last two domain parts (e.g. "aimaestro.local", "crabmail.ai")
#   - Tenant is the part immediately before the provider
#   - Scope (optional) is everything before tenant
#
# Examples:
#   alice@rnd23blocks.aimaestro.local → name=alice, tenant=rnd23blocks, provider=aimaestro.local
#   bob@myrepo.github.rnd23blocks.aimaestro.local → name=bob, tenant=rnd23blocks, provider=aimaestro.local, scope=myrepo.github
#   carol@acme.crabmail.ai → name=carol, tenant=acme, provider=crabmail.ai
parse_address() {
    # Normalize to lowercase for case-insensitive matching
    local address
    address=$(echo "$1" | tr '[:upper:]' '[:lower:]')

    # Reset
    ADDR_NAME=""
    ADDR_TENANT=""
    ADDR_PROVIDER=""
    ADDR_SCOPE=""
    ADDR_IS_LOCAL=false

    # Check if it's a full address (contains @)
    if [[ "$address" == *"@"* ]]; then
        ADDR_NAME="${address%%@*}"
        local domain="${address#*@}"

        # Split domain into parts
        IFS='.' read -ra parts <<< "$domain"
        local num_parts=${#parts[@]}

        if [ "$num_parts" -ge 3 ]; then
            # Provider = last 2 parts (e.g. "aimaestro.local", "crabmail.ai")
            ADDR_PROVIDER="${parts[$((num_parts-2))]}.${parts[$((num_parts-1))]}"
            # Tenant = part immediately before provider
            ADDR_TENANT="${parts[$((num_parts-3))]}"
            # Scope = everything before tenant (if any)
            if [ "$num_parts" -gt 3 ]; then
                local scope_parts=()
                for ((i=0; i<num_parts-3; i++)); do
                    scope_parts+=("${parts[$i]}")
                done
                ADDR_SCOPE=$(IFS='.'; echo "${scope_parts[*]}")
            fi
        elif [ "$num_parts" -eq 2 ]; then
            # Two-part domain: could be "tenant.local" or bare provider
            # Treat as tenant + single-word provider for backward compat
            ADDR_TENANT="${parts[0]}"
            ADDR_PROVIDER="${parts[1]}"
        elif [ "$num_parts" -eq 1 ]; then
            # Just provider, no tenant
            ADDR_TENANT="default"
            ADDR_PROVIDER="${parts[0]}"
        fi
    else
        # Short form - just a name, use the configured tenant
        ADDR_NAME="$address"
        # Try to get tenant from config, then from AI Maestro, then default
        if [ -n "${AMP_TENANT:-}" ]; then
            ADDR_TENANT="${AMP_TENANT}"
        else
            local org
            org=$(get_organization 2>/dev/null) || true
            ADDR_TENANT="${org:-default}"
        fi
        ADDR_PROVIDER="${AMP_PROVIDER_DOMAIN}"
    fi

    # Check if local (aimaestro.local or legacy "local" or "default.local")
    # Note: Only treat specific known local domains as local, not any *.local
    if [ "${ADDR_PROVIDER}" = "${AMP_PROVIDER_DOMAIN}" ] || \
       [ "${ADDR_PROVIDER}" = "aimaestro.local" ] || \
       [ "${ADDR_PROVIDER}" = "local" ] || \
       [ "${ADDR_PROVIDER}" = "default.local" ]; then
        ADDR_IS_LOCAL=true
    fi
}

# Build full address from components
# Format: name@tenant.aimaestro.local
build_address() {
    local name="$1"
    local tenant="${2:-default}"
    local provider="${3:-${AMP_PROVIDER_DOMAIN}}"

    echo "${name}@${tenant}.${provider}"
}

# =============================================================================
# Message Creation
# =============================================================================

# Generate message ID
generate_message_id() {
    # AMP spec: msg_<seconds_timestamp>_<hex_random>
    local timestamp
    timestamp=$(date +%s)
    local random
    random=$(head -c 4 /dev/urandom | xxd -p)
    echo "msg_${timestamp}_${random}"
}

# Validate message ID format (security: prevent path traversal)
validate_message_id() {
    local id="$1"
    # Message IDs: msg_<timestamp>_<hex> or msg-<timestamp>-<alphanum>
    # Only allow alphanumeric, underscores, hyphens - no slashes, dots, etc.
    if [[ ! "$id" =~ ^msg[_-][0-9]+[_-][a-zA-Z0-9]+$ ]]; then
        echo "Error: Invalid message ID format: ${id}" >&2
        return 1
    fi
    return 0
}

# Create AMP message envelope
# Args: to, subject, body, type, priority, in_reply_to, context, thread_id
create_message() {
    local to="$1"
    local subject="$2"
    local body="$3"
    local type="${4:-notification}"
    local priority="${5:-normal}"
    local in_reply_to="${6:-}"
    local context="${7:-null}"
    local explicit_thread_id="${8:-}"

    # Must be initialized
    if ! load_config; then
        echo "Error: AMP not initialized. Run 'amp-init' first." >&2
        return 1
    fi

    local id=$(generate_message_id)
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    # Default expiration: 7 days from now
    local expires_at
    expires_at=$(compute_expiry_date 7)
    # Thread ID: use explicit value if provided (from reply), otherwise use this message's ID
    local thread_id="${explicit_thread_id:-$id}"

    # Parse destination address
    parse_address "$to"
    local full_to=$(build_address "$ADDR_NAME" "$ADDR_TENANT" "$ADDR_PROVIDER")

    # Build message JSON
    local message_json
    message_json=$(jq -n \
        --arg id "$id" \
        --arg from "$AMP_ADDRESS" \
        --arg to "$full_to" \
        --arg subject "$subject" \
        --arg priority "$priority" \
        --arg timestamp "$timestamp" \
        --arg thread_id "$thread_id" \
        --arg in_reply_to "$in_reply_to" \
        --arg expires_at "$expires_at" \
        --arg type "$type" \
        --arg body "$body" \
        --argjson context "$context" \
        '{
            envelope: {
                version: "amp/0.1",
                id: $id,
                from: $from,
                to: $to,
                subject: $subject,
                priority: $priority,
                timestamp: $timestamp,
                thread_id: $thread_id,
                in_reply_to: (if $in_reply_to == "" then null else $in_reply_to end),
                expires_at: (if $expires_at == "" then null else $expires_at end),
                signature: null
            },
            payload: {
                type: $type,
                message: $body,
                context: $context
            },
            metadata: {
                status: "unread",
                queued_at: $timestamp,
                delivery_attempts: 0
            }
        }')

    echo "$message_json"
}

# =============================================================================
# Message Storage (Local Provider)
# =============================================================================

# Sanitize address for use as directory name
sanitize_address_for_path() {
    local address="$1"
    # Replace @ and . with underscores, remove other special chars
    echo "$address" | sed 's/[@.]/_/g' | sed 's/[^a-zA-Z0-9_-]//g'
}

# Save message to inbox (organized by sender)
save_to_inbox() {
    local message_json="$1"
    local apply_security="${2:-true}"

    local id=$(echo "$message_json" | jq -r '.envelope.id')
    local from=$(echo "$message_json" | jq -r '.envelope.from')
    local sender_dir=$(sanitize_address_for_path "$from")

    # Replay protection (Section 07: Recipients MUST track message IDs)
    local replay_db="${AMP_DIR}/replay_db"
    if [ -f "$replay_db" ] && grep -qF "${id}" "$replay_db" 2>/dev/null; then
        echo "Warning: Replay detected - message ${id} already received, skipping" >&2
        return 1
    fi

    # Create sender subdirectory
    local inbox_sender_dir="${AMP_INBOX_DIR}/${sender_dir}"
    mkdir -p "$inbox_sender_dir"

    # Apply content security if enabled and security module loaded
    if [ "$apply_security" = "true" ] && type apply_content_security &>/dev/null; then
        # Load local config for tenant
        load_config 2>/dev/null || true
        local local_tenant="${AMP_TENANT:-default}"

        # Check if signature is present (assume valid for local, need verification for external)
        local signature=$(echo "$message_json" | jq -r '.envelope.signature // empty')
        local sig_valid="false"

        # For local messages (same provider domain), trust them
        # Use parse_address for proper provider extraction (prevents trusting arbitrary .local domains)
        local _save_from_provider=""
        parse_address "$from"
        _save_from_provider="$ADDR_PROVIDER"

        if [ "$_save_from_provider" = "${AMP_PROVIDER_DOMAIN}" ] || \
           [ "$_save_from_provider" = "aimaestro.local" ]; then
            sig_valid="true"
        elif [ -n "$signature" ]; then
            # External messages: default to unverified (SEC-03)
            # TODO: Attempt sender key lookup via provider API when available.
            # Currently, external messages default to untrusted because we lack
            # the sender's public key locally. A future version should query
            # the sender's provider for their public key and verify the signature.
            sig_valid="false"
        fi

        # Apply security
        message_json=$(apply_content_security "$message_json" "$local_tenant" "$sig_valid")
    fi

    # Add received_at to local metadata
    message_json=$(echo "$message_json" | jq \
        --arg received "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '.local = (.local // {}) + {received_at: $received, status: "unread"}')

    local inbox_file="${inbox_sender_dir}/${id}.json"
    echo "$message_json" > "$inbox_file"

    # Record message ID for replay protection
    echo "${id}|$(date +%s)" >> "$replay_db"

    # Prune replay_db entries older than 24 hours (best-effort)
    if [ -f "$replay_db" ]; then
        local _cutoff=$(( $(date +%s) - 86400 ))
        local _tmp_db="${replay_db}.tmp.$$"
        awk -F'|' -v c="$_cutoff" '$2+0 >= c' "$replay_db" > "$_tmp_db" 2>/dev/null && mv "$_tmp_db" "$replay_db" || rm -f "$_tmp_db"
    fi

    echo "$inbox_file"
}

# Save message to sent (organized by recipient)
save_to_sent() {
    local message_json="$1"

    local id=$(echo "$message_json" | jq -r '.envelope.id')
    local to=$(echo "$message_json" | jq -r '.envelope.to')
    local recipient_dir=$(sanitize_address_for_path "$to")

    # Create recipient subdirectory
    local sent_recipient_dir="${AMP_SENT_DIR}/${recipient_dir}"
    mkdir -p "$sent_recipient_dir"

    # Add sent_at to local metadata
    message_json=$(echo "$message_json" | jq \
        --arg sent "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '.local = (.local // {}) + {sent_at: $sent}')

    local sent_file="${sent_recipient_dir}/${id}.json"
    echo "$message_json" > "$sent_file"
    echo "$sent_file"
}

# List inbox messages (handles nested sender directories)
list_inbox() {
    local status_filter="${1:-}"  # Optional: unread, read, all

    if [ ! -d "$AMP_INBOX_DIR" ]; then
        echo "[]"
        return 0
    fi

    # Collect all message files from all sender subdirectories
    local msg_files=()
    shopt -s nullglob

    # Check for old flat structure (backward compatibility)
    for msg_file in "${AMP_INBOX_DIR}"/*.json; do
        msg_files+=("$msg_file")
    done

    # Check nested sender directories (protocol-compliant structure)
    for sender_dir in "${AMP_INBOX_DIR}"/*/; do
        if [ -d "$sender_dir" ]; then
            for msg_file in "${sender_dir}"*.json; do
                msg_files+=("$msg_file")
            done
        fi
    done
    shopt -u nullglob

    if [ ${#msg_files[@]} -eq 0 ]; then
        echo "[]"
        return 0
    fi

    # Use jq slurp to read all files at once, then filter and sort
    # Check both .metadata.status (old) and .local.status (new)
    if [ -n "$status_filter" ] && [ "$status_filter" != "all" ]; then
        jq -s --arg status "$status_filter" \
            '[.[] | select(
                (.local.status // .metadata.status // "unread") == $status or
                ($status == "unread" and (.local.status // .metadata.status) == null)
            )] | sort_by(.envelope.timestamp) | reverse' \
            "${msg_files[@]}"
    else
        jq -s 'sort_by(.envelope.timestamp) | reverse' "${msg_files[@]}"
    fi
}

# Find message file by ID (searches flat and nested structures)
find_message_file() {
    local message_id="$1"
    local base_dir="$2"

    # Security: validate message ID format
    if ! validate_message_id "$message_id"; then
        return 1
    fi

    # Check flat structure first (backward compatibility)
    local flat_file="${base_dir}/${message_id}.json"
    if [ -f "$flat_file" ]; then
        echo "$flat_file"
        return 0
    fi

    # Search in subdirectories (protocol-compliant structure)
    shopt -s nullglob
    for subdir in "${base_dir}"/*/; do
        if [ -d "$subdir" ]; then
            local nested_file="${subdir}${message_id}.json"
            if [ -f "$nested_file" ]; then
                shopt -u nullglob
                echo "$nested_file"
                return 0
            fi
        fi
    done
    shopt -u nullglob

    return 1
}

# Read a specific message
read_message() {
    local message_id="$1"
    local box="${2:-inbox}"  # inbox or sent

    local msg_dir
    if [ "$box" = "inbox" ]; then
        msg_dir="$AMP_INBOX_DIR"
    else
        msg_dir="$AMP_SENT_DIR"
    fi

    local msg_file
    msg_file=$(find_message_file "$message_id" "$msg_dir")

    if [ -z "$msg_file" ] || [ ! -f "$msg_file" ]; then
        echo "Error: Message not found: ${message_id}" >&2
        return 1
    fi

    cat "$msg_file"
}

# Mark message as read
mark_as_read() {
    local message_id="$1"

    local msg_file
    msg_file=$(find_message_file "$message_id" "$AMP_INBOX_DIR")

    if [ -z "$msg_file" ] || [ ! -f "$msg_file" ]; then
        echo "Error: Message not found: ${message_id}" >&2
        return 1
    fi

    # Update both old (.metadata.status) and new (.local.status) locations
    local updated=$(jq '.metadata.status = "read" | .local.status = "read"' "$msg_file")
    echo "$updated" > "$msg_file"
}

# Delete a message
delete_message() {
    local message_id="$1"
    local box="${2:-inbox}"

    local msg_dir
    if [ "$box" = "inbox" ]; then
        msg_dir="$AMP_INBOX_DIR"
    else
        msg_dir="$AMP_SENT_DIR"
    fi

    local msg_file
    msg_file=$(find_message_file "$message_id" "$msg_dir")

    if [ -z "$msg_file" ] || [ ! -f "$msg_file" ]; then
        echo "Error: Message not found: ${message_id}" >&2
        return 1
    fi

    rm "$msg_file"
}

# =============================================================================
# Provider Routing
# =============================================================================

# Get registration for a provider
get_registration() {
    local provider="$1"
    local reg_file="${AMP_REGISTRATIONS_DIR}/${provider}.json"

    if [ -f "$reg_file" ]; then
        cat "$reg_file"
        return 0
    fi

    return 1
}

# Check if registered with a provider
is_registered() {
    local provider="$1"
    [ -f "${AMP_REGISTRATIONS_DIR}/${provider}.json" ]
}

# Route message to appropriate provider
# Returns: "local" or provider name
get_message_route() {
    local to_address="$1"

    parse_address "$to_address"

    if [ "$ADDR_IS_LOCAL" = true ]; then
        echo "local"
    else
        echo "$ADDR_PROVIDER"
    fi
}

# =============================================================================
# Display Helpers
# =============================================================================

# Format timestamp for display
format_timestamp() {
    local ts="$1"

    if command -v gdate &>/dev/null; then
        gdate -d "$ts" "+%Y-%m-%d %H:%M" 2>/dev/null || echo "$ts"
    elif date --version 2>&1 | grep -q GNU; then
        date -d "$ts" "+%Y-%m-%d %H:%M" 2>/dev/null || echo "$ts"
    else
        # macOS date
        date -j -f "%Y-%m-%dT%H:%M:%SZ" "$ts" "+%Y-%m-%d %H:%M" 2>/dev/null || echo "$ts"
    fi
}

# Priority indicator
priority_indicator() {
    local priority="$1"

    case "$priority" in
        urgent) echo "🔴" ;;
        high)   echo "🟠" ;;
        normal) echo "🟢" ;;
        low)    echo "⚪" ;;
        *)      echo "🟢" ;;
    esac
}

# Status indicator
status_indicator() {
    local status="$1"

    case "$status" in
        unread)   echo "●" ;;
        read)     echo "○" ;;
        archived) echo "📦" ;;
        *)        echo "○" ;;
    esac
}

# =============================================================================
# Auto-detect Agent Name
# =============================================================================

# Try to detect agent name from environment
detect_agent_name() {
    # 1. Check CLAUDE_AGENT_NAME env var
    if [ -n "${CLAUDE_AGENT_NAME:-}" ]; then
        echo "$CLAUDE_AGENT_NAME"
        return 0
    fi

    # 2. Check tmux session name
    if [ -n "${TMUX:-}" ]; then
        local tmux_session
        tmux_session=$(tmux display-message -p '#S' 2>/dev/null)
        if [ -n "$tmux_session" ]; then
            # Remove any _N suffix (multi-session pattern)
            echo "${tmux_session%_[0-9]*}"
            return 0
        fi
    fi

    # 3. Single agent → use that name
    local index_file="${AMP_AGENTS_BASE}/.index.json"
    if [ -f "$index_file" ]; then
        local count
        count=$(jq 'length' "$index_file" 2>/dev/null || echo "0")
        if [ "$count" = "1" ]; then
            jq -r 'keys[0]' "$index_file" 2>/dev/null
            return 0
        fi
    fi

    # 4. Fallback: error out — do NOT use git repo name or hostname
    #    Using git repo name (e.g. "agents-web") would silently poison
    #    the agent's config with a wrong identity. Better to fail loudly.
    echo ""
    return 1
}

# =============================================================================
# Initialization Check
# =============================================================================

# =============================================================================
# Attachment Functions
# =============================================================================

# Generate attachment ID
generate_attachment_id() {
    local timestamp
    if timestamp=$(python3 -c 'import time; print(int(time.time()*1000))' 2>/dev/null); then
        : # got millisecond timestamp
    else
        timestamp="$(date +%s)000"
    fi
    local random
    random=$(head -c 4 /dev/urandom | xxd -p)
    echo "att_${timestamp}_${random}"
}

# Validate attachment ID format (security: prevent path traversal)
validate_attachment_id() {
    local id="$1"
    if [[ ! "$id" =~ ^att[_-][0-9]+[_-][a-zA-Z0-9]+$ ]]; then
        echo "Error: Invalid attachment ID format: ${id}" >&2
        return 1
    fi
    return 0
}

# Compute file digest (sha256:<hex>)
compute_file_digest() {
    local filepath="$1"
    local hash
    if command -v sha256sum &>/dev/null; then
        hash=$(sha256sum "$filepath" | awk '{print $1}')
    else
        hash=$($OPENSSL_BIN dgst -sha256 -hex "$filepath" 2>/dev/null | awk '{print $NF}')
    fi
    echo "sha256:${hash}"
}

# Sanitize filename for safe storage
sanitize_filename() {
    local filename="$1"
    # Strip path components
    filename=$(basename "$filename")
    # Reject double-encoded path separators (spec requirement)
    if echo "$filename" | grep -qiE '%2[fF]|%5[cC]|%00'; then
        echo "Error: Filename contains encoded path separators: ${filename}" >&2
        echo "unnamed_file"
        return
    fi
    # Replace unsafe characters with underscores, keep only safe chars
    filename=$(echo "$filename" | sed 's/[^a-zA-Z0-9._-]/_/g')
    # Strip leading and trailing dots and spaces (spec requirement)
    filename=$(echo "$filename" | sed 's/^[. ]*//' | sed 's/[. ]*$//')
    # Enforce max 255 character limit (spec requirement)
    if [ ${#filename} -gt 255 ]; then
        local base="${filename%.*}"
        local ext="${filename##*.}"
        if [ "$base" = "$ext" ]; then
            filename="${filename:0:255}"
        else
            local max_base=$((255 - ${#ext} - 1))
            filename="${base:0:$max_base}.${ext}"
        fi
    fi
    # Check reserved names (Windows-style)
    local basename_noext="${filename%%.*}"
    local reserved_names="CON PRN AUX NUL COM1 COM2 COM3 COM4 COM5 COM6 COM7 COM8 COM9 LPT1 LPT2 LPT3 LPT4 LPT5 LPT6 LPT7 LPT8 LPT9"
    local upper_basename
    upper_basename=$(echo "$basename_noext" | tr '[:lower:]' '[:upper:]')
    for reserved in $reserved_names; do
        if [ "$upper_basename" = "$reserved" ]; then
            filename="_${filename}"
            break
        fi
    done
    # Ensure not empty
    [ -z "$filename" ] && filename="unnamed_file"
    echo "$filename"
}

# Detect MIME type of a file (magic bytes + extension fallback)
detect_mime_type() {
    local filepath="$1"
    local mime=""

    # Try magic bytes detection first
    if command -v file &>/dev/null; then
        mime=$(file --mime-type -b "$filepath" 2>/dev/null || echo "")
    fi

    # Extension-based fallback for known types (cross-platform consistency)
    if [ -z "$mime" ] || [ "$mime" = "application/octet-stream" ]; then
        local ext="${filepath##*.}"
        ext=$(echo "$ext" | tr '[:upper:]' '[:lower:]')
        case "$ext" in
            pdf)  mime="application/pdf" ;;
            json) mime="application/json" ;;
            xml)  mime="application/xml" ;;
            zip)  mime="application/zip" ;;
            gz|gzip) mime="application/gzip" ;;
            tar)  mime="application/x-tar" ;;
            csv)  mime="text/csv" ;;
            txt)  mime="text/plain" ;;
            md)   mime="text/markdown" ;;
            html|htm) mime="text/html" ;;
            png)  mime="image/png" ;;
            jpg|jpeg) mime="image/jpeg" ;;
            gif)  mime="image/gif" ;;
            svg)  mime="image/svg+xml" ;;
            mp4)  mime="video/mp4" ;;
            mp3)  mime="audio/mpeg" ;;
            wav)  mime="audio/wav" ;;
            docx) mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document" ;;
            xlsx) mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ;;
            pptx) mime="application/vnd.openxmlformats-officedocument.presentationml.presentation" ;;
            *)    mime="application/octet-stream" ;;
        esac
    fi

    echo "$mime"
}

# Compute expiry date (default: 7 days from now)
# Args: [days] (default: 7)
# Returns: ISO 8601 timestamp or empty string on failure
compute_expiry_date() {
    local days="${1:-7}"
    date -u -v+${days}d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
        || date -u -d "+${days} days" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
        || gdate -u -d "+${days} days" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
        || python3 -c "from datetime import datetime,timedelta;print((datetime.utcnow()+timedelta(days=${days})).strftime('%Y-%m-%dT%H:%M:%SZ'))" 2>/dev/null \
        || echo ""
}

# Format file size for human-readable display
format_file_size() {
    local bytes="$1"
    if [ "$bytes" -ge 1073741824 ]; then
        echo "$(( bytes / 1073741824 )).$(( (bytes % 1073741824) * 10 / 1073741824 )) GB"
    elif [ "$bytes" -ge 1048576 ]; then
        echo "$(( bytes / 1048576 )).$(( (bytes % 1048576) * 10 / 1048576 )) MB"
    elif [ "$bytes" -ge 1024 ]; then
        echo "$(( bytes / 1024 )).$(( (bytes % 1024) * 10 / 1024 )) KB"
    else
        echo "${bytes} B"
    fi
}

# Check if MIME type is blocked
# Handles MIME parameters (e.g., "type; charset=utf-8") and case-insensitive matching
is_mime_blocked() {
    local mime="$1"
    # Strip MIME parameters (everything after first semicolon)
    mime="${mime%%;*}"
    # Trim whitespace and convert to lowercase for case-insensitive comparison
    mime=$(echo "$mime" | tr '[:upper:]' '[:lower:]' | tr -d ' ')
    for blocked in "${AMP_BLOCKED_MIME_TYPES[@]}"; do
        if [ "$mime" = "$blocked" ]; then
            return 0
        fi
    done
    return 1
}

# Upload an attachment via provider API
# Args: filepath, api_url, api_key
# Returns: JSON with attachment metadata (id, upload_url, etc.)
upload_attachment() {
    local filepath="$1"
    local api_url="$2"
    local api_key="$3"

    local filename
    filename=$(sanitize_filename "$(basename "$filepath")")
    local content_type
    content_type=$(detect_mime_type "$filepath")
    local file_size
    file_size=$(wc -c < "$filepath" | tr -d ' ')
    local digest
    digest=$(compute_file_digest "$filepath")
    local att_id
    att_id=$(generate_attachment_id)

    # Step 1: Request upload URL from provider
    local init_body
    init_body=$(jq -n \
        --arg filename "$filename" \
        --arg content_type "$content_type" \
        --argjson size "$file_size" \
        --arg digest "$digest" \
        '{filename: $filename, content_type: $content_type, size: $size, digest: $digest}')

    local init_response
    init_response=$(curl -s -w "\n%{http_code}" --connect-timeout 5 --max-time 15 \
        -X POST "${api_url}/attachments/upload" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${api_key}" \
        -d "$init_body" 2>&1)

    local init_http
    init_http=$(echo "$init_response" | tail -n1)
    local init_result
    init_result=$(echo "$init_response" | sed '$d')

    if [ "$init_http" != "200" ] && [ "$init_http" != "201" ]; then
        echo "Error: Failed to initiate attachment upload (HTTP ${init_http})" >&2
        local err_msg
        err_msg=$(echo "$init_result" | jq -r '.error // .message // "Unknown error"' 2>/dev/null)
        [ -n "$err_msg" ] && [ "$err_msg" != "null" ] && echo "  ${err_msg}" >&2
        return 1
    fi

    local upload_url
    upload_url=$(echo "$init_result" | jq -r '.upload_url // empty')
    local server_att_id
    server_att_id=$(echo "$init_result" | jq -r '.attachment_id // empty')
    if [ -n "$server_att_id" ] && [ "$server_att_id" != "$att_id" ]; then
        # Validate server-assigned ID before accepting
        if validate_attachment_id "$server_att_id" 2>/dev/null; then
            att_id="$server_att_id"
        else
            echo "Warning: Server returned invalid attachment ID, using client-generated ID" >&2
        fi
    fi

    # Step 2: Upload the file content
    if [ -n "$upload_url" ]; then
        echo "    Uploading $(format_file_size "$file_size")..." >&2
        local upload_response
        upload_response=$(curl -s -w "\n%{http_code}" --connect-timeout 10 --max-time 120 \
            -X PUT "$upload_url" \
            -H "Content-Type: ${content_type}" \
            --data-binary "@${filepath}" 2>&1)

        local upload_http
        upload_http=$(echo "$upload_response" | tail -n1)

        if [ "$upload_http" != "200" ] && [ "$upload_http" != "201" ]; then
            echo "Error: Failed to upload attachment content (HTTP ${upload_http})" >&2
            return 1
        fi
    fi

    # Step 3: Confirm upload
    local confirm_response
    confirm_response=$(curl -s -w "\n%{http_code}" --connect-timeout 5 --max-time 15 \
        -X POST "${api_url}/attachments/${att_id}/confirm" \
        -H "Authorization: Bearer ${api_key}" 2>&1)

    local confirm_http
    confirm_http=$(echo "$confirm_response" | tail -n1)
    local confirm_result
    confirm_result=$(echo "$confirm_response" | sed '$d')

    # Step 4: Poll for scan status with exponential backoff
    # Default timeout: 60s (configurable via AMP_SCAN_TIMEOUT)
    local scan_status="pending"
    local download_url=""
    local poll_count=0
    local poll_delay=2
    local max_poll_time="${AMP_SCAN_TIMEOUT:-60}"
    local total_wait=0
    while [ "$scan_status" = "pending" ] && [ "$total_wait" -lt "$max_poll_time" ]; do
        sleep "$poll_delay"
        total_wait=$((total_wait + poll_delay))
        poll_count=$((poll_count + 1))
        # Exponential backoff: 2, 4, 8, 10, 10, 10...
        poll_delay=$((poll_delay * 2))
        [ "$poll_delay" -gt 10 ] && poll_delay=10

        local status_response
        status_response=$(curl -s -w "\n%{http_code}" --connect-timeout 5 --max-time 10 \
            -X GET "${api_url}/attachments/${att_id}" \
            -H "Authorization: Bearer ${api_key}" 2>&1)

        local status_http
        status_http=$(echo "$status_response" | tail -n1)
        local status_result
        status_result=$(echo "$status_response" | sed '$d')

        if [ "$status_http" = "200" ]; then
            scan_status=$(echo "$status_result" | jq -r '.scan_status // "clean"')
            download_url=$(echo "$status_result" | jq -r '.url // .download_url // empty')
        else
            # Provider may not support polling — leave as pending (don't assume clean)
            break
        fi
    done

    # Return attachment metadata (spec uses "url", keep "download_url" as alias)
    local uploaded_at
    uploaded_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local expires_at
    expires_at=$(compute_expiry_date 7)

    jq -n \
        --arg id "$att_id" \
        --arg filename "$filename" \
        --arg content_type "$content_type" \
        --argjson size "$file_size" \
        --arg digest "$digest" \
        --arg url "$download_url" \
        --arg scan_status "$scan_status" \
        --arg uploaded_at "$uploaded_at" \
        --arg expires_at "$expires_at" \
        '{
            id: $id,
            filename: $filename,
            content_type: $content_type,
            size: $size,
            digest: $digest,
            url: (if $url == "" then null else $url end),
            scan_status: $scan_status,
            uploaded_at: $uploaded_at,
            expires_at: (if $expires_at == "" then null else $expires_at end)
        }'
}

# Download an attachment with digest verification
# Args: attachment_json, dest_dir, [api_url, api_key]
# Returns: path to downloaded file
download_attachment() {
    local attachment_json="$1"
    local dest_dir="$2"
    local api_url="${3:-}"
    local api_key="${4:-}"

    local att_id
    att_id=$(echo "$attachment_json" | jq -r '.id')
    local filename
    filename=$(echo "$attachment_json" | jq -r '.filename')
    local expected_digest
    expected_digest=$(echo "$attachment_json" | jq -r '.digest // empty')
    local expected_size
    expected_size=$(echo "$attachment_json" | jq -r '.size // empty')
    local download_url
    download_url=$(echo "$attachment_json" | jq -r '.url // .download_url // empty')

    # Validate attachment ID before using in any path (spec requirement: prevent path traversal)
    validate_attachment_id "$att_id" || return 1

    # Require digest for integrity verification (spec: digest is a required field)
    if [ -z "$expected_digest" ]; then
        echo "Error: Missing required digest field for attachment ${att_id}" >&2
        return 1
    fi

    filename=$(sanitize_filename "$filename")
    mkdir -p "$dest_dir"
    chmod 700 "$dest_dir"

    local dest_path="${dest_dir}/${filename}"

    # Handle filename collisions (max 100 to prevent DoS via repeated downloads)
    local counter=1
    local max_collisions=100
    while [ -f "$dest_path" ]; do
        if [ "$counter" -gt "$max_collisions" ]; then
            echo "Error: Too many filename collisions for ${filename} (>${max_collisions})" >&2
            return 1
        fi
        local base="${filename%.*}"
        local ext="${filename##*.}"
        if [ "$base" = "$ext" ]; then
            dest_path="${dest_dir}/${base}_${counter}"
        else
            dest_path="${dest_dir}/${base}_${counter}.${ext}"
        fi
        counter=$((counter + 1))
    done

    # Try local file path first (for filesystem-delivered attachments)
    # Security: only allow paths within AMP_ATTACHMENTS_DIR to prevent path traversal
    local local_path=""
    local local_candidate="${AMP_ATTACHMENTS_DIR}/${att_id}/${filename}"
    if [ -f "$local_candidate" ]; then
        # Resolve symlinks and verify path is within expected directory
        local resolved_path
        resolved_path=$(cd "$(dirname "$local_candidate")" 2>/dev/null && pwd -P)/$(basename "$local_candidate") 2>/dev/null || true
        local resolved_base
        resolved_base=$(cd "$AMP_ATTACHMENTS_DIR" 2>/dev/null && pwd -P) 2>/dev/null || true
        if [ -n "$resolved_path" ] && [ -n "$resolved_base" ] && [[ "$resolved_path" == "${resolved_base}/"* ]]; then
            local_path="$local_candidate"
        fi
    fi

    if [ -n "$local_path" ] && [ -f "$local_path" ]; then
        cp "$local_path" "$dest_path"
        # Verify digest
        local actual_digest
        actual_digest=$(compute_file_digest "$dest_path")
        if [ "$actual_digest" != "$expected_digest" ]; then
            rm -f "$dest_path"
            echo "Error: Digest mismatch! Expected ${expected_digest}, got ${actual_digest}" >&2
            echo "  The file may have been tampered with." >&2
            return 1
        fi
        # Verify size if provided
        if [ -n "$expected_size" ] && [ "$expected_size" != "null" ]; then
            local actual_size
            actual_size=$(wc -c < "$dest_path" | tr -d ' ')
            if [ "$actual_size" != "$expected_size" ]; then
                rm -f "$dest_path"
                echo "Error: Size mismatch! Expected ${expected_size} bytes, got ${actual_size}" >&2
                return 1
            fi
        fi
        echo "$dest_path"
        return 0
    fi

    # Download from URL or provider API
    # Security: limit redirects and restrict protocols to prevent SSRF
    local dl_http
    if [ -n "$download_url" ]; then
        # Warn about HTTP downloads (SEC-06: MITM risk on non-TLS connections)
        if [[ "$download_url" == http://* ]]; then
            echo "Warning: Downloading over HTTP (not HTTPS). Connection is not encrypted." >&2
        fi
        local dl_response
        dl_response=$(curl -s -w "\n%{http_code}" --connect-timeout 10 --max-time 120 \
            --max-filesize "$AMP_MAX_ATTACHMENT_SIZE" \
            --max-redirs 3 --proto '=https,http' \
            -C - \
            -o "$dest_path" "$download_url" 2>&1)
        dl_http=$(echo "$dl_response" | tail -n1)
    elif [ -n "$api_url" ] && [ "$api_url" != "null" ] && [ -n "$api_key" ] && [ "$api_key" != "null" ]; then
        local dl_response
        dl_response=$(curl -s -w "\n%{http_code}" --connect-timeout 10 --max-time 120 \
            --max-filesize "$AMP_MAX_ATTACHMENT_SIZE" \
            --max-redirs 3 \
            -C - \
            -o "$dest_path" \
            -H "Authorization: Bearer ${api_key}" \
            "${api_url}/attachments/${att_id}/download" 2>&1)
        dl_http=$(echo "$dl_response" | tail -n1)
    else
        echo "Error: No download URL or API credentials available" >&2
        return 1
    fi

    if [ "$dl_http" != "200" ]; then
        rm -f "$dest_path"
        echo "Error: Failed to download attachment (HTTP ${dl_http})" >&2
        return 1
    fi

    # Verify digest (mandatory)
    local actual_digest
    actual_digest=$(compute_file_digest "$dest_path")
    if [ "$actual_digest" != "$expected_digest" ]; then
        rm -f "$dest_path"
        echo "Error: Digest mismatch! Expected ${expected_digest}, got ${actual_digest}" >&2
        echo "  The file may have been tampered with." >&2
        return 1
    fi

    # Verify size if provided
    if [ -n "$expected_size" ] && [ "$expected_size" != "null" ]; then
        local actual_size
        actual_size=$(wc -c < "$dest_path" | tr -d ' ')
        if [ "$actual_size" != "$expected_size" ]; then
            rm -f "$dest_path"
            echo "Error: Size mismatch! Expected ${expected_size} bytes, got ${actual_size}" >&2
            return 1
        fi
    fi

    echo "$dest_path"
}

# =============================================================================
# Initialization Check
# =============================================================================

require_init() {
    if ! is_initialized; then
        echo "Error: AMP not initialized." >&2
        echo "Run: amp-init.sh --name <your-agent-name>" >&2
        exit 1
    fi
    load_config
}
