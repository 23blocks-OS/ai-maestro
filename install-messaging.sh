#!/bin/bash
# AI Maestro - Agent Messaging Protocol (AMP) Installer
# Installs AMP scripts and Claude Code skills
#
# Usage:
#   ./install-messaging.sh           # Interactive mode
#   ./install-messaging.sh -y        # Non-interactive (install all)
#   ./install-messaging.sh --migrate # Migrate from old messaging system

set -e

# Parse command line arguments
NON_INTERACTIVE=false
MIGRATE_ONLY=false
while [[ $# -gt 0 ]]; do
    case $1 in
        -y|--yes|--non-interactive)
            NON_INTERACTIVE=true
            shift
            ;;
        --migrate)
            MIGRATE_ONLY=true
            shift
            ;;
        -h|--help)
            echo "AI Maestro - Agent Messaging Protocol (AMP) Installer"
            echo ""
            echo "Usage: ./install-messaging.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -y, --yes          Non-interactive mode (install all, assume yes)"
            echo "  --migrate          Migrate from old messaging system only"
            echo "  -h, --help         Show this help message"
            echo ""
            echo "This installer sets up the Agent Messaging Protocol (AMP) which provides:"
            echo "  - Local messaging between agents (works immediately)"
            echo "  - Federation with external providers (CrabMail, etc.)"
            echo "  - Cryptographic message signing (Ed25519)"
            echo ""
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

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

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║      AI Maestro - Agent Messaging Protocol (AMP) Installer    ║"
echo "║                                                                ║"
echo "║              Email for AI Agents - Local First                ║"
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
if [ ! -d "plugins/amp-messaging" ] || [ ! -f "plugins/amp-messaging/plugin.json" ]; then
    # Try to auto-initialize the submodule
    if [ -f ".gitmodules" ] && command -v git &> /dev/null; then
        print_warning "AMP plugin submodule not initialized. Initializing now..."
        git submodule update --init --recursive
        if [ -d "plugins/amp-messaging" ] && [ -f "plugins/amp-messaging/plugin.json" ]; then
            print_success "Submodule initialized"
        else
            print_error "Error: Failed to initialize AMP plugin submodule."
            echo ""
            echo "Try manually:"
            echo "  git submodule update --init --recursive"
            exit 1
        fi
    else
        print_error "Error: AMP plugin not found. Run from AI Maestro root directory."
        echo ""
        echo "If this is a fresh clone, initialize submodules:"
        echo "  git submodule update --init --recursive"
        echo ""
        echo "Then run:"
        echo "  ./install-messaging.sh"
        exit 1
    fi
fi

