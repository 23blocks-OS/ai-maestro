#!/bin/bash
# AI Maestro - Complete Installation Script
# Installs all prerequisites and sets up AI Maestro from scratch

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Icons
CHECK="✅"
CROSS="❌"
INFO="ℹ️ "
WARN="⚠️ "
ROCKET="🚀"
TOOLS="🔧"
PACKAGE="📦"

# Parse command line arguments
SKIP_TOOLS=false
NON_INTERACTIVE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-tools)
            SKIP_TOOLS=true
            shift
            ;;
        --non-interactive|-y)
            NON_INTERACTIVE=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║              AI Maestro - Complete Installer                  ║"
echo "║                                                                ║"
echo "║         From zero to orchestrating AI agents in minutes       ║"
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
    echo -e "${PURPLE}${ROCKET} $1${NC}"
}

print_header() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# Detect OS and WSL
detect_os() {
    # Check if running in WSL
    if grep -qi microsoft /proc/version 2>/dev/null || grep -qi wsl /proc/version 2>/dev/null; then
        OS="wsl"
        WSL_VERSION=$(grep -oP 'WSL\K[0-9]+' /proc/version 2>/dev/null || echo "2")
        print_success "Detected: WSL${WSL_VERSION} (Windows Subsystem for Linux)"

        # Check if WSL2
        if [ "$WSL_VERSION" = "1" ]; then
            print_warning "You're running WSL1. WSL2 is recommended for better performance."
            echo ""
            echo "  To upgrade to WSL2:"
            echo "    1. Open PowerShell as Administrator on Windows"
            echo "    2. Run: wsl --set-version Ubuntu 2"
            echo ""
            if [ "$NON_INTERACTIVE" = true ]; then
                print_info "Non-interactive mode: continuing with WSL1..."
            else
                read -p "Continue with WSL1? (y/n): " CONTINUE_WSL1
                if [[ ! "$CONTINUE_WSL1" =~ ^[Yy]$ ]]; then
                    exit 1
                fi
            fi
        fi

        # Detect Linux distribution in WSL
        if [ -f /etc/os-release ]; then
            DISTRO=$(grep ^ID= /etc/os-release | cut -d'=' -f2 | tr -d '"')
            print_info "WSL Distribution: $DISTRO"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
        print_success "Detected: macOS"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
        print_success "Detected: Linux"

        # Detect distribution
        if [ -f /etc/os-release ]; then
            DISTRO=$(grep ^ID= /etc/os-release | cut -d'=' -f2 | tr -d '"')
            DISTRO_NAME=$(grep ^NAME= /etc/os-release | cut -d'=' -f2 | tr -d '"')
            print_info "Distribution: $DISTRO_NAME"
        fi
    else
        print_error "Unsupported OS: $OSTYPE"
        echo ""
        echo "AI Maestro supports:"
        echo "  • macOS 12.0+ (Monterey or later)"
        echo "  • Linux (Ubuntu, Debian, Fedora, etc.)"
        echo "  • Windows via WSL2 (Windows Subsystem for Linux)"
        echo ""
        echo "For Windows users:"
        echo "  1. Install WSL2: wsl --install (in PowerShell as Admin)"
        echo "  2. Restart Windows"
        echo "  3. Run this installer in Ubuntu"
        echo "  See: https://github.com/23blocks-OS/ai-maestro/blob/main/docs/WINDOWS-INSTALLATION.md"
        exit 1
    fi
}

# Check if running as root
check_root() {
    if [ "$EUID" -eq 0 ]; then
        print_error "Don't run this script as root (with sudo)"
        echo "The script will ask for sudo password when needed."
        exit 1
    fi
}

print_header "STEP 1: System Check"

check_root
detect_os

echo ""
print_info "Checking what's already installed..."
echo ""

# Track what needs to be installed
NEED_HOMEBREW=false
NEED_NODE=false
NEED_TMUX=false
NEED_CLAUDE=false
NEED_YARN=false
NEED_GIT=false
NEED_JQ=false

