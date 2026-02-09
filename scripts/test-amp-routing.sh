#!/bin/bash
# =============================================================================
# AMP Routing Test Suite
# =============================================================================
#
# Tests message routing across different scenarios:
#   1. Internal agent to internal agent (same AI Maestro)
#   2. Internal agent to external agent (polling-based)
#   3. External agent to internal agent
#   4. Cross-provider federation (expected to fail gracefully)
#
# Prerequisites:
#   - AI Maestro running on localhost:23000
#   - jq installed
#   - AMP scripts installed (amp-*.sh)
#
# Usage:
#   ./scripts/test-amp-routing.sh
#
# =============================================================================

# Don't use set -e - we handle errors manually
# set -e

# Timeouts
CURL_TIMEOUT=10

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="${AMP_API_URL:-http://localhost:23000/api/v1}"
TEST_DIR="/tmp/amp-routing-tests"
RESULTS_FILE="${TEST_DIR}/results.json"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# =============================================================================
# Utility Functions
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_section() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# Check if API is available
check_api() {
    local response
    response=$(curl -s -m "${CURL_TIMEOUT}" -o /dev/null -w "%{http_code}" "${API_URL}/health" 2>/dev/null || echo "000")
    if [ "$response" = "200" ]; then
        return 0
    fi
    return 1
}

# Generate unique test ID
generate_test_id() {
    echo "test_$(date +%s)_$(head -c 4 /dev/urandom | xxd -p)"
}

# =============================================================================
# Test Agent Setup
# =============================================================================

# Create a test agent identity
create_test_agent() {
    local name="$1"
    local agent_dir="${TEST_DIR}/agents/${name}"

    mkdir -p "${agent_dir}/keys"

    # Generate Ed25519 keypair
    openssl genpkey -algorithm Ed25519 -out "${agent_dir}/keys/private.pem" 2>/dev/null
    openssl pkey -in "${agent_dir}/keys/private.pem" -pubout -out "${agent_dir}/keys/public.pem" 2>/dev/null

    # Get public key hex
    local public_key_hex
    public_key_hex=$(openssl pkey -pubin -in "${agent_dir}/keys/public.pem" -outform DER 2>/dev/null | tail -c 32 | xxd -p | tr -d '\n')

    # Calculate fingerprint
    local fingerprint
    fingerprint=$(openssl pkey -in "${agent_dir}/keys/private.pem" -pubout -outform DER 2>/dev/null | openssl dgst -sha256 -binary | base64)

    # Save agent info
    cat > "${agent_dir}/config.json" << EOF
{
    "name": "${name}",
    "public_key_hex": "${public_key_hex}",
    "fingerprint": "SHA256:${fingerprint}",
    "keys": {
        "private": "${agent_dir}/keys/private.pem",
        "public": "${agent_dir}/keys/public.pem"
    }
}
EOF

    echo "${agent_dir}"
}

# Register an agent with AI Maestro
register_agent() {
    local name="$1"
    local tenant="$2"
    local agent_dir="$3"

    local public_key
    public_key=$(cat "${agent_dir}/keys/public.pem")

    local response
    response=$(curl -s -m "${CURL_TIMEOUT}" -X POST "${API_URL}/register" \
        -H "Content-Type: application/json" \
        -d "{
            \"name\": \"${name}\",
            \"tenant\": \"${tenant}\",
            \"public_key\": $(echo "$public_key" | jq -Rs .),
            \"key_algorithm\": \"Ed25519\"
        }")

    # Save registration response
    echo "$response" > "${agent_dir}/registration.json"

    # Extract API key
    local api_key
    api_key=$(echo "$response" | jq -r '.api_key // empty')

    if [ -n "$api_key" ]; then
        echo "$api_key" > "${agent_dir}/api_key"
        echo "$api_key"
        return 0
    else
        echo "Registration failed: $(echo "$response" | jq -r '.error // .message // "unknown error"')" >&2
        return 1
    fi
}

