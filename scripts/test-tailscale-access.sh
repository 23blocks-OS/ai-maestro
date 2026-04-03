#!/bin/bash
# AI Maestro — Tailscale VPN Access Test
#
# Verifies that AI Maestro is correctly configured for Tailscale VPN access.
# Tests: Tailscale detection, IP filter, connectivity, and security.
#
# Usage:
#   ./scripts/test-tailscale-access.sh           # Run all tests
#   ./scripts/test-tailscale-access.sh --quick    # Quick check (no connectivity tests)
#
# Exit codes:
#   0 — All tests passed
#   1 — One or more tests failed

set -euo pipefail

PORT="${AIMAESTRO_PORT:-23000}"
QUICK=false
PASS=0
FAIL=0
SKIP=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

pass() { PASS=$((PASS + 1)); echo -e "  ${GREEN}PASS${NC}  $1"; }
fail() { FAIL=$((FAIL + 1)); echo -e "  ${RED}FAIL${NC}  $1"; }
skip() { SKIP=$((SKIP + 1)); echo -e "  ${YELLOW}SKIP${NC}  $1"; }
info() { echo -e "  ${CYAN}INFO${NC}  $1"; }

[[ "${1:-}" == "--quick" ]] && QUICK=true

echo ""
echo -e "${BOLD}AI Maestro — Tailscale VPN Access Tests${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ═══════════════════════════════════════════════════════════════
echo -e "${BOLD}1. Tailscale Installation${NC}"
# ═══════════════════════════════════════════════════════════════

if command -v tailscale &>/dev/null; then
  TS_VERSION=$(tailscale version 2>/dev/null | head -1)
  pass "Tailscale installed ($TS_VERSION)"
else
  fail "Tailscale not installed"
  echo ""
  echo "  Install Tailscale:"
  echo "    macOS:  brew install --cask tailscale"
  echo "    Linux:  curl -fsSL https://tailscale.com/install.sh | sh"
  echo "    More:   https://tailscale.com/download"
  echo ""
  echo -e "${RED}Cannot continue without Tailscale.${NC}"
  exit 1
fi

# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}2. Tailscale Status${NC}"
# ═══════════════════════════════════════════════════════════════

if tailscale status &>/dev/null; then
  pass "Tailscale is running"
else
  fail "Tailscale is not running or not logged in"
  echo "  Run: tailscale up"
  exit 1
fi

TS_IP4=$(tailscale ip -4 2>/dev/null || true)
TS_IP6=$(tailscale ip -6 2>/dev/null || true)

if [[ -n "$TS_IP4" && "$TS_IP4" =~ ^100\. ]]; then
  pass "Tailscale IPv4: $TS_IP4"
else
  fail "No Tailscale IPv4 address (expected 100.x.x.x)"
fi

if [[ -n "$TS_IP6" && "$TS_IP6" =~ ^fd7a: ]]; then
  pass "Tailscale IPv6: $TS_IP6"
else
  skip "No Tailscale IPv6 address"
fi

# Check peer count
PEER_COUNT=$(tailscale status 2>/dev/null | grep -c "active\|idle" || echo "0")
if [ "$PEER_COUNT" -gt 0 ]; then
  pass "Tailnet has $PEER_COUNT other device(s)"
else
  info "No other devices in tailnet (add more at https://tailscale.com/download)"
fi

# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}3. Server Configuration${NC}"
# ═══════════════════════════════════════════════════════════════

# Check if server is running on the expected port
if lsof -i ":$PORT" -P 2>/dev/null | grep -q LISTEN; then
  BIND=$(lsof -i ":$PORT" -P 2>/dev/null | grep LISTEN | awk '{print $9}' | head -1)
  if echo "$BIND" | grep -q '\*:'; then
    pass "Server listening on all interfaces (*:$PORT)"
  elif echo "$BIND" | grep -q "localhost:"; then
    if [ -n "$TS_IP4" ]; then
      fail "Server only on localhost — Tailscale access won't work"
      echo "  The server should bind to :: when Tailscale is detected."
      echo "  Check server.mjs Tailscale IP detection."
    else
      pass "Server on localhost (no Tailscale — correct)"
    fi
  else
    info "Server binding: $BIND"
  fi
else
  fail "No server listening on port $PORT"
  echo "  Start with: pm2 start ai-maestro"
fi