# Check Homebrew (macOS only)
if [ "$OS" = "macos" ]; then
    print_info "Checking for Homebrew..."
    if command -v brew &> /dev/null; then
        BREW_VERSION=$(brew --version | head -n1)
        print_success "Homebrew installed ($BREW_VERSION)"
    else
        print_warning "Homebrew not found"
        NEED_HOMEBREW=true
    fi
fi

# Check Git
print_info "Checking for Git..."
if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version | cut -d' ' -f3)
    print_success "Git installed (version $GIT_VERSION)"
else
    print_warning "Git not found"
    NEED_GIT=true
fi

# Check Node.js
print_info "Checking for Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    # Check if version is >= 18
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    if [ "$NODE_MAJOR" -ge 18 ]; then
        print_success "Node.js installed ($NODE_VERSION)"
    else
        print_warning "Node.js $NODE_VERSION is too old (need 18+)"
        NEED_NODE=true
    fi
else
    print_warning "Node.js not found"
    NEED_NODE=true
fi

# Check npm (comes with Node)
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    print_success "npm installed ($NPM_VERSION)"
fi

# Check Yarn
print_info "Checking for Yarn..."
if command -v yarn &> /dev/null; then
    YARN_VERSION=$(yarn --version)
    print_success "Yarn installed ($YARN_VERSION)"
else
    print_warning "Yarn not found"
    NEED_YARN=true
fi

# Check tmux
print_info "Checking for tmux..."
if command -v tmux &> /dev/null; then
    TMUX_VERSION=$(tmux -V | cut -d' ' -f2)
    print_success "tmux installed (version $TMUX_VERSION)"
else
    print_warning "tmux not found"
    NEED_TMUX=true
fi

# Check Claude Code
print_info "Checking for Claude Code..."
if command -v claude &> /dev/null; then
    CLAUDE_VERSION=$(claude --version 2>/dev/null | head -n1 || echo "unknown")
    print_success "Claude Code installed ($CLAUDE_VERSION)"
else
    print_warning "Claude Code not found"
    NEED_CLAUDE=true
fi

# Check jq (required for agent CLI tools)
print_info "Checking for jq..."
if command -v jq &> /dev/null; then
    print_success "jq installed"
else
    print_warning "jq not found (required for agent CLI)"
    NEED_JQ=true
fi

# Check curl (should be pre-installed on macOS)
if ! command -v curl &> /dev/null; then
    print_error "curl not found (should be pre-installed)"
fi

echo ""

# Count missing items
MISSING_COUNT=0
if [ "$NEED_HOMEBREW" = true ]; then MISSING_COUNT=$((MISSING_COUNT + 1)); fi
if [ "$NEED_GIT" = true ]; then MISSING_COUNT=$((MISSING_COUNT + 1)); fi
if [ "$NEED_NODE" = true ]; then MISSING_COUNT=$((MISSING_COUNT + 1)); fi
if [ "$NEED_YARN" = true ]; then MISSING_COUNT=$((MISSING_COUNT + 1)); fi
if [ "$NEED_TMUX" = true ]; then MISSING_COUNT=$((MISSING_COUNT + 1)); fi
if [ "$NEED_CLAUDE" = true ]; then MISSING_COUNT=$((MISSING_COUNT + 1)); fi
if [ "$NEED_JQ" = true ]; then MISSING_COUNT=$((MISSING_COUNT + 1)); fi

if [ $MISSING_COUNT -eq 0 ]; then
    print_success "All prerequisites are installed!"
else
    print_warning "Found $MISSING_COUNT missing prerequisite(s)"
fi