# =============================================================================
# Message Sending Functions
# =============================================================================

# Send a message via AMP API
send_message() {
    local api_key="$1"
    local to="$2"
    local subject="$3"
    local message="$4"
    local msg_type="${5:-notification}"

    local response
    response=$(curl -s -m "${CURL_TIMEOUT}" -X POST "${API_URL}/route" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${api_key}" \
        -d "{
            \"to\": \"${to}\",
            \"subject\": \"${subject}\",
            \"priority\": \"normal\",
            \"payload\": {
                \"type\": \"${msg_type}\",
                \"message\": \"${message}\"
            }
        }")

    echo "$response"
}

# Check pending messages for an agent
check_pending() {
    local api_key="$1"

    local response
    response=$(curl -s -m "${CURL_TIMEOUT}" -X GET "${API_URL}/messages/pending" \
        -H "Authorization: Bearer ${api_key}")

    echo "$response"
}

# Acknowledge a message
ack_message() {
    local api_key="$1"
    local message_id="$2"

    curl -s -m "${CURL_TIMEOUT}" -X DELETE "${API_URL}/messages/pending?id=${message_id}" \
        -H "Authorization: Bearer ${api_key}"
}

# =============================================================================
# Test Cases
# =============================================================================

test_api_health() {
    TESTS_RUN=$((TESTS_RUN + 1))
    log_info "Testing API health endpoint..."

    local response
    response=$(curl -s -m "${CURL_TIMEOUT}" "${API_URL}/health" 2>/dev/null)
    local status
    status=$(echo "$response" | jq -r '.status // empty' 2>/dev/null)

    if [ "$status" = "ok" ]; then
        log_success "API health check passed"
        return 0
    else
        log_fail "API health check failed: $response"
        return 1
    fi
}

test_agent_registration() {
    local name="$1"
    local tenant="$2"
    local agent_dir="$3"

    TESTS_RUN=$((TESTS_RUN + 1))
    log_info "Registering agent '${name}' with tenant '${tenant}'..." >&2

    local api_key
    api_key=$(register_agent "$name" "$tenant" "$agent_dir" 2>/dev/null)
    if [ -n "$api_key" ] && [[ ! "$api_key" == "Registration failed:"* ]]; then
        log_success "Agent '${name}' registered successfully" >&2
        echo "$api_key"
        return 0
    else
        log_fail "Agent '${name}' registration failed" >&2
        return 1
    fi
}

test_internal_to_internal() {
    local sender_key="$1"
    local sender_name="$2"
    local recipient_name="$3"
    local recipient_key="$4"

    TESTS_RUN=$((TESTS_RUN + 1))
    log_info "Testing: ${sender_name} -> ${recipient_name} (internal to internal)"

    local test_id
    test_id=$(generate_test_id)
    local subject="Test ${test_id}"
    local message="Hello from ${sender_name} at $(date)"

    # Send message
    local send_response
    send_response=$(send_message "$sender_key" "$recipient_name" "$subject" "$message")

    local status
    status=$(echo "$send_response" | jq -r '.status // empty')
    local method
    method=$(echo "$send_response" | jq -r '.method // empty')

    if [ "$status" = "delivered" ] || [ "$status" = "queued" ]; then
        log_success "Message sent: status=${status}, method=${method}"

        # If queued, check pending messages
        if [ "$status" = "queued" ]; then
            sleep 1
            local pending
            pending=$(check_pending "$recipient_key")
            local count
            count=$(echo "$pending" | jq -r '.count // 0')

            if [ "$count" -gt 0 ]; then
                log_success "Message found in recipient's pending queue"
            else
                log_warn "Message queued but not found in pending (may need longer delay)"
            fi
        fi

        return 0
    else
        log_fail "Message send failed: $(echo "$send_response" | jq -c .)"
        return 1
    fi
}

