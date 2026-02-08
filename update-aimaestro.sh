#!/bin/bash
# AI Maestro - Full Update Script
# Updates AI Maestro to the latest version including code, scripts, and skills

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Icons
CHECK="✅"
CROSS="❌"
INFO="ℹ️ "
WARN="⚠️ "
ROCKET="🚀"
DOWNLOAD="📥"
BUILD="🔨"
RESTART="🔄"

# Parse command line arguments
NON_INTERACTIVE=false
while [[ $# -gt 0 ]]; do
    case $1 in
        -y|--yes|--non-interactive)
            NON_INTERACTIVE=true
            shift
            ;;
        -h|--help)
            echo "Usage: ./update-aimaestro.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -y, --yes, --non-interactive  Run without prompts (auto-accept all)"
            echo "  -h, --help                    Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║                 AI Maestro - Full Updater                      ║"
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

print_step() {
    echo -e "${CYAN}${1} ${2}${NC}"
}

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -f "server.mjs" ]; then
    print_error "Error: This script must be run from the AI Maestro root directory"
    echo ""
    echo "Usage:"
    echo "  cd /path/to/ai-maestro"
    echo "  ./update-aimaestro.sh"
    exit 1
fi

# Get current version
CURRENT_VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')
echo "Current version: ${CYAN}${CURRENT_VERSION}${NC}"
echo ""

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    print_warning "You have uncommitted changes in your working directory"
    echo ""
    echo "Options:"
    echo "  1) Stash changes and continue (git stash)"
    echo "  2) Abort update"
    echo ""

    if [ "$NON_INTERACTIVE" = true ]; then
        print_info "Non-interactive mode: auto-stashing changes..."
        STASH_CHOICE="1"
    else
        read -p "Choose option (1/2): " STASH_CHOICE
    fi

    if [ "$STASH_CHOICE" = "1" ]; then
        print_info "Stashing changes..."
        git stash
        print_success "Changes stashed (use 'git stash pop' to restore)"
    else
        print_warning "Update cancelled"
        exit 0
    fi
fi

echo ""
print_step "$DOWNLOAD" "Fetching latest changes from GitHub..."
echo ""

# Fetch and show what's new
git fetch origin main

COMMITS_BEHIND=$(git rev-list HEAD..origin/main --count 2>/dev/null || echo "0")

if [ "$COMMITS_BEHIND" = "0" ]; then
    print_success "You're already on the latest version!"
    echo ""

    # Ask if user wants to reinstall scripts/skills anyway
    if [ "$NON_INTERACTIVE" = true ]; then
        print_info "Non-interactive mode: reinstalling scripts and skills..."
        REINSTALL="y"
    else
        read -p "Would you like to reinstall scripts and skills anyway? (y/n): " REINSTALL
    fi
    if [[ ! "$REINSTALL" =~ ^[Yy]$ ]]; then
        exit 0
    fi
else
    echo "New commits available: ${GREEN}${COMMITS_BEHIND}${NC}"
    echo ""
    echo "Recent changes:"
    git log HEAD..origin/main --oneline | head -10
    echo ""

    if [ "$NON_INTERACTIVE" = true ]; then
        print_info "Non-interactive mode: proceeding with update..."
        CONFIRM="y"
    else
        read -p "Continue with update? (y/n): " CONFIRM
    fi
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
        print_warning "Update cancelled"
        exit 0
    fi

    echo ""
    print_step "$DOWNLOAD" "Pulling latest changes..."
    git pull origin main
    print_success "Code updated"
fi

# Get new version
NEW_VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')

echo ""
print_step "$BUILD" "Installing dependencies..."
yarn install --frozen-lockfile 2>/dev/null || yarn install
print_success "Dependencies installed"

echo ""
print_step "$BUILD" "Building application..."
yarn build
print_success "Build complete"

echo ""
print_step "$ROCKET" "Reinstalling scripts and skills..."

# ── v0.21.26 fix: delegate to component installers ──────────────────────
# Previously this section iterated messaging_scripts/ and docs_scripts/
# directories that no longer exist (migrated to plugin/scripts/ and
# plugins/amp-messaging/scripts/). The component installers are the
# single source of truth for each tool category.
# ─────────────────────────────────────────────────────────────────────────

# 1. AMP messaging scripts + all plugin/scripts/* tools + skills
if [ -f "install-messaging.sh" ]; then
    print_info "Reinstalling AMP messaging & CLI tools..."
    ./install-messaging.sh -y
    print_success "Messaging & CLI tools reinstalled"
else
    print_warning "install-messaging.sh not found - skipping messaging tools"
fi

# 2. Agent CLI (aimaestro-agent.sh + agent-helper.sh + skill)
if [ -f "install-agent-cli.sh" ]; then
    print_info "Reinstalling agent management CLI..."
    ./install-agent-cli.sh
    print_success "Agent CLI reinstalled"
else
    print_warning "install-agent-cli.sh not found - skipping agent CLI"
fi

# 3. Claude Code hooks (session lifecycle integration)
if [ -f "scripts/claude-hooks/install-hooks.sh" ]; then
    print_info "Reinstalling Claude Code hooks..."
    ./scripts/claude-hooks/install-hooks.sh
    print_success "Claude Code hooks reinstalled"
else
    print_warning "install-hooks.sh not found - skipping hooks"
fi

# 4. Verify the installation
if [ -f "verify-installation.sh" ]; then
    echo ""
    print_info "Running installation verification..."
    ./verify-installation.sh || true
fi

# Check if PM2 is managing ai-maestro
echo ""
if command -v pm2 &> /dev/null; then
    if pm2 list | grep -q "ai-maestro"; then
        print_step "$RESTART" "Restarting AI Maestro via PM2..."
        pm2 restart ai-maestro
        print_success "AI Maestro restarted"

        # Wait a moment for startup
        sleep 2

        # Check status
        if pm2 list | grep "ai-maestro" | grep -q "online"; then
            print_success "AI Maestro is running"
        else
            print_warning "AI Maestro may not have started correctly"
            echo "         Check logs with: pm2 logs ai-maestro"
        fi
    else
        print_info "AI Maestro not found in PM2 process list"
        echo "         Start it with: pm2 start ecosystem.config.cjs"
    fi
else
    print_info "PM2 not installed - skipping automatic restart"
    echo "         Start manually with: yarn start"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                     Update Complete!                           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

if [ "$CURRENT_VERSION" != "$NEW_VERSION" ]; then
    echo "Updated: ${YELLOW}${CURRENT_VERSION}${NC} → ${GREEN}${NEW_VERSION}${NC}"
else
    echo "Version: ${GREEN}${NEW_VERSION}${NC} (reinstalled)"
fi

echo ""
print_info "What's updated:"
echo "   • Application code and dependencies (git pull + yarn build)"
echo "   • AMP messaging scripts (amp-*.sh)"
echo "   • Agent CLI (aimaestro-agent.sh, agent-helper.sh)"
echo "   • Memory, graph, and docs CLI tools"
echo "   • Claude Code skills and hooks"
echo ""

print_warning "IMPORTANT: Restart your Claude Code sessions to reload updated skills"
echo "           In each tmux session:"
echo "           1. Exit Claude Code (type 'exit' or Ctrl+D)"
echo "           2. Restart Claude Code (type 'claude')"
echo ""