# Ask user if they want to install missing items
if [ $MISSING_COUNT -gt 0 ]; then
    echo ""
    print_header "STEP 2: Install Missing Prerequisites"

    echo "The following will be installed:"
    echo ""

    if [ "$NEED_HOMEBREW" = true ]; then
        echo "  ${PACKAGE} Homebrew - Package manager for macOS"
    fi
    if [ "$NEED_GIT" = true ]; then
        echo "  ${PACKAGE} Git - Version control (required for cloning AI Maestro)"
    fi
    if [ "$NEED_NODE" = true ]; then
        echo "  ${PACKAGE} Node.js 20 LTS - JavaScript runtime (required)"
    fi
    if [ "$NEED_YARN" = true ]; then
        echo "  ${PACKAGE} Yarn - Package manager (required)"
    fi
    if [ "$NEED_TMUX" = true ]; then
        echo "  ${PACKAGE} tmux - Terminal multiplexer (required)"
    fi
    if [ "$NEED_CLAUDE" = true ]; then
        echo "  ${PACKAGE} Claude Code - AI coding assistant (optional)"
    fi
    if [ "$NEED_JQ" = true ]; then
        echo "  ${PACKAGE} jq - JSON processor (optional)"
    fi

    echo ""
    if [ "$NON_INTERACTIVE" = true ]; then
        print_info "Non-interactive mode: installing prerequisites..."
        INSTALL_PREREQS="y"
    else
        read -p "Install missing prerequisites? (y/n): " INSTALL_PREREQS
    fi

    if [[ ! "$INSTALL_PREREQS" =~ ^[Yy]$ ]]; then
        print_warning "Skipping prerequisite installation"
        print_info "You can install manually and run this script again"
        exit 0
    fi

    # Install Homebrew first (needed for other installs on macOS)
    if [ "$NEED_HOMEBREW" = true ]; then
        echo ""
        print_step "Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

        # Add Homebrew to PATH for this session
        if [ -f /opt/homebrew/bin/brew ]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
        fi

        print_success "Homebrew installed"
    fi

    # Install Git
    if [ "$NEED_GIT" = true ]; then
        echo ""
        print_step "Installing Git..."
        if [ "$OS" = "macos" ]; then
            brew install git
        elif [ "$OS" = "linux" ] || [ "$OS" = "wsl" ]; then
            sudo apt-get update
            sudo apt-get install -y git
        fi
        print_success "Git installed"
    fi

    # Install Node.js
    if [ "$NEED_NODE" = true ]; then
        echo ""
        print_step "Installing Node.js 20 LTS..."
        if [ "$OS" = "macos" ]; then
            brew install node@20
            brew link node@20
        elif [ "$OS" = "linux" ] || [ "$OS" = "wsl" ]; then
            print_info "Installing Node.js via nvm (Node Version Manager)..."
            # Check if nvm is already installed
            if [ ! -d "$HOME/.nvm" ]; then
                curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
                # Load nvm for current session
                export NVM_DIR="$HOME/.nvm"
                [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
            else
                export NVM_DIR="$HOME/.nvm"
                [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
            fi
            nvm install 20
            nvm use 20
            nvm alias default 20
        fi
        print_success "Node.js installed"
    fi

    # Install Yarn
    if [ "$NEED_YARN" = true ]; then
        echo ""
        print_step "Installing Yarn..."
        npm install -g yarn
        print_success "Yarn installed"
    fi

    # Install tmux
    if [ "$NEED_TMUX" = true ]; then
        echo ""
        print_step "Installing tmux..."
        if [ "$OS" = "macos" ]; then
            brew install tmux
        elif [ "$OS" = "linux" ] || [ "$OS" = "wsl" ]; then
            sudo apt-get update
            sudo apt-get install -y tmux
        fi
        print_success "tmux installed"
    fi

    # Install jq (optional)
    if [ "$NEED_JQ" = true ]; then
        echo ""
        print_step "Installing jq..."
        if [ "$OS" = "macos" ]; then
            brew install jq
        elif [ "$OS" = "linux" ] || [ "$OS" = "wsl" ]; then
            sudo apt-get update
            sudo apt-get install -y jq
        fi
        print_success "jq installed"
    fi

    # Claude Code requires manual installation
    if [ "$NEED_CLAUDE" = true ]; then
        echo ""
        print_warning "Claude Code requires manual installation"
        echo ""
        echo "  1. Visit: https://claude.ai/download"
        echo "  2. Download Claude Code for your OS"
        echo "  3. Install and authenticate"
        echo "  4. Run this installer again (optional - for messaging features)"
        echo ""
        print_info "AI Maestro works without Claude Code (you can use Aider, Cursor, etc.)"
        echo ""
        if [ "$NON_INTERACTIVE" != true ]; then
            read -p "Press Enter to continue without Claude Code..."
        fi
    fi
fi

# Check if we're already in an AI Maestro directory
print_header "STEP 3: Install AI Maestro"

INSTALL_DIR=""
IN_AI_MAESTRO=false

if [ -f "package.json" ] && grep -q "ai-maestro" package.json 2>/dev/null; then
    IN_AI_MAESTRO=true
    INSTALL_DIR=$(pwd)
    print_info "Already in AI Maestro directory: $INSTALL_DIR"

    echo ""
    if [ "$NON_INTERACTIVE" = true ]; then
        print_info "Non-interactive mode: updating AI Maestro..."
        REINSTALL="y"
    else
        read -p "Reinstall/update AI Maestro here? (y/n): " REINSTALL
    fi
    if [[ ! "$REINSTALL" =~ ^[Yy]$ ]]; then
        print_info "Skipping AI Maestro installation"
        INSTALL_DIR=""
    fi
else
    echo ""
    if [ "$NON_INTERACTIVE" = true ]; then
        print_info "Non-interactive mode: installing to ~/ai-maestro..."
        DIR_CHOICE=1
    else
        echo "Where would you like to install AI Maestro?"
        echo ""
        echo "  1) ~/ai-maestro (recommended)"
        echo "  2) Current directory ($(pwd))"
        echo "  3) Custom location"
        echo "  4) Skip installation (already installed elsewhere)"
        echo ""
        read -p "Enter your choice (1-4): " DIR_CHOICE
    fi

    case $DIR_CHOICE in
        1)
            INSTALL_DIR="$HOME/ai-maestro"
            ;;
        2)
            INSTALL_DIR=$(pwd)/ai-maestro
            ;;
        3)
            read -p "Enter full path: " INSTALL_DIR
            INSTALL_DIR="${INSTALL_DIR/#\~/$HOME}"  # Expand ~
            ;;
        4)
            INSTALL_DIR=""
            ;;
        *)
            print_error "Invalid choice"
            exit 1
            ;;
    esac
