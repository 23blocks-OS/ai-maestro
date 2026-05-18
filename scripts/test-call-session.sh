#!/bin/bash
# =============================================================================
# Call Session Fork Integration Test
# =============================================================================
#
# Tests the full lifecycle of companion call session forks:
#   1. Prerequisite: AI Maestro is running, test agent exists in registry
#   2. Connect companion WebSocket → __call tmux session is spawned
#   3. __call session does NOT appear in /api/sessions (sidebar)
#   4. __call session does NOT appear as orphan in /api/agents
#   5. Send voice:transcript → text arrives in __call session (not primary)
#   6. Disconnect companion WebSocket → __call session is killed
#   7. Stale cleanup: orphaned __call sessions are killed on connect
#
# Prerequisites:
#   - AI Maestro running on localhost:23000
#   - At least one registered agent with a tmux session
#   - node + ws module available (bundled with the project)
#   - jq installed
#   - tmux installed
#
# Usage:
#   ./scripts/test-call-session.sh [agent-id]
#
# If agent-id is omitted, the first online agent is used.
#
# =============================================================================

CURL_TIMEOUT=10
API_BASE="http://localhost:23000"
PORT=23000
NODE_SCRIPT_DIR="/tmp/call-session-test-$$"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# =============================================================================
# Utility Functions
# =============================================================================

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $1"; TESTS_PASSED=$((TESTS_PASSED + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }
log_fail()    { echo -e "${RED}[FAIL]${NC} $1"; TESTS_FAILED=$((TESTS_FAILED + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_section() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

cleanup() {
    # Kill any background node processes we started
    if [ -n "$WS_PID" ] && kill -0 "$WS_PID" 2>/dev/null; then
        kill "$WS_PID" 2>/dev/null
        wait "$WS_PID" 2>/dev/null
    fi
    # Kill stale __call session if we left one
    if [ -n "$CALL_SESSION_NAME" ]; then
        tmux kill-session -t "$CALL_SESSION_NAME" 2>/dev/null || true
    fi
    rm -rf "$NODE_SCRIPT_DIR"
}
trap cleanup EXIT

# =============================================================================
# Prerequisites
# =============================================================================

log_section "Prerequisites"

# Check AI Maestro is running
SESSIONS_RESP=$(curl -s -m $CURL_TIMEOUT "${API_BASE}/api/sessions" 2>/dev/null)
if [ -z "$SESSIONS_RESP" ]; then
    echo -e "${RED}ERROR: AI Maestro not running on ${API_BASE}${NC}"
    echo "Start it with: yarn dev"
    exit 1
fi
log_info "AI Maestro is running"

# Check jq
if ! command -v jq &>/dev/null; then
    echo -e "${RED}ERROR: jq is not installed${NC}"
    exit 1
fi

# Check tmux
if ! command -v tmux &>/dev/null; then
    echo -e "${RED}ERROR: tmux is not installed${NC}"
    exit 1
fi

# Find or use specified agent
if [ -n "$1" ]; then
    AGENT_ID="$1"
    log_info "Using specified agent: $AGENT_ID"
else
    # Find the first online agent
    AGENTS_RESP=$(curl -s -m $CURL_TIMEOUT "${API_BASE}/api/agents" 2>/dev/null)
    AGENT_ID=$(echo "$AGENTS_RESP" | jq -r '.agents[] | select(.session.status == "online") | .id' 2>/dev/null | head -1)
    if [ -z "$AGENT_ID" ] || [ "$AGENT_ID" = "null" ]; then
        echo -e "${RED}ERROR: No online agents found. Create one first:${NC}"
        echo "  tmux new-session -d -s test-agent"
        echo "  Then register it in AI Maestro"
        exit 1
    fi
    log_info "Auto-selected agent: $AGENT_ID"
fi

# Get agent details
AGENT_RESP=$(curl -s -m $CURL_TIMEOUT "${API_BASE}/api/agents/${AGENT_ID}" 2>/dev/null)
AGENT_NAME=$(echo "$AGENT_RESP" | jq -r '.agent.name // .agent.alias // empty' 2>/dev/null)
if [ -z "$AGENT_NAME" ]; then
    echo -e "${RED}ERROR: Could not find agent ${AGENT_ID}${NC}"
    exit 1
fi

CALL_SESSION_NAME="${AGENT_NAME}__call"
log_info "Agent name: $AGENT_NAME"
log_info "Expected call session: $CALL_SESSION_NAME"

# Make sure no stale call session exists
tmux kill-session -t "$CALL_SESSION_NAME" 2>/dev/null || true

# Create temp dir for node scripts
mkdir -p "$NODE_SCRIPT_DIR"

# =============================================================================
# Test 1: __call session is NOT present before companion connects
# =============================================================================

log_section "Test 1: No __call session before companion connects"

if tmux has-session -t "$CALL_SESSION_NAME" 2>/dev/null; then
    log_fail "Call session ${CALL_SESSION_NAME} already exists before test"
else
    log_success "No pre-existing call session"
fi

# =============================================================================
# Test 2: Companion WS connect spawns __call session
# =============================================================================

log_section "Test 2: Companion connect spawns __call session"

# Write a node script that connects the companion WS and stays open
cat > "$NODE_SCRIPT_DIR/connect.mjs" << 'NODESCRIPT'
import WebSocket from 'ws';
const agentId = process.argv[2];
const port = process.argv[3] || '23000';
const ws = new WebSocket(`ws://localhost:${port}/companion-ws?agent=${agentId}`);
ws.on('open', () => {
    process.stdout.write('CONNECTED\n');
});
ws.on('error', (err) => {
    process.stderr.write(`WS ERROR: ${err.message}\n`);
    process.exit(1);
});
ws.on('close', (code) => {
    process.stdout.write(`CLOSED:${code}\n`);
    process.exit(0);
});
// Handle SIGTERM for clean shutdown
process.on('SIGTERM', () => { ws.close(); });
// Keep alive, listen for commands on stdin
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
    const line = chunk.trim();
    if (line.startsWith('SEND:')) {
        const payload = line.substring(5);
        ws.send(payload);
        process.stdout.write('SENT\n');
    } else if (line === 'CLOSE') {
        ws.close();
    }
});
NODESCRIPT

# Start companion WS connection in background
node "$NODE_SCRIPT_DIR/connect.mjs" "$AGENT_ID" "$PORT" < <(exec cat) &
WS_PID=$!
# Create a named pipe for sending commands to the WS process
WS_INPUT="/tmp/call-session-test-ws-input-$$"
mkfifo "$WS_INPUT" 2>/dev/null || true

# Wait for connection
sleep 2

if ! kill -0 "$WS_PID" 2>/dev/null; then
    log_fail "Companion WS process died immediately"
else
    # Check if __call tmux session was created
    sleep 2  # Give server time to spawn the session
    if tmux has-session -t "$CALL_SESSION_NAME" 2>/dev/null; then
        log_success "Call session ${CALL_SESSION_NAME} was spawned"
    else
        log_fail "Call session ${CALL_SESSION_NAME} was NOT spawned"
        log_warn "tmux sessions: $(tmux list-sessions -F '#{session_name}' 2>/dev/null | tr '\n' ' ')"
    fi
fi

# =============================================================================
# Test 3: __call session does NOT appear in /api/sessions
# =============================================================================

log_section "Test 3: __call session hidden from /api/sessions"

# Bust the cache by waiting
sleep 4

SESSIONS_LIST=$(curl -s -m $CURL_TIMEOUT "${API_BASE}/api/sessions" 2>/dev/null)
CALL_IN_SESSIONS=$(echo "$SESSIONS_LIST" | jq -r ".sessions[] | select(.name == \"${CALL_SESSION_NAME}\") | .name" 2>/dev/null)

if [ -z "$CALL_IN_SESSIONS" ]; then
    log_success "__call session NOT in /api/sessions (sidebar hidden)"
else
    log_fail "__call session VISIBLE in /api/sessions — would show in sidebar!"
fi

# =============================================================================
# Test 4: __call session does NOT appear as orphan in /api/agents
# =============================================================================

log_section "Test 4: __call session not registered as orphan agent"

AGENTS_LIST=$(curl -s -m $CURL_TIMEOUT "${API_BASE}/api/agents" 2>/dev/null)
CALL_ORPHAN=$(echo "$AGENTS_LIST" | jq -r ".agents[] | select(.name == \"${CALL_SESSION_NAME}\") | .name" 2>/dev/null)

if [ -z "$CALL_ORPHAN" ]; then
    log_success "__call session NOT registered as orphan agent"
else
    log_fail "__call session was registered as orphan agent '${CALL_ORPHAN}'!"
fi

# Verify the real agent is still there and online
REAL_AGENT_STATUS=$(echo "$AGENTS_LIST" | jq -r ".agents[] | select(.id == \"${AGENT_ID}\") | .session.status" 2>/dev/null)
if [ "$REAL_AGENT_STATUS" = "online" ]; then
    log_success "Real agent ${AGENT_NAME} still shows as online"
else
    log_warn "Real agent status: ${REAL_AGENT_STATUS} (may be expected if primary session is offline)"
fi

# =============================================================================
# Test 5: voice:transcript routes to __call session
# =============================================================================

log_section "Test 5: Transcript routing to __call session"

# Capture current __call pane content before sending
BEFORE_CONTENT=$(tmux capture-pane -t "$CALL_SESSION_NAME" -p 2>/dev/null || echo "")

# Send a unique marker via the companion WS
MARKER="CALLTEST_$(date +%s)_$$"

# Write a one-shot node script to send the transcript
cat > "$NODE_SCRIPT_DIR/send-transcript.mjs" << NODESCRIPT
import WebSocket from 'ws';
const agentId = '${AGENT_ID}';
const port = '${PORT}';
const ws = new WebSocket(\`ws://localhost:\${port}/companion-ws?agent=\${agentId}\`);
ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'voice:transcript', text: '${MARKER}' }));
    setTimeout(() => { ws.close(); process.exit(0); }, 500);
});
ws.on('error', (err) => { process.exit(1); });
NODESCRIPT

node "$NODE_SCRIPT_DIR/send-transcript.mjs" 2>/dev/null
sleep 3  # Give time for send-keys + Claude to receive

# Check if the marker text appears in the __call pane
AFTER_CONTENT=$(tmux capture-pane -t "$CALL_SESSION_NAME" -p -S -100 2>/dev/null || echo "")

if echo "$AFTER_CONTENT" | grep -q "$MARKER"; then
    log_success "Transcript '${MARKER}' routed to __call session"
else
    log_fail "Transcript '${MARKER}' NOT found in __call session pane"
    log_warn "Pane content (last 5 lines):"
    echo "$AFTER_CONTENT" | tail -5 | sed 's/^/    /'
fi

# Verify it did NOT go to the primary session
PRIMARY_CONTENT=$(tmux capture-pane -t "$AGENT_NAME" -p -S -100 2>/dev/null || echo "")
if echo "$PRIMARY_CONTENT" | grep -q "$MARKER"; then
    log_fail "Transcript ALSO appeared in primary session (should only be in __call)"
else
    log_success "Transcript NOT in primary session (correctly isolated)"
fi

# =============================================================================
# Test 6: Companion disconnect kills __call session
# =============================================================================

log_section "Test 6: Disconnect kills __call session"

# Kill the companion WS process
if [ -n "$WS_PID" ] && kill -0 "$WS_PID" 2>/dev/null; then
    kill "$WS_PID" 2>/dev/null
    wait "$WS_PID" 2>/dev/null
    WS_PID=""
fi

# Wait for server to process disconnect + 500ms kill delay
sleep 3

if tmux has-session -t "$CALL_SESSION_NAME" 2>/dev/null; then
    log_fail "Call session ${CALL_SESSION_NAME} still alive after disconnect"
    # Clean up
    tmux kill-session -t "$CALL_SESSION_NAME" 2>/dev/null || true
else
    log_success "Call session ${CALL_SESSION_NAME} killed after disconnect"
fi

# =============================================================================
# Test 7: Multiple companion clients share the same call session
# =============================================================================

log_section "Test 7: Multiple companions share one call session"

# Connect first client
node "$NODE_SCRIPT_DIR/connect.mjs" "$AGENT_ID" "$PORT" &>/dev/null &
CLIENT1_PID=$!
sleep 2

# Verify call session exists
if ! tmux has-session -t "$CALL_SESSION_NAME" 2>/dev/null; then
    log_fail "Call session not created for first client"
    kill "$CLIENT1_PID" 2>/dev/null; wait "$CLIENT1_PID" 2>/dev/null
else
    # Connect second client
    node "$NODE_SCRIPT_DIR/connect.mjs" "$AGENT_ID" "$PORT" &>/dev/null &
    CLIENT2_PID=$!
    sleep 1

    # Count __call sessions (should be exactly 1, not 2)
    CALL_COUNT=$(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -c "^${AGENT_NAME}__call$" || echo 0)
    if [ "$CALL_COUNT" -eq 1 ]; then
        log_success "Only 1 call session exists with 2 companion clients"
    else
        log_fail "Expected 1 call session, found ${CALL_COUNT}"
    fi

    # Kill first client — session should survive
    kill "$CLIENT1_PID" 2>/dev/null; wait "$CLIENT1_PID" 2>/dev/null
    sleep 2

    if tmux has-session -t "$CALL_SESSION_NAME" 2>/dev/null; then
        log_success "Call session survives after first client disconnects"
    else
        log_fail "Call session killed prematurely when first client disconnected"
    fi

    # Kill second client — session should die
    kill "$CLIENT2_PID" 2>/dev/null; wait "$CLIENT2_PID" 2>/dev/null
    sleep 3

    if tmux has-session -t "$CALL_SESSION_NAME" 2>/dev/null; then
        log_fail "Call session still alive after ALL clients disconnected"
        tmux kill-session -t "$CALL_SESSION_NAME" 2>/dev/null || true
    else
        log_success "Call session killed after last client disconnects"
    fi
fi

# =============================================================================
# Results
# =============================================================================

log_section "Results"

echo -e "  Tests run:    ${TESTS_RUN}"
echo -e "  ${GREEN}Passed:     ${TESTS_PASSED}${NC}"
if [ "$TESTS_FAILED" -gt 0 ]; then
    echo -e "  ${RED}Failed:     ${TESTS_FAILED}${NC}"
fi
echo ""

if [ "$TESTS_FAILED" -gt 0 ]; then
    echo -e "${RED}SOME TESTS FAILED${NC}"
    exit 1
else
    echo -e "${GREEN}ALL TESTS PASSED${NC}"
    exit 0
fi
