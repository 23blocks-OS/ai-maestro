#!/bin/bash
# =============================================================================
# AMP Cross-Host Messaging Test Suite
# =============================================================================
#
# Tests message delivery between all hosts in the mesh network.
# Registers a temporary test agent on each host, then sends messages
# between every pair, verifying delivered/mesh status.
#
# Prerequisites:
#   - AI Maestro running on all hosts (minilola, leonidas, mac-mini, local)
#   - All hosts reachable via Tailscale
#   - jq installed
#
# Usage:
#   ./scripts/test-amp-cross-host.sh              # Auto-detect hosts from hosts.json
#   ./scripts/test-amp-cross-host.sh --local-only  # Only test local→remote (no remote→remote)
#   ./scripts/test-amp-cross-host.sh --skip-inbox   # Skip inbox verification
#
# =============================================================================

CURL_TIMEOUT=15
CURL_CONNECT_TIMEOUT=5

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Defaults
HOSTS_JSON="${HOME}/.aimaestro/hosts.json"
TEST_DIR="/tmp/amp-cross-host-tests"
LOCAL_ONLY=false
SKIP_INBOX=false

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Host arrays (populated from hosts.json)
declare -a HOST_IDS
declare -a HOST_NAMES
declare -a HOST_URLS
declare -a HOST_AGENT_NAMES
declare -a HOST_API_KEYS
declare -a HOST_AGENT_IDS

# =============================================================================
# CLI Arguments
# =============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --local-only)  LOCAL_ONLY=true; shift ;;
            --skip-inbox)  SKIP_INBOX=true; shift ;;
            --hosts)       HOSTS_JSON="$2"; shift 2 ;;
            -h|--help)     show_help; exit 0 ;;
            *)             echo "Unknown option: $1"; show_help; exit 1 ;;
        esac
    done
}

show_help() {
    echo "AMP Cross-Host Messaging Test Suite"
    echo ""
    echo "Usage: ./scripts/test-amp-cross-host.sh [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --local-only     Only test local→remote delivery (skip remote→remote)"
    echo "  --skip-inbox     Skip inbox file verification on remote hosts"
    echo "  --hosts PATH     Path to hosts.json (default: ~/.aimaestro/hosts.json)"
    echo "  -h, --help       Show this help"
}

# =============================================================================
# Utility Functions
# =============================================================================

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $1"; TESTS_PASSED=$((TESTS_PASSED + 1)); }
log_fail()    { echo -e "${RED}[FAIL]${NC} $1"; TESTS_FAILED=$((TESTS_FAILED + 1)); }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_skip()    { echo -e "${YELLOW}[SKIP]${NC} $1"; TESTS_SKIPPED=$((TESTS_SKIPPED + 1)); }

