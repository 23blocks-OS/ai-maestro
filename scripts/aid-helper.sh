#!/bin/bash
# =============================================================================
# AID Helper Functions
# Agent Identity Protocol - Core utilities for all AID scripts
# =============================================================================
#
# Self-contained helper providing:
# - OpenSSL auto-detection (macOS LibreSSL doesn't support Ed25519)
# - Agent identity directory resolution
# - Configuration loading
# - Ed25519 signing
#
# Storage: ~/.agent-messaging/agents/<name-or-uuid>/
#
# AID is independent of AMP. If both are installed, they share the same
# agent directory structure for interoperability.
# =============================================================================

# =============================================================================
# OpenSSL Auto-Detection
# =============================================================================
# macOS ships with LibreSSL which doesn't support Ed25519.
# We auto-detect a compatible OpenSSL binary (Homebrew or system).

_detect_openssl() {
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

    # Search Homebrew paths
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

    echo ""
    return 1
}

# Detect once and cache
OPENSSL_BIN=$(_detect_openssl 2>/dev/null || true)

OPENSSL_AVAILABLE=true
if [ -z "$OPENSSL_BIN" ]; then
    OPENSSL_AVAILABLE=false
fi

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

# =============================================================================
# Agent Directory Resolution
# =============================================================================
#
# Each agent has its own directory at ~/.agent-messaging/agents/<name-or-uuid>/
# containing keys/, config.json, api_registrations/, and tokens/.
#
# Resolution order:
#   1. Explicit AMP_DIR env var (set by AI Maestro or AMP)
#   2. CLAUDE_AGENT_ID env var -> ~/.agent-messaging/agents/<uuid>/
#   3. CLAUDE_AGENT_NAME env var -> index lookup or name dir
#   4. tmux session name -> index lookup or name dir
#   5. Single agent auto-select (solo setups)
#

AID_AGENTS_BASE="${HOME}/.agent-messaging/agents"

# Case-insensitive name-to-UUID lookup via .index.json
_aid_index_lookup() {
    local name="$1"
    local index_file="${AID_AGENTS_BASE}/.index.json"
    [ -f "$index_file" ] || return 1
    local uuid
    uuid=$(jq -r --arg name "$name" '.[$name] // empty' "$index_file" 2>/dev/null)
    if [ -n "$uuid" ]; then echo "$uuid"; return 0; fi
    # Case-insensitive fallback
    local lower_name
    lower_name=$(echo "$name" | tr '[:upper:]' '[:lower:]')
    uuid=$(jq -r --arg name "$lower_name" \
        'to_entries[] | select(.key | ascii_downcase == $name) | .value' \
        "$index_file" 2>/dev/null | head -1)
    if [ -n "$uuid" ]; then echo "$uuid"; return 0; fi
    return 1
}