fi

if [ -n "$INSTALL_DIR" ]; then
    echo ""

    if [ -d "$INSTALL_DIR" ] && [ "$IN_AI_MAESTRO" = false ]; then
        print_warning "Directory already exists: $INSTALL_DIR"
        if [ "$NON_INTERACTIVE" = true ]; then
            print_info "Non-interactive mode: deleting existing directory..."
            DELETE_DIR="y"
        else
            read -p "Delete and reinstall? (y/n): " DELETE_DIR
        fi
        if [[ "$DELETE_DIR" =~ ^[Yy]$ ]]; then
            rm -rf "$INSTALL_DIR"
        else
            print_error "Installation cancelled"
            exit 1
        fi
    fi

    if [ "$IN_AI_MAESTRO" = false ]; then
        print_step "Cloning AI Maestro repository..."
        git clone https://github.com/23blocks-OS/ai-maestro.git "$INSTALL_DIR"
        print_success "Repository cloned"
    fi

    cd "$INSTALL_DIR"

    # Initialize git submodules (AMP messaging plugin, etc.)
    print_step "Initializing git submodules..."
    git submodule update --init --recursive
    print_success "Git submodules initialized"

    echo ""
    print_step "Installing dependencies..."
    yarn install
    print_success "Dependencies installed"

    # Configure tmux
    echo ""
    print_info "Configure tmux for optimal performance?"
    echo "  - Enables mouse scrolling"
    echo "  - Increases scrollback buffer to 50,000 lines"
    echo "  - Better colors"
    if [ "$NON_INTERACTIVE" = true ]; then
        print_info "Non-interactive mode: configuring tmux..."
        SETUP_TMUX="y"
    else
        read -p "Configure tmux? (y/n): " SETUP_TMUX
    fi

    if [[ "$SETUP_TMUX" =~ ^[Yy]$ ]]; then
        if [ -f "scripts/setup-tmux.sh" ]; then
            ./scripts/setup-tmux.sh
            print_success "tmux configured"
        else
            print_warning "setup-tmux.sh not found - skipping"
        fi
    fi

    # Configure SSH for tmux
    echo ""
    print_info "Configure SSH for tmux sessions? (CRITICAL for git operations)"
    if [ "$NON_INTERACTIVE" = true ]; then
        print_info "Non-interactive mode: configuring SSH..."
        SETUP_SSH="y"
    else
        read -p "Configure SSH? (y/n): " SETUP_SSH
    fi

    if [[ "$SETUP_SSH" =~ ^[Yy]$ ]]; then
        # Add to ~/.tmux.conf
        echo "" >> ~/.tmux.conf
        echo "# SSH Agent Configuration - AI Maestro" >> ~/.tmux.conf
        echo "set-option -g update-environment \"DISPLAY SSH_ASKPASS SSH_AGENT_PID SSH_CONNECTION WINDOWID XAUTHORITY\"" >> ~/.tmux.conf
        echo "set-environment -g 'SSH_AUTH_SOCK' ~/.ssh/ssh_auth_sock" >> ~/.tmux.conf

        # Add to shell config
        SHELL_RC="$HOME/.zshrc"
        if [ -f "$HOME/.bashrc" ]; then
            SHELL_RC="$HOME/.bashrc"
        fi

        echo "" >> "$SHELL_RC"
        echo "# SSH Agent for tmux - AI Maestro" >> "$SHELL_RC"
        echo "if [ -S \"\$SSH_AUTH_SOCK\" ] && [ ! -h \"\$SSH_AUTH_SOCK\" ]; then" >> "$SHELL_RC"
        echo "    mkdir -p ~/.ssh" >> "$SHELL_RC"
        echo "    ln -sf \"\$SSH_AUTH_SOCK\" ~/.ssh/ssh_auth_sock" >> "$SHELL_RC"
        echo "fi" >> "$SHELL_RC"

        # Create initial symlink
        mkdir -p ~/.ssh
        if [ -n "$SSH_AUTH_SOCK" ]; then
            ln -sf "$SSH_AUTH_SOCK" ~/.ssh/ssh_auth_sock
        fi

        # Reload tmux config
        tmux source-file ~/.tmux.conf 2>/dev/null || true

        print_success "SSH configured for tmux"
    fi
