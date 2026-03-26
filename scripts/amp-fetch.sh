#!/bin/bash
# =============================================================================
# AMP Fetch - Fetch Messages from Providers
# =============================================================================
#
# Pull new messages from registered providers using the standard AMP API:
#   GET  /messages/pending       — fetch pending messages
#   DELETE /messages/pending/:id — acknowledge receipt
#
# All providers use the same endpoints. No provider-specific logic.
#
# Usage:
#   amp-fetch                    # Fetch from all providers
#   amp-fetch --provider crabmail.ai   # Fetch from specific provider
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
PROVIDER=""
VERBOSE=false
MARK_AS_FETCHED=true

show_help() {
    echo "Usage: amp-fetch [options]"
    echo ""
    echo "Fetch new messages from registered providers."
    echo ""
    echo "Options:"
    echo "  --provider, -p PROVIDER   Fetch from specific provider only"
    echo "  --verbose, -v             Show detailed output"
    echo "  --no-mark                 Don't mark messages as fetched on provider"
    echo "  --id UUID                 Operate as this agent (UUID from config.json)"
    echo "  --help, -h                Show this help"
    echo ""
    echo "Examples:"
    echo "  amp-fetch                     # Fetch from all registered providers"
    echo "  amp-fetch -p crabmail.ai      # Fetch from Crabmail only"
    echo "  amp-fetch --verbose           # Show details"
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --provider|-p)
            PROVIDER="$2"
            shift 2
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --no-mark)
            MARK_AS_FETCHED=false
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
            echo "Run 'amp-fetch --help' for usage."
            exit 1
            ;;
    esac
done

# Require initialization
require_init

# Get list of providers to fetch from
if [ -n "$PROVIDER" ]; then
    PROVIDER_LOWER=$(echo "$PROVIDER" | tr '[:upper:]' '[:lower:]')
    REG_FILE="${AMP_REGISTRATIONS_DIR}/${PROVIDER_LOWER}.json"
    if [ ! -f "$REG_FILE" ]; then
        echo "Error: Not registered with ${PROVIDER}"
        echo ""
        echo "Register first: amp-register --provider ${PROVIDER}"
        exit 1
    fi
    PROVIDERS=("$PROVIDER_LOWER")