_resolve_agent_dir() {
    # Already resolved
    if [ -n "${AMP_DIR:-}" ] && [ -d "${AMP_DIR}" ]; then
        return 0
    fi

    local _resolved=false

    # Priority 1: AMP_DIR already set (by AMP, AI Maestro, or env)
    if [ -n "${AMP_DIR:-}" ] && [ -d "${AMP_DIR}" ]; then
        _resolved=true
    fi

    # Priority 2: CLAUDE_AGENT_ID env var (UUID -> direct directory)
    if [ "$_resolved" = false ] && [ -n "${CLAUDE_AGENT_ID:-}" ]; then
        AMP_DIR="${AID_AGENTS_BASE}/${CLAUDE_AGENT_ID}"
        _resolved=true
    fi

    # Priority 3: CLAUDE_AGENT_NAME or tmux session name
    if [ "$_resolved" = false ]; then
        local _agent_name=""
        if [ -n "${CLAUDE_AGENT_NAME:-}" ]; then
            _agent_name="${CLAUDE_AGENT_NAME}"
        elif [ -n "${TMUX:-}" ]; then
            _agent_name=$(tmux display-message -p '#S' 2>/dev/null || true)
            _agent_name="${_agent_name%_[0-9]*}"
        fi

        if [ -n "$_agent_name" ]; then
            local _uuid
            _uuid=$(_aid_index_lookup "$_agent_name" 2>/dev/null) || true
            if [ -n "$_uuid" ]; then
                AMP_DIR="${AID_AGENTS_BASE}/${_uuid}"
            else
                AMP_DIR="${AID_AGENTS_BASE}/${_agent_name}"
            fi
            _resolved=true
        fi
    fi

    # Priority 4: Single agent auto-select
    if [ "$_resolved" = false ]; then
        local _index_file="${AID_AGENTS_BASE}/.index.json"
        if [ -f "$_index_file" ]; then
            local _count
            _count=$(jq 'length' "$_index_file" 2>/dev/null || echo "0")
            if [ "$_count" = "1" ]; then
                local _uuid
                _uuid=$(jq -r 'to_entries[0].value' "$_index_file" 2>/dev/null)
                if [ -n "$_uuid" ]; then
                    AMP_DIR="${AID_AGENTS_BASE}/${_uuid}"
                    _resolved=true
                fi
            elif [ "$_count" != "0" ]; then
                echo "Error: Multiple agents found. Set CLAUDE_AGENT_NAME or use --id <uuid>" >&2
                echo "" >&2
                echo "Available agents:" >&2
                while IFS= read -r _entry; do
                    local _e_name _e_uuid _e_addr=""
                    _e_name=$(echo "$_entry" | jq -r '.key')
                    _e_uuid=$(echo "$_entry" | jq -r '.value')
                    local _e_cfg="${AID_AGENTS_BASE}/${_e_uuid}/config.json"
                    if [ -f "$_e_cfg" ]; then
                        _e_addr=$(jq -r '.agent.address // empty' "$_e_cfg" 2>/dev/null)
                    fi
                    if [ -n "$_e_addr" ]; then
                        printf "  %-45s %s\n" "$_e_addr" "$_e_uuid" >&2
                    else
                        printf "  %-45s %s\n" "$_e_name" "$_e_uuid" >&2
                    fi
                done < <(jq -c 'to_entries[]' "$_index_file" 2>/dev/null)
                exit 1
            fi
        else
            # No index file — try finding any agent dir with config.json
            if [ -d "$AID_AGENTS_BASE" ]; then
                for _dir in "$AID_AGENTS_BASE"/*/; do
                    if [ -f "${_dir}config.json" ] && [ -d "${_dir}keys" ]; then
                        AMP_DIR="${_dir%/}"
                        _resolved=true
                        break
                    fi
                done
            fi
        fi
    fi

    if [ "$_resolved" = false ]; then
        return 1
    fi

    return 0
}

# Exported variables (set by load_config)
AMP_DIR="${AMP_DIR:-}"
AMP_KEYS_DIR=""
AMP_AGENT_NAME=""
AMP_ADDRESS=""
AMP_FINGERPRINT=""
AMP_CONFIG=""

# =============================================================================
# is_initialized — Check if an agent identity exists
# =============================================================================

is_initialized() {
    _resolve_agent_dir 2>/dev/null || return 1
    AMP_CONFIG="${AMP_DIR}/config.json"
    AMP_KEYS_DIR="${AMP_DIR}/keys"
    [ -f "${AMP_CONFIG}" ] && [ -f "${AMP_KEYS_DIR}/private.pem" ]
}

# =============================================================================
# load_config — Load agent identity configuration
# =============================================================================

load_config() {
    _resolve_agent_dir || {
        echo "Error: No agent identity found." >&2
        echo "Run: aid-init --auto" >&2
        return 1
    }

    AMP_CONFIG="${AMP_DIR}/config.json"
    AMP_KEYS_DIR="${AMP_DIR}/keys"

    if [ ! -f "$AMP_CONFIG" ]; then
        echo "Error: Config file not found: ${AMP_CONFIG}" >&2
        return 1
    fi

    AMP_AGENT_NAME=$(jq -r '.agent.name // .name // .agent_name // empty' "$AMP_CONFIG" 2>/dev/null)
    AMP_ADDRESS=$(jq -r '.agent.address // .address // .amp_address // empty' "$AMP_CONFIG" 2>/dev/null)
    AMP_FINGERPRINT=$(jq -r '.agent.fingerprint // .fingerprint // empty' "$AMP_CONFIG" 2>/dev/null)

    # Compute fingerprint from public key if not in config
    if [ -z "$AMP_FINGERPRINT" ] && [ -f "${AMP_KEYS_DIR}/public.pem" ]; then
        require_openssl
        AMP_FINGERPRINT=$($OPENSSL_BIN pkey -pubin -in "${AMP_KEYS_DIR}/public.pem" -outform DER 2>/dev/null | \
            $OPENSSL_BIN dgst -sha256 -binary | base64)
        AMP_FINGERPRINT="SHA256:${AMP_FINGERPRINT}"
    fi

    if [ -z "${AMP_AGENT_NAME}" ]; then
        echo "Error: Agent name not found in config" >&2
        return 1
    fi
}

# =============================================================================
# sign_message — Ed25519 sign a message, return base64-encoded signature
# =============================================================================

sign_message() {
    require_openssl
    local message="$1"
    local private_key="${AMP_KEYS_DIR}/private.pem"

    if [ ! -f "${private_key}" ]; then
        echo "Error: No private key found at ${private_key}" >&2
        return 1
    fi

    # Use temporary files (OpenSSL 3.x has issues with Ed25519 + stdin)
    local tmp_msg tmp_sig
    tmp_msg=$(mktemp)
    tmp_sig=$(mktemp)
    trap 'rm -f "$tmp_msg" "$tmp_sig"' RETURN

    echo -n "${message}" > "$tmp_msg"
    if $OPENSSL_BIN pkeyutl -sign -inkey "${private_key}" -rawin -in "$tmp_msg" -out "$tmp_sig" 2>/dev/null; then
        base64 < "$tmp_sig" | tr -d '\n'
    fi
}

# =============================================================================
# generate_keypair — Create Ed25519 key pair
# =============================================================================

generate_keypair() {
    require_openssl

    local keys_dir="${1:-${AMP_KEYS_DIR}}"
    mkdir -p "$keys_dir"

    local private_key="${keys_dir}/private.pem"
    local public_key="${keys_dir}/public.pem"

    $OPENSSL_BIN genpkey -algorithm Ed25519 -out "${private_key}" 2>/dev/null
    chmod 600 "${private_key}"

    $OPENSSL_BIN pkey -in "${private_key}" -pubout -out "${public_key}" 2>/dev/null
    chmod 644 "${public_key}"

    # Calculate fingerprint
    local fingerprint
    fingerprint=$($OPENSSL_BIN pkey -in "${private_key}" -pubout -outform DER 2>/dev/null | \
                  $OPENSSL_BIN dgst -sha256 -binary | base64)

    echo "SHA256:${fingerprint}"
}
