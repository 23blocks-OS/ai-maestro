#!/bin/bash
# =============================================================================
# AMP Send - Send a Message
# =============================================================================
#
# Send a message to another agent.
#
# Usage:
#   amp-send <recipient> <subject> <message> [options]
#
# Examples:
#   amp-send alice "Hello" "How are you?"
#   amp-send backend-api@23blocks.crabmail.ai "Deploy" "Ready for deploy" --priority high
#   amp-send bob --type task "Review PR" "Please review PR #42"
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
RECIPIENT=""
SUBJECT=""
MESSAGE=""
PRIORITY="normal"
TYPE="notification"
REPLY_TO=""
THREAD_ID=""
CONTEXT="null"
ATTACH_FILES=()

show_help() {
    echo "Usage: amp-send <recipient> <subject> <message> [options]"
    echo ""
    echo "Send a message to another agent."
    echo ""
    echo "Arguments:"
    echo "  recipient   Agent address (e.g., alice, bob@tenant.provider)"
    echo "  subject     Message subject"
    echo "  message     Message body"
    echo ""
    echo "Options:"
    echo "  --priority, -p PRIORITY   low|normal|high|urgent (default: normal)"
    echo "  --type, -t TYPE           request|response|notification|task|status (default: notification)"
    echo "  --reply-to, -r ID         Message ID this is replying to"
    echo "  --context, -c JSON        Additional context as JSON"
    echo "  --attach, -a FILE         Attach a file (repeatable, max ${AMP_MAX_ATTACHMENTS} files,"
    echo "                              max $(format_file_size "$AMP_MAX_ATTACHMENT_SIZE")/file,"
    echo "                              max $(format_file_size "$AMP_MAX_TOTAL_ATTACHMENT_SIZE") total)"
    echo "  --id UUID                 Operate as this agent (UUID from config.json)"
    echo "  --help, -h                Show this help"
    echo ""
    echo "Address formats:"
    echo "  alice                     → alice@default.local (local)"
    echo "  alice@myteam.local        → alice@myteam.local (local)"
    echo "  alice@acme.crabmail.ai    → alice@acme.crabmail.ai (external)"
    echo ""
    echo "Examples:"
    echo "  amp-send alice \"Hello\" \"How are you?\""
    echo "  amp-send backend-api \"Deploy\" \"Ready\" --priority high"
    echo "  amp-send bob@acme.crabmail.ai \"Help\" \"Need assistance\" --type request"
}

# Parse positional and optional arguments
POSITIONAL=()
while [[ $# -gt 0 ]]; do
    case $1 in
        --priority|-p)
            PRIORITY="$2"
            shift 2
            ;;
        --type|-t)
            TYPE="$2"
            shift 2
            ;;
        --reply-to|-r)
            REPLY_TO="$2"
            shift 2
            ;;
        --thread-id)
            THREAD_ID="$2"
            shift 2
            ;;
        --context|-c)
            CONTEXT="$2"
            shift 2
            ;;
        --attach|-a)
            ATTACH_FILES+=("$2")
            shift 2
            ;;
        --id)
            shift 2  # Already handled in pre-source parsing
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        -*)
            echo "Unknown option: $1"
            echo "Run 'amp-send --help' for usage."
            exit 1
            ;;
        *)
            POSITIONAL+=("$1")
            shift
            ;;
    esac
done