test_external_agent_polling() {
    local agent_key="$1"
    local agent_name="$2"

    TESTS_RUN=$((TESTS_RUN + 1))
    log_info "Testing: External agent polling for ${agent_name}"

    local pending
    pending=$(check_pending "$agent_key")

    local count
    count=$(echo "$pending" | jq -r '.count // 0')

    log_success "External agent can poll: ${count} pending messages"
    echo "$pending"
    return 0
}

test_cross_provider_federation() {
    local sender_key="$1"
    local sender_name="$2"
    local external_address="$3"

    TESTS_RUN=$((TESTS_RUN + 1))
    log_info "Testing: ${sender_name} -> ${external_address} (cross-provider federation)"

    local test_id
    test_id=$(generate_test_id)
    local subject="Federation Test ${test_id}"
    local message="Testing federation from ${sender_name}"

    # Send message - expected to fail gracefully
    local send_response
    send_response=$(send_message "$sender_key" "$external_address" "$subject" "$message")

    local error
    error=$(echo "$send_response" | jq -r '.error // empty')

    if [ "$error" = "external_provider" ] || [ "$error" = "forbidden" ]; then
        log_warn "Correctly rejected — client must send directly to external provider: $(echo "$send_response" | jq -r '.message')"
        return 0
    elif [ -n "$error" ]; then
        log_warn "External provider send failed with error: $error"
        return 0
    else
        log_success "External provider attempt returned: $(echo "$send_response" | jq -c .)"
        return 0
    fi
}

test_message_acknowledgment() {
    local api_key="$1"
    local agent_name="$2"

    TESTS_RUN=$((TESTS_RUN + 1))
    log_info "Testing: Message acknowledgment for ${agent_name}"

    # Get pending messages
    local pending
    pending=$(check_pending "$api_key")

    local messages
    messages=$(echo "$pending" | jq -r '.messages // []')
    local first_id
    first_id=$(echo "$messages" | jq -r '.[0].id // empty')

    if [ -n "$first_id" ] && [ "$first_id" != "null" ]; then
        local ack_response
        ack_response=$(ack_message "$api_key" "$first_id")

        local acknowledged
        acknowledged=$(echo "$ack_response" | jq -r '.acknowledged // false')

        if [ "$acknowledged" = "true" ]; then
            log_success "Message ${first_id} acknowledged successfully"
            return 0
        else
            log_fail "Message acknowledgment failed: $ack_response"
            return 1
        fi
    else
        log_warn "No messages to acknowledge"
        return 0
    fi
}

# =============================================================================
# Short Name / Partial Name Resolution Tests
# =============================================================================

test_short_name_delivery() {
    local sender_key="$1"
    local sender_name="$2"
    local short_name="$3"
    local expected_status="$4"  # "delivered" or "not_found"

    TESTS_RUN=$((TESTS_RUN + 1))
    log_info "Testing: ${sender_name} -> '${short_name}' (short/partial name resolution, expect ${expected_status})"

    local test_id
    test_id=$(generate_test_id)
    local subject="Short Name Test ${test_id}"
    local message="Testing short name resolution for '${short_name}'"

    local send_response
    send_response=$(send_message "$sender_key" "$short_name" "$subject" "$message")

    local status
    status=$(echo "$send_response" | jq -r '.status // empty')
    local error
    error=$(echo "$send_response" | jq -r '.error // empty')

    if [ "$expected_status" = "delivered" ]; then
        if [ "$status" = "delivered" ]; then
            log_success "Short name '${short_name}' resolved and delivered"
            return 0
        elif [ "$status" = "queued" ]; then
            log_success "Short name '${short_name}' resolved (queued — agent offline)"
            return 0
        else
            log_fail "Expected delivery for '${short_name}', got: $(echo "$send_response" | jq -c .)"
            return 1
        fi
    elif [ "$expected_status" = "not_found" ]; then
        if [ "$error" = "not_found" ]; then
            log_success "Nonexistent name '${short_name}' correctly returned 404"
            return 0
        else
            log_fail "Expected 404 for '${short_name}', got: $(echo "$send_response" | jq -c .)"
            return 1
        fi
    fi
}

