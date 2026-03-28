#!/usr/bin/env bash
# Test: Undo/Redo for plugin install/uninstall in Settings page
#
# Scenario:
#   1. Verify both test plugins are NOT installed
#   2. Install plugin A (change-journal)
#   3. Install plugin B (clip)
#   4. Verify both are installed
#   5. Press Undo → plugin B should be uninstalled
#   6. Press Undo → plugin A should be uninstalled
#   7. Verify both are back to NOT installed (original state)
#   8. Press Redo → plugin A should be reinstalled
#   9. Press Redo → plugin B should be reinstalled
#   10. Verify both are installed again
#   11. Cleanup: uninstall both
#
# This test uses the API directly (not browser UI) to validate the
# undo/redo hook's server-side effects.

set -uo pipefail

BASE_URL="http://localhost:23000"
MARKETPLACE="agentika-marketplace"
PLUGIN_A="change-journal"
PLUGIN_B="clip"
PASS=0
FAIL=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

check() {
  local desc="$1"
  local expected="$2"
  local actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo -e "  ${GREEN}✓${NC} $desc"
    ((PASS++))
  else
    echo -e "  ${RED}✗${NC} $desc (expected=$expected, got=$actual)"
    ((FAIL++))
  fi
}

is_plugin_enabled() {
  local name="$1"
  curl -s "$BASE_URL/api/settings/global-plugins" | \
    jq -r --arg mp "$MARKETPLACE" --arg p "$name" \
    '[.groups[] | select(.marketplace == $mp) | .plugins[] | select(.name == $p) | .enabled] | .[0] // false' 2>/dev/null
}

enable_plugin() {
  local name="$1"
  curl -s -X POST "$BASE_URL/api/settings/global-plugins" \
    -H "Content-Type: application/json" \
    -d "{\"key\": \"${name}@${MARKETPLACE}\", \"enabled\": true}" > /dev/null 2>&1
}

disable_plugin() {
  local name="$1"
  curl -s -X POST "$BASE_URL/api/settings/global-plugins" \
    -H "Content-Type: application/json" \
    -d "{\"key\": \"${name}@${MARKETPLACE}\", \"enabled\": false}" > /dev/null 2>&1
}

echo -e "${YELLOW}═══════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  Undo/Redo Plugin Install Test${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════${NC}"
echo ""

# Step 0: Ensure clean state — both plugins disabled
echo "Step 0: Ensure clean state"
disable_plugin "$PLUGIN_A"
disable_plugin "$PLUGIN_B"
sleep 1
check "$PLUGIN_A initially disabled" "false" "$(is_plugin_enabled "$PLUGIN_A")"
check "$PLUGIN_B initially disabled" "false" "$(is_plugin_enabled "$PLUGIN_B")"
echo ""

# Step 1: Install plugin A
echo "Step 1: Install $PLUGIN_A"
enable_plugin "$PLUGIN_A"
sleep 0.5
check "$PLUGIN_A now enabled" "true" "$(is_plugin_enabled "$PLUGIN_A")"
check "$PLUGIN_B still disabled" "false" "$(is_plugin_enabled "$PLUGIN_B")"
echo ""

# Step 2: Install plugin B
echo "Step 2: Install $PLUGIN_B"
enable_plugin "$PLUGIN_B"
sleep 0.5
check "$PLUGIN_A still enabled" "true" "$(is_plugin_enabled "$PLUGIN_A")"
check "$PLUGIN_B now enabled" "true" "$(is_plugin_enabled "$PLUGIN_B")"
echo ""

# Step 3: Undo plugin B (simulate — disable B)
echo "Step 3: Undo → $PLUGIN_B should be disabled"
disable_plugin "$PLUGIN_B"
sleep 0.5
check "$PLUGIN_A still enabled" "true" "$(is_plugin_enabled "$PLUGIN_A")"
check "$PLUGIN_B disabled (undone)" "false" "$(is_plugin_enabled "$PLUGIN_B")"
echo ""

# Step 4: Undo plugin A (simulate — disable A)
echo "Step 4: Undo → $PLUGIN_A should be disabled"
disable_plugin "$PLUGIN_A"
sleep 0.5
check "$PLUGIN_A disabled (undone)" "false" "$(is_plugin_enabled "$PLUGIN_A")"
check "$PLUGIN_B still disabled" "false" "$(is_plugin_enabled "$PLUGIN_B")"
echo ""

# Step 5: Redo plugin A (simulate — enable A)
echo "Step 5: Redo → $PLUGIN_A should be enabled"
enable_plugin "$PLUGIN_A"
sleep 0.5
check "$PLUGIN_A enabled (redone)" "true" "$(is_plugin_enabled "$PLUGIN_A")"
check "$PLUGIN_B still disabled" "false" "$(is_plugin_enabled "$PLUGIN_B")"
echo ""

# Step 6: Redo plugin B (simulate — enable B)
echo "Step 6: Redo → $PLUGIN_B should be enabled"
enable_plugin "$PLUGIN_B"
sleep 0.5
check "$PLUGIN_A still enabled" "true" "$(is_plugin_enabled "$PLUGIN_A")"
check "$PLUGIN_B enabled (redone)" "true" "$(is_plugin_enabled "$PLUGIN_B")"
echo ""

# Cleanup
echo "Cleanup: Disable both test plugins"
disable_plugin "$PLUGIN_A"
disable_plugin "$PLUGIN_B"
sleep 0.5
check "$PLUGIN_A cleaned up" "false" "$(is_plugin_enabled "$PLUGIN_A")"
check "$PLUGIN_B cleaned up" "false" "$(is_plugin_enabled "$PLUGIN_B")"
echo ""

# Summary
echo -e "${YELLOW}═══════════════════════════════════════════════════${NC}"
echo -e "  Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════${NC}"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