fi

# Install agent tools (messaging, memory, graph, docs)
if [ -n "$INSTALL_DIR" ] && [ "$SKIP_TOOLS" != true ]; then
    echo ""
    print_header "STEP 4: Install Agent Tools"

    echo "AI Maestro includes powerful tools for agent collaboration and intelligence:"
    echo ""
    echo "  📨 Messaging    - Agent-to-agent communication"
    echo "  🧠 Memory       - Search conversation history for context"
    echo "  🔗 Graph        - Query code relationships and dependencies"
    echo "  📚 Docs         - Search auto-generated documentation"
    echo "  🪝 Hooks        - Claude Code integration for Chat interface"
    echo ""
    if command -v claude &> /dev/null; then
        echo "  Claude Code skills will be installed for natural language access."
    fi
    echo ""

    INSTALL_TOOLS_ANSWER="y"
    if [ "$NON_INTERACTIVE" != true ]; then
        read -p "Install agent tools? (y/n): " INSTALL_TOOLS_ANSWER
    fi

    if [[ "$INSTALL_TOOLS_ANSWER" =~ ^[Yy]$ ]]; then
        cd "$INSTALL_DIR"

        # Install messaging
        if [ -f "install-messaging.sh" ]; then
            echo ""
            print_step "Installing messaging tools..."
            if [ "$NON_INTERACTIVE" = true ]; then
                ./install-messaging.sh -y
            else
                ./install-messaging.sh
            fi
        fi

        # Install memory tools
        if [ -f "install-memory-tools.sh" ]; then
            echo ""
            print_step "Installing memory tools..."
            if [ "$NON_INTERACTIVE" = true ]; then
                ./install-memory-tools.sh -y
            else
                ./install-memory-tools.sh
            fi
        fi

        # Install graph tools
        if [ -f "install-graph-tools.sh" ]; then
            echo ""
            print_step "Installing graph tools..."
            if [ "$NON_INTERACTIVE" = true ]; then
                ./install-graph-tools.sh -y
            else
                ./install-graph-tools.sh
            fi
        fi

        # Install doc tools
        if [ -f "install-doc-tools.sh" ]; then
            echo ""
            print_step "Installing doc tools..."
            if [ "$NON_INTERACTIVE" = true ]; then
                ./install-doc-tools.sh -y
            else
                ./install-doc-tools.sh
            fi
        fi

        # Install Claude Code hooks
        if [ -f "scripts/claude-hooks/install-hooks.sh" ]; then
            echo ""
            print_step "Installing Claude Code hooks..."
            if [ "$NON_INTERACTIVE" = true ]; then
                ./scripts/claude-hooks/install-hooks.sh -y
            else
                ./scripts/claude-hooks/install-hooks.sh
            fi
        fi

        # Install agent management CLI
        # This installs aimaestro-agent.sh and the ai-maestro-agents-management skill
        if [ -f "install-agent-cli.sh" ]; then
            echo ""
            print_step "Installing agent management CLI..."
            if [ "$NON_INTERACTIVE" = true ]; then
                ./install-agent-cli.sh -y
            else
                ./install-agent-cli.sh
            fi
        fi

        print_success "All agent tools installed"

        # Verify installation
        if [ -f "verify-installation.sh" ]; then
            echo ""
            print_step "Verifying installation..."
            ./verify-installation.sh || true
        fi
    else
        print_info "Skipping agent tools (you can install later with individual install-*.sh scripts)"
    fi
