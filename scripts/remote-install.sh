#!/bin/bash
# AI Maestro - Remote Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/23blocks-OS/ai-maestro/main/scripts/remote-install.sh | sh
#    or: curl -fsSL https://get.aimaestro.dev | sh (when domain is configured)

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Version
VERSION="0.17.31"
REPO_URL="https://github.com/23blocks-OS/ai-maestro.git"
DEFAULT_INSTALL_DIR="$HOME/ai-maestro"

# Print banner
print_banner() {
    echo ""
    echo -e "${CYAN}${BOLD}"
    echo "    _    ___   __  __                _            "
    echo "   / \  |_ _| |  \/  | __ _  ___  __| |_ _ ___    "
    echo "  / _ \  | |  | |\/| |/ _\` |/ _ \/ _\` | '_/ _ \   "
    echo " / ___ \ | |  | |  | | (_| |  __/ (_| | | | (_) |  "
    echo "/_/   \_\___| |_|  |_|\__,_|\___|\__,_|_|  \___/   "
    echo ""
    echo -e "${NC}${PURPLE}    Orchestrate your AI coding agents${NC}"
    echo -e "${BLUE}    Version ${VERSION}${NC}"
    echo ""
}

print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}!${NC} $1"; }
print_info() { echo -e "${BLUE}→${NC} $1"; }
print_step() { echo -e "${PURPLE}▶${NC} ${BOLD}$1${NC}"; }

# Detect OS
detect_os() {
    OS="unknown"
    DISTRO=""

    if grep -qi microsoft /proc/version 2>/dev/null || grep -qi wsl /proc/version 2>/dev/null; then
        OS="wsl"
        if [ -f /etc/os-release ]; then
            DISTRO=$(grep ^ID= /etc/os-release | cut -d'=' -f2 | tr -d '"')
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
        if [ -f /etc/os-release ]; then
            DISTRO=$(grep ^ID= /etc/os-release | cut -d'=' -f2 | tr -d '"')
        fi
    fi

    if [ "$OS" = "unknown" ]; then
        print_error "Unsupported operating system: $OSTYPE"
        echo ""
        echo "AI Maestro supports:"
        echo "  • macOS 12.0+ (Monterey or later)"
        echo "  • Linux (Ubuntu, Debian, Fedora, etc.)"
        echo "  • Windows via WSL2"
        echo ""
        echo "For Windows: Install WSL2 first with 'wsl --install' in PowerShell"
        exit 1
    fi
}

# Check for required commands
check_requirements() {
    local missing=()

    # Git is required to clone
    if ! command -v git &> /dev/null; then
        missing+=("git")
    fi

    # curl or wget for downloads
    if ! command -v curl &> /dev/null && ! command -v wget &> /dev/null; then
        missing+=("curl")
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        print_error "Missing required tools: ${missing[*]}"
        echo ""
        if [ "$OS" = "macos" ]; then
            echo "Install with: xcode-select --install"
        elif [ "$OS" = "linux" ] || [ "$OS" = "wsl" ]; then
            echo "Install with: sudo apt-get install -y ${missing[*]}"
        fi
        exit 1
    fi
}

# Parse command line arguments
parse_args() {
    INSTALL_DIR="$DEFAULT_INSTALL_DIR"
    SKIP_PREREQS=false
    SKIP_TOOLS=false
    AUTO_START=false
    UNINSTALL=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            -d|--dir)
                INSTALL_DIR="${2/#\~/$HOME}"
                shift 2
                ;;
            --skip-prereqs)
                SKIP_PREREQS=true
                shift
                ;;
            --skip-tools|--skip-messaging)
                SKIP_TOOLS=true
                shift
                ;;
            --auto-start)
                AUTO_START=true
                shift
                ;;
            --uninstall)
                UNINSTALL=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

