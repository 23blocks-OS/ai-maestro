#!/bin/bash
# AI Maestro - Full Update Script
# Updates AI Maestro to the latest version including code, scripts, and skills

set -e

# Source ecosystem constants (single source of truth for marketplace/plugin names)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/scripts/ecosystem-config.sh" ]; then
    source "$SCRIPT_DIR/scripts/ecosystem-config.sh"
elif [ -f "$SCRIPT_DIR/ecosystem-config.sh" ]; then
    source "$SCRIPT_DIR/ecosystem-config.sh"
fi

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
SKIP_MEMORY=false
SKIP_GRAPH=false
SKIP_DOCS=false
SKIP_HOOKS=false
SKIP_AGENT_CLI=false
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
        --skip-memory)
            SKIP_MEMORY=true
            shift
            ;;
        --skip-graph)
            SKIP_GRAPH=true
            shift
            ;;
        --skip-docs)
            SKIP_DOCS=true
            shift
            ;;
        --skip-hooks)
            SKIP_HOOKS=true
            shift
            ;;
        --skip-agent-cli)
            SKIP_AGENT_CLI=true
            shift
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
echo "║                   AI Maestro - Full Updater                    ║"
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
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
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
        git stash push -m "ai-maestro-update-$(date +%Y%m%d-%H%M%S)"
        print_success "Changes stashed (use 'git stash pop' to restore)"
    else
        print_warning "Update cancelled"
        exit 0
    fi
fi

echo ""
print_step "$DOWNLOAD" "Fetching latest changes from GitHub..."
echo ""

# SF-042: Verify we are on the main branch before pulling from origin/main.
# Running `git pull origin main` on a feature branch would merge main into it.
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
if [ "$CURRENT_BRANCH" != "main" ]; then
    print_warning "You are on branch '${CURRENT_BRANCH}', not 'main'."
    echo "         This updater pulls from origin/main. Switching branches automatically."
    echo ""
    if [ "$NON_INTERACTIVE" = true ]; then
        git checkout main
    else
        read -p "Switch to main and continue? (y/n): " SWITCH_CONFIRM
        if [[ "$SWITCH_CONFIRM" =~ ^[Yy]$ ]]; then
            git checkout main
        else
            print_warning "Update cancelled -- please switch to main manually."
            exit 0
        fi
    fi
fi

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
    BEFORE_SHA=$(git rev-parse HEAD)
    git pull origin main
    print_success "Code updated"

    # Detect ecosystem.config.js changes that require PM2 config reload
    if ! git diff --quiet "$BEFORE_SHA" HEAD -- ecosystem.config.js ecosystem.config.cjs 2>/dev/null; then
        ECOSYSTEM_CHANGED=true
    fi
fi

# Get new version
NEW_VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')

echo ""
print_step "$BUILD" "Installing dependencies..."
# Issue 7.1: Don't let yarn install failure abort the entire update under set -e
yarn install --frozen-lockfile 2>/dev/null || yarn install || { print_warning "yarn install had warnings but continuing..."; }
print_success "Dependencies installed"

# Issue 7.2: Track build failure so tool reinstallation still proceeds under set -e
BUILD_FAILED=false
VERIFICATION_WARNINGS=false
ECOSYSTEM_CHANGED=${ECOSYSTEM_CHANGED:-false}

echo ""
print_step "$BUILD" "Building application..."
if yarn build; then
    print_success "Build complete"
else
    print_warning "Build failed - continuing with tool reinstallation"
    BUILD_FAILED=true
fi

echo ""
print_step "$ROCKET" "Updating AI Maestro plugin and reinstalling scripts..."

# ── v0.26.0: Skills are now bundled in the ai-maestro plugin ────────────
# The plugin is installed from the ${MARKETPLACE_REPO:-Emasoft/ai-maestro-plugins} marketplace.
# No standalone skills in ~/.claude/skills/ anymore.
# Component installers still handle CLI scripts (amp-*.sh, etc.) in ~/.local/bin/.
# ─────────────────────────────────────────────────────────────────────────

# 0. Update the AI Maestro plugin (marketplace: see scripts/ecosystem-config.sh)
print_info "Updating AI Maestro plugin from marketplace..."
claude plugin marketplace update "${MARKETPLACE_NAME:-ai-maestro-plugins}" 2>/dev/null || true
claude plugin update "${MAIN_PLUGIN_NAME:-ai-maestro-plugin}" 2>/dev/null || true
print_success "AI Maestro plugin updated"

# 1. AMP messaging scripts + all plugin/scripts/* tools
if [ -f "install-messaging.sh" ]; then
    print_info "Reinstalling AMP messaging & CLI tools..."
    ./install-messaging.sh -y
    print_success "Messaging & CLI tools reinstalled"