# Check tailscale serve is NOT active (we don't use it)
TS_SERVE=$(tailscale serve status 2>/dev/null || echo "")
if echo "$TS_SERVE" | grep -q "proxy\|tcp://"; then
  fail "tailscale serve is active — this can break static file serving"
  echo "  Run: tailscale serve reset"
else
  pass "No tailscale serve config (correct — direct bind used)"
fi

if [ "$QUICK" = true ]; then
  echo ""
  echo -e "${BOLD}Skipping connectivity tests (--quick mode)${NC}"
  echo ""
  echo -e "${BOLD}Results:${NC} ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, ${YELLOW}$SKIP skipped${NC}"
  [ "$FAIL" -gt 0 ] && exit 1
  exit 0
fi

# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}4. Connectivity Tests${NC}"
# ═══════════════════════════════════════════════════════════════

# Test localhost
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://127.0.0.1:$PORT/api/sessions" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  pass "localhost:$PORT → HTTP 200"
else
  fail "localhost:$PORT → HTTP $HTTP_CODE (expected 200)"
fi

# Test Tailscale IPv4
if [ -n "$TS_IP4" ]; then
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://$TS_IP4:$PORT/api/sessions" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    pass "Tailscale IPv4 ($TS_IP4:$PORT) → HTTP 200"
  else
    fail "Tailscale IPv4 ($TS_IP4:$PORT) → HTTP $HTTP_CODE (expected 200)"
  fi
fi

# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}5. Security Tests (IP Filter)${NC}"
# ═══════════════════════════════════════════════════════════════

# Get LAN IP
case "$(uname)" in
  Darwin)
    LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
    ;;
  Linux)
    LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
    ;;
  *)
    LAN_IP=""
    ;;
esac

if [ -n "$LAN_IP" ] && [ -n "$TS_IP4" ]; then
  # LAN IP should be BLOCKED
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "http://$LAN_IP:$PORT/api/sessions" 2>/dev/null || echo "000")
  if [[ "$HTTP_CODE" =~ ^0+$ ]]; then
    pass "LAN IP ($LAN_IP:$PORT) → BLOCKED (connection dropped)"
  else
    fail "LAN IP ($LAN_IP:$PORT) → HTTP $HTTP_CODE (should be blocked!)"
    echo "  The IP filter may not be working. Check server.mjs isAllowedSource()."
  fi
else
  skip "Cannot test LAN blocking (no LAN IP detected or no Tailscale)"
fi

# Test that non-API paths also work (page, static assets)
if [ -n "$TS_IP4" ]; then
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://$TS_IP4:$PORT/" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    pass "Tailscale IPv4 page load → HTTP 200"
  else
    fail "Tailscale IPv4 page load → HTTP $HTTP_CODE (expected 200)"
  fi

  # Test a static JS chunk
  WEBPACK=$(curl -s "http://127.0.0.1:$PORT/" 2>/dev/null | grep -o 'webpack-[a-f0-9]*.js' | head -1 || true)
  if [ -n "$WEBPACK" ]; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://$TS_IP4:$PORT/_next/static/chunks/$WEBPACK" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
      pass "Tailscale IPv4 static assets → HTTP 200"
    else
      fail "Tailscale IPv4 static assets → HTTP $HTTP_CODE (check for stale build or tailscale serve interference)"
    fi
  fi
fi

# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}6. Remote Device Reachability${NC}"
# ═══════════════════════════════════════════════════════════════

# List tailnet peers and check connectivity
PEER_IPS=$(tailscale status 2>/dev/null | awk '{print $1}' | grep '^100\.' | head -5)
if [ -n "$PEER_IPS" ]; then
  for PEER_IP in $PEER_IPS; do
    PEER_NAME=$(tailscale status 2>/dev/null | grep "$PEER_IP" | awk '{print $2}')
    if ping -c 1 -t 3 "$PEER_IP" &>/dev/null 2>&1 || ping -c 1 -W 3 "$PEER_IP" &>/dev/null 2>&1; then
      pass "Peer $PEER_NAME ($PEER_IP) → reachable"
    else
      fail "Peer $PEER_NAME ($PEER_IP) → unreachable"
    fi
  done
else
  skip "No tailnet peers to test"
fi

# ═══════════════════════════════════════════════════════════════
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BOLD}Results:${NC} ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, ${YELLOW}$SKIP skipped${NC}"

if [ -n "$TS_IP4" ]; then
  echo ""
  echo -e "${BOLD}Remote access URL:${NC} http://$TS_IP4:$PORT"
fi

echo ""
[ "$FAIL" -gt 0 ] && exit 1
exit 0
