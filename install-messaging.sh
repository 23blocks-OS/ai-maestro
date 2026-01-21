#!/bin/bash
# AI Maestro - Agent Messaging System Installer
# Installs messaging scripts and Claude Code skill

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
echo "║           AI Maestro - Agent Messaging Installer              ║"
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
if [ ! -d "messaging_scripts" ] || [ ! -d "skills" ] || [ ! -d "docs_scripts" ] || [ ! -d "portable_scripts" ]; then
    print_error "Error: This script must be run from the AI Maestro root directory"
    echo ""
    echo "Usage:"
    echo "  cd /path/to/ai-maestro"
    echo "  ./install-messaging.sh"
    exit 1
fi

echo "🔍 Checking prerequisites..."
echo ""

# Track what needs to be installed
INSTALL_SCRIPTS=false
INSTALL_SKILL=false
PREREQUISITES_OK=true

# Check tmux
print_info "Checking for tmux..."
if command -v tmux &> /dev/null; then
    TMUX_VERSION=$(tmux -V | cut -d' ' -f2)
    print_success "tmux installed (version $TMUX_VERSION)"
else
    print_error "tmux not found"
    echo "         Install with: brew install tmux"
    PREREQUISITES_OK=false
fi

# Check if in a tmux session (optional, just a warning)
if [ -z "$TMUX" ]; then
    print_warning "Not currently in a tmux session (optional, but recommended for testing)"
fi

# Check curl
print_info "Checking for curl..."
if command -v curl &> /dev/null; then
    print_success "curl installed"
else
    print_error "curl not found (required for messaging scripts)"
    PREREQUISITES_OK=false
fi

# Check jq
print_info "Checking for jq..."
if command -v jq &> /dev/null; then
    print_success "jq installed"
else
    print_warning "jq not found (recommended but optional)"
    echo "         Install with: brew install jq"
fi

# Check Claude Code (optional)
print_info "Checking for Claude Code..."
if command -v claude &> /dev/null; then
    CLAUDE_VERSION=$(claude --version 2>/dev/null | head -n1 || echo "unknown")
    print_success "Claude Code installed ($CLAUDE_VERSION)"
    INSTALL_SKILL=true
else
    print_warning "Claude Code not found"
    echo "         Skills Mode will not be available (Manual Mode still works)"
    echo "         Install from: https://claude.ai/download"
fi

echo ""

if [ "$PREREQUISITES_OK" = false ]; then
    print_error "Missing required prerequisites. Please install them and try again."
    exit 1
fi

# Ask user what to install
echo "📦 What would you like to install?"
echo ""
echo "  1) Messaging scripts only (works with ANY agent)"
echo "  2) Claude Code skill only (requires Claude Code)"
echo "  3) Both scripts and skill (recommended)"
echo "  4) Cancel installation"
echo ""
read -p "Enter your choice (1-4): " CHOICE

case $CHOICE in
    1)
        INSTALL_SCRIPTS=true
        INSTALL_SKILL=false
        ;;
    2)
        INSTALL_SCRIPTS=false
        INSTALL_SKILL=true
        if ! command -v claude &> /dev/null; then
            print_error "Claude Code not found. Cannot install skill."
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

