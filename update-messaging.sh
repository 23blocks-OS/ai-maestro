#!/bin/bash
# AI Maestro - Agent Messaging System Updater
# Updates messaging scripts and Claude Code skill

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Icons
CHECK="✅"
CROSS="❌"
INFO="ℹ️ "
WARN="⚠️ "

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║           AI Maestro - Agent Messaging Updater                ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Function to print colored messages
print_success() {
    echo -e "${GREEN}${CHECK} $1${NC}"
}

print_error() {
    echo -e "${RED}${CROSS} $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}${WARN} $1${NC}"
}

print_info() {
    echo -e "${BLUE}${INFO}$1${NC}"
}

# Check if we're in the right directory
if [ ! -d "messaging_scripts" ] || [ ! -d "skills" ]; then
    print_error "Error: This script must be run from the AI Maestro root directory"
    echo ""
    echo "Usage:"
    echo "  cd /path/to/ai-maestro"
    echo "  ./update-messaging.sh"
    exit 1
fi

echo "🔍 Checking current installation..."
echo ""

# Check if scripts are installed
SCRIPTS_INSTALLED=false
if [ -f ~/.local/bin/check-aimaestro-messages.sh ]; then
    SCRIPTS_INSTALLED=true
    print_success "Messaging scripts found in ~/.local/bin/"
else
    print_warning "Messaging scripts not found in ~/.local/bin/"
    echo "         Run ./install-messaging.sh for initial installation"
fi

# Check if skill is installed
SKILL_INSTALLED=false
if [ -d ~/.claude/skills/agent-messaging ]; then
    SKILL_INSTALLED=true
    print_success "Agent messaging skill found in ~/.claude/skills/"
else
    print_warning "Agent messaging skill not found in ~/.claude/skills/"
    echo "         Run ./install-messaging.sh for initial installation"
fi

echo ""

# Exit if nothing is installed
if [ "$SCRIPTS_INSTALLED" = false ] && [ "$SKILL_INSTALLED" = false ]; then
    print_error "Nothing to update - messaging system not installed"
    echo ""
    echo "Run ./install-messaging.sh to install the messaging system"
    exit 1
fi

# Ask for confirmation
echo "📦 This will update:"
if [ "$SCRIPTS_INSTALLED" = true ]; then
    echo "   • Messaging scripts in ~/.local/bin/"
fi
if [ "$SKILL_INSTALLED" = true ]; then
    echo "   • Agent messaging skill in ~/.claude/skills/"
fi
echo ""

read -p "Continue with update? (y/n): " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    print_warning "Update cancelled"
    exit 0
fi

echo ""
echo "🚀 Starting update..."
echo ""

# Update scripts
if [ "$SCRIPTS_INSTALLED" = true ]; then
    print_info "Updating messaging scripts..."

    SCRIPT_COUNT=0
    for script in messaging_scripts/*.sh; do
        if [ -f "$script" ]; then
            SCRIPT_NAME=$(basename "$script")
            cp "$script" ~/.local/bin/
            chmod +x ~/.local/bin/"$SCRIPT_NAME"
            print_success "Updated: $SCRIPT_NAME"
            SCRIPT_COUNT=$((SCRIPT_COUNT + 1))
        fi
    done

    echo ""
    print_success "Updated $SCRIPT_COUNT messaging scripts"
fi

# Update skill
if [ "$SKILL_INSTALLED" = true ]; then
    echo ""
    print_info "Updating Claude Code skill..."

    if [ -d "skills/agent-messaging" ]; then
        # Backup old version
        if [ -d ~/.claude/skills/agent-messaging ]; then
            BACKUP_DIR=~/.claude/skills/agent-messaging.backup.$(date +%Y%m%d_%H%M%S)
            mv ~/.claude/skills/agent-messaging "$BACKUP_DIR"
            print_info "Backed up old version to: $BACKUP_DIR"
        fi

        # Install new version
        cp -r skills/agent-messaging ~/.claude/skills/
        print_success "Updated: agent-messaging skill"

        # Verify skill file exists
        if [ -f ~/.claude/skills/agent-messaging/SKILL.md ]; then
            SKILL_SIZE=$(wc -c < ~/.claude/skills/agent-messaging/SKILL.md)
            print_success "Skill file verified (${SKILL_SIZE} bytes)"
        else
            print_error "Skill file not found after update"
        fi
    else
        print_error "Skill source directory not found: skills/agent-messaging"
    fi
fi

echo ""
echo "✅ Update complete!"
echo ""

# Remind about Claude session restart
if [ "$SKILL_INSTALLED" = true ]; then
    print_warning "IMPORTANT: Restart your Claude Code sessions to reload the updated skill"
    echo ""
    echo "   In each tmux session:"
    echo "   1. Exit Claude Code (type 'exit' or Ctrl+D)"
    echo "   2. Restart Claude Code (type 'claude')"
    echo ""
fi

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                     Update successful!                         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