# Migration function
migrate_old_messages() {
    echo ""
    print_info "Checking for existing messages to migrate..."

    OLD_INBOX="$HOME/.aimaestro/messages/inbox"
    OLD_SENT="$HOME/.aimaestro/messages/sent"
    NEW_INBOX="$HOME/.agent-messaging/messages/inbox"
    NEW_SENT="$HOME/.agent-messaging/messages/sent"

    if [ -d "$OLD_INBOX" ] || [ -d "$OLD_SENT" ]; then
        OLD_COUNT=0
        if [ -d "$OLD_INBOX" ]; then
            OLD_COUNT=$(find "$OLD_INBOX" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
        fi

        if [ "$OLD_COUNT" -gt 0 ]; then
            print_warning "Found $OLD_COUNT messages in old format (~/.aimaestro/messages/)"
            echo ""
            echo "  The new AMP system uses ~/.agent-messaging/"
            echo "  Your old messages can be migrated to the new location."
            echo ""

            if [ "$NON_INTERACTIVE" = true ]; then
                MIGRATE_CHOICE="y"
            else
                read -p "Migrate old messages to AMP format? [Y/n]: " MIGRATE_CHOICE
                MIGRATE_CHOICE=${MIGRATE_CHOICE:-Y}
            fi

            if [[ "$MIGRATE_CHOICE" =~ ^[Yy]$ ]]; then
                mkdir -p "$NEW_INBOX" "$NEW_SENT"

                # Migrate inbox
                if [ -d "$OLD_INBOX" ]; then
                    for agent_dir in "$OLD_INBOX"/*; do
                        if [ -d "$agent_dir" ]; then
                            agent_name=$(basename "$agent_dir")
                            mkdir -p "$NEW_INBOX"
                            for msg in "$agent_dir"/*.json; do
                                if [ -f "$msg" ]; then
                                    cp "$msg" "$NEW_INBOX/"
                                fi
                            done
                        fi
                    done
                fi

                # Migrate sent
                if [ -d "$OLD_SENT" ]; then
                    for agent_dir in "$OLD_SENT"/*; do
                        if [ -d "$agent_dir" ]; then
                            for msg in "$agent_dir"/*.json; do
                                if [ -f "$msg" ]; then
                                    cp "$msg" "$NEW_SENT/"
                                fi
                            done
                        fi
                    done
                fi

                MIGRATED=$(find "$NEW_INBOX" "$NEW_SENT" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
                print_success "Migrated $MIGRATED messages to ~/.agent-messaging/"

                # Backup old messages
                BACKUP_DIR="$HOME/.aimaestro/messages.backup.$(date +%Y%m%d)"
                mv "$HOME/.aimaestro/messages" "$BACKUP_DIR"
                print_info "Old messages backed up to: $BACKUP_DIR"
            else
                print_info "Skipping migration. Old messages remain in ~/.aimaestro/messages/"
            fi
        else
            print_info "No old messages found to migrate."
        fi
    else
        print_info "No old messaging system detected."
    fi
}

# Handle migrate-only mode
if [ "$MIGRATE_ONLY" = true ]; then
    migrate_old_messages
    echo ""
    print_success "Migration complete!"
    exit 0
fi

echo "🔍 Checking prerequisites..."
echo ""

# Track what needs to be installed
INSTALL_SCRIPTS=false
INSTALL_SKILL=false
PREREQUISITES_OK=true

# Check curl
print_info "Checking for curl..."
if command -v curl &> /dev/null; then
    print_success "curl installed"
else
    print_error "curl not found (required)"
    PREREQUISITES_OK=false
fi

# Check jq
print_info "Checking for jq..."
if command -v jq &> /dev/null; then
    print_success "jq installed"
else
    print_error "jq not found (required for AMP)"
    echo "         Install with: brew install jq"
    PREREQUISITES_OK=false
fi

# Check openssl
print_info "Checking for openssl..."
if command -v openssl &> /dev/null; then
    OPENSSL_VERSION=$(openssl version | cut -d' ' -f2)
    print_success "openssl installed (version $OPENSSL_VERSION)"
else
    print_error "openssl not found (required for cryptographic signing)"
    PREREQUISITES_OK=false
fi

# Check tmux (optional but recommended)
print_info "Checking for tmux..."
if command -v tmux &> /dev/null; then
    TMUX_VERSION=$(tmux -V | cut -d' ' -f2)
    print_success "tmux installed (version $TMUX_VERSION)"
else
    print_warning "tmux not found (optional, for terminal notifications)"
fi

# Check Claude Code (optional)
print_info "Checking for Claude Code..."
if command -v claude &> /dev/null; then
    CLAUDE_VERSION=$(claude --version 2>/dev/null | head -n1 || echo "unknown")
    print_success "Claude Code installed ($CLAUDE_VERSION)"
    INSTALL_SKILL=true
else
    print_warning "Claude Code not found"
    echo "         Skills will not be available (CLI still works)"
    echo "         Install from: https://claude.ai/download"
fi

echo ""

if [ "$PREREQUISITES_OK" = false ]; then
    print_error "Missing required prerequisites. Please install them and try again."
    exit 1
fi

# Check for old messaging system
if [ -d "$HOME/.aimaestro/messages" ]; then
    migrate_old_messages
fi

# Ask user what to install (or auto-select in non-interactive mode)
if [ "$NON_INTERACTIVE" = true ]; then
    print_info "Non-interactive mode: installing scripts and skills..."
    CHOICE=3
else
    echo "📦 What would you like to install?"
    echo ""
    echo "  1) AMP scripts only (amp-send, amp-inbox, etc.)"
    echo "  2) Claude Code skills only (requires Claude Code)"
    echo "  3) Both scripts and skills (recommended)"
    echo "  4) Cancel installation"
    echo ""
    read -p "Enter your choice (1-4): " CHOICE
fi

case $CHOICE in
    1)
        INSTALL_SCRIPTS=true
        INSTALL_SKILL=false
        ;;
    2)
        INSTALL_SCRIPTS=false
        INSTALL_SKILL=true
        if ! command -v claude &> /dev/null; then
            print_error "Claude Code not found. Cannot install skills."
            exit 1
        fi
        ;;
    3)
        INSTALL_SCRIPTS=true
        INSTALL_SKILL=true
        if ! command -v claude &> /dev/null; then
            print_warning "Claude Code not found. Will install scripts only."
            INSTALL_SKILL=false
        fi
        ;;
    4)
        echo "Installation cancelled."
        exit 0
        ;;
    *)
        print_error "Invalid choice. Installation cancelled."
        exit 1
        ;;
esac

echo ""
echo "🚀 Starting installation..."
echo ""

# Install AMP scripts
if [ "$INSTALL_SCRIPTS" = true ]; then
    print_info "Installing AMP scripts to ~/.local/bin/..."

    # Create directory if it doesn't exist
    mkdir -p ~/.local/bin

    # Copy AMP scripts from submodule
    SCRIPT_COUNT=0
    for script in plugins/amp-messaging/scripts/*.sh; do
        if [ -f "$script" ]; then
            SCRIPT_NAME=$(basename "$script")
            cp "$script" ~/.local/bin/
            chmod +x ~/.local/bin/"$SCRIPT_NAME"

            # Create symlink without .sh extension for convenience
            # e.g., amp-init -> amp-init.sh
            LINK_NAME="${SCRIPT_NAME%.sh}"
            if [ "$LINK_NAME" != "$SCRIPT_NAME" ]; then
                ln -sf "$SCRIPT_NAME" ~/.local/bin/"$LINK_NAME"
            fi

            print_success "Installed: $SCRIPT_NAME"
            SCRIPT_COUNT=$((SCRIPT_COUNT + 1))
        fi
    done

    echo ""
    print_success "Installed $SCRIPT_COUNT AMP scripts (with symlinks)"

    # Also install other AI Maestro tools (graph, memory, docs, agent management)
    echo ""
    print_info "Installing additional AI Maestro tools..."

    TOOL_COUNT=0
    for script in plugin/scripts/*.sh; do
        if [ -f "$script" ]; then
            SCRIPT_NAME=$(basename "$script")
            # Skip old messaging scripts (they're replaced by AMP)
            if [[ "$SCRIPT_NAME" == *"aimaestro-message"* ]] || \
               [[ "$SCRIPT_NAME" == "check-and-show-messages.sh" ]] || \
               [[ "$SCRIPT_NAME" == "check-new-messages-arrived.sh" ]] || \
               [[ "$SCRIPT_NAME" == "send-tmux-message.sh" ]]; then
                continue
            fi
            cp "$script" ~/.local/bin/
            chmod +x ~/.local/bin/"$SCRIPT_NAME"
            print_success "Installed: $SCRIPT_NAME"
            TOOL_COUNT=$((TOOL_COUNT + 1))
        fi
    done

    echo ""
    print_success "Installed $TOOL_COUNT additional tools (graph, memory, docs, agent management)"

    # Install shell helpers
    echo ""
    print_info "Installing shell helpers..."
    mkdir -p ~/.local/share/aimaestro/shell-helpers
    if [ -f "scripts/shell-helpers/common.sh" ]; then
        cp "scripts/shell-helpers/common.sh" ~/.local/share/aimaestro/shell-helpers/
        chmod +x ~/.local/share/aimaestro/shell-helpers/common.sh
        print_success "Installed: shell-helpers/common.sh"
    fi

    # Setup PATH
    echo ""
    print_info "Configuring PATH..."

    # Check if ~/.local/bin is in PATH
    if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
        # Detect shell
        SHELL_RC=""
        if [ -n "$ZSH_VERSION" ] || [ "$SHELL" = "/bin/zsh" ]; then
            SHELL_RC="$HOME/.zshrc"
        elif [ -n "$BASH_VERSION" ] || [ "$SHELL" = "/bin/bash" ]; then
            SHELL_RC="$HOME/.bashrc"
        fi

        if [ -n "$SHELL_RC" ] && [ -f "$SHELL_RC" ]; then
            if ! grep -q 'export PATH="$HOME/.local/bin:$PATH"' "$SHELL_RC" 2>/dev/null; then
                echo '' >> "$SHELL_RC"
                echo '# Added by AI Maestro installer' >> "$SHELL_RC"
                echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"
                print_success "Added ~/.local/bin to PATH in $SHELL_RC"
            else
                print_info "PATH already configured in $SHELL_RC"
            fi
        fi

        # Also add to current session
        export PATH="$HOME/.local/bin:$PATH"
    else
        print_info "~/.local/bin already in PATH"
    fi
fi

# Install Claude Code skills
if [ "$INSTALL_SKILL" = true ]; then
    echo ""
    print_info "Installing Claude Code skills to ~/.claude/skills/..."

    mkdir -p ~/.claude/skills

    # Install AMP messaging skill from submodule
    if [ -d "plugins/amp-messaging/skills/messaging" ]; then
        # Remove old agent-messaging skill if exists
        if [ -d ~/.claude/skills/agent-messaging ]; then
            print_warning "Removing old agent-messaging skill..."
            rm -rf ~/.claude/skills/agent-messaging
        fi

        # Install as 'agent-messaging' for backwards compatibility with skill triggers
        cp -r "plugins/amp-messaging/skills/messaging" ~/.claude/skills/agent-messaging
        print_success "Installed: agent-messaging skill (AMP protocol)"

        if [ -f ~/.claude/skills/agent-messaging/SKILL.md ]; then
            SKILL_SIZE=$(wc -c < ~/.claude/skills/agent-messaging/SKILL.md)
            print_success "Skill file verified (${SKILL_SIZE} bytes)"
        fi
    else
        print_error "AMP messaging skill not found in submodule"
    fi

    # Install other AI Maestro skills
    OTHER_SKILLS=("graph-query" "memory-search" "docs-search" "planning")

    for skill in "${OTHER_SKILLS[@]}"; do
        if [ -d "plugin/skills/$skill" ]; then
            if [ -d ~/.claude/skills/"$skill" ]; then
                rm -rf ~/.claude/skills/"$skill"
            fi
            cp -r "plugin/skills/$skill" ~/.claude/skills/
            print_success "Installed: $skill skill"
        fi
    done
fi

echo ""
echo "🧪 Verifying installation..."
echo ""

# Verify AMP scripts
if [ "$INSTALL_SCRIPTS" = true ]; then
    print_info "Checking AMP scripts..."

    AMP_SCRIPTS=("amp-init.sh" "amp-identity.sh" "amp-send.sh" "amp-inbox.sh" "amp-read.sh" "amp-reply.sh" "amp-status.sh" "amp-register.sh" "amp-fetch.sh" "amp-delete.sh")
    SCRIPTS_OK=true

    for script in "${AMP_SCRIPTS[@]}"; do
        if [ -x ~/.local/bin/"$script" ]; then
            print_success "$script"
        else
            print_error "$script not found"
            SCRIPTS_OK=false
        fi
    done

    echo ""
    if command -v amp-init.sh &> /dev/null; then
        print_success "AMP scripts accessible in PATH"
    else
        print_warning "Restart terminal or run: source ~/.zshrc (or ~/.bashrc)"
    fi
fi

# Verify skills
if [ "$INSTALL_SKILL" = true ]; then
    echo ""
    print_info "Checking installed skills..."

    for skill in agent-messaging graph-query memory-search docs-search planning; do
        if [ -f ~/.claude/skills/"$skill"/SKILL.md ]; then
            print_success "$skill"
        else
            print_warning "$skill not found"
        fi
    done
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    Installation Complete!                      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Show next steps
echo -e "${CYAN}📚 Getting Started with AMP${NC}"
echo ""

if [ "$INSTALL_SCRIPTS" = true ]; then
    echo "1️⃣  Initialize your agent identity (first time only):"
    echo ""
    echo "   $ amp-init.sh --auto"
    echo ""
    echo "2️⃣  Send a message to another agent:"
    echo ""
    echo "   $ amp-send.sh alice \"Hello\" \"How are you?\""
    echo ""
    echo "3️⃣  Check your inbox:"
    echo ""
    echo "   $ amp-inbox.sh"
    echo ""
    echo "4️⃣  Read a message:"
    echo ""
    echo "   $ amp-read.sh <message-id>"
    echo ""
fi

if [ "$INSTALL_SKILL" = true ]; then
    echo "5️⃣  Or use natural language with Claude Code:"
    echo ""
    echo "   > \"Check my messages\""
    echo "   > \"Send a message to backend-api about the deployment\""
    echo "   > \"Reply to the last message\""
    echo ""
fi

echo "📖 Documentation:"
echo ""
echo "   AMP Protocol: https://agentmessaging.org"
echo "   AI Maestro:   https://github.com/23blocks-OS/ai-maestro"
echo ""

# External provider registration (optional)
echo -e "${CYAN}🌐 Optional: Connect to External Providers${NC}"
echo ""
echo "   To send messages to agents outside your local network:"
echo ""
echo "   $ amp-register.sh --provider crabmail.ai --tenant mycompany"
echo ""

if [ "$INSTALL_SCRIPTS" = true ] && ! command -v amp-init.sh &> /dev/null; then
    echo ""
    print_warning "Remember to restart your terminal or run: source ~/.zshrc (or ~/.bashrc)"
fi

echo ""
echo "🎉 Happy agent messaging!"
echo ""