show_help() {
    echo "AI Maestro Installer"
    echo ""
    echo "Usage: curl -fsSL https://get.aimaestro.dev | sh -s -- [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -d, --dir PATH      Install directory (default: ~/ai-maestro)"
    echo "  --skip-prereqs      Skip prerequisite installation prompts"
    echo "  --skip-tools        Skip agent tools (messaging, memory, graph, docs)"
    echo "  --auto-start        Automatically start after installation"
    echo "  --uninstall         Remove AI Maestro installation"
    echo "  -h, --help          Show this help message"
    echo ""
    echo "Examples:"
    echo "  # Standard install"
    echo "  curl -fsSL https://get.aimaestro.dev | sh"
    echo ""
    echo "  # Install to custom directory"
    echo "  curl -fsSL https://get.aimaestro.dev | sh -s -- -d ~/projects/ai-maestro"
    echo ""
    echo "  # Unattended install with auto-start"
    echo "  curl -fsSL https://get.aimaestro.dev | sh -s -- --skip-prereqs --auto-start"
}

# Uninstall function
uninstall() {
    print_step "Uninstalling AI Maestro..."

    # Stop PM2 service if running
    if command -v pm2 &> /dev/null; then
        pm2 stop ai-maestro 2>/dev/null || true
        pm2 delete ai-maestro 2>/dev/null || true
        print_info "Stopped PM2 service"
    fi

    # Remove all agent tool scripts
    local scripts=(
        # Messaging scripts
        "check-aimaestro-messages.sh"
        "read-aimaestro-message.sh"
        "send-aimaestro-message.sh"
        "reply-aimaestro-message.sh"
        "list-aimaestro-sent.sh"
        "delete-aimaestro-message.sh"
        # Memory scripts
        "memory-search.sh"
        "memory-helper.sh"
        # Graph scripts
        "graph-describe.sh"
        "graph-find-callers.sh"
        "graph-find-callees.sh"
        "graph-find-related.sh"
        "graph-find-by-type.sh"
        "graph-find-serializers.sh"
        "graph-find-associations.sh"
        "graph-find-path.sh"
        # Docs scripts
        "docs-search.sh"
        "docs-find-by-type.sh"
        "docs-stats.sh"
        "docs-index.sh"
        "docs-index-delta.sh"
        "docs-list.sh"
        "docs-get.sh"
    )

    for script in "${scripts[@]}"; do
        rm -f "$HOME/.local/bin/$script" 2>/dev/null || true
    done
    print_info "Removed agent tool scripts"

    # Remove Claude skills
    rm -rf "$HOME/.claude/skills/agent-messaging" 2>/dev/null || true
    rm -rf "$HOME/.claude/skills/memory-search" 2>/dev/null || true
    rm -rf "$HOME/.claude/skills/graph-query" 2>/dev/null || true
    rm -rf "$HOME/.claude/skills/docs-search" 2>/dev/null || true
    print_info "Removed Claude skills"

    # Remove shell helpers
    rm -rf "$HOME/.local/share/aimaestro/shell-helpers" 2>/dev/null || true
    print_info "Removed shell helpers"

    # Remove message storage
    echo ""
    read -p "Remove message history (~/.aimaestro/messages)? (y/n): " REMOVE_MESSAGES
    if [[ "$REMOVE_MESSAGES" =~ ^[Yy]$ ]]; then
        rm -rf "$HOME/.aimaestro/messages" 2>/dev/null || true
        print_info "Removed message history"
    fi

    # Remove installation directory
    if [ -d "$INSTALL_DIR" ]; then
        echo ""
        read -p "Remove installation directory ($INSTALL_DIR)? (y/n): " REMOVE_DIR
        if [[ "$REMOVE_DIR" =~ ^[Yy]$ ]]; then
            rm -rf "$INSTALL_DIR"
            print_info "Removed $INSTALL_DIR"
        fi
    fi

    echo ""
    print_success "AI Maestro uninstalled"
    echo ""
    echo "Note: Prerequisites (Node.js, tmux, etc.) were not removed."
    echo "      Agent data in ~/.aimaestro/agents was preserved."
}