# Install messaging scripts
if [ "$INSTALL_SCRIPTS" = true ]; then
    print_info "Installing shell helpers to ~/.local/share/aimaestro/..."

    # Create shell helpers directory
    mkdir -p ~/.local/share/aimaestro/shell-helpers

    # Copy common shell helpers
    if [ -f "scripts/shell-helpers/common.sh" ]; then
        cp "scripts/shell-helpers/common.sh" ~/.local/share/aimaestro/shell-helpers/
        chmod +x ~/.local/share/aimaestro/shell-helpers/common.sh
        print_success "Installed: shell-helpers/common.sh"
    else
        print_error "common.sh not found in scripts/shell-helpers/"
        exit 1
    fi

    # Setup hosts configuration for cross-host messaging
    echo ""
    print_info "Setting up hosts configuration for cross-host messaging..."
    mkdir -p ~/.aimaestro

    # Detect this machine's hostname and IP for proper mesh network config
    SELF_HOSTNAME=$(hostname | tr '[:upper:]' '[:lower:]')

    # Try to get a proper network IP (prefer Tailscale, then LAN)
    SELF_IP=""
    # Try Tailscale IP first (100.x.x.x)
    SELF_IP=$(ifconfig 2>/dev/null | grep -A1 'utun' | grep 'inet 100\.' | awk '{print $2}' | head -1)
    # Fallback to any non-localhost IP
    if [ -z "$SELF_IP" ]; then
        SELF_IP=$(ifconfig 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | head -1)
    fi
    # Last resort: use hostname
    if [ -z "$SELF_IP" ]; then
        SELF_IP="$SELF_HOSTNAME"
    fi

    SELF_URL="http://${SELF_IP}:23000"

    # Check if hosts.json exists and needs migration
    if [ -f "$HOME/.aimaestro/hosts.json" ]; then
        # Check if it has "id": "local" which needs migration
        if grep -q '"id"[[:space:]]*:[[:space:]]*"local"' "$HOME/.aimaestro/hosts.json" 2>/dev/null; then
            print_warning "Found legacy hosts.json with 'local' as host ID"
            print_info "Mesh network requires actual hostname as host ID"
            echo ""
            echo "  Current: \"id\": \"local\""
            echo "  New:     \"id\": \"${SELF_HOSTNAME}\""
            echo ""
            read -p "Migrate hosts.json to use hostname? (recommended) [Y/n]: " MIGRATE_CHOICE
            MIGRATE_CHOICE=${MIGRATE_CHOICE:-Y}

            if [[ "$MIGRATE_CHOICE" =~ ^[Yy]$ ]]; then
                # Backup existing file
                cp "$HOME/.aimaestro/hosts.json" "$HOME/.aimaestro/hosts.json.backup"
                print_info "Backed up to: ~/.aimaestro/hosts.json.backup"

                # Migrate using jq if available, otherwise sed
                if command -v jq &> /dev/null; then
                    # Use jq for safe JSON manipulation
                    jq --arg hostname "$SELF_HOSTNAME" --arg url "$SELF_URL" '
                        .hosts = [.hosts[] |
                            if .id == "local" or .type == "local" then
                                .id = $hostname |
                                .url = $url
                            else . end
                        ]
                    ' "$HOME/.aimaestro/hosts.json.backup" > "$HOME/.aimaestro/hosts.json"
                    print_success "Migrated hosts.json using jq"
                else
                    # Fallback to sed (less safe but works)
                    sed -i.bak "s/\"id\"[[:space:]]*:[[:space:]]*\"local\"/\"id\": \"${SELF_HOSTNAME}\"/g" "$HOME/.aimaestro/hosts.json"
                    print_success "Migrated hosts.json using sed"
                fi
                print_info "New host ID: ${SELF_HOSTNAME}"
                print_info "New host URL: ${SELF_URL}"
            else
                print_warning "Keeping legacy hosts.json - some mesh features may not work correctly"
                print_info "You can manually edit ~/.aimaestro/hosts.json to change 'local' to your hostname"
            fi
        else
            print_info "Keeping existing: ~/.aimaestro/hosts.json (already using proper host ID)"
        fi
    else
        # Create new hosts.json
        if [ -f ".aimaestro/hosts.example.json" ]; then
            cp ".aimaestro/hosts.example.json" "$HOME/.aimaestro/hosts.json"
            print_success "Created: ~/.aimaestro/hosts.json (from example)"
            print_warning "Edit ~/.aimaestro/hosts.json to add your remote hosts"
        else
            # Create a minimal default config with detected values
            cat > "$HOME/.aimaestro/hosts.json" << EOF
{
  "hosts": [
    {
      "id": "${SELF_HOSTNAME}",
      "name": "${SELF_HOSTNAME}",
      "url": "${SELF_URL}",
      "type": "local",
      "enabled": true,
      "description": "This machine"
    }
  ]
}
EOF
            print_success "Created: ~/.aimaestro/hosts.json (default)"
            print_info "Host ID: ${SELF_HOSTNAME}"
            print_info "Host URL: ${SELF_URL}"
            print_warning "Edit ~/.aimaestro/hosts.json to add your remote hosts"
        fi
    fi

    echo ""
    print_info "Installing messaging scripts to ~/.local/bin/..."

    # Create directory if it doesn't exist
    mkdir -p ~/.local/bin

    # Copy scripts
    SCRIPT_COUNT=0
    for script in messaging_scripts/*.sh; do
        if [ -f "$script" ]; then
            SCRIPT_NAME=$(basename "$script")
            cp "$script" ~/.local/bin/
            chmod +x ~/.local/bin/"$SCRIPT_NAME"
            print_success "Installed: $SCRIPT_NAME"
            ((SCRIPT_COUNT++))
        fi
    done

    echo ""
    print_success "Installed $SCRIPT_COUNT messaging scripts"

    # Install docs scripts
    print_info "Installing docs scripts to ~/.local/bin/..."
    DOCS_SCRIPT_COUNT=0
    for script in docs_scripts/*.sh; do
        if [ -f "$script" ]; then
            SCRIPT_NAME=$(basename "$script")
            cp "$script" ~/.local/bin/
            chmod +x ~/.local/bin/"$SCRIPT_NAME"
            print_success "Installed: $SCRIPT_NAME"
            ((DOCS_SCRIPT_COUNT++))
        fi
    done
    echo ""
    print_success "Installed $DOCS_SCRIPT_COUNT docs scripts"

    # Install portable agent scripts
    print_info "Installing portable agent scripts to ~/.local/bin/..."
    PORTABLE_SCRIPT_COUNT=0
    for script in portable_scripts/*.sh; do
        if [ -f "$script" ]; then
            SCRIPT_NAME=$(basename "$script")
            cp "$script" ~/.local/bin/
            chmod +x ~/.local/bin/"$SCRIPT_NAME"
            print_success "Installed: $SCRIPT_NAME"
            ((PORTABLE_SCRIPT_COUNT++))
        fi
    done
    echo ""
    print_success "Installed $PORTABLE_SCRIPT_COUNT portable agent scripts"

    # Check if ~/.local/bin is in PATH
    if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
        print_warning "~/.local/bin is not in your PATH"
        echo ""
        echo "Add this to your ~/.zshrc or ~/.bashrc:"
        echo ""
        echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
        echo ""
        read -p "Would you like me to add it to ~/.zshrc now? (y/n): " ADD_PATH
        if [[ "$ADD_PATH" =~ ^[Yy]$ ]]; then
            echo "" >> ~/.zshrc
            echo "# AI Maestro - Added by installer" >> ~/.zshrc
            echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> ~/.zshrc
            print_success "Added to ~/.zshrc - restart your terminal or run: source ~/.zshrc"
        else
            print_warning "Skipped PATH update - scripts may not work until PATH is configured"
        fi
    else
        print_success "~/.local/bin is already in PATH"
    fi
fi

# Install Claude Code skill
if [ "$INSTALL_SKILL" = true ]; then
    echo ""
    print_info "Installing Claude Code skill to ~/.claude/skills/..."

    # Create directory if it doesn't exist
    mkdir -p ~/.claude/skills

    # Copy all skills
    SKILLS_TO_INSTALL=("agent-messaging" "graph-query" "memory-search" "docs-search")

    for skill in "${SKILLS_TO_INSTALL[@]}"; do
        if [ -d "skills/$skill" ]; then
            # Remove old version if exists
            if [ -d ~/.claude/skills/"$skill" ]; then
                print_warning "Removing old version of $skill skill..."
                rm -rf ~/.claude/skills/"$skill"
            fi

            cp -r "skills/$skill" ~/.claude/skills/
            print_success "Installed: $skill skill"

            # Verify skill file exists
            if [ -f ~/.claude/skills/"$skill"/SKILL.md ]; then
                SKILL_SIZE=$(wc -c < ~/.claude/skills/"$skill"/SKILL.md)
                print_success "Skill file verified (${SKILL_SIZE} bytes)"
            else
                print_error "Skill file not found after installation"
            fi
        else
            print_warning "Skill source directory not found: skills/$skill"
        fi
    done
fi

echo ""
echo "🧪 Verifying installation..."
echo ""

# Verify scripts
if [ "$INSTALL_SCRIPTS" = true ]; then
    print_info "Checking installed scripts..."

    SCRIPTS_OK=true
    for script in send-aimaestro-message.sh check-and-show-messages.sh check-new-messages-arrived.sh send-tmux-message.sh; do
        if [ -x ~/.local/bin/"$script" ]; then
            print_success "$script is executable"
        else
            print_error "$script not found or not executable"
            SCRIPTS_OK=false
        fi
    done

    # Try to find scripts in PATH
    echo ""
    if command -v send-aimaestro-message.sh &> /dev/null; then
        SCRIPT_PATH=$(which send-aimaestro-message.sh)
        print_success "Scripts are accessible in PATH: $SCRIPT_PATH"
    else
        print_warning "Scripts not in PATH yet - restart terminal or run: source ~/.zshrc"
    fi
fi

# Verify skills
if [ "$INSTALL_SKILL" = true ]; then
    echo ""
    print_info "Checking installed skills..."

    for skill in agent-messaging graph-query memory-search docs-search; do
        if [ -f ~/.claude/skills/"$skill"/SKILL.md ]; then
            print_success "$skill skill is installed"
        else
            print_warning "$skill skill not found"
        fi
    done
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    Installation Complete!                      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Show next steps
echo "📚 Next Steps:"
echo ""

if [ "$INSTALL_SCRIPTS" = true ]; then
    echo "1️⃣  Messaging Scripts (Manual Mode)"
    echo ""
    echo "   Test the scripts:"
    echo "   $ send-aimaestro-message.sh backend-architect \"Test\" \"Hello!\" normal notification"
    echo "   $ check-and-show-messages.sh"
    echo ""
    echo "   📖 Full guide: https://github.com/23blocks-OS/ai-maestro/tree/main/messaging_scripts"
    echo ""
fi

if [ "$INSTALL_SKILL" = true ]; then
    echo "2️⃣  Claude Code Skills (Skills Mode)"
    echo ""
    echo "   Available skills:"
    echo ""
    echo "   📬 agent-messaging - Send/receive messages between agents"
    echo "      > \"Send a message to backend-architect asking about the API\""
    echo "      > \"Check my messages\""
    echo ""
    echo "   🔍 graph-query - Query code relationships and structure"
    echo "      > \"Who calls the authenticate function?\""
    echo "      > \"Find all serializers for the User model\""
    echo "      > \"What classes extend ApplicationRecord?\""
    echo ""
    echo "   🧠 memory-search - Search your conversation history"
    echo "      > \"Search my memory for discussions about caching\""
    echo "      > \"Find where we talked about authentication\""
    echo "      > \"Recall our discussion about the payment flow\""
    echo ""
    echo "   📚 docs-search - Search auto-generated documentation"
    echo "      > \"Search docs for authentication functions\""
    echo "      > \"Find documentation for PaymentService\""
    echo "      > \"What functions handle user validation?\""
    echo ""
    echo "   📖 Full guide: https://github.com/23blocks-OS/ai-maestro/tree/main/skills"
    echo ""
fi

echo "3️⃣  Portable Agents (Export/Import)"
echo ""
echo "   Transfer agents between AI Maestro instances:"
echo ""
echo "   $ list-agents.sh                    # List available agents"
echo "   $ export-agent.sh backend-api       # Export agent to ZIP"
echo "   $ import-agent.sh agent-export.zip  # Import on new machine"
echo ""
echo "   Options:"
echo "   --alias <name>     Override agent name on import"
echo "   --new-id           Generate new ID (keeps original by default)"
echo "   --overwrite        Replace existing agent with same name"
echo ""

echo "4️⃣  Documentation"
echo ""
echo "   📬 Quickstart: https://github.com/23blocks-OS/ai-maestro/blob/main/docs/AGENT-COMMUNICATION-QUICKSTART.md"
echo "   📋 Best Practices: https://github.com/23blocks-OS/ai-maestro/blob/main/docs/AGENT-COMMUNICATION-GUIDELINES.md"
echo "   📖 Complete Guide: https://github.com/23blocks-OS/ai-maestro/blob/main/docs/AGENT-MESSAGING-GUIDE.md"
echo ""

# Show warnings if any
if [ "$INSTALL_SCRIPTS" = true ] && ! command -v send-aimaestro-message.sh &> /dev/null; then
    print_warning "Remember to restart your terminal or run: source ~/.zshrc"
fi

echo ""
echo "🎉 Happy agent orchestrating!"
echo ""