elif [ "$SKIP_TOOLS" = true ]; then
    print_info "Skipping agent tools (--skip-tools flag set)"
fi

# Final steps
print_header "Installation Complete!"

if [ -n "$INSTALL_DIR" ]; then
    echo "AI Maestro installed at: $INSTALL_DIR"
    echo ""
    echo "🚀 Next Steps:"
    echo ""
    echo "1️⃣  Start AI Maestro:"
    echo ""
    echo "   cd $INSTALL_DIR"
    echo "   yarn dev"
    echo ""

    if [ "$OS" = "wsl" ]; then
        echo "   Dashboard opens at: http://localhost:23000"
        echo ""
        print_info "Access from Windows browser:"
        echo "   • Open any browser on Windows"
        echo "   • Navigate to: http://localhost:23000"
        echo "   • Or use your machine name: http://$(hostname):23000"
    else
        echo "   Dashboard opens at: http://localhost:23000"
    fi

    echo ""
    echo "2️⃣  Create your first agent session:"
    echo ""
    echo "   • Click the '+' button in the sidebar"
    echo "   • Or from terminal:"
    echo "     tmux new-session -s my-agent"
    echo "     claude  # or aider, cursor, etc."
    echo ""
    echo "3️⃣  Read the docs:"
    echo ""
    echo "   • README: $INSTALL_DIR/README.md"
    if [ "$OS" = "wsl" ]; then
        echo "   • Windows Guide: $INSTALL_DIR/docs/WINDOWS-INSTALLATION.md"
    fi
    echo "   • Online: https://github.com/23blocks-OS/ai-maestro"
    echo ""

    if [ "$NEED_HOMEBREW" = true ] || [ "$NEED_NODE" = true ]; then
        print_warning "Restart your terminal to complete the installation"
    fi

    if [ "$OS" = "wsl" ]; then
        echo ""
        print_info "WSL2 Tips:"
        echo "  • Access Windows files: /mnt/c/Users/YourUsername"
        echo "  • Keep projects in WSL for better performance: ~/projects"
        echo "  • tmux sessions persist until WSL2 shuts down"
        echo "  • Full guide: $INSTALL_DIR/docs/WINDOWS-INSTALLATION.md"
    fi
else
    echo "Prerequisites installed!"
    echo ""
    echo "AI Maestro is already installed. To start:"
    echo ""
    echo "  cd /path/to/ai-maestro"
    echo "  yarn dev"
fi

echo ""
print_success "Happy orchestrating! 🎉"
echo ""
