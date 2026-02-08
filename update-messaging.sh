#!/bin/bash
# AI Maestro - Agent Messaging System Updater
#
# v0.21.26: Simplified to delegate to install-messaging.sh (single source of truth).
# Previously this script iterated messaging_scripts/ which no longer exists.

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse arguments
NON_INTERACTIVE=false
while [[ $# -gt 0 ]]; do
    case $1 in
        -y|--yes|--non-interactive) NON_INTERACTIVE=true; shift ;;
        -h|--help)
            echo "Usage: ./update-messaging.sh [-y|--yes]"
            echo "Updates messaging scripts and skills via install-messaging.sh"
            exit 0
            ;;
        *) shift ;;
    esac
done

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║           AI Maestro - Agent Messaging Updater                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check we're in the right directory
if [ ! -f "install-messaging.sh" ]; then
    echo -e "${YELLOW}⚠️  install-messaging.sh not found in current directory${NC}" >&2
    echo "   Run this from the AI Maestro root directory:" >&2
    echo "   cd ~/ai-maestro && ./update-messaging.sh" >&2
    exit 1
fi

# Confirm unless non-interactive
if [ "$NON_INTERACTIVE" != true ]; then
    echo -e "${BLUE}ℹ️  This will reinstall AMP messaging scripts and skills.${NC}"
    echo ""
    read -p "Continue with update? (y/n): " CONFIRM
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}⚠️  Update cancelled${NC}"
        exit 0
    fi
fi

# Delegate to install-messaging.sh (the single source of truth)
echo ""
./install-messaging.sh -y

echo ""
echo -e "${GREEN}✅ Messaging update complete!${NC}"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: Restart Claude Code sessions to reload updated skills${NC}"
echo ""
echo -e "${BLUE}ℹ️  For a full update (server + all tools), run: ./update-aimaestro.sh${NC}"
echo ""
