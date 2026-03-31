#!/bin/bash
# AI Maestro - Agent Messaging System Updater
#
# v0.21.26: Simplified to delegate to install-messaging.sh (single source of truth).
# Previously this script iterated messaging_scripts/ which no longer exists.

set -e

# Source ecosystem constants (single source of truth for marketplace/plugin names)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/scripts/ecosystem-config.sh" ]; then
    source "$SCRIPT_DIR/scripts/ecosystem-config.sh"
elif [ -f "$SCRIPT_DIR/ecosystem-config.sh" ]; then
    source "$SCRIPT_DIR/ecosystem-config.sh"
fi

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

# Update AI Maestro plugin (skills are bundled in the plugin, not standalone)
echo ""
echo -e "${BLUE}ℹ️  Updating AI Maestro plugin (marketplace: ${MARKETPLACE_REPO:-Emasoft/ai-maestro-plugins})...${NC}"
claude plugin marketplace update "${MARKETPLACE_NAME:-ai-maestro-plugins}" 2>/dev/null || true
claude plugin update "${MAIN_PLUGIN_NAME:-ai-maestro-plugin}" 2>/dev/null || true
echo -e "${GREEN}✅ AI Maestro plugin updated${NC}"

# Update AMP scripts (copy from plugin submodule to ~/.local/bin/)
echo ""
echo -e "${BLUE}ℹ️  Updating AMP scripts in ~/.local/bin/...${NC}"
if [ -f "install-messaging.sh" ]; then
    ./install-messaging.sh -y
    echo -e "${GREEN}✅ AMP scripts updated${NC}"
else
    echo -e "${YELLOW}⚠️  install-messaging.sh not found - skipping script update${NC}"
fi

echo ""
echo -e "${GREEN}✅ Messaging update complete!${NC}"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: Restart Claude Code sessions to reload updated skills${NC}"
echo ""
echo -e "${BLUE}ℹ️  For a full update (server + all tools), run: ./update-aimaestro.sh${NC}"
echo ""
