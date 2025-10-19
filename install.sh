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

# Detect OS
detect_os() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
        print_success "Detected: macOS"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
        print_warning "Detected: Linux (partial support - macOS recommended)"
    else
        print_error "Unsupported OS: $OSTYPE"
        echo "AI Maestro currently supports macOS. Linux support is experimental."
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

# Check jq (optional but recommended)
print_info "Checking for jq..."
if command -v jq &> /dev/null; then
    print_success "jq installed (optional)"
else
    print_warning "jq not found (optional but recommended)"
    NEED_JQ=true
fi

# Check curl (should be pre-installed on macOS)
if ! command -v curl &> /dev/null; then
    print_error "curl not found (should be pre-installed)"
fi

echo ""

# Count missing items
MISSING_COUNT=0
if [ "$NEED_HOMEBREW" = true ]; then ((MISSING_COUNT++)); fi
if [ "$NEED_GIT" = true ]; then ((MISSING_COUNT++)); fi
if [ "$NEED_NODE" = true ]; then ((MISSING_COUNT++)); fi
if [ "$NEED_YARN" = true ]; then ((MISSING_COUNT++)); fi
if [ "$NEED_TMUX" = true ]; then ((MISSING_COUNT++)); fi
if [ "$NEED_CLAUDE" = true ]; then ((MISSING_COUNT++)); fi
if [ "$NEED_JQ" = true ]; then ((MISSING_COUNT++)); fi

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
    read -p "Install missing prerequisites? (y/n): " INSTALL_PREREQS

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
        fi
        print_success "tmux installed"
    fi

    # Install jq (optional)
    if [ "$NEED_JQ" = true ]; then
        echo ""
        print_step "Installing jq..."
        if [ "$OS" = "macos" ]; then
            brew install jq
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
        read -p "Press Enter to continue without Claude Code..."
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
    read -p "Reinstall/update AI Maestro here? (y/n): " REINSTALL
    if [[ ! "$REINSTALL" =~ ^[Yy]$ ]]; then
        print_info "Skipping AI Maestro installation"
        INSTALL_DIR=""
    fi
else
    echo ""
    echo "Where would you like to install AI Maestro?"
    echo ""
    echo "  1) ~/ai-maestro (recommended)"
    echo "  2) Current directory ($(pwd))"
    echo "  3) Custom location"
    echo "  4) Skip installation (already installed elsewhere)"
    echo ""
    read -p "Enter your choice (1-4): " DIR_CHOICE

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
        read -p "Delete and reinstall? (y/n): " DELETE_DIR
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

    echo ""
    print_step "Installing dependencies..."
    cd "$INSTALL_DIR"
    yarn install
    print_success "Dependencies installed"

    # Configure tmux
    echo ""
    print_info "Configure tmux for optimal performance?"
    echo "  - Enables mouse scrolling"
    echo "  - Increases scrollback buffer to 50,000 lines"
    echo "  - Better colors"
    read -p "Configure tmux? (y/n): " SETUP_TMUX

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
    read -p "Configure SSH? (y/n): " SETUP_SSH

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

# Install messaging system
if [ -n "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/install-messaging.sh" ]; then
    echo ""
    print_header "STEP 4: Install Agent Messaging System (Optional)"

    echo "Enable agent-to-agent communication?"
    echo "  - Scripts for any AI agent (Aider, Cursor, etc.)"
    if command -v claude &> /dev/null; then
        echo "  - Claude Code skill for natural language messaging"
    fi
    echo ""
    read -p "Install messaging system? (y/n): " INSTALL_MESSAGING

    if [[ "$INSTALL_MESSAGING" =~ ^[Yy]$ ]]; then
        cd "$INSTALL_DIR"
        ./install-messaging.sh
    else
        print_info "Skipping messaging system (you can install later with ./install-messaging.sh)"
    fi
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
    echo "   Dashboard opens at: http://localhost:23000"
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
    echo "   • Online: https://github.com/23blocks-OS/ai-maestro"
    echo ""

    if [ "$NEED_HOMEBREW" = true ] || [ "$NEED_NODE" = true ]; then
        print_warning "Restart your terminal to complete the installation"
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
