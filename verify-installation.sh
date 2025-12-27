#!/bin/bash
# AI Maestro - Installation Verification Script
# Run this after installation to verify everything works

# Don't use set -e - we want to continue on failures

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

pass() {
    echo -e "${GREEN}✓${NC} $1"
    PASS=$((PASS + 1))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    FAIL=$((FAIL + 1))
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    WARN=$((WARN + 1))
}

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║           AI Maestro - Installation Verification               ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# 1. Check common.sh is installed
echo "1. Checking shell helpers..."
if [ -f "$HOME/.local/share/aimaestro/shell-helpers/common.sh" ]; then
    pass "common.sh installed"
else
    fail "common.sh NOT installed - run any installer to fix"
fi

# Check docs-helper.sh in share dir (installed by install-doc-tools.sh)
if [ -f "$HOME/.local/share/aimaestro/shell-helpers/docs-helper.sh" ]; then
    pass "docs-helper.sh installed (share dir)"
else
    warn "docs-helper.sh not in share dir - run install-doc-tools.sh"
fi

# 2. Check messaging scripts
echo ""
echo "2. Checking messaging scripts..."
MESSAGING_SCRIPTS=(
    "check-aimaestro-messages.sh"
    "send-aimaestro-message.sh"
    "read-aimaestro-message.sh"
    "messaging-helper.sh"
)

for script in "${MESSAGING_SCRIPTS[@]}"; do
    if [ -x "$HOME/.local/bin/$script" ]; then
        pass "$script"
    else
        fail "$script NOT installed - run install-messaging.sh"
    fi
done

# 3. Check memory scripts
echo ""
echo "3. Checking memory scripts..."
MEMORY_SCRIPTS=(
    "memory-search.sh"
    "memory-helper.sh"
)

for script in "${MEMORY_SCRIPTS[@]}"; do
    if [ -x "$HOME/.local/bin/$script" ]; then
        pass "$script"
    else
        fail "$script NOT installed - run install-memory-tools.sh"
    fi
done

# 4. Check graph scripts
echo ""
echo "4. Checking graph scripts..."
GRAPH_SCRIPTS=(
    "graph-helper.sh"
    "graph-describe.sh"
    "graph-find-callers.sh"
    "graph-find-callees.sh"
    "graph-find-related.sh"
    "graph-find-by-type.sh"
)

for script in "${GRAPH_SCRIPTS[@]}"; do
    if [ -x "$HOME/.local/bin/$script" ]; then
        pass "$script"
    else
        fail "$script NOT installed - run install-graph-tools.sh"
    fi
done

# 5. Check docs scripts
echo ""
echo "5. Checking docs scripts..."
DOCS_SCRIPTS=(
    "docs-search.sh"
    "docs-index.sh"
    "docs-stats.sh"
    "docs-list.sh"
    "docs-get.sh"
    "docs-find-by-type.sh"
)

for script in "${DOCS_SCRIPTS[@]}"; do
    if [ -x "$HOME/.local/bin/$script" ]; then
        pass "$script"
    else
        fail "$script NOT installed - run install-doc-tools.sh"
    fi
done

# 6. Check skills
echo ""
echo "6. Checking Claude Code skills..."
SKILLS=(
    "agent-messaging"
    "memory-search"
    "docs-search"
    "graph-query"
)

for skill in "${SKILLS[@]}"; do
    if [ -f "$HOME/.claude/skills/$skill/SKILL.md" ]; then
        pass "$skill skill"
    else
        warn "$skill skill not installed"
    fi
done

# 7. Check PATH
echo ""
echo "7. Checking PATH..."
if [[ ":$PATH:" == *":$HOME/.local/bin:"* ]]; then
    pass "~/.local/bin is in PATH"
else
    warn "~/.local/bin is NOT in PATH - add to ~/.zshrc"
fi

# 8. Test scripts can source dependencies
echo ""
echo "8. Testing script dependencies..."

# Test messaging-helper.sh
if [ -f "$HOME/.local/bin/messaging-helper.sh" ]; then
    if bash -n "$HOME/.local/bin/messaging-helper.sh" 2>/dev/null; then
        pass "messaging-helper.sh syntax OK"
    else
        fail "messaging-helper.sh has syntax errors"
    fi
fi

# Test memory-helper.sh
if [ -f "$HOME/.local/bin/memory-helper.sh" ]; then
    if bash -n "$HOME/.local/bin/memory-helper.sh" 2>/dev/null; then
        pass "memory-helper.sh syntax OK"
    else
        fail "memory-helper.sh has syntax errors"
    fi
fi

# Test graph-helper.sh
if [ -f "$HOME/.local/bin/graph-helper.sh" ]; then
    if bash -n "$HOME/.local/bin/graph-helper.sh" 2>/dev/null; then
        pass "graph-helper.sh syntax OK"
    else
        fail "graph-helper.sh has syntax errors"
    fi
fi

# Test docs-helper.sh (in share dir)
if [ -f "$HOME/.local/share/aimaestro/shell-helpers/docs-helper.sh" ]; then
    if bash -n "$HOME/.local/share/aimaestro/shell-helpers/docs-helper.sh" 2>/dev/null; then
        pass "docs-helper.sh syntax OK"
    else
        fail "docs-helper.sh has syntax errors"
    fi
fi

# 9. Test scripts can run (with --help or graceful failure)
echo ""
echo "9. Testing script execution..."

if [ -n "$TMUX" ]; then
    # In tmux - can do fuller tests
    if memory-search.sh "test" >/dev/null 2>&1; then
        pass "memory-search.sh runs"
    else
        warn "memory-search.sh failed (may need API running)"
    fi

    if check-aimaestro-messages.sh >/dev/null 2>&1; then
        pass "check-aimaestro-messages.sh runs"
    else
        warn "check-aimaestro-messages.sh failed (may need API running)"
    fi

    if graph-describe.sh "test" >/dev/null 2>&1; then
        pass "graph-describe.sh runs"
    else
        warn "graph-describe.sh failed (may need API running)"
    fi

    if docs-stats.sh >/dev/null 2>&1; then
        pass "docs-stats.sh runs"
    else
        warn "docs-stats.sh failed (may need API running)"
    fi
else
    warn "Not in tmux session - skipping runtime tests"
fi

# Summary
echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""
echo -e "Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, ${YELLOW}$WARN warnings${NC}"
echo ""

if [ $FAIL -gt 0 ]; then
    echo -e "${RED}Some checks failed. Run the appropriate installer:${NC}"
    echo "  ./install-messaging.sh    - For messaging scripts"
    echo "  ./install-memory-tools.sh - For memory search"
    echo "  ./install-graph-tools.sh  - For graph query"
    echo "  ./install-doc-tools.sh    - For docs search"
    exit 1
elif [ $WARN -gt 0 ]; then
    echo -e "${YELLOW}Some optional features are missing.${NC}"
    exit 0
else
    echo -e "${GREEN}All checks passed!${NC}"
    exit 0
fi