else
    print_warning "install-messaging.sh not found - skipping messaging tools"
fi

# 2. Memory tools (optional — skip with --skip-memory)
if [ "$SKIP_MEMORY" != true ] && [ -f "install-memory-tools.sh" ]; then
    print_info "Reinstalling memory tools..."
    ./install-memory-tools.sh -y
    print_success "Memory tools reinstalled"
fi

# 3. Graph tools (optional — skip with --skip-graph)
if [ "$SKIP_GRAPH" != true ] && [ -f "install-graph-tools.sh" ]; then
    print_info "Reinstalling graph tools..."
    ./install-graph-tools.sh -y
    print_success "Graph tools reinstalled"
fi

# 4. Doc tools (optional — skip with --skip-docs)
if [ "$SKIP_DOCS" != true ] && [ -f "install-doc-tools.sh" ]; then
    print_info "Reinstalling doc tools..."
    ./install-doc-tools.sh -y
    print_success "Doc tools reinstalled"
fi

# 5. Agent CLI (optional — skip with --skip-agent-cli)
if [ "$SKIP_AGENT_CLI" != true ] && [ -f "install-agent-cli.sh" ]; then
    print_info "Reinstalling agent management CLI..."
    ./install-agent-cli.sh -y
    print_success "Agent CLI reinstalled"
fi

# 6. Claude Code hooks — now provided by ai-maestro-plugin (v2.4.0+)
# The plugin's hooks/hooks.json handles all events via ${CLAUDE_PLUGIN_ROOT}.
# No settings.json modification needed.
if [ "$SKIP_HOOKS" != true ]; then
    print_info "Claude Code hooks: provided by ai-maestro-plugin (no settings.json changes)"
fi

# 7. Marketplace plugin already updated in step 0 above

# Issue 7.12: Capture verification exit code instead of piping to || true
if [ -f "verify-installation.sh" ]; then
    echo ""
    print_info "Running installation verification..."
    if ! ./verify-installation.sh; then
        print_warning "Some verification checks failed. Review the output above."
        VERIFICATION_WARNINGS=true
    fi
fi

# Check if PM2 is managing ai-maestro
echo ""
if command -v pm2 &> /dev/null; then
    if pm2 list | grep -q "ai-maestro"; then
        if [[ "$BUILD_FAILED" != "true" ]]; then
            if [ "$ECOSYSTEM_CHANGED" = true ]; then
                print_warning "ecosystem.config.js changed — reloading PM2 config..."
                pm2 delete ai-maestro 2>/dev/null || true
                pm2 start ecosystem.config.js 2>/dev/null || pm2 start ecosystem.config.cjs 2>/dev/null || {
                    print_error "Failed to start with ecosystem config — falling back to pm2 restart"
                    pm2 start "yarn start" --name ai-maestro
                }
            else
                print_step "$RESTART" "Restarting AI Maestro via PM2..."
                pm2 restart ai-maestro
            fi
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
            print_warning "Skipping PM2 restart due to build failure"
            echo "         Fix the build errors and run: pm2 restart ai-maestro"
        fi
    else
        print_info "AI Maestro not found in PM2 process list"
        echo "         Start it with: pm2 start ecosystem.config.js"
    fi
else
    print_info "PM2 not installed - skipping automatic restart"
    echo "         Start manually with: yarn start"
fi

# Report accumulated warnings from build/verification at the end
if [ "$BUILD_FAILED" = true ]; then
    echo ""
    print_error "Build failed during update - please check TypeScript errors and run 'yarn build' manually"
fi
if [ "$VERIFICATION_WARNINGS" = true ]; then
    echo ""
    print_warning "Installation verification reported issues - review the warnings above"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
if [ "$BUILD_FAILED" = true ] || [ "$VERIFICATION_WARNINGS" = true ]; then
echo "║                Update Complete (with warnings)                 ║"
else
echo "║                        Update Complete!                        ║"
fi
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
echo "   • AI Maestro plugin (skills bundled from ${MARKETPLACE_REPO:-Emasoft/ai-maestro-plugins})"
echo "   • AMP messaging scripts (amp-*.sh)"
echo "   • Agent CLI (aimaestro-agent.sh, agent-helper.sh)"
echo "   • Memory, graph, and docs CLI tools"
echo "   • Claude Code hooks"
echo ""

print_warning "IMPORTANT: Restart your Claude Code sessions to reload updated skills"
echo "           In each tmux session:"
echo "           1. Exit Claude Code (type 'exit' or Ctrl+D)"
echo "           2. Restart Claude Code (type 'claude')"
echo ""