log_section() {
    echo ""
    echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${PURPLE}  $1${NC}"
    echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

generate_test_id() {
    echo "xhost_$(date +%s)_$(head -c 4 /dev/urandom | xxd -p)"
}

# =============================================================================
# Host Discovery
# =============================================================================

load_hosts() {
    if [ ! -f "$HOSTS_JSON" ]; then
        log_fail "Hosts config not found: $HOSTS_JSON"
        exit 1
    fi

    local count
    count=$(jq '.hosts | length' "$HOSTS_JSON")

    if [ "$count" -lt 2 ]; then
        log_fail "Need at least 2 hosts for cross-host testing (found $count)"
        exit 1
    fi

    for i in $(seq 0 $((count - 1))); do
        local enabled
        enabled=$(jq -r ".hosts[$i].enabled // true" "$HOSTS_JSON")
        if [ "$enabled" != "true" ]; then
            continue
        fi

        local id name url
        id=$(jq -r ".hosts[$i].id" "$HOSTS_JSON")
        name=$(jq -r ".hosts[$i].name // .hosts[$i].id" "$HOSTS_JSON")
        url=$(jq -r ".hosts[$i].url" "$HOSTS_JSON")

        HOST_IDS+=("$id")
        HOST_NAMES+=("$name")
        HOST_URLS+=("$url")
    done

    log_info "Loaded ${#HOST_IDS[@]} enabled hosts from $HOSTS_JSON"
}

# =============================================================================
# Health Checks
# =============================================================================

check_host_health() {
    local url="$1"
    local name="$2"

    TESTS_RUN=$((TESTS_RUN + 1))

    local response
    response=$(curl -s --connect-timeout "$CURL_CONNECT_TIMEOUT" -m "$CURL_TIMEOUT" \
        -o /dev/null -w "%{http_code}" "${url}/api/v1/health" 2>/dev/null || echo "000")

    if [ "$response" = "200" ]; then
        log_success "Host '${name}' is reachable at ${url}"
        return 0
    else
        log_fail "Host '${name}' unreachable at ${url} (HTTP ${response})"
        return 1
    fi
}

# =============================================================================
# Agent Lifecycle (create, register, cleanup)
# =============================================================================

create_test_agent() {
    local name="$1"
    local agent_dir="${TEST_DIR}/agents/${name}"

    mkdir -p "${agent_dir}/keys"

    # Generate Ed25519 keypair
    openssl genpkey -algorithm Ed25519 -out "${agent_dir}/keys/private.pem" 2>/dev/null
    openssl pkey -in "${agent_dir}/keys/private.pem" -pubout -out "${agent_dir}/keys/public.pem" 2>/dev/null

    echo "${agent_dir}"
}

register_agent_on_host() {
    local agent_name="$1"
    local host_url="$2"
    local host_name="$3"
    local agent_dir="$4"
    local tenant="$5"

    TESTS_RUN=$((TESTS_RUN + 1))

    local public_key
    public_key=$(cat "${agent_dir}/keys/public.pem")

    local response
    response=$(curl -s --connect-timeout "$CURL_CONNECT_TIMEOUT" -m "$CURL_TIMEOUT" \
        -X POST "${host_url}/api/v1/register" \
        -H "Content-Type: application/json" \
        -d "{
            \"name\": \"${agent_name}\",
            \"tenant\": \"${tenant}\",
            \"public_key\": $(echo "$public_key" | jq -Rs .),
            \"key_algorithm\": \"Ed25519\"
        }")

    local api_key
    api_key=$(echo "$response" | jq -r '.api_key // empty')

    if [ -n "$api_key" ]; then
        echo "$response" > "${agent_dir}/registration-${host_name}.json"
        echo "$api_key" > "${agent_dir}/api_key-${host_name}"
        log_success "Registered '${agent_name}' on ${host_name}" >&2
        echo "$api_key"
        return 0
    else
        local err
        err=$(echo "$response" | jq -r '.error // .message // "unknown"')
        log_fail "Failed to register '${agent_name}' on ${host_name}: ${err}" >&2
        return 1
    fi
}

# =============================================================================
# Cross-Host Message Tests
# =============================================================================

test_cross_host_send() {
    local sender_key="$1"
    local sender_name="$2"
    local sender_host_url="$3"
    local sender_host_name="$4"
    local recipient_name="$5"
    local recipient_host_name="$6"
    local recipient_host_id="$7"

    TESTS_RUN=$((TESTS_RUN + 1))

    local test_id
    test_id=$(generate_test_id)
    local subject="CrossHost ${test_id}"
    local message="Cross-host test from ${sender_host_name} to ${recipient_host_name} at $(date)"

    log_info "Sending: ${sender_name}@${sender_host_name} -> ${recipient_name}@${recipient_host_name}"

    # Send via the sender's host API, addressing the recipient by bare name
    # The sender host's mesh discovery should find the agent on the recipient host
    local response
    response=$(curl -s --connect-timeout "$CURL_CONNECT_TIMEOUT" -m "$CURL_TIMEOUT" \
        -X POST "${sender_host_url}/api/v1/route" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${sender_key}" \
        -d "{
            \"to\": \"${recipient_name}\",
            \"subject\": \"${subject}\",
            \"priority\": \"normal\",
            \"payload\": {
                \"type\": \"notification\",
                \"message\": \"${message}\"
            }
        }")

    local status method remote_host
    status=$(echo "$response" | jq -r '.status // empty')
    method=$(echo "$response" | jq -r '.method // empty')
    remote_host=$(echo "$response" | jq -r '.remote_host // empty')

    if [ -z "$response" ]; then
        log_fail "${sender_host_name} -> ${recipient_host_name}: empty response (check API key and URL)"
        return 1
    elif [ "$status" = "delivered" ] && [ "$method" = "mesh" ]; then
        log_success "${sender_host_name} -> ${recipient_host_name}: delivered/mesh (remote_host=${remote_host})"
        return 0
    elif [ "$status" = "delivered" ] && [ "$method" = "local" ]; then
        log_success "${sender_host_name} -> ${recipient_host_name}: delivered/local (same host)"
        return 0
    elif [ "$status" = "queued" ]; then
        log_warn "${sender_host_name} -> ${recipient_host_name}: queued/relay (host may be down)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    else
        log_fail "${sender_host_name} -> ${recipient_host_name}: status=${status} method=${method} | $(echo "$response" | jq -c . 2>/dev/null || echo "$response")"
        return 1
    fi
}

test_cross_host_reply() {
    local original_recipient_key="$1"
    local original_recipient_name="$2"
    local original_recipient_host_url="$3"
    local original_recipient_host_name="$4"
    local original_sender_name="$5"
    local original_sender_host_name="$6"
    local original_sender_host_id="$7"

    TESTS_RUN=$((TESTS_RUN + 1))

    local test_id
    test_id=$(generate_test_id)
    local subject="Re: CrossHost Reply ${test_id}"
    local message="Reply from ${original_recipient_host_name} back to ${original_sender_host_name}"

    log_info "Reply: ${original_recipient_name}@${original_recipient_host_name} -> ${original_sender_name}@${original_sender_host_name}"

    local response
    response=$(curl -s --connect-timeout "$CURL_CONNECT_TIMEOUT" -m "$CURL_TIMEOUT" \
        -X POST "${original_recipient_host_url}/api/v1/route" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${original_recipient_key}" \
        -d "{
            \"to\": \"${original_sender_name}\",
            \"subject\": \"${subject}\",
            \"priority\": \"normal\",
            \"payload\": {
                \"type\": \"notification\",
                \"message\": \"${message}\"
            }
        }")

    local status method
    status=$(echo "$response" | jq -r '.status // empty')
    method=$(echo "$response" | jq -r '.method // empty')

    if [ "$status" = "delivered" ] && { [ "$method" = "mesh" ] || [ "$method" = "local" ]; }; then
        log_success "Reply ${original_recipient_host_name} -> ${original_sender_host_name}: ${status}/${method}"
        return 0
    elif [ "$status" = "queued" ]; then
        log_warn "Reply queued (relay) - mesh discovery may not have found sender's agent"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    else
        log_fail "Reply failed: $(echo "$response" | jq -c .)"
        return 1
    fi
}

# Check inbox on a host via its /api/messages?action=unread-count endpoint
# Note: Mesh-delivered messages go to the file inbox (via AMP Inbox Writer),
# NOT the relay pending queue (/api/v1/messages/pending). We must use the
# internal messages API which reads from the actual inbox directory.
test_inbox_count() {
    local agent_name="$1"
    local agent_id="$2"
    local host_url="$3"
    local host_name="$4"
    local expected_min="$5"

    TESTS_RUN=$((TESTS_RUN + 1))

    # Use agent name as identifier (registered agents are in the agent registry)
    local identifier="${agent_id:-$agent_name}"

    local response
    response=$(curl -s --connect-timeout "$CURL_CONNECT_TIMEOUT" -m "$CURL_TIMEOUT" \
        -X GET "${host_url}/api/messages?agent=${identifier}&action=unread-count")

    local count
    count=$(echo "$response" | jq -r '.count // 0' 2>/dev/null)
    count=${count:-0}

    if [ "$count" -ge "$expected_min" ] 2>/dev/null; then
        log_success "Inbox for ${agent_name}@${host_name}: ${count} messages (expected >= ${expected_min})"
        return 0
    else
        log_fail "Inbox for ${agent_name}@${host_name}: ${count} messages (expected >= ${expected_min})"
        return 1
    fi
}

# =============================================================================
# Main Test Runner
# =============================================================================

main() {
    parse_args "$@"

    log_section "AMP Cross-Host Messaging Test Suite"

    # Setup
    rm -rf "${TEST_DIR}"
    mkdir -p "${TEST_DIR}/agents" "${TEST_DIR}/results"

    # Load hosts
    load_hosts

    local num_hosts=${#HOST_IDS[@]}
    echo ""
    log_info "Hosts in mesh:"
    for i in $(seq 0 $((num_hosts - 1))); do
        echo -e "  ${CYAN}${HOST_IDS[$i]}${NC} (${HOST_NAMES[$i]}) → ${HOST_URLS[$i]}"
    done
    echo ""

    # =========================================================================
    log_section "Phase 1: Host Health Checks"
    # =========================================================================

    declare -a REACHABLE_INDICES=()

    for i in $(seq 0 $((num_hosts - 1))); do
        if check_host_health "${HOST_URLS[$i]}" "${HOST_NAMES[$i]}"; then
            REACHABLE_INDICES+=("$i")
        fi
    done

    local reachable_count=${#REACHABLE_INDICES[@]}
    echo ""
    log_info "${reachable_count}/${num_hosts} hosts reachable"

    if [ "$reachable_count" -lt 2 ]; then
        log_fail "Need at least 2 reachable hosts for cross-host testing"
        echo ""
        echo "Ensure all hosts are running and reachable via Tailscale."
        exit 1
    fi

    # =========================================================================
    log_section "Phase 2: Register Test Agents on Each Host"
    # =========================================================================

    local timestamp
    timestamp=$(date +%s)
    local tenant
    tenant=$(jq -r '.organization // "rnd23blocks"' "$HOSTS_JSON")

    for i in "${REACHABLE_INDICES[@]}"; do
        local agent_name="xtest-${HOST_IDS[$i]}-${timestamp}"
        local agent_dir
        agent_dir=$(create_test_agent "$agent_name")

        # Run registration directly (no subshell — counters update correctly)
        register_agent_on_host "$agent_name" "${HOST_URLS[$i]}" "${HOST_NAMES[$i]}" "$agent_dir" "$tenant" > /dev/null

        # Read the key and agent_id from the files written by register_agent_on_host
        local key_file="${agent_dir}/api_key-${HOST_NAMES[$i]}"
        local reg_file="${agent_dir}/registration-${HOST_NAMES[$i]}.json"
        if [ -f "$key_file" ]; then
            HOST_AGENT_NAMES[$i]="$agent_name"
            HOST_API_KEYS[$i]=$(cat "$key_file")
            # Store agent_id for inbox verification via /api/messages endpoint
            if [ -f "$reg_file" ]; then
                HOST_AGENT_IDS[$i]=$(jq -r '.agent_id // empty' "$reg_file")
            fi
        else
            log_warn "Skipping host ${HOST_NAMES[$i]} - registration failed"
        fi
    done

    # Filter to only hosts with registered agents
    declare -a ACTIVE_INDICES=()
    for i in "${REACHABLE_INDICES[@]}"; do
        if [ -n "${HOST_API_KEYS[$i]}" ]; then
            ACTIVE_INDICES+=("$i")
        fi
    done

    local active_count=${#ACTIVE_INDICES[@]}
    echo ""
    log_info "${active_count} hosts have registered test agents"

    if [ "$active_count" -lt 2 ]; then
        log_fail "Need at least 2 hosts with agents for cross-host testing"
        exit 1
    fi

    # =========================================================================
    log_section "Phase 3: Cross-Host Message Delivery"
    # =========================================================================

    local pair_count=0

    for si in "${ACTIVE_INDICES[@]}"; do
        for ri in "${ACTIVE_INDICES[@]}"; do
            # Skip self-sends (already tested in local test suite)
            [ "$si" -eq "$ri" ] && continue

            # If --local-only, skip remote→remote (only test from first host)
            if [ "$LOCAL_ONLY" = true ] && [ "$si" -ne "${ACTIVE_INDICES[0]}" ]; then
                continue
            fi

            test_cross_host_send \
                "${HOST_API_KEYS[$si]}" \
                "${HOST_AGENT_NAMES[$si]}" \
                "${HOST_URLS[$si]}" \
                "${HOST_NAMES[$si]}" \
                "${HOST_AGENT_NAMES[$ri]}" \
                "${HOST_NAMES[$ri]}" \
                "${HOST_IDS[$ri]}"

            pair_count=$((pair_count + 1))

            # Small delay to avoid overwhelming hosts
            sleep 0.5
        done
    done

    echo ""
    log_info "Tested ${pair_count} cross-host pairs"

    # =========================================================================
    log_section "Phase 4: Cross-Host Reply Test"
    # =========================================================================

    # Pick first two active hosts for reply test
    local h0="${ACTIVE_INDICES[0]}"
    local h1="${ACTIVE_INDICES[1]}"

    # Host1's agent replies back to Host0's agent
    test_cross_host_reply \
        "${HOST_API_KEYS[$h1]}" \
        "${HOST_AGENT_NAMES[$h1]}" \
        "${HOST_URLS[$h1]}" \
        "${HOST_NAMES[$h1]}" \
        "${HOST_AGENT_NAMES[$h0]}" \
        "${HOST_NAMES[$h0]}" \
        "${HOST_IDS[$h0]}"

    # =========================================================================
    log_section "Phase 5: Inbox Verification"
    # =========================================================================

    if [ "$SKIP_INBOX" = true ]; then
        log_info "Skipping inbox verification (--skip-inbox)"
    else
        # Wait briefly for messages to land
        sleep 1

        for i in "${ACTIVE_INDICES[@]}"; do
            # Count how many messages this agent should have received
            local expected=0
            for si in "${ACTIVE_INDICES[@]}"; do
                [ "$si" -eq "$i" ] && continue
                if [ "$LOCAL_ONLY" = true ] && [ "$si" -ne "${ACTIVE_INDICES[0]}" ]; then
                    continue
                fi
                expected=$((expected + 1))
            done

            # Add 1 for reply if this is host 0 (reply target)
            if [ "$i" -eq "$h0" ]; then
                expected=$((expected + 1))
            fi

            if [ "$expected" -gt 0 ]; then
                test_inbox_count \
                    "${HOST_AGENT_NAMES[$i]}" \
                    "${HOST_AGENT_IDS[$i]}" \
                    "${HOST_URLS[$i]}" \
                    "${HOST_NAMES[$i]}" \
                    "$expected"
            fi
        done
    fi

    # =========================================================================
    log_section "Test Results"
    # =========================================================================

    echo ""
    echo -e "  Tests Run:     ${BOLD}${TESTS_RUN}${NC}"
    echo -e "  Tests Passed:  ${GREEN}${TESTS_PASSED}${NC}"
    echo -e "  Tests Failed:  ${RED}${TESTS_FAILED}${NC}"
    echo -e "  Tests Skipped: ${YELLOW}${TESTS_SKIPPED}${NC}"
    echo ""

    # Hosts summary
    echo -e "  ${CYAN}Hosts tested:${NC}"
    for i in "${ACTIVE_INDICES[@]}"; do
        echo -e "    ${HOST_NAMES[$i]} (${HOST_IDS[$i]}) - agent: ${HOST_AGENT_NAMES[$i]}"
    done
    echo ""

    # Save results
    cat > "${TEST_DIR}/results/summary.json" << EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "tests_run": ${TESTS_RUN},
    "tests_passed": ${TESTS_PASSED},
    "tests_failed": ${TESTS_FAILED},
    "tests_skipped": ${TESTS_SKIPPED},
    "hosts_tested": ${active_count},
    "pairs_tested": ${pair_count}
}
EOF

    log_info "Results saved to ${TEST_DIR}/results/summary.json"

    if [ "$TESTS_FAILED" -gt 0 ]; then
        echo ""
        log_fail "Some tests failed. Review the output above for details."
        exit 1
    else
        echo ""
        log_success "All cross-host tests passed!"
        exit 0
    fi
}

main "$@"