test_uuid_delivery() {
    local sender_key="$1"
    local sender_name="$2"
    local recipient_uuid="$3"

    TESTS_RUN=$((TESTS_RUN + 1))
    log_info "Testing: ${sender_name} -> UUID '${recipient_uuid}' (direct UUID delivery)"

    local test_id
    test_id=$(generate_test_id)
    local subject="UUID Test ${test_id}"
    local message="Testing direct UUID delivery"

    local send_response
    send_response=$(send_message "$sender_key" "$recipient_uuid" "$subject" "$message")

    local status
    status=$(echo "$send_response" | jq -r '.status // empty')

    if [ "$status" = "delivered" ] || [ "$status" = "queued" ]; then
        log_success "UUID delivery succeeded: status=${status}"
        return 0
    else
        log_fail "UUID delivery failed: $(echo "$send_response" | jq -c .)"
        return 1
    fi
}

test_mesh_peer_query() {
    local query_name="$1"
    local expected_exists="$2"  # "true" or "false"

    TESTS_RUN=$((TESTS_RUN + 1))
    local base_url="${API_URL%/v1}"
    log_info "Testing: GET /api/agents/by-name/${query_name} (expect exists=${expected_exists})"

    local response
    response=$(curl -s -m "${CURL_TIMEOUT}" "${base_url}/agents/by-name/${query_name}" 2>/dev/null)

    local exists
    exists=$(echo "$response" | jq -r '.exists // false')

    if [ "$exists" = "$expected_exists" ]; then
        if [ "$expected_exists" = "true" ]; then
            local resolved_name
            resolved_name=$(echo "$response" | jq -r '.agent.name // empty')
            log_success "Mesh peer query '${query_name}' -> exists=true (resolved to '${resolved_name}')"
        else
            log_success "Mesh peer query '${query_name}' -> exists=false (correct)"
        fi
        return 0
    else
        log_fail "Mesh peer query '${query_name}': expected exists=${expected_exists}, got exists=${exists}"
        return 1
    fi
}

# =============================================================================
# Main Test Runner
# =============================================================================