else
    # Find all registered providers
    PROVIDERS=()
    if [ -d "$AMP_REGISTRATIONS_DIR" ]; then
        for reg_file in "${AMP_REGISTRATIONS_DIR}"/*.json; do
            if [ -f "$reg_file" ]; then
                provider_name=$(basename "$reg_file" .json)
                PROVIDERS+=("$provider_name")
            fi
        done
    fi
fi

if [ ${#PROVIDERS[@]} -eq 0 ]; then
    echo "No providers registered."
    echo ""
    echo "Register with a provider first:"
    echo "  amp-register --provider crabmail.ai --tenant <your-tenant>"
    exit 0
fi

# Fetch from each provider
TOTAL_NEW=0

for provider in "${PROVIDERS[@]}"; do
    REG_FILE="${AMP_REGISTRATIONS_DIR}/${provider}.json"
    REGISTRATION=$(cat "$REG_FILE")

    API_URL=$(echo "$REGISTRATION" | jq -r '.apiUrl')
    API_KEY=$(echo "$REGISTRATION" | jq -r '.apiKey')
    EXTERNAL_ADDRESS=$(echo "$REGISTRATION" | jq -r '.address')

    # Use explicit fetchUrl from registration if available, otherwise derive from apiUrl
    # All providers use the same AMP standard: GET /v1/messages/pending
    FETCH_ENDPOINT=$(echo "$REGISTRATION" | jq -r '.fetchUrl // empty')
    if [ -z "$FETCH_ENDPOINT" ]; then
        FETCH_ENDPOINT="${API_URL}/v1/messages/pending"
    fi

    if [ "$VERBOSE" = true ]; then
        echo "Fetching from ${provider}..."
        echo "  API: ${API_URL}"
        echo "  Fetch: ${FETCH_ENDPOINT}"
        echo "  Address: ${EXTERNAL_ADDRESS}"
    fi

    # Fetch messages from provider
    RESPONSE=$(curl -s -w "\n%{http_code}" --connect-timeout 5 --max-time 15 \
        -X GET "${FETCH_ENDPOINT}" \
        -H "Authorization: Bearer ${API_KEY}" \
        -H "Accept: application/json" 2>&1)

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" = "200" ]; then
        # Parse messages
        MESSAGE_COUNT=$(echo "$BODY" | jq '.messages | length' 2>/dev/null || echo "0")

        if [ "$MESSAGE_COUNT" = "0" ] || [ "$MESSAGE_COUNT" = "null" ]; then
            if [ "$VERBOSE" = true ]; then
                echo "  No new messages"
            fi
            continue
        fi

        if [ "$VERBOSE" = true ]; then
            echo "  Found ${MESSAGE_COUNT} new message(s)"
        fi

        # Process each message (use process substitution to avoid subshell variable scope issue)
        while read -r msg; do
            # Get message ID
            msg_id=$(echo "$msg" | jq -r '.envelope.id // .id')

            # Validate message ID format (security) - use strict format or server-assigned UUIDs
            if ! validate_message_id "$msg_id" 2>/dev/null && [[ ! "$msg_id" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{3,63}$ ]]; then
                if [ "$VERBOSE" = true ]; then
                    echo "    Skipping invalid message ID: ${msg_id}"
                fi
                continue
            fi

            # Check if already exists locally (search flat and sender subdirectories)
            if find_message_file "${msg_id}" "${AMP_INBOX_DIR}" >/dev/null 2>&1; then
                if [ "$VERBOSE" = true ]; then
                    echo "    Skipping ${msg_id} (already exists)"
                fi
                continue
            fi

            # Signature verification for fetched messages
            # If the message has a valid signature, verify it locally when possible.
            # Messages from the same provider are trusted (provider verified at route time).
            signature=$(echo "$msg" | jq -r '.envelope.signature // empty')
            sig_valid="false"

            # Check if message was relayed through the same provider we registered with
            # (provider already verified the signature at route/ingest time)
            msg_from=$(echo "$msg" | jq -r '.envelope.from // empty')
            msg_from_provider=""
            if [[ "$msg_from" == *"@"* ]]; then
                # Extract provider from address: name@tenant.provider → provider part
                msg_from_after_at="${msg_from#*@}"
                # If it has a dot, the provider is everything after the first dot
                if [[ "$msg_from_after_at" == *.* ]]; then
                    msg_from_provider="${msg_from_after_at#*.}"
                fi
            fi

            # Trust messages relayed through our registered provider
            if [ "$msg_from_provider" = "$provider" ] || \
               [[ "$provider" == *".$msg_from_provider" ]] || \
               [[ "$msg_from_provider" == *".$provider" ]]; then
                sig_valid="true"
            elif [ -n "$signature" ]; then
                # Different provider or unknown: attempt local verification
                sender_addr=$(echo "$msg" | jq -r '.envelope.from // empty')
                sender_name="${sender_addr%%@*}"
                # Look up sender UUID from .index.json for key resolution
                _sender_uuid=$(_index_lookup "$sender_name" 2>/dev/null) || true
                if [ -n "$_sender_uuid" ]; then
                    sender_pubkey="${AMP_AGENTS_BASE}/${_sender_uuid}/keys/public.pem"
                else
                    sender_pubkey="${AMP_AGENTS_BASE}/${sender_name}/keys/public.pem"
                fi

                if [ -f "$sender_pubkey" ]; then
                    # Reconstruct canonical signing data and verify
                    v_to=$(echo "$msg" | jq -r '.envelope.to // empty')
                    v_subj=$(echo "$msg" | jq -r '.envelope.subject // empty')
                    v_pri=$(echo "$msg" | jq -r '.envelope.priority // "normal"')
                    v_reply=$(echo "$msg" | jq -r '.envelope.in_reply_to // ""')
                    v_phash=$(echo "$msg" | jq -cS '.payload' | tr -d '\n' | $OPENSSL_BIN dgst -sha256 -binary 2>/dev/null | base64 | tr -d '\n')
                    v_sdata="${sender_addr}|${v_to}|${v_subj}|${v_pri}|${v_reply}|${v_phash}"

                    if verify_signature "$v_sdata" "$signature" "$sender_pubkey"; then
                        sig_valid="true"
                    else
                        if [ "$VERBOSE" = true ]; then
                            echo "    ⚠️  Signature verification failed for ${msg_id}"
                        fi
                    fi
                fi
                # No public key available — accept but mark unverified
            fi

            # Apply security module if available
            if type apply_content_security &>/dev/null; then
                load_config 2>/dev/null || true
                msg=$(apply_content_security "$msg" "${AMP_TENANT:-default}" "$sig_valid")
            fi

            # Add additional metadata (including signature verification status)
            msg=$(echo "$msg" | jq \
                --arg receivedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
                --arg provider "$provider" \
                --arg method "fetch" \
                --arg sigVerified "$sig_valid" \
                '.local = (.local // {}) + {
                    received_at: $receivedAt,
                    fetched_from: $provider,
                    delivery_method: $method,
                    signature_verified: ($sigVerified == "true"),
                    status: "unread"
                }')

            # Save to inbox (use sender subdirectory)
            from_addr=$(echo "$msg" | jq -r '.envelope.from')
            sender_dir=$(sanitize_address_for_path "$from_addr")
            mkdir -p "${AMP_INBOX_DIR}/${sender_dir}"
            echo "$msg" > "${AMP_INBOX_DIR}/${sender_dir}/${msg_id}.json"

            if [ "$VERBOSE" = true ]; then
                subject=$(echo "$msg" | jq -r '.envelope.subject')
                from=$(echo "$msg" | jq -r '.envelope.from')
                echo "    Saved: ${msg_id}"
                echo "      From: ${from}"
                echo "      Subject: ${subject}"
            fi

            # Check for suspicious attachments
            fetch_att_count=$(echo "$msg" | jq '.payload.attachments // [] | length' 2>/dev/null || echo "0")
            if [ "$fetch_att_count" -gt 0 ]; then
                while read -r fetch_att_b64; do
                    fetch_att=$(echo "$fetch_att_b64" | base64 -d)
                    fetch_scan=$(echo "$fetch_att" | jq -r '.scan_status // "unknown"')
                    fetch_att_name=$(echo "$fetch_att" | jq -r '.filename // "unknown"')
                    if [ "$fetch_scan" = "rejected" ]; then
                        echo "    ⚠️  WARNING: Attachment '${fetch_att_name}' rejected by security scan!"
                    elif [ "$fetch_scan" = "suspicious" ]; then
                        echo "    ⚠️  WARNING: Attachment '${fetch_att_name}' flagged as suspicious — requires human approval!"
                    elif [ "$fetch_scan" = "pending" ] || [ "$fetch_scan" = "unknown" ]; then
                        echo "    ⚠️  Attachment '${fetch_att_name}' scan status: ${fetch_scan}"
                    fi
                done < <(echo "$msg" | jq -r '.payload.attachments[]? | @base64' 2>/dev/null)
            fi

            TOTAL_NEW=$((TOTAL_NEW + 1))

            # Acknowledge receipt on provider (AMP standard: DELETE /v1/messages/pending/:id)
            if [ "$MARK_AS_FETCHED" = true ]; then
                # msg_id is validated to [a-zA-Z0-9_-] so safe in path segment
                curl -s --connect-timeout 3 -X DELETE "${API_URL}/v1/messages/pending/${msg_id}" \
                    -H "Authorization: Bearer ${API_KEY}" \
                    >/dev/null 2>&1 || true
            fi
        done < <(echo "$BODY" | jq -c '.messages[]' 2>/dev/null)

    elif [ "$HTTP_CODE" = "401" ]; then
        echo "Error: Authentication failed for ${provider}"
        echo "  Your API key may have expired. Re-register with:"
        echo "  amp-register --provider ${provider} --force"

    elif [ "$HTTP_CODE" = "000" ]; then
        echo "Error: Could not connect to ${provider}"
        echo "  Check your internet connection."

    else
        echo "Error: Failed to fetch from ${provider} (HTTP ${HTTP_CODE})"
        ERROR_MSG=$(echo "$BODY" | jq -r '.error // .message // empty' 2>/dev/null)
        if [ -n "$ERROR_MSG" ]; then
            echo "  ${ERROR_MSG}"
        fi
    fi
done

# Summary
if [ "$TOTAL_NEW" -gt 0 ]; then
    echo ""
    echo "✅ Fetched ${TOTAL_NEW} new message(s)"
    echo ""
    echo "View messages: amp-inbox"
else
    echo "No new messages from external providers."
fi