# Main installation
install() {
    print_step "Installing AI Maestro to $INSTALL_DIR"
    echo ""

    # Check if already installed
    if [ -d "$INSTALL_DIR" ]; then
        if [ -f "$INSTALL_DIR/package.json" ] && grep -q "ai-maestro" "$INSTALL_DIR/package.json" 2>/dev/null; then
            print_warning "AI Maestro already installed at $INSTALL_DIR"
            echo ""
            read -p "Update existing installation? (y/n): " UPDATE
            if [[ "$UPDATE" =~ ^[Yy]$ ]]; then
                print_info "Updating..."
                cd "$INSTALL_DIR"
                git pull origin main
                yarn install
                yarn build
                print_success "Updated to latest version"

                # Restart if running
                if command -v pm2 &> /dev/null && pm2 list | grep -q "ai-maestro"; then
                    pm2 restart ai-maestro
                    print_success "Service restarted"
                fi

                echo ""
                print_success "Update complete!"
                echo ""
                echo "Dashboard: http://localhost:23000"
                exit 0
            else
                print_error "Installation cancelled"
                exit 1
            fi
        else
            print_error "Directory exists but doesn't appear to be AI Maestro: $INSTALL_DIR"
            exit 1
        fi
    fi

    # Clone repository
    print_info "Cloning repository..."
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
    print_success "Repository cloned"

    cd "$INSTALL_DIR"

    # Run the full installer
    if [ -f "install.sh" ]; then
        print_info "Running full installer..."
        echo ""

        # Make it executable
        chmod +x install.sh

        # Build installer arguments
        INSTALLER_ARGS=""
        if [ "$SKIP_TOOLS" = true ]; then
            INSTALLER_ARGS="$INSTALLER_ARGS --skip-tools"
        fi

        # Run installer
        ./install.sh $INSTALLER_ARGS
    else
        # Fallback: manual installation
        print_info "Installing dependencies..."

        # Check Node.js
        if ! command -v node &> /dev/null; then
            print_error "Node.js not found. Please install Node.js 18+ first."
            echo ""
            if [ "$OS" = "macos" ]; then
                echo "  brew install node@20"
            else
                echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
                echo "  sudo apt-get install -y nodejs"
            fi
            exit 1
        fi

        # Check Yarn
        if ! command -v yarn &> /dev/null; then
            print_info "Installing Yarn..."
            npm install -g yarn
        fi

        # Install dependencies
        yarn install

        # Build
        print_info "Building..."
        yarn build

        print_success "Installation complete"
    fi

    # Auto-start if requested
    if [ "$AUTO_START" = true ]; then
        echo ""
        print_step "Starting AI Maestro..."

        if command -v pm2 &> /dev/null; then
            cd "$INSTALL_DIR"
            pm2 start ecosystem.config.cjs --env production 2>/dev/null || \
                pm2 start "yarn start" --name ai-maestro
            pm2 save
            print_success "Started with PM2"
        else
            print_warning "PM2 not installed. Starting in foreground..."
            echo ""
            echo "To run in background, install PM2:"
            echo "  npm install -g pm2"
            echo "  cd $INSTALL_DIR && pm2 start ecosystem.config.cjs"
            echo ""
            cd "$INSTALL_DIR"
            yarn start
        fi
    fi
}

# Main execution
main() {
    print_banner

    # Parse arguments (handle stdin piping)
    if [ -t 0 ]; then
        # Running interactively
        parse_args "$@"
    else
        # Piped from curl, check for -s -- args
        parse_args "$@"
    fi

    detect_os

    case "$OS" in
        macos)
            print_info "Detected: macOS"
            ;;
        linux)
            print_info "Detected: Linux ($DISTRO)"
            ;;
        wsl)
            print_info "Detected: WSL ($DISTRO)"
            ;;
    esac

    echo ""

    if [ "$UNINSTALL" = true ]; then
        uninstall
        exit 0
    fi

    check_requirements
    install

    echo ""
    echo -e "${GREEN}${BOLD}Installation Complete!${NC}"
    echo ""
    echo "Next steps:"
    echo ""
    echo "  1. Start AI Maestro:"
    echo "     cd $INSTALL_DIR && yarn dev"
    echo ""
    echo "  2. Open dashboard:"
    echo "     http://localhost:23000"
    echo ""
    echo "  3. Create your first agent:"
    echo "     tmux new-session -s my-agent"
    echo "     claude  # or aider, cursor, etc."
    echo ""
    echo "Documentation: https://github.com/23blocks-OS/ai-maestro"
    echo ""
}

main "$@"