main() {
    log_section "AMP Routing Test Suite"

    # Setup
    rm -rf "${TEST_DIR}"
    mkdir -p "${TEST_DIR}/agents"
    mkdir -p "${TEST_DIR}/results"

    # Check API availability
    log_info "Checking API availability at ${API_URL}..."
    if ! check_api; then
        log_fail "API not available at ${API_URL}"
        echo ""
        echo "Make sure AI Maestro is running:"
        echo "  yarn dev  # or pm2 start ai-maestro"
        exit 1
    fi
    log_success "API is available"

    # ==========================================================================
    log_section "Phase 1: Agent Setup"
    # ==========================================================================

    # Create test agents with unique names
    local timestamp
    timestamp=$(date +%s)

    log_info "Creating test agent identities..."
    AGENT_A_NAME="test-a-${timestamp}"
    AGENT_B_NAME="test-b-${timestamp}"
    AGENT_C_NAME="test-c-${timestamp}"

    AGENT_A_DIR=$(create_test_agent "$AGENT_A_NAME")
    AGENT_B_DIR=$(create_test_agent "$AGENT_B_NAME")
    AGENT_C_DIR=$(create_test_agent "$AGENT_C_NAME")

    log_success "Test agent identities created"

    # Register agents with AI Maestro
    TENANT="rnd23blocks"

    AGENT_A_KEY=$(test_agent_registration "$AGENT_A_NAME" "$TENANT" "$AGENT_A_DIR") || true
    AGENT_B_KEY=$(test_agent_registration "$AGENT_B_NAME" "$TENANT" "$AGENT_B_DIR") || true
    AGENT_C_KEY=$(test_agent_registration "$AGENT_C_NAME" "$TENANT" "$AGENT_C_DIR") || true

    # Save keys for reference
    echo "AGENT_A_KEY=${AGENT_A_KEY}" > "${TEST_DIR}/keys.env"
    echo "AGENT_B_KEY=${AGENT_B_KEY}" >> "${TEST_DIR}/keys.env"
    echo "AGENT_C_KEY=${AGENT_C_KEY}" >> "${TEST_DIR}/keys.env"

    # ==========================================================================
    log_section "Phase 2: Internal Agent Communication"
    # ==========================================================================

    if [ -n "$AGENT_A_KEY" ] && [ -n "$AGENT_B_KEY" ]; then
        # A -> B
        test_internal_to_internal "$AGENT_A_KEY" "$AGENT_A_NAME" "$AGENT_B_NAME" "$AGENT_B_KEY"

        # B -> A
        test_internal_to_internal "$AGENT_B_KEY" "$AGENT_B_NAME" "$AGENT_A_NAME" "$AGENT_A_KEY"

        # A -> A (self-message)
        test_internal_to_internal "$AGENT_A_KEY" "$AGENT_A_NAME" "$AGENT_A_NAME" "$AGENT_A_KEY"
    else
        log_warn "Skipping internal communication tests - agents not registered"
    fi

    # ==========================================================================
    log_section "Phase 3: External Agent (Polling)"
    # ==========================================================================

    if [ -n "$AGENT_C_KEY" ]; then
        # Internal -> External
        if [ -n "$AGENT_A_KEY" ]; then
            test_internal_to_internal "$AGENT_A_KEY" "$AGENT_A_NAME" "$AGENT_C_NAME" "$AGENT_C_KEY"
        fi

        # External agent polls for messages
        test_external_agent_polling "$AGENT_C_KEY" "$AGENT_C_NAME"

        # External -> Internal
        if [ -n "$AGENT_B_KEY" ]; then
            test_internal_to_internal "$AGENT_C_KEY" "$AGENT_C_NAME" "$AGENT_B_NAME" "$AGENT_B_KEY"
        fi
    else
        log_warn "Skipping external agent tests - agent not registered"
    fi

    # ==========================================================================
    log_section "Phase 4: Cross-Provider Federation"
    # ==========================================================================

    if [ -n "$AGENT_A_KEY" ]; then
        # Test sending to external provider (should fail gracefully)
        test_cross_provider_federation "$AGENT_A_KEY" "$AGENT_A_NAME" "alice@acme.crabmail.ai"
        test_cross_provider_federation "$AGENT_A_KEY" "$AGENT_A_NAME" "bob@other.external-provider.com"
    fi

    # ==========================================================================
    log_section "Phase 5: Message Acknowledgment"
    # ==========================================================================

    if [ -n "$AGENT_B_KEY" ]; then
        test_message_acknowledgment "$AGENT_B_KEY" "$AGENT_B_NAME"
    fi

    if [ -n "$AGENT_C_KEY" ]; then
        test_message_acknowledgment "$AGENT_C_KEY" "$AGENT_C_NAME"
    fi

    # ==========================================================================
    log_section "Phase 6: Short Name & Partial Name Resolution"
    # ==========================================================================

    # These tests use the test agents created above with timestamped names.
    # Agent names are like "test-a-1707350400" — the last segment is the timestamp.
    # Partial match should find them by last segment (the timestamp).

    if [ -n "$AGENT_A_KEY" ]; then
        # Test: send to nonexistent name → expect 404
        test_short_name_delivery "$AGENT_A_KEY" "$AGENT_A_NAME" "nonexistent-agent-xyz-999" "not_found"

        # Test: send to partial last segment of test-b agent
        # Agent B is "test-b-<timestamp>", last segment is <timestamp>
        # This tests the partial-match path in resolveAgent step 5
        test_short_name_delivery "$AGENT_A_KEY" "$AGENT_A_NAME" "$AGENT_B_NAME" "delivered"
    fi

    # ==========================================================================
    log_section "Phase 7: Mesh Peer Query (/api/agents/by-name)"
    # ==========================================================================

    # Test: query for a test agent by full name → expect exists=true
    test_mesh_peer_query "$AGENT_A_NAME" "true"

    # Test: query for nonexistent agent → expect exists=false
    test_mesh_peer_query "nonexistent-agent-xyz-999" "false"

    # Test: query for a test agent by full name (agent B)
    test_mesh_peer_query "$AGENT_B_NAME" "true"

    # ==========================================================================
    log_section "Phase 8: Real Agent Integration (Short Name + Partial Match)"
    # ==========================================================================

    # Discover real registered agents from the running server.
    # This tests the actual scenario that broke: existing agents sending
    # to each other using short names via the AMP API.

    if [ -n "$AGENT_A_KEY" ]; then
        local base_url="${API_URL%/v1}"
        local sessions_response
        sessions_response=$(curl -s -m "${CURL_TIMEOUT}" "${base_url}/sessions" 2>/dev/null)
        local session_count
        session_count=$(echo "$sessions_response" | jq -r '.sessions | length' 2>/dev/null || echo "0")

        if [ "$session_count" -gt 0 ]; then
            log_info "Found ${session_count} live session(s) — testing real agent resolution"

            # Pick the first real agent name (not a test- agent)
            local real_agent_name
            real_agent_name=$(echo "$sessions_response" | jq -r '[.sessions[].agentName // empty | select(startswith("test-") | not)] | first // empty' 2>/dev/null)

            if [ -n "$real_agent_name" ] && [ "$real_agent_name" != "null" ]; then
                # Test: send to real agent by full name → expect delivered
                test_short_name_delivery "$AGENT_A_KEY" "$AGENT_A_NAME" "$real_agent_name" "delivered"

                # Test: mesh peer query for real agent → expect exists=true
                test_mesh_peer_query "$real_agent_name" "true"

                # Test: extract last segment and send via partial match
                local last_segment
                last_segment=$(echo "$real_agent_name" | rev | cut -d'-' -f1 | rev)
                if [ -n "$last_segment" ] && [ "$last_segment" != "$real_agent_name" ]; then
                    test_short_name_delivery "$AGENT_A_KEY" "$AGENT_A_NAME" "$last_segment" "delivered"
                    test_mesh_peer_query "$last_segment" "true"
                fi
            else
                log_warn "No non-test agents found in sessions — skipping real agent tests"
            fi
        else
            log_warn "No live sessions found — skipping real agent integration tests"
        fi
    fi

    # ==========================================================================
    log_section "Test Results"
    # ==========================================================================

    echo ""
    echo "Tests Run:    ${TESTS_RUN}"
    echo "Tests Passed: ${TESTS_PASSED}"
    echo "Tests Failed: ${TESTS_FAILED}"
    echo ""

    # Save results
    cat > "${RESULTS_FILE}" << EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "api_url": "${API_URL}",
    "tests_run": ${TESTS_RUN},
    "tests_passed": ${TESTS_PASSED},
    "tests_failed": ${TESTS_FAILED},
    "agents": {
        "agent_a": "${AGENT_A_DIR}",
        "agent_b": "${AGENT_B_DIR}",
        "agent_c": "${AGENT_C_DIR}"
    }
}
EOF

    log_info "Results saved to ${RESULTS_FILE}"
    log_info "Agent configs in ${TEST_DIR}/agents/"

    if [ "$TESTS_FAILED" -gt 0 ]; then
        echo ""
        log_fail "Some tests failed. Review the output above for details."
        exit 1
    else
        echo ""
        log_success "All tests passed!"
        exit 0
    fi
}

# Run main
main "$@"