# Check positional arguments
if [ ${#POSITIONAL[@]} -lt 3 ]; then
    echo "Error: Missing required arguments."
    echo ""
    show_help
    exit 1
fi

RECIPIENT="${POSITIONAL[0]}"
SUBJECT="${POSITIONAL[1]}"
MESSAGE="${POSITIONAL[2]}"

# Validate priority
if [[ ! "$PRIORITY" =~ ^(low|normal|high|urgent)$ ]]; then
    echo "Error: Invalid priority '${PRIORITY}'"
    echo "Valid values: low, normal, high, urgent"
    exit 1
fi

# Validate type
if [[ ! "$TYPE" =~ ^(request|response|notification|task|status|alert|update|handoff|ack|system)$ ]]; then
    echo "Error: Invalid type '${TYPE}'"
    echo "Valid values: request, response, notification, task, status, alert, update, handoff, ack, system"
    exit 1
fi

# Validate context is valid JSON (if provided)
if [ "$CONTEXT" != "null" ]; then
    if ! echo "$CONTEXT" | jq . >/dev/null 2>&1; then
        echo "Error: Invalid JSON context"
        exit 1
    fi
fi

# Require initialization
require_init

# =============================================================================
# Attachment Validation
# =============================================================================

ATTACHMENTS_JSON="[]"

if [ ${#ATTACH_FILES[@]} -gt 0 ]; then
    # Check attachment count limit
    if [ ${#ATTACH_FILES[@]} -gt "$AMP_MAX_ATTACHMENTS" ]; then
        echo "Error: Too many attachments (${#ATTACH_FILES[@]}). Maximum is ${AMP_MAX_ATTACHMENTS}."
        exit 1
    fi

    TOTAL_ATTACH_SIZE=0
    for attach_file in "${ATTACH_FILES[@]}"; do
        # Check file exists
        if [ ! -f "$attach_file" ]; then
            echo "Error: Attachment not found: ${attach_file}"
            exit 1
        fi

        # Check file size
        local_size=$(wc -c < "$attach_file" | tr -d ' ')
        if [ "$local_size" -gt "$AMP_MAX_ATTACHMENT_SIZE" ]; then
            echo "Error: Attachment too large: $(basename "$attach_file") ($(format_file_size "$local_size"))"
            echo "  Maximum size per file: $(format_file_size "$AMP_MAX_ATTACHMENT_SIZE")"
            exit 1
        fi

        # Track total size
        TOTAL_ATTACH_SIZE=$((TOTAL_ATTACH_SIZE + local_size))
        if [ "$TOTAL_ATTACH_SIZE" -gt "$AMP_MAX_TOTAL_ATTACHMENT_SIZE" ]; then
            echo "Error: Total attachment size exceeds limit ($(format_file_size "$TOTAL_ATTACH_SIZE"))"
            echo "  Maximum total: $(format_file_size "$AMP_MAX_TOTAL_ATTACHMENT_SIZE")"
            exit 1
        fi

        # Check MIME type
        local_mime=$(detect_mime_type "$attach_file")
        if is_mime_blocked "$local_mime"; then
            echo "Error: Blocked file type: ${local_mime} ($(basename "$attach_file"))"
            echo "  Executable and script files are not allowed as attachments."
            exit 1
        fi

        echo "  Preparing attachment: $(basename "$attach_file") ($(format_file_size "$local_size"))"
    done
fi

# Determine routing
ROUTE=$(get_message_route "$RECIPIENT")

# Create the message
MESSAGE_JSON=$(create_message "$RECIPIENT" "$SUBJECT" "$MESSAGE" "$TYPE" "$PRIORITY" "$REPLY_TO" "$CONTEXT" "$THREAD_ID")

# =============================================================================
# Upload Attachments (if any, and we have API credentials)
# =============================================================================

if [ ${#ATTACH_FILES[@]} -gt 0 ]; then
    # Find API credentials for upload
    UPLOAD_API_URL=""
    UPLOAD_API_KEY=""

    # Try local provider registration first (any .local domain)
    for provider_file in "${AMP_REGISTRATIONS_DIR}"/*.json; do
        [ -f "$provider_file" ] || continue
        prov=$(jq -r '.provider // empty' "$provider_file" 2>/dev/null)
        if [[ "$prov" == *.local ]]; then
            UPLOAD_API_URL=$(jq -r '.apiUrl // empty' "$provider_file" 2>/dev/null)
            UPLOAD_API_KEY=$(jq -r '.apiKey // empty' "$provider_file" 2>/dev/null)
            break
        fi
    done

    # Fall back to external provider registration if external route
    if [ -z "$UPLOAD_API_URL" ] && [ "$ROUTE" != "local" ]; then
        REG_FILE="${AMP_REGISTRATIONS_DIR}/${ROUTE}.json"
        if [ -f "$REG_FILE" ]; then
            UPLOAD_API_URL=$(jq -r '.apiUrl // empty' "$REG_FILE" 2>/dev/null)
            UPLOAD_API_KEY=$(jq -r '.apiKey // empty' "$REG_FILE" 2>/dev/null)
        fi
    fi

    if [ -n "$UPLOAD_API_URL" ] && [ -n "$UPLOAD_API_KEY" ]; then
        for attach_file in "${ATTACH_FILES[@]}"; do
            echo "  Uploading: $(basename "$attach_file")..."
            att_meta=$(upload_attachment "$attach_file" "$UPLOAD_API_URL" "$UPLOAD_API_KEY")
            if [ $? -ne 0 ]; then
                echo "Error: Failed to upload attachment: $(basename "$attach_file")"
                exit 1
            fi
            ATTACHMENTS_JSON=$(echo "$ATTACHMENTS_JSON" | jq --argjson att "$att_meta" '. + [$att]')

            scan_status=$(echo "$att_meta" | jq -r '.scan_status')
            if [ "$scan_status" = "rejected" ]; then
                echo "Error: Attachment rejected by security scan: $(basename "$attach_file")"
                exit 1
            fi
        done
    else
        # No API — create local attachment metadata (for filesystem delivery)
        for attach_file in "${ATTACH_FILES[@]}"; do
            local_att_id=$(generate_attachment_id)
            local_filename=$(sanitize_filename "$(basename "$attach_file")")
            local_mime=$(detect_mime_type "$attach_file")
            local_size=$(wc -c < "$attach_file" | tr -d ' ')
            local_digest=$(compute_file_digest "$attach_file")

            # Copy file to attachments directory
            ensure_amp_dirs
            local_att_dir="${AMP_ATTACHMENTS_DIR}/${local_att_id}"
            mkdir -p "$local_att_dir"
            cp "$attach_file" "${local_att_dir}/${local_filename}"
            chmod 600 "${local_att_dir}/${local_filename}"

            # Verify digest after copy (S-P2-01: detect silent corruption)
            local_copy_digest=$(compute_file_digest "${local_att_dir}/${local_filename}")
            if [ "$local_copy_digest" != "$local_digest" ]; then
                echo "Error: Digest mismatch after copy for $(basename "$attach_file")" >&2
                rm -f "${local_att_dir}/${local_filename}"
                exit 1
            fi

            # Determine scan status: perform basic MIME verification locally
            # Full scanning (AV, injection) requires provider infrastructure
            # Use spec-defined values: basic_clean (MIME checks passed), unscanned (no checks)
            local_scan_status="unscanned"
            if is_mime_blocked "$local_mime"; then
                local_scan_status="rejected"
            else
                # MIME check passed - mark as basic_clean (required checks done, no AV)
                local_scan_status="basic_clean"
            fi

            local_uploaded_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

            att_meta=$(jq -n \
                --arg id "$local_att_id" \
                --arg filename "$local_filename" \
                --arg content_type "$local_mime" \
                --argjson size "$local_size" \
                --arg digest "$local_digest" \
                --arg scan_status "$local_scan_status" \
                --arg uploaded_at "$local_uploaded_at" \
                --arg expires_at "$(compute_expiry_date 7)" \
                '{id: $id, filename: $filename, content_type: $content_type, size: $size, digest: $digest, url: null, scan_status: $scan_status, uploaded_at: $uploaded_at, expires_at: $expires_at}')
            ATTACHMENTS_JSON=$(echo "$ATTACHMENTS_JSON" | jq --argjson att "$att_meta" '. + [$att]')
        done
    fi

    # Inject attachments array into message payload
    MESSAGE_JSON=$(echo "$MESSAGE_JSON" | jq --argjson atts "$ATTACHMENTS_JSON" '.payload.attachments = $atts')
fi

# =============================================================================
# Sign the message (required for all delivery methods)
# =============================================================================
# Create canonical string for signing
# Format: from|to|subject|priority|in_reply_to|payload_hash
#
# This format follows AMP Protocol v1.1 specification:
# - Signs only fields the CLIENT controls (not server-generated id/timestamp)
# - Includes priority to prevent escalation attacks
# - Includes in_reply_to to prevent thread hijacking
# - payload_hash covers entire payload content
#
# Use jq -cS for compact JSON with sorted keys (required for cross-language interop)
# Note: jq adds a trailing newline, so we remove it with tr before hashing
PAYLOAD_HASH=$(echo "$MESSAGE_JSON" | jq -cS '.payload' | tr -d '\n' | $OPENSSL_BIN dgst -sha256 -binary | base64 | tr -d '\n')
# Extract envelope fields in a single jq call for efficiency
read -r FROM_ADDR TO_ADDR SUBJ < <(echo "$MESSAGE_JSON" | jq -r '[.envelope.from, .envelope.to, .envelope.subject] | @tsv')
# PRIORITY and REPLY_TO are already set from arguments (empty string if not provided)
SIGN_DATA="${FROM_ADDR}|${TO_ADDR}|${SUBJ}|${PRIORITY}|${REPLY_TO}|${PAYLOAD_HASH}"
SIGNATURE=$(sign_message "$SIGN_DATA")

# Add signature to message
MESSAGE_JSON=$(echo "$MESSAGE_JSON" | jq --arg sig "$SIGNATURE" '.envelope.signature = $sig')

# =============================================================================
# Helper: Send via AMP provider API
# =============================================================================
# Builds the flat API body, sends with timeouts, handles response.
# Used by both the registered and auto-registered code paths.
#
# Args: $1=send_url  $2=api_key  $3=full_recipient  $4=label (for display)
# Exits 0 on success, 1 on failure.
send_via_api() {
    local send_url="$1"
    local api_key="$2"
    local full_recipient="$3"
    local label="${4:-AMP routing}"

    local api_body
    api_body=$(jq -n \
        --arg to "$full_recipient" \
        --arg subject "$SUBJECT" \
        --arg priority "$PRIORITY" \
        --arg type "$TYPE" \
        --arg message "$MESSAGE" \
        --arg in_reply_to "$REPLY_TO" \
        --arg thread_id "$THREAD_ID" \
        --argjson context "$CONTEXT" \
        --argjson attachments "$ATTACHMENTS_JSON" \
        --arg signature "$SIGNATURE" \
        '{
            to: $to,
            subject: $subject,
            priority: $priority,
            payload: ({
                type: $type,
                message: $message,
                context: $context
            } + (if ($attachments | length) > 0 then {attachments: $attachments} else {} end)),
            in_reply_to: (if $in_reply_to == "" then null else $in_reply_to end),
            thread_id: (if $thread_id == "" then null else $thread_id end),
            signature: $signature
        }')

    local response
    response=$(curl -s -w "\n%{http_code}" --connect-timeout 5 --max-time 15 \
        -X POST "${send_url}" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${api_key}" \
        -d "$api_body" 2>&1)

    local http_code
    http_code=$(echo "$response" | tail -n1)
    local body
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ] || [ "$http_code" = "202" ]; then
        save_to_sent "$MESSAGE_JSON" >/dev/null

        local msg_id
        msg_id=$(echo "$body" | jq -r '.id // empty')
        [ -z "$msg_id" ] && msg_id=$(echo "$MESSAGE_JSON" | jq -r '.envelope.id')

        local delivery_status
        delivery_status=$(echo "$body" | jq -r '.status // "sent"')
        local delivery_method
        delivery_method=$(echo "$body" | jq -r '.method // "api"')

        echo "✅ Message sent via ${label}"
        echo ""
        echo "  To:       ${full_recipient}"
        echo "  Subject:  ${SUBJECT}"
        echo "  Priority: ${PRIORITY}"
        echo "  Type:     ${TYPE}"
        echo "  ID:       ${msg_id}"
        echo "  Status:   ${delivery_status}"
        echo "  Method:   ${delivery_method}"

        local att_count
        att_count=$(echo "$ATTACHMENTS_JSON" | jq 'length' 2>/dev/null || echo "0")
        if [ "$att_count" -gt 0 ]; then
            echo "  Attach:   ${att_count} file(s)"
        fi

        return 0
    else
        echo "❌ Failed to send via ${label} (HTTP ${http_code})"
        local error_msg
        error_msg=$(echo "$body" | jq -r '.error // .message // "Unknown error"' 2>/dev/null)
        if [ -n "$error_msg" ] && [ "$error_msg" != "null" ]; then
            echo "   Error: ${error_msg}"
        fi
        return 1
    fi
}

# =============================================================================
# Helper: Check if a registration is for a local provider (any .local domain)
# =============================================================================
is_local_provider_registration() {
    local provider_name="$1"
    [[ "$provider_name" == *.local ]]
}

# =============================================================================
# Routing Decision
# =============================================================================
# For "local" routes, check if we're registered with a local provider.
# If so, use the API for proper mesh routing; otherwise, fall back to filesystem.

if [ "$ROUTE" = "local" ]; then
    # Try to find a local provider registration
    LOCAL_PROVIDER_REG=""
    for provider_file in "${AMP_REGISTRATIONS_DIR}"/*.json; do
        [ -f "$provider_file" ] || continue
        provider=$(jq -r '.provider // empty' "$provider_file" 2>/dev/null)
        if is_local_provider_registration "$provider"; then
            LOCAL_PROVIDER_REG="$provider_file"
            break
        fi
    done

    if [ -n "$LOCAL_PROVIDER_REG" ] && [ -f "$LOCAL_PROVIDER_REG" ]; then
        # ==========================================================================
        # Local Provider Delivery
        # ==========================================================================
        # Priority: filesystem delivery if recipient is on this machine,
        # otherwise use the provider API for cross-host mesh routing.

        parse_address "$RECIPIENT"
        FULL_RECIPIENT=$(build_address "$ADDR_NAME" "$ADDR_TENANT" "$ADDR_PROVIDER")

        # Check if recipient exists on this filesystem first
        AGENTS_BASE_DIR="${HOME}/.agent-messaging/agents"
        RECIPIENT_UUID=$(_index_lookup "$ADDR_NAME" 2>/dev/null) || true
        if [ -n "$RECIPIENT_UUID" ]; then
            RECIPIENT_AMP_DIR="${AGENTS_BASE_DIR}/${RECIPIENT_UUID}"
        else
            RECIPIENT_AMP_DIR="${AGENTS_BASE_DIR}/${ADDR_NAME}"
        fi

        if [ -d "${RECIPIENT_AMP_DIR}" ] && [ -f "${RECIPIENT_AMP_DIR}/config.json" ]; then
            # Recipient IS on this machine — deliver directly via filesystem
            save_to_sent "$MESSAGE_JSON" >/dev/null
            MSG_ID=$(echo "$MESSAGE_JSON" | jq -r '.envelope.id')

            # MF-023: Validate MSG_ID before using as filesystem path to prevent path traversal
            validate_message_id "$MSG_ID"

            RECIPIENT_INBOX="${RECIPIENT_AMP_DIR}/messages/inbox"
            FROM_ADDR=$(echo "$MESSAGE_JSON" | jq -r '.envelope.from')
            SENDER_DIR=$(sanitize_address_for_path "$FROM_ADDR")
            mkdir -p "${RECIPIENT_INBOX}/${SENDER_DIR}"

            # Strip local_path from attachments before delivery
            DELIVERY_MSG=$(echo "$MESSAGE_JSON" | jq \
                --arg received "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
                '.local = (.local // {}) + {received_at: $received, status: "unread"} |
                 .payload.attachments = [(.payload.attachments // [])[] | del(.local_path)]')

            # Apply content security (injection detection + wrapping) before writing
            if type apply_content_security &>/dev/null; then
                DELIVERY_MSG=$(apply_content_security "$DELIVERY_MSG" "${AMP_TENANT:-default}" "true")
            fi

            echo "$DELIVERY_MSG" > "${RECIPIENT_INBOX}/${SENDER_DIR}/${MSG_ID}.json"

            echo "✅ Message sent (local filesystem delivery)"
            echo ""
            echo "  To:       ${FULL_RECIPIENT}"
            echo "  Subject:  ${SUBJECT}"
            echo "  Priority: ${PRIORITY}"
            echo "  Type:     ${TYPE}"
            echo "  ID:       ${MSG_ID}"

            local_att_count=$(echo "$ATTACHMENTS_JSON" | jq 'length' 2>/dev/null || echo "0")
            if [ "$local_att_count" -gt 0 ]; then
                echo "  Attach:   ${local_att_count} file(s)"
            fi
        else
            # Recipient NOT on this machine — use provider API for cross-host routing
            REGISTRATION=$(cat "$LOCAL_PROVIDER_REG")
            API_URL=$(echo "$REGISTRATION" | jq -r '.apiUrl')
            API_KEY=$(echo "$REGISTRATION" | jq -r '.apiKey')
            ROUTE_URL=$(echo "$REGISTRATION" | jq -r '.routeUrl // empty')

            SEND_URL="${ROUTE_URL:-${API_URL}/route}"
            send_via_api "$SEND_URL" "$API_KEY" "$FULL_RECIPIENT" "AMP routing" || exit 1
        fi

    else
        # ==========================================================================
        # No local provider registration found — attempt auto-registration
        # ==========================================================================
        echo "  No AMP registration found. Auto-registering..."

        # Read agent's public key
        AUTO_REG_PUBLIC_KEY=""
        if [ -f "${AMP_KEYS_DIR}/public.pem" ]; then
            AUTO_REG_PUBLIC_KEY=$(cat "${AMP_KEYS_DIR}/public.pem")
        fi

        # Read agent name and tenant from config (nested under .agent)
        AUTO_REG_NAME=$(jq -r '.agent.name // .name // empty' "$AMP_CONFIG" 2>/dev/null)
        AUTO_REG_TENANT=$(jq -r '.agent.tenant // .tenant // "default"' "$AMP_CONFIG" 2>/dev/null)

        AUTO_REG_SUCCESS=false

        if [ -n "$AUTO_REG_PUBLIC_KEY" ] && [ -n "$AUTO_REG_NAME" ]; then
            AUTO_REG_REQUEST=$(jq -n \
                --arg name "$AUTO_REG_NAME" \
                --arg tenant "$AUTO_REG_TENANT" \
                --arg publicKey "$AUTO_REG_PUBLIC_KEY" \
                '{
                    name: $name,
                    tenant: $tenant,
                    public_key: $publicKey,
                    key_algorithm: "Ed25519"
                }')

            AUTO_REG_RESPONSE=$(curl -s -w "\n%{http_code}" --connect-timeout 3 -X POST \
                "${AMP_MAESTRO_URL}/api/v1/register" \
                -H "Content-Type: application/json" \
                -d "$AUTO_REG_REQUEST" 2>&1) || true

            AUTO_REG_HTTP=$(echo "$AUTO_REG_RESPONSE" | tail -n1)
            AUTO_REG_BODY=$(echo "$AUTO_REG_RESPONSE" | sed '$d')

            if [ "$AUTO_REG_HTTP" = "200" ] || [ "$AUTO_REG_HTTP" = "201" ]; then
                # Parse registration and save
                AUTO_API_KEY=$(echo "$AUTO_REG_BODY" | jq -r '.api_key // empty')
                AUTO_ADDRESS=$(echo "$AUTO_REG_BODY" | jq -r '.address // empty')
                AUTO_AGENT_ID=$(echo "$AUTO_REG_BODY" | jq -r '.agent_id // empty')
                AUTO_PROVIDER_NAME=$(echo "$AUTO_REG_BODY" | jq -r '.provider.name // "aimaestro.local"')
                AUTO_PROVIDER_ENDPOINT=$(echo "$AUTO_REG_BODY" | jq -r '.provider.endpoint // empty')
                AUTO_ROUTE_URL=$(echo "$AUTO_REG_BODY" | jq -r '.provider.route_url // empty')
                AUTO_FINGERPRINT=$(jq -r '.agent.fingerprint // .fingerprint // empty' "$AMP_CONFIG" 2>/dev/null)

                if [ -n "$AUTO_API_KEY" ]; then
                    ensure_amp_dirs
                    REG_FILE="${AMP_REGISTRATIONS_DIR}/${AUTO_PROVIDER_NAME}.json"

                    jq -n \
                        --arg provider "$AUTO_PROVIDER_NAME" \
                        --arg apiUrl "${AUTO_PROVIDER_ENDPOINT:-${AMP_MAESTRO_URL}/api/v1}" \
                        --arg routeUrl "${AUTO_ROUTE_URL:-${AUTO_PROVIDER_ENDPOINT:-${AMP_MAESTRO_URL}/api/v1}/route}" \
                        --arg agentName "$AUTO_REG_NAME" \
                        --arg tenant "$AUTO_REG_TENANT" \
                        --arg address "${AUTO_ADDRESS:-${AUTO_REG_NAME}@${AUTO_REG_TENANT}.${AMP_PROVIDER_DOMAIN}}" \
                        --arg apiKey "$AUTO_API_KEY" \
                        --arg providerAgentId "$AUTO_AGENT_ID" \
                        --arg fingerprint "$AUTO_FINGERPRINT" \
                        --arg registeredAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
                        '{
                            provider: $provider,
                            apiUrl: $apiUrl,
                            routeUrl: $routeUrl,
                            agentName: $agentName,
                            tenant: $tenant,
                            address: $address,
                            apiKey: $apiKey,
                            providerAgentId: $providerAgentId,
                            fingerprint: $fingerprint,
                            registeredAt: $registeredAt
                        }' > "$REG_FILE"
                    chmod 600 "$REG_FILE"

                    echo "  ✅ AMP identity registered"
                    AUTO_REG_SUCCESS=true

                    # Send via the newly-registered provider
                    parse_address "$RECIPIENT"
                    FULL_RECIPIENT=$(build_address "$ADDR_NAME" "$ADDR_TENANT" "$ADDR_PROVIDER")

                    AUTO_SEND_URL="${AUTO_ROUTE_URL:-${AUTO_PROVIDER_ENDPOINT:-${AMP_MAESTRO_URL}/api/v1}/route}"
                    send_via_api "$AUTO_SEND_URL" "$AUTO_API_KEY" "$FULL_RECIPIENT" "AMP routing (auto-registered)" || exit 1
                fi
            elif [ "$AUTO_REG_HTTP" = "409" ]; then
                echo "  ⚠️  AMP identity already registered but local config is missing."
                echo "     Re-run: amp-init.sh --force --auto"
            fi
        fi

        # If auto-registration failed, check if recipient is truly local
        if [ "$AUTO_REG_SUCCESS" = false ]; then
            parse_address "$RECIPIENT"
            FULL_RECIPIENT=$(build_address "$ADDR_NAME" "$ADDR_TENANT" "$ADDR_PROVIDER")

            AGENTS_BASE_DIR="${HOME}/.agent-messaging/agents"
            # Look up recipient UUID from .index.json
            RECIPIENT_UUID=$(_index_lookup "$ADDR_NAME" 2>/dev/null) || true
            if [ -n "$RECIPIENT_UUID" ]; then
                RECIPIENT_AMP_DIR="${AGENTS_BASE_DIR}/${RECIPIENT_UUID}"
            else
                RECIPIENT_AMP_DIR="${AGENTS_BASE_DIR}/${ADDR_NAME}"
            fi

            if [ -d "${RECIPIENT_AMP_DIR}" ] && [ -f "${RECIPIENT_AMP_DIR}/config.json" ]; then
                # Recipient IS on this machine - filesystem delivery is valid
                save_to_sent "$MESSAGE_JSON" >/dev/null
                MSG_ID=$(echo "$MESSAGE_JSON" | jq -r '.envelope.id')

                # MF-023: Validate MSG_ID before using as filesystem path to prevent path traversal
                validate_message_id "$MSG_ID"

                RECIPIENT_INBOX="${RECIPIENT_AMP_DIR}/messages/inbox"
                FROM_ADDR=$(echo "$MESSAGE_JSON" | jq -r '.envelope.from')
                SENDER_DIR=$(sanitize_address_for_path "$FROM_ADDR")
                mkdir -p "${RECIPIENT_INBOX}/${SENDER_DIR}"

                # Strip local_path from attachments before delivery
                DELIVERY_MSG=$(echo "$MESSAGE_JSON" | jq \
                    --arg received "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
                    '.local = (.local // {}) + {received_at: $received, status: "unread"} |
                     .payload.attachments = [(.payload.attachments // [])[] | del(.local_path)]')

                # Apply content security (injection detection + wrapping) before writing
                if type apply_content_security &>/dev/null; then
                    DELIVERY_MSG=$(apply_content_security "$DELIVERY_MSG" "${AMP_TENANT:-default}" "true")
                fi

                echo "$DELIVERY_MSG" > "${RECIPIENT_INBOX}/${SENDER_DIR}/${MSG_ID}.json"

                echo "✅ Message sent (local filesystem delivery)"
                echo ""
                echo "  To:       ${FULL_RECIPIENT}"
                echo "  Subject:  ${SUBJECT}"
                echo "  Priority: ${PRIORITY}"
                echo "  Type:     ${TYPE}"
                echo "  ID:       ${MSG_ID}"

                fs_att_count=$(echo "$ATTACHMENTS_JSON" | jq 'length' 2>/dev/null || echo "0")
                if [ "$fs_att_count" -gt 0 ]; then
                    echo "  Attach:   ${fs_att_count} file(s)"
                fi
            else
                # Recipient NOT on this machine AND no AMP registration
                echo "❌ Cannot deliver message to '${FULL_RECIPIENT}'"
                echo ""
                echo "  The recipient '${ADDR_NAME}' was not found on this machine,"
                echo "  and this agent has no AMP identity for cross-host routing."
                echo ""
                echo "  To fix this, run:"
                echo "    amp-init.sh --force --auto"
                echo ""
                echo "  This will create an AMP identity and enable cross-host messaging."
                exit 1
            fi
        fi
    fi

else
    # ==========================================================================
    # External Delivery (via provider)
    # ==========================================================================
    # External providers use the full AMP envelope format (not the flat body
    # used by AI Maestro's /api/v1/route). The message is re-signed with the
    # agent's external address before sending.

    # Check if registered with this provider
    if ! is_registered "$ROUTE"; then
        echo "Error: Not registered with provider '${ROUTE}'"
        echo ""
        echo "To send messages to ${ROUTE}, you need to register first:"
        echo "  amp-register --provider ${ROUTE}"
        exit 1
    fi

    # Load registration
    REGISTRATION=$(get_registration "$ROUTE")
    API_URL=$(echo "$REGISTRATION" | jq -r '.apiUrl')
    API_KEY=$(echo "$REGISTRATION" | jq -r '.apiKey')
    ROUTE_URL=$(echo "$REGISTRATION" | jq -r '.routeUrl // empty')
    EXTERNAL_ADDRESS=$(echo "$REGISTRATION" | jq -r '.address')

    # Update the 'from' address to use external address
    MESSAGE_JSON=$(echo "$MESSAGE_JSON" | jq --arg from "$EXTERNAL_ADDRESS" '.envelope.from = $from')

    # Re-sign the message with the external address
    # Format: from|to|subject|priority|in_reply_to|payload_hash (AMP Protocol v1.1)
    EXT_FROM_ADDR=$(echo "$MESSAGE_JSON" | jq -r '.envelope.from')
    EXT_TO_ADDR=$(echo "$MESSAGE_JSON" | jq -r '.envelope.to')
    EXT_SUBJ=$(echo "$MESSAGE_JSON" | jq -r '.envelope.subject')
    EXT_PRIORITY=$(echo "$MESSAGE_JSON" | jq -r '.envelope.priority // "normal"')
    EXT_REPLY_TO=$(echo "$MESSAGE_JSON" | jq -r '.envelope.in_reply_to // ""')
    EXT_PAYLOAD_HASH=$(echo "$MESSAGE_JSON" | jq -cS '.payload' | tr -d '\n' | $OPENSSL_BIN dgst -sha256 -binary | base64 | tr -d '\n')
    SIGN_DATA="${EXT_FROM_ADDR}|${EXT_TO_ADDR}|${EXT_SUBJ}|${EXT_PRIORITY}|${EXT_REPLY_TO}|${EXT_PAYLOAD_HASH}"
    SIGNATURE=$(sign_message "$SIGN_DATA")

    # Add signature to message
    MESSAGE_JSON=$(echo "$MESSAGE_JSON" | jq --arg sig "$SIGNATURE" '.envelope.signature = $sig')

    # Send full AMP envelope to external provider (strip internal metadata/local fields)
    EXT_SEND_BODY=$(echo "$MESSAGE_JSON" | jq 'del(.metadata, .local)')
    EXT_SEND_URL="${ROUTE_URL:-${API_URL}/v1/route}"
    RESPONSE=$(curl -s -w "\n%{http_code}" --connect-timeout 5 --max-time 15 \
        -X POST "${EXT_SEND_URL}" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${API_KEY}" \
        -d "$EXT_SEND_BODY")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "202" ]; then
        # Save to sent folder
        save_to_sent "$MESSAGE_JSON" >/dev/null

        MSG_ID=$(echo "$MESSAGE_JSON" | jq -r '.envelope.id')
        parse_address "$RECIPIENT"
        FULL_RECIPIENT=$(build_address "$ADDR_NAME" "$ADDR_TENANT" "$ADDR_PROVIDER")

        DELIVERY_STATUS=$(echo "$BODY" | jq -r '.status // "queued"' 2>/dev/null)

        echo "✅ Message sent via ${ROUTE}"
        echo ""
        echo "  To:       ${FULL_RECIPIENT}"
        echo "  Subject:  ${SUBJECT}"
        echo "  Priority: ${PRIORITY}"
        echo "  Type:     ${TYPE}"
        echo "  ID:       ${MSG_ID}"
        echo "  Status:   ${DELIVERY_STATUS}"

        ext_att_count=$(echo "$ATTACHMENTS_JSON" | jq 'length' 2>/dev/null || echo "0")
        if [ "$ext_att_count" -gt 0 ]; then
            echo "  Attach:   ${ext_att_count} file(s)"
        fi
    else
        echo "❌ Failed to send message (HTTP ${HTTP_CODE})"
        ERROR_MSG=$(echo "$BODY" | jq -r '.error // .message // "Unknown error"' 2>/dev/null)
        if [ -n "$ERROR_MSG" ] && [ "$ERROR_MSG" != "null" ]; then
            echo "   Error: ${ERROR_MSG}"
        fi
        exit 1
    fi
fi
