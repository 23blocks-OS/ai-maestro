#!/bin/bash
# AI Maestro - Remote Installer (Maestro-Guided)
# Usage: curl -fsSL https://raw.githubusercontent.com/23blocks-OS/ai-maestro/main/scripts/remote-install.sh | bash
#    or: curl -fsSL https://get.aimaestro.dev | bash
#
# Options:
#   -d, --dir PATH      Install directory (default: ~/ai-maestro)
#   -y, --yes           Non-interactive mode (auto-accept all prompts)
#   --skip-prereqs      Skip prerequisite installation
#   --skip-tools        Skip agent tools installation
#   --uninstall         Remove AI Maestro installation
#   -h, --help          Show help

set -e

# =============================================================================
# MAESTRO UI FUNCTIONS (embedded — runs before repo is cloned)
# =============================================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Version & config
VERSION="0.24.11"
REPO_URL="https://github.com/23blocks-OS/ai-maestro.git"
DEFAULT_INSTALL_DIR="$HOME/ai-maestro"
PORT="${AIMAESTRO_PORT:-23000}"  # configurable via --port or AIMAESTRO_PORT env var
TYPE_SPEED=0.03  # seconds per character (0 in non-interactive)

# Disable ANSI colors in non-interactive/dumb terminal environments (CI logs)
if [ "$TERM" = "dumb" ] || [ -n "$NO_COLOR" ]; then
    RED='' GREEN='' YELLOW='' BLUE='' PURPLE='' CYAN='' BOLD='' DIM='' NC=''
fi

# Auto-disable typing animation over SSH
if [ -n "$SSH_CONNECTION" ] || [ -n "$SSH_TTY" ]; then
    TYPE_SPEED=0
fi

# Maestro prefix
MAESTRO_PREFIX="🎵 Maestro > "

maestro_say() {
    local msg="$1"
    if [ "$NON_INTERACTIVE" = true ]; then
        echo "[maestro] $msg"
        return
    fi
    printf "%b" "$MAESTRO_PREFIX"
    local i=0
    while [ $i -lt ${#msg} ]; do
        printf "%s" "${msg:$i:1}"
        sleep "$TYPE_SPEED"
        i=$((i + 1))
    done
    echo ""
}

maestro_ok() {
    printf "   ${GREEN}✓${NC} %s\n" "$1"
}

maestro_fail() {
    printf "   ${RED}✗${NC} %s\n" "$1"
}

maestro_info() {
    printf "   ${BLUE}→${NC} %s\n" "$1"
}

maestro_warn() {
    printf "   ${YELLOW}!${NC} %s\n" "$1"
}

maestro_check() {
    local label="$1"
    local status="$2"
    if [ "$NON_INTERACTIVE" = true ]; then
        echo "   [check] $label    $status"
    else
        printf "   ${DIM}[checking]${NC} %-24s %s\n" "$label" "$status"
    fi
}

maestro_step() {
    local step="$1"
    local total="$2"
    local label="$3"
    local status="$4"
    printf "   ${DIM}[%s/%s]${NC} %-32s %s\n" "$step" "$total" "$label" "$status"
}

maestro_ask_yn() {
    local msg="$1"
    local default="$2"  # "y" or "n"

    if [ "$NON_INTERACTIVE" = true ]; then
        echo "[maestro] $msg [auto: $default]"
        REPLY="$default"
        return
    fi

    maestro_say "$msg"
    if [ "$default" = "y" ]; then
        printf "   > [Y/n] "
    else
        printf "   > [y/N] "
    fi
    read -r REPLY
    REPLY="${REPLY:-$default}"
}

maestro_ask_choice() {
    local msg="$1"
    shift
    local options=("$@")

    if [ "$NON_INTERACTIVE" = true ]; then
        echo "[maestro] $msg [auto: 1]"
        REPLY="1"
        return
    fi

    maestro_say "$msg"
    local i=1
    for opt in "${options[@]}"; do
        echo "   $i) $opt"
        i=$((i + 1))
    done
    printf "   > "
    read -r REPLY
    REPLY="${REPLY:-1}"
}

open_browser() {
    local url="$1"
    if [ "$NON_INTERACTIVE" = true ]; then
        return
    fi
    if [ "$OS" = "macos" ]; then
        open "$url" 2>/dev/null || true
    elif [ "$OS" = "wsl" ]; then
        cmd.exe /c start "" "$url" 2>/dev/null || true
    elif command -v xdg-open &>/dev/null; then
        xdg-open "$url" 2>/dev/null || true
    fi
}

# Cleanup on error/interrupt
cleanup() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        echo ""
        maestro_fail "Something went wrong (exit code $exit_code)"
        maestro_info "Check the output above for details"
        # Remove partial clone if install dir was created but has no package.json
        # Safety: only auto-remove paths under $HOME (never system dirs)
        if [ -n "$INSTALL_DIR" ] && [ -d "$INSTALL_DIR" ] && [ ! -f "$INSTALL_DIR/package.json" ] \
           && [[ "$INSTALL_DIR" == "$HOME"/* ]]; then
            if [ "$NON_INTERACTIVE" = true ]; then
                rm -rf "$INSTALL_DIR"
                maestro_info "Removed partial installation at $INSTALL_DIR"
            else
                maestro_warn "Partial installation detected at $INSTALL_DIR"
                maestro_info "You may want to remove it: rm -rf $INSTALL_DIR"
            fi
        fi
        maestro_info "You can re-run the installer to try again"
    fi
}
trap cleanup EXIT

# =============================================================================
# ARGUMENT PARSING
# =============================================================================

INSTALL_DIR="$DEFAULT_INSTALL_DIR"
SKIP_PREREQS=false
SKIP_TOOLS=false
SKIP_AI_TOOL=false
SKIP_GATEWAYS=false
UNINSTALL=false
NON_INTERACTIVE=false
IS_UPDATE=false
SELECTED_GATEWAYS=""
GATEWAYS_REPO="https://github.com/23blocks-OS/aimaestro-gateways.git"

# Detect if stdin is not a terminal (piped from curl)
if [ ! -t 0 ]; then
    # When piped, we can't read from stdin for prompts
    # Redirect stdin from /dev/tty so read works
    exec < /dev/tty 2>/dev/null || NON_INTERACTIVE=true
fi

parse_args() {
    while [ $# -gt 0 ]; do
        case $1 in
            -d|--dir)
                INSTALL_DIR="${2/#\~/$HOME}"
                shift 2
                ;;
            -y|--yes|--non-interactive)
                NON_INTERACTIVE=true
                TYPE_SPEED=0
                shift
                ;;
            --skip-prereqs)
                SKIP_PREREQS=true
                shift
                ;;
            --fast)
                TYPE_SPEED=0
                shift
                ;;
            --skip-tools|--skip-messaging)
                SKIP_TOOLS=true
                shift
                ;;
            --skip-ai-tool)
                SKIP_AI_TOOL=true
                shift
                ;;
            --skip-gateways)
                SKIP_GATEWAYS=true
                shift
                ;;
            -p|--port)
                PORT="$2"
                shift 2
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
                maestro_fail "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

show_help() {
    echo "AI Maestro Installer (Maestro-Guided)"
    echo ""
    echo "Usage: curl -fsSL https://get.aimaestro.dev | bash -s -- [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -d, --dir PATH      Install directory (default: ~/ai-maestro)"
    echo "  -y, --yes           Non-interactive mode (auto-accept all prompts)"
    echo "  --fast              Disable typing animation (auto-enabled over SSH)"
    echo "  --skip-prereqs      Skip prerequisite installation"
    echo "  --skip-tools        Skip agent tools (messaging, memory, graph, docs)"
    echo "  --skip-ai-tool      Skip AI coding assistant installation"
    echo "  --skip-gateways     Skip messaging gateway selection"
    echo "  -p, --port PORT     Dashboard port (default: 23000, or AIMAESTRO_PORT env var)"
    echo "  --uninstall         Remove AI Maestro installation"
    echo "  -h, --help          Show this help message"
    echo ""
    echo "Examples:"
    echo "  # Standard install"
    echo "  curl -fsSL https://get.aimaestro.dev | bash"
    echo ""
    echo "  # Install to custom directory"
    echo "  curl -fsSL https://get.aimaestro.dev | bash -s -- -d ~/projects/ai-maestro"
    echo ""
    echo "  # Fully unattended"
    echo "  curl -fsSL https://get.aimaestro.dev | bash -s -- -y"
}

# =============================================================================
# OS DETECTION
# =============================================================================

detect_os() {
    OS="unknown"
    DISTRO=""

    if grep -qi microsoft /proc/version 2>/dev/null || grep -qi wsl /proc/version 2>/dev/null; then
        OS="wsl"
        if [ -f /etc/os-release ]; then
            DISTRO=$(grep ^ID= /etc/os-release | cut -d'=' -f2 | tr -d '"')
        fi
    elif [ "$(uname)" = "Darwin" ]; then
        OS="macos"
    elif [ "$(uname)" = "Linux" ]; then
        OS="linux"
        if [ -f /etc/os-release ]; then
            DISTRO=$(grep ^ID= /etc/os-release | cut -d'=' -f2 | tr -d '"')
        fi
    fi

    if [ "$OS" = "unknown" ]; then
        maestro_fail "Unsupported operating system"
        echo ""
        echo "   AI Maestro supports:"
        echo "     macOS 12.0+ (Monterey or later)"
        echo "     Linux (Ubuntu, Debian, Fedora, etc.)"
        echo "     Windows via WSL2"
        echo ""
        echo "   For Windows: Install WSL2 first with 'wsl --install' in PowerShell"
        exit 1
    fi
}

# sed that works on both macOS and Linux
portable_sed() {
    if [ "$OS" = "macos" ]; then
        sed -i '' "$@"
    else
        sed -i "$@"
    fi
}

# Install a system package on any Linux distro
_install_pkg() {
    local pkg="$1"
    if command -v apt-get &>/dev/null; then
        sudo apt-get install -y -qq "$pkg"
    elif command -v dnf &>/dev/null; then
        sudo dnf install -y "$pkg"
    elif command -v pacman &>/dev/null; then
        sudo pacman -S --noconfirm "$pkg"
    elif command -v zypper &>/dev/null; then
        sudo zypper install -y "$pkg"
    elif command -v apk &>/dev/null; then
        sudo apk add "$pkg"
    else
        maestro_warn "No supported package manager found — install '$pkg' manually"
        return 1
    fi
}

# =============================================================================
# UNINSTALL
# =============================================================================

uninstall() {
    maestro_say "Removing AI Maestro..."
    echo ""

    # Stop PM2 services if running
    if command -v pm2 &>/dev/null; then
        pm2 stop ai-maestro 2>/dev/null || true
        pm2 delete ai-maestro 2>/dev/null || true
        # Stop gateway services
        for gw in slack discord email whatsapp; do
            pm2 stop "${gw}-gateway" 2>/dev/null || true
            pm2 delete "${gw}-gateway" 2>/dev/null || true
        done
        pm2 save 2>/dev/null || true
        maestro_info "Stopped PM2 services"
    fi

    # Stop mailman tmux session
    if tmux has-session -t mailman 2>/dev/null; then
        tmux kill-session -t mailman 2>/dev/null || true
        maestro_info "Stopped mailman tmux session"
    fi

    # Remove agent tool scripts (old messaging + AMP + graph + memory + docs + agent CLI)
    local scripts=(
        "check-aimaestro-messages.sh" "read-aimaestro-message.sh"
        "send-aimaestro-message.sh" "reply-aimaestro-message.sh"
        "list-aimaestro-sent.sh" "delete-aimaestro-message.sh"
        "amp-init.sh" "amp-identity.sh" "amp-send.sh" "amp-inbox.sh"
        "amp-read.sh" "amp-reply.sh" "amp-status.sh" "amp-register.sh"
        "amp-fetch.sh" "amp-delete.sh" "amp-forward.sh" "amp-search.sh"
        "amp-thread.sh"
        "aimaestro-agent.sh"
        "memory-search.sh" "memory-helper.sh"
        "graph-describe.sh" "graph-find-callers.sh" "graph-find-callees.sh"
        "graph-find-related.sh" "graph-find-by-type.sh" "graph-find-serializers.sh"
        "graph-find-associations.sh" "graph-find-path.sh"
        "docs-search.sh" "docs-find-by-type.sh" "docs-stats.sh"
        "docs-index.sh" "docs-index-delta.sh" "docs-list.sh" "docs-get.sh"
    )
    for script in "${scripts[@]}"; do
        rm -f "$HOME/.local/bin/$script" 2>/dev/null || true
        # Also remove symlinks without .sh extension (AMP convenience links)
        local link_name="${script%.sh}"
        if [ "$link_name" != "$script" ]; then
            rm -f "$HOME/.local/bin/$link_name" 2>/dev/null || true
        fi
    done
    maestro_info "Removed agent tool scripts"

    # Remove Claude skills
    rm -rf "$HOME/.claude/skills/agent-messaging" 2>/dev/null || true
    rm -rf "$HOME/.claude/skills/memory-search" 2>/dev/null || true
    rm -rf "$HOME/.claude/skills/graph-query" 2>/dev/null || true
    rm -rf "$HOME/.claude/skills/docs-search" 2>/dev/null || true
    rm -rf "$HOME/.claude/skills/planning" 2>/dev/null || true
    rm -rf "$HOME/.claude/skills/ai-maestro-agents-management" 2>/dev/null || true
    maestro_info "Removed Claude skills"

    # Remove shell helpers
    rm -rf "$HOME/.local/share/aimaestro/shell-helpers" 2>/dev/null || true
    rm -rf "$HOME/.local/share/aimaestro" 2>/dev/null || true
    maestro_info "Removed shell helpers"

    # Remove message storage (both old and new formats)
    echo ""
    maestro_ask_yn "Remove message history (~/.aimaestro/messages and ~/.agent-messaging)?" "n"
    if [ "$REPLY" = "y" ] || [ "$REPLY" = "Y" ]; then
        rm -rf "$HOME/.aimaestro/messages" 2>/dev/null || true
        rm -rf "$HOME/.agent-messaging" 2>/dev/null || true
        maestro_info "Removed message history"
    fi

    # Remove installation directory
    if [ -d "$INSTALL_DIR" ]; then
        echo ""
        maestro_ask_yn "Remove installation directory ($INSTALL_DIR)?" "n"
        if [ "$REPLY" = "y" ] || [ "$REPLY" = "Y" ]; then
            rm -rf "$INSTALL_DIR"
            maestro_info "Removed $INSTALL_DIR"
        fi
    fi

    # Remove first agent directory
    if [ -d "$HOME/my-first-agent" ]; then
        echo ""
        maestro_ask_yn "Remove first agent directory ($HOME/my-first-agent)?" "n"
        if [ "$REPLY" = "y" ] || [ "$REPLY" = "Y" ]; then
            rm -rf "$HOME/my-first-agent"
            maestro_info "Removed $HOME/my-first-agent"
        fi
    fi

    # Remove mailman agent directory
    if [ -d "$HOME/mailman-agent" ]; then
        echo ""
        maestro_ask_yn "Remove mailman agent directory ($HOME/mailman-agent)?" "n"
        if [ "$REPLY" = "y" ] || [ "$REPLY" = "Y" ]; then
            rm -rf "$HOME/mailman-agent"
            maestro_info "Removed $HOME/mailman-agent"
        fi
    fi

    echo ""
    maestro_ok "AI Maestro uninstalled"
    echo ""
    echo "   Note: Prerequisites (Node.js, tmux, etc.) were not removed."
    echo "         Agent data in ~/.aimaestro/agents was preserved."
}

# =============================================================================
# ACT 1: HELLO & DISCOVERY
# =============================================================================

act1_hello_and_discovery() {
    echo ""

    # Detect returning user (match the actual npm package name, not just substring)
    if [ -d "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/package.json" ] && grep -q '"name".*"ai-maestro"' "$INSTALL_DIR/package.json" 2>/dev/null; then
        IS_UPDATE=true
        maestro_say "Welcome back! I'll update your AI Maestro installation."
        maestro_say "Let me check what's changed..."
    else
        maestro_say "Hey! I'm Maestro — I'll get AI Maestro set up for you."
        maestro_say "Let me see what we're working with..."
    fi
    echo ""

    # OS check
    local os_display=""
    case "$OS" in
        macos)  os_display="macOS" ;;
        linux)  os_display="Linux${DISTRO:+ ($DISTRO)}" ;;
        wsl)    os_display="WSL${DISTRO:+ ($DISTRO)}" ;;
    esac
    maestro_check "Operating System" "${os_display} ${GREEN}✓${NC}"

    # Node.js
    NEED_NODE=false
    if command -v node &>/dev/null; then
        local node_ver
        node_ver=$(node --version)
        local node_major
        node_major=$(echo "$node_ver" | cut -d'.' -f1 | sed 's/v//')
        if [ "$node_major" -ge 18 ]; then
            maestro_check "Node.js" "${node_ver} ${GREEN}✓${NC}"
        else
            maestro_check "Node.js" "${node_ver} ${YELLOW}too old${NC}"
            NEED_NODE=true
        fi
    else
        maestro_check "Node.js" "${YELLOW}not found${NC}"
        NEED_NODE=true
    fi

    # Yarn
    NEED_YARN=false
    if command -v yarn &>/dev/null; then
        maestro_check "Yarn" "$(yarn --version) ${GREEN}✓${NC}"
    else
        maestro_check "Yarn" "${YELLOW}not found${NC}"
        NEED_YARN=true
    fi

    # tmux
    NEED_TMUX=false
    if command -v tmux &>/dev/null; then
        maestro_check "tmux" "$(tmux -V | cut -d' ' -f2) ${GREEN}✓${NC}"
    else
        maestro_check "tmux" "${YELLOW}not found${NC}"
        NEED_TMUX=true
    fi

    # Git (on macOS, check Xcode CLI tools first to avoid blocking system dialog)
    NEED_GIT=false
    if [ "$OS" = "macos" ] && ! xcode-select -p &>/dev/null; then
        maestro_check "Git" "${RED}not found (Xcode CLI tools required)${NC}"
        NEED_GIT=true
    elif command -v git &>/dev/null; then
        maestro_check "Git" "$(git --version | cut -d' ' -f3) ${GREEN}✓${NC}"
    else
        maestro_check "Git" "${RED}not found${NC}"
        NEED_GIT=true
    fi

    # jq
    NEED_JQ=false
    if command -v jq &>/dev/null; then
        maestro_check "jq" "${GREEN}✓${NC}"
    else
        maestro_check "jq" "${YELLOW}not found${NC}"
        NEED_JQ=true
    fi

    # Claude Code
    NEED_CLAUDE=false
    HAS_CLAUDE=false
    if command -v claude &>/dev/null; then
        local claude_ver
        claude_ver=$(claude --version 2>/dev/null | head -n1 || echo "installed")
        maestro_check "Claude Code" "${claude_ver} ${GREEN}✓${NC}"
        HAS_CLAUDE=true
    else
        maestro_check "Claude Code" "${YELLOW}not found${NC}"
        NEED_CLAUDE=true
    fi

    # Codex
    HAS_CODEX=false
    if command -v codex &>/dev/null; then
        maestro_check "OpenAI Codex" "${GREEN}✓${NC}"
        HAS_CODEX=true
    else
        maestro_check "OpenAI Codex" "${DIM}not found${NC}"
    fi

    # Tailscale
    NEED_TAILSCALE=false
    HAS_TAILSCALE=false
    if command -v tailscale &>/dev/null; then
        maestro_check "Tailscale" "${GREEN}✓${NC}"
        HAS_TAILSCALE=true
    else
        maestro_check "Tailscale" "${DIM}not found${NC}"
        NEED_TAILSCALE=true
    fi

    # Homebrew (macOS only)
    NEED_HOMEBREW=false
    if [ "$OS" = "macos" ]; then
        if command -v brew &>/dev/null; then
            maestro_check "Homebrew" "${GREEN}✓${NC}"
        else
            maestro_check "Homebrew" "${YELLOW}not found${NC}"
            NEED_HOMEBREW=true
        fi
    fi

    echo ""

    # Git is required — bail early
    if [ "$NEED_GIT" = true ]; then
        maestro_fail "Git is required but not installed."
        if [ "$OS" = "macos" ]; then
            echo "   Install with: xcode-select --install"
        else
            echo "   Install with: sudo apt-get install -y git"
        fi
        exit 1
    fi

    # curl is required (used by Homebrew, nvm, Tailscale, and API calls)
    if ! command -v curl &>/dev/null; then
        maestro_fail "curl is required but not found."
        if [ "$OS" = "linux" ] || [ "$OS" = "wsl" ]; then
            echo "   Install with your package manager, e.g.: sudo apt-get install -y curl"
        fi
        exit 1
    fi

    # Count what's needed
    local need_count=0
    [ "$NEED_HOMEBREW" = true ] && need_count=$((need_count + 1))
    [ "$NEED_NODE" = true ] && need_count=$((need_count + 1))
    [ "$NEED_YARN" = true ] && need_count=$((need_count + 1))
    [ "$NEED_TMUX" = true ] && need_count=$((need_count + 1))
    [ "$NEED_JQ" = true ] && need_count=$((need_count + 1))

    if [ $need_count -gt 0 ] && [ "$SKIP_PREREQS" != true ]; then
        # Estimate time based on what needs installing
        local time_est="1-2 minutes"
        if [ "$NEED_HOMEBREW" = true ]; then
            time_est="5-10 minutes (Homebrew takes a while on first install)"
        elif [ "$NEED_NODE" = true ]; then
            time_est="2-3 minutes"
        fi
        maestro_say "I need to install a few things. This should take about ${time_est}. Ready?"
        maestro_ask_yn "Proceed with installation?" "y"
        if [ "$REPLY" != "y" ] && [ "$REPLY" != "Y" ] && [ "$REPLY" != "" ]; then
            maestro_say "No worries. Run me again when you're ready!"
            exit 0
        fi
    else
        maestro_say "Looking good! All core prerequisites are in place."
        # Fast-track: skip typing animation when everything is already installed
        if [ "$IS_UPDATE" = true ]; then
            TYPE_SPEED=0
        fi
    fi
}

# =============================================================================
# ACT 2: INSTALL PREREQUISITES
# =============================================================================

act2_install_prerequisites() {
    if [ "$SKIP_PREREQS" = true ]; then
        return
    fi

    # Homebrew (macOS)
    if [ "$NEED_HOMEBREW" = true ]; then
        echo ""
        maestro_say "Setting up Homebrew..."
        maestro_info "Installing Homebrew (macOS package manager)"
        NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        if [ -f /opt/homebrew/bin/brew ]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
        elif [ -f /usr/local/bin/brew ]; then
            eval "$(/usr/local/bin/brew shellenv)"
        fi
        maestro_ok "Homebrew installed"
    fi

    # Node.js
    if [ "$NEED_NODE" = true ]; then
        echo ""
        maestro_say "Setting up Node.js..."
        if [ "$OS" = "macos" ]; then
            maestro_info "Installing Node.js 20 via Homebrew"
            brew install node@20
            brew link --force --overwrite node@20 2>/dev/null || true
        else
            maestro_info "Installing Node.js 20 via nvm"
            if [ ! -d "$HOME/.nvm" ]; then
                # Use nvm's latest install URL (auto-resolves to current stable release)
                curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
            fi
            export NVM_DIR="$HOME/.nvm"
            # shellcheck disable=SC1091
            [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
            nvm install 20
            nvm use 20
            nvm alias default 20
        fi
        maestro_ok "Node.js installed"
    fi

    # Yarn
    if [ "$NEED_YARN" = true ]; then
        echo ""
        maestro_say "Setting up Yarn..."
        maestro_info "Installing Yarn"
        # Detect if npm global dir is writable (system Node needs sudo)
        local npm_prefix
        npm_prefix=$(npm config get prefix 2>/dev/null || echo "/usr/local")
        if [ -w "$npm_prefix/lib" ] 2>/dev/null; then
            npm install -g yarn || { maestro_warn "Could not install Yarn"; }
        else
            maestro_info "System Node detected — using sudo for global npm install..."
            sudo npm install -g yarn || { maestro_warn "Could not install Yarn"; }
        fi
        maestro_ok "Yarn installed"
    fi

    # System packages (Linux/WSL only)
    local SKIP_SYSPKG=false
    if [ "$OS" != "macos" ]; then
        if [ "$NEED_TMUX" = true ] || [ "$NEED_JQ" = true ]; then
            # Check if sudo requires a password (skip in CI if no passwordless sudo)
            if [ "$NON_INTERACTIVE" = true ] && ! sudo -n true 2>/dev/null; then
                maestro_warn "sudo requires a password — skipping system packages (tmux, jq)"
                maestro_info "Install manually with your package manager"
                SKIP_SYSPKG=true
            else
                # Run apt-get update if using apt (other package managers don't need it)
                if command -v apt-get &>/dev/null; then
                    maestro_info "I'll need your password to install system packages (tmux, jq)..."
                    sudo apt-get update -qq
                fi
            fi
        fi
    fi

    # tmux
    if [ "$NEED_TMUX" = true ]; then
        echo ""
        maestro_say "Setting up tmux..."
        if [ "$OS" = "macos" ]; then
            maestro_info "Installing tmux via Homebrew"
            brew install tmux
        elif [ "$SKIP_SYSPKG" != true ]; then
            maestro_info "Installing tmux"
            _install_pkg tmux
        fi
        [ "$SKIP_SYSPKG" != true ] && maestro_ok "tmux installed"
    fi

    # jq
    if [ "$NEED_JQ" = true ]; then
        echo ""
        maestro_info "Installing jq"
        if [ "$OS" = "macos" ]; then
            brew install jq
        elif [ "$SKIP_SYSPKG" != true ]; then
            _install_pkg jq
        fi
        [ "$SKIP_SYSPKG" != true ] && maestro_ok "jq installed"
    fi

    # AI Tool choice (skip if --skip-ai-tool or user already has Claude)
    if [ "$HAS_CLAUDE" != true ] && [ "$SKIP_AI_TOOL" != true ]; then
        echo ""
        maestro_ask_choice "Which AI coding assistant do you want?" \
            "Claude Code (Anthropic) — AI pair programmer for terminal" \
            "OpenAI Codex (OpenAI) — AI coding agent" \
            "Both" \
            "Skip for now"

        local ai_choice="${REPLY:-1}"

        # Helper: install npm package with visible errors in CI
        _install_npm_global() {
            local pkg="$1"
            if [ "$NON_INTERACTIVE" = true ]; then
                npm install -g "$pkg"
            else
                npm install -g "$pkg" 2>/dev/null
            fi
        }

        case "$ai_choice" in
            1)
                maestro_info "Installing Claude Code"
                _install_npm_global @anthropic-ai/claude-code && {
                    maestro_ok "Claude Code installed"
                    HAS_CLAUDE=true
                    NEED_CLAUDE=false
                } || {
                    maestro_warn "Could not install Claude Code automatically"
                    echo "   Visit https://claude.ai/download to install manually"
                }
                ;;
            2)
                maestro_info "Installing OpenAI Codex"
                _install_npm_global @openai/codex && {
                    maestro_ok "OpenAI Codex installed"
                    HAS_CODEX=true
                } || {
                    maestro_warn "Could not install Codex automatically"
                }
                ;;
            3)
                maestro_info "Installing Claude Code"
                _install_npm_global @anthropic-ai/claude-code && {
                    maestro_ok "Claude Code installed"
                    HAS_CLAUDE=true
                    NEED_CLAUDE=false
                } || maestro_warn "Could not install Claude Code"

                maestro_info "Installing OpenAI Codex"
                _install_npm_global @openai/codex && {
                    maestro_ok "OpenAI Codex installed"
                    HAS_CODEX=true
                } || maestro_warn "Could not install Codex"
                ;;
            4)
                maestro_info "Skipping AI tool installation"
                ;;
        esac
    fi

    # Tailscale (optional)
    if [ "$NEED_TAILSCALE" = true ]; then
        echo ""
        maestro_ask_yn "Tailscale lets agents work across multiple machines. Install?" "n"
        if [ "$REPLY" = "y" ] || [ "$REPLY" = "Y" ]; then
            maestro_info "Installing Tailscale"
            if [ "$OS" = "macos" ]; then
                brew install --cask tailscale
            else
                curl -fsSL https://tailscale.com/install.sh | sh
            fi
            maestro_ok "Tailscale installed"
            maestro_info "To activate: tailscale up"
            HAS_TAILSCALE=true
        else
            maestro_info "Skipping Tailscale — you can add it later"
        fi
    fi
}

# =============================================================================
# ACT 2B: GATEWAY SELECTION
# =============================================================================

act2b_gateway_selection() {
    # Skip conditions
    if [ "$SKIP_GATEWAYS" = true ]; then
        return
    fi
    if [ "$NON_INTERACTIVE" = true ]; then
        # Non-interactive: no gateways by default
        return
    fi
    if [ "$IS_UPDATE" = true ]; then
        # On update: detect existing gateways, don't re-prompt
        if [ -d "$INSTALL_DIR/services" ]; then
            local found=""
            for gw in slack discord email whatsapp; do
                if [ -d "$INSTALL_DIR/services/${gw}-gateway" ]; then
                    if [ -n "$found" ]; then found="$found,"; fi
                    found="${found}${gw}"
                fi
            done
            SELECTED_GATEWAYS="$found"
        fi
        return
    fi

    echo ""
    maestro_say "Want to connect messaging channels? (Slack, Discord, etc.)"
    maestro_say "Credentials are configured after install — this just downloads the code."
    echo ""

    # Gateway toggle state
    local gw_slack=false gw_discord=false gw_email=false gw_whatsapp=false

    while true; do
        echo ""
        echo "  Connect messaging channels (configured after install):"
        echo ""
        local s_slack=" " s_discord=" " s_email=" " s_whatsapp=" "
        [ "$gw_slack" = true ] && s_slack="✓"
        [ "$gw_discord" = true ] && s_discord="✓"
        [ "$gw_email" = true ] && s_email="✓"
        [ "$gw_whatsapp" = true ] && s_whatsapp="✓"
        echo "    1) [$s_slack]  Slack       Slack workspace bridge"
        echo "    2) [$s_discord]  Discord     Discord server bridge"
        echo "    3) [$s_email]  Email       Email via Mandrill (advanced)"
        echo "    4) [$s_whatsapp]  WhatsApp    WhatsApp Web bridge (beta)"
        echo ""
        echo "  Toggle: 1-4  |  a) All  n) None  Enter) Continue"
        printf "  > "
        read -r choice
        case $choice in
            1) if [ "$gw_slack" = true ]; then gw_slack=false; else gw_slack=true; fi ;;
            2) if [ "$gw_discord" = true ]; then gw_discord=false; else gw_discord=true; fi ;;
            3) if [ "$gw_email" = true ]; then gw_email=false; else gw_email=true; fi ;;
            4) if [ "$gw_whatsapp" = true ]; then gw_whatsapp=false; else gw_whatsapp=true; fi ;;
            a|A) gw_slack=true; gw_discord=true; gw_email=true; gw_whatsapp=true ;;
            n|N) gw_slack=false; gw_discord=false; gw_email=false; gw_whatsapp=false ;;
            "") break ;;
            *) echo "  Invalid choice. Use 1-4, a, n, or Enter." ;;
        esac
    done

    # Build comma-separated list
    local result=""
    if [ "$gw_slack" = true ]; then result="slack"; fi
    if [ "$gw_discord" = true ]; then
        [ -n "$result" ] && result="$result,"
        result="${result}discord"
    fi
    if [ "$gw_email" = true ]; then
        [ -n "$result" ] && result="$result,"
        result="${result}email"
    fi
    if [ "$gw_whatsapp" = true ]; then
        [ -n "$result" ] && result="$result,"
        result="${result}whatsapp"
    fi

    SELECTED_GATEWAYS="$result"

    if [ -n "$SELECTED_GATEWAYS" ]; then
        maestro_ok "Selected gateways: $SELECTED_GATEWAYS"
    else
        maestro_info "No gateways selected — you can add them later"
    fi
}

# =============================================================================
# ACT 3: CLONE & BUILD AI MAESTRO
# =============================================================================

act3_clone_and_build() {
    echo ""
    maestro_say "Now the main event — installing AI Maestro..."
    echo ""

    # Check for existing installation
    if [ -d "$INSTALL_DIR" ]; then
        if [ -f "$INSTALL_DIR/package.json" ] && grep -q '"name".*"ai-maestro"' "$INSTALL_DIR/package.json" 2>/dev/null; then
            # M20/M21: Show current version and check if update is needed
            local old_version=""
            if [ -f "$INSTALL_DIR/package.json" ]; then
                old_version=$(grep '"version"' "$INSTALL_DIR/package.json" 2>/dev/null | head -1 | sed 's/.*"version".*"\([^"]*\)".*/\1/')
            fi
            if [ -n "$old_version" ] && [ "$old_version" = "$VERSION" ]; then
                maestro_ok "AI Maestro v${VERSION} is already up to date"
                maestro_info "Dashboard: http://localhost:${PORT}"
                return
            fi
            maestro_warn "AI Maestro already installed at $INSTALL_DIR"
            if [ -n "$old_version" ]; then
                maestro_info "Current: v${old_version} → Latest: v${VERSION}"
            fi
            maestro_ask_yn "Update existing installation?" "y"
            if [ "$REPLY" = "y" ] || [ "$REPLY" = "Y" ] || [ "$REPLY" = "" ]; then
                maestro_step 1 4 "Pulling latest changes..." ""
                cd "$INSTALL_DIR"
                # Count stashes before so we only pop what we pushed (avoids race condition)
                local stash_count_before
                stash_count_before=$(git stash list 2>/dev/null | wc -l | tr -d ' ')
                git stash --quiet 2>/dev/null || true
                local stash_count_after
                stash_count_after=$(git stash list 2>/dev/null | wc -l | tr -d ' ')
                local had_stash=false
                if [ "$stash_count_after" -gt "$stash_count_before" ]; then
                    had_stash=true
                fi
                git pull origin main 2>/dev/null || git pull
                if [ "$had_stash" = true ]; then
                    if ! git stash pop --quiet 2>/dev/null; then
                        maestro_warn "Could not cleanly restore your local changes after update."
                        maestro_info "Your changes are saved in git stash. To recover:"
                        echo "   cd $INSTALL_DIR && git stash list"
                        echo "   git stash pop   # (resolve any conflicts manually)"
                    fi
                fi
                git submodule update --init --recursive 2>/dev/null || maestro_warn "Some submodules failed to update"
                maestro_step 1 4 "Pulling latest changes..." "done"

                maestro_step 2 4 "Installing dependencies..." ""
                yarn install --silent 2>/dev/null || yarn install || maestro_warn "yarn install had errors — continuing"
                maestro_step 2 4 "Installing dependencies..." "done"

                maestro_step 3 4 "Updating agent tools..." ""
                if [ -f "install.sh" ] && [ "$SKIP_TOOLS" != true ]; then
                    # On update: only reinstall tools that are already present
                    local tool_flags=""
                    [ ! -f "$HOME/.local/bin/check-aimaestro-messages.sh" ] && tool_flags="$tool_flags --skip-memory --skip-graph --skip-docs --skip-hooks --skip-agent-cli"
                    chmod +x install.sh
                    # shellcheck disable=SC2086
                    ./install.sh --from-remote -y $tool_flags
                fi
                maestro_step 3 4 "Updating agent tools..." "done"

                # Update existing gateways
                maestro_step 4 4 "Updating gateways..." ""
                if [ -d "$INSTALL_DIR/services" ] && [ -n "$SELECTED_GATEWAYS" ]; then
                    cd "$INSTALL_DIR/services"
                    git pull origin main 2>/dev/null || git pull 2>/dev/null || true
                    IFS=',' read -ra GW_ARRAY <<< "$SELECTED_GATEWAYS"
                    for gw in "${GW_ARRAY[@]}"; do
                        if [ -d "${gw}-gateway" ]; then
                            (cd "${gw}-gateway" && npm install --silent 2>/dev/null || npm install 2>/dev/null || true)
                        fi
                    done
                    cd "$INSTALL_DIR"
                fi
                maestro_step 4 4 "Updating gateways..." "done"

                echo ""
                maestro_ok "AI Maestro v${VERSION} updated (was v${old_version:-unknown})"
                return
            else
                maestro_fail "Installation cancelled"
                exit 1
            fi
        else
            maestro_fail "Directory exists but isn't AI Maestro: $INSTALL_DIR"
            exit 1
        fi
    fi

    # Fresh install — determine total steps
    local total_steps=4
    [ -n "$SELECTED_GATEWAYS" ] && total_steps=5

    maestro_step 1 "$total_steps" "Downloading..." ""
    if ! git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"; then
        maestro_fail "Failed to clone repository. Check your network connection."
        exit 1
    fi
    cd "$INSTALL_DIR"
    git submodule update --init --recursive || maestro_warn "Some submodules failed to initialize"
    maestro_step 1 "$total_steps" "Downloading..." "done"

    maestro_step 2 "$total_steps" "Installing dependencies..." ""
    yarn install --silent 2>/dev/null || yarn install || maestro_warn "yarn install had errors — continuing"
    maestro_step 2 "$total_steps" "Installing dependencies..." "done"

    maestro_step 3 "$total_steps" "Setting up agent tools..." ""
    if [ -f "install.sh" ] && [ "$SKIP_TOOLS" != true ]; then
        chmod +x install.sh
        ./install.sh --from-remote -y
    fi
    maestro_step 3 "$total_steps" "Setting up agent tools..." "done"

    # Install selected gateways
    if [ -n "$SELECTED_GATEWAYS" ]; then
        maestro_step 4 "$total_steps" "Installing gateways..." ""
        if git clone --depth 1 "$GATEWAYS_REPO" "$INSTALL_DIR/services" 2>/dev/null; then
            IFS=',' read -ra GW_ARRAY <<< "$SELECTED_GATEWAYS"
            for gw in "${GW_ARRAY[@]}"; do
                local gw_dir="$INSTALL_DIR/services/${gw}-gateway"
                if [ -d "$gw_dir" ]; then
                    cd "$gw_dir"
                    npm install --silent 2>/dev/null || npm install || {
                        maestro_warn "npm install failed for ${gw}-gateway — skipping"
                        cd "$INSTALL_DIR"
                        continue
                    }
                    # Copy .env.example to .env with defaults
                    if [ -f ".env.example" ] && [ ! -f ".env" ]; then
                        cp .env.example .env
                        # Pre-set AI Maestro connection and default agent
                        if grep -q 'AIMAESTRO_API' .env 2>/dev/null; then
                            portable_sed 's|AIMAESTRO_API=.*|AIMAESTRO_API=http://127.0.0.1:${PORT}|' .env
                        else
                            echo "AIMAESTRO_API=http://127.0.0.1:${PORT}" >> .env
                        fi
                        if grep -q 'DEFAULT_AGENT' .env 2>/dev/null; then
                            portable_sed 's|DEFAULT_AGENT=.*|DEFAULT_AGENT=mailman|' .env
                        else
                            echo "DEFAULT_AGENT=mailman" >> .env
                        fi
                    fi
                    cd "$INSTALL_DIR"
                fi
            done
            maestro_ok "Gateways installed: $SELECTED_GATEWAYS"
        else
            maestro_warn "Could not clone gateways repo — you can add them later"
            SELECTED_GATEWAYS=""
        fi
        maestro_step 4 "$total_steps" "Installing gateways..." "done"
    fi

    local config_step=$total_steps
    maestro_step "$config_step" "$total_steps" "Configuring your system..." ""
    # Configure tmux if setup script exists
    if [ -f "scripts/setup-tmux.sh" ]; then
        chmod +x scripts/setup-tmux.sh
        ./scripts/setup-tmux.sh 2>/dev/null || true
    fi
    maestro_step "$config_step" "$total_steps" "Configuring your system..." "done"

    echo ""
    maestro_ok "AI Maestro v${VERSION} installed"
}

# =============================================================================
# ACT 4: START SERVICE & REGISTER FIRST AGENT
# =============================================================================

act4_start_and_register() {
    echo ""
    maestro_say "Starting the dashboard..."

    # Check if AI Maestro is already running
    # Verify it's actually AI Maestro by checking for known API response
    if curl -s http://localhost:${PORT}/api/sessions 2>/dev/null | grep -q '"sessions"'; then
        if [ "$IS_UPDATE" = true ]; then
            # Restart service after update so it picks up new code
            maestro_info "Restarting service with updated code..."
            cd "$INSTALL_DIR"
            if command -v pm2 &>/dev/null; then
                pm2 restart ai-maestro 2>/dev/null || pm2 restart all 2>/dev/null || true
            else
                # Kill old nohup process and restart
                local old_pid
                old_pid=$(lsof -ti:"$PORT" 2>/dev/null || true)
                if [ -n "$old_pid" ]; then
                    kill "$old_pid" 2>/dev/null || true
                    sleep 2
                fi
                mkdir -p "$INSTALL_DIR/logs"
                nohup yarn start > "$INSTALL_DIR/logs/startup.log" 2>&1 &
            fi
            # Wait for service to come back up
            local attempts=0
            while [ $attempts -lt 15 ]; do
                if curl -s http://localhost:${PORT}/api/sessions >/dev/null 2>&1; then
                    break
                fi
                sleep 1
                attempts=$((attempts + 1))
            done
            maestro_ok "AI Maestro restarted on port $PORT"
        else
            maestro_ok "AI Maestro already running on port $PORT"
        fi
    else
        # Start the service
        cd "$INSTALL_DIR"
        if command -v pm2 &>/dev/null; then
            if [ -f "ecosystem.config.cjs" ]; then
                pm2 start ecosystem.config.cjs --env production 2>/dev/null || \
                    pm2 start "yarn start" --name ai-maestro 2>/dev/null
            elif [ -f "ecosystem.config.js" ]; then
                pm2 start ecosystem.config.js --env production 2>/dev/null || \
                    pm2 start "yarn start" --name ai-maestro 2>/dev/null
            else
                pm2 start "yarn start" --name ai-maestro 2>/dev/null
            fi
            pm2 save 2>/dev/null || true
        else
            # No pm2 — start in background
            mkdir -p "$INSTALL_DIR/logs"
            nohup yarn start > "$INSTALL_DIR/logs/startup.log" 2>&1 &
            echo $! > "$INSTALL_DIR/logs/aimaestro.pid"
        fi

        # Wait for service to come up
        local attempts=0
        local max_attempts=30
        while [ $attempts -lt $max_attempts ]; do
            if curl -s http://localhost:${PORT}/api/sessions >/dev/null 2>&1; then
                break
            fi
            sleep 1
            attempts=$((attempts + 1))
        done

        if [ $attempts -lt $max_attempts ]; then
            maestro_ok "AI Maestro running on port $PORT"
        else
            maestro_warn "Service is starting slowly — it may need a moment"
            maestro_info "Check: curl http://localhost:${PORT}/api/sessions"
        fi
    fi

    echo ""
    maestro_say "Creating your first agent..."

    # Create first agent working directory
    AGENT_DIR="$HOME/my-first-agent"
    mkdir -p "$AGENT_DIR"

    # Escape all sed metacharacters in INSTALL_DIR — used by both agent templates
    # Escapes: \ & | [ ] . * ^ $ / (covers regex specials + our | delimiter)
    local safe_dir
    safe_dir=$(printf '%s' "$INSTALL_DIR" | sed 's/[[\.*^$|&\\\/]/\\&/g')

    # Copy CLAUDE.md for first agent (only on fresh install, never overwrite)
    if [ ! -f "$AGENT_DIR/CLAUDE.md" ] && [ -f "$INSTALL_DIR/scripts/FIRST-RUN-CLAUDE.md" ]; then
        cp "$INSTALL_DIR/scripts/FIRST-RUN-CLAUDE.md" "$AGENT_DIR/CLAUDE.md"
        # Substitute install-time variables (portable sed)
        portable_sed "s|{{INSTALL_DIR}}|${safe_dir}|g" "$AGENT_DIR/CLAUDE.md"
        portable_sed "s|{{VERSION}}|$VERSION|g" "$AGENT_DIR/CLAUDE.md"
        portable_sed "s|{{SELECTED_GATEWAYS}}|${SELECTED_GATEWAYS}|g" "$AGENT_DIR/CLAUDE.md"
    fi

    # Register agent with AI Maestro (initializes AMP messaging)
    curl -s -X POST http://localhost:${PORT}/api/sessions/create \
        -H "Content-Type: application/json" \
        -d '{"name":"my-first-agent","workingDirectory":"'"$AGENT_DIR"'"}' \
        >/dev/null 2>&1 || true

    maestro_ok "Registered 'my-first-agent'"

    # Create mailman agent if gateways were selected
    if [ -n "$SELECTED_GATEWAYS" ]; then
        local MAILMAN_DIR="$HOME/mailman-agent"
        mkdir -p "$MAILMAN_DIR"
        if [ ! -f "$MAILMAN_DIR/CLAUDE.md" ] && [ -f "$INSTALL_DIR/scripts/MAILMAN-CLAUDE.md" ]; then
            cp "$INSTALL_DIR/scripts/MAILMAN-CLAUDE.md" "$MAILMAN_DIR/CLAUDE.md"
            portable_sed "s|{{INSTALL_DIR}}|${safe_dir}|g" "$MAILMAN_DIR/CLAUDE.md"
            # Format gateways as a bullet list (e.g., "slack,discord" -> "- Slack\n- Discord")
            local gw_list=""
            IFS=',' read -ra GW_ITEMS <<< "$SELECTED_GATEWAYS"
            for gw_item in "${GW_ITEMS[@]}"; do
                local gw_display=""
                case "$gw_item" in
                    slack)    gw_display="Slack" ;;
                    discord)  gw_display="Discord" ;;
                    email)    gw_display="Email" ;;
                    whatsapp) gw_display="WhatsApp" ;;
                    *)        gw_display="$gw_item" ;;
                esac
                if [ -n "$gw_list" ]; then
                    gw_list="${gw_list}\n- ${gw_display}"
                else
                    gw_list="- ${gw_display}"
                fi
            done
            portable_sed "s|{{ACTIVE_GATEWAYS_LIST}}|${gw_list}|g" "$MAILMAN_DIR/CLAUDE.md"
        fi
        # Register mailman with AI Maestro
        curl -s -X POST http://localhost:${PORT}/api/sessions/create \
            -H "Content-Type: application/json" \
            -d '{"name":"mailman","workingDirectory":"'"$MAILMAN_DIR"'"}' \
            >/dev/null 2>&1 || true
        maestro_ok "Registered 'mailman' agent"
    fi

    # Open dashboard in browser
    maestro_info "Opening dashboard in your browser..."
    open_browser "http://localhost:${PORT}"

    # WSL-specific tips
    if [ "$OS" = "wsl" ]; then
        echo ""
        maestro_info "WSL Tips:"
        echo "   - Dashboard: open http://localhost:${PORT} in your Windows browser"
        echo "   - tmux sessions persist while WSL is running (lost on wsl --shutdown or reboot)"
        echo "   - Use 'tmux ls' to list active sessions"
    fi
}

# =============================================================================
# ACT 5: GRAND FINALE
# =============================================================================

act5_grand_finale() {
    echo ""

    # Determine which AI tool to use
    AI_TOOL=""
    command -v claude &>/dev/null && AI_TOOL="claude"
    [ -z "$AI_TOOL" ] && command -v codex &>/dev/null && AI_TOOL="codex"

    # On update, skip tutorial — just show completion summary
    if [ "$IS_UPDATE" = true ]; then
        maestro_ok "Update complete!"
        maestro_info "Dashboard: http://localhost:${PORT}"
        if [ -n "$AI_TOOL" ]; then
            maestro_info "Your existing agents are ready to use."
        fi
        echo ""
        return
    fi

    if [ -n "$AI_TOOL" ] && [ "$NON_INTERACTIVE" != true ] && command -v tmux &>/dev/null; then
        maestro_say "Launching ${AI_TOOL} in your first agent session."
        maestro_say "If this is your first time with ${AI_TOOL}, it'll ask you to sign in."
        maestro_say "After sign-in, you may need to re-type your prompt."
        maestro_say "I'm handing you off now. Have fun building!"
        echo ""
        echo "   Tip: Detach anytime with Ctrl+b, release, then d"
        echo "   Dashboard: http://localhost:${PORT}"
        echo ""

        INITIAL_PROMPT="Hi! I just installed AI Maestro. Can you verify everything is working and help me get started?"

        if [ -n "$TMUX" ]; then
            # Already in tmux — create a new window and switch to it
            tmux new-window -n "my-first-agent" -c "$AGENT_DIR" "$AI_TOOL \"$INITIAL_PROMPT\""
            echo ""
            maestro_ok "Agent launched in a new tmux window!"
            maestro_info "Switch to it: Ctrl+b then n (next window)"
            maestro_info "Dashboard: http://localhost:${PORT}"
        else
            # Not in tmux — create session and attach (handle re-install collision)
            if tmux has-session -t "my-first-agent" 2>/dev/null; then
                maestro_info "Reattaching to existing 'my-first-agent' session..."
            else
                tmux new-session -d -s "my-first-agent" -c "$AGENT_DIR" \
                    "$AI_TOOL \"$INITIAL_PROMPT\""
            fi
            sleep 2
            tmux attach-session -t "my-first-agent"
            echo ""
            maestro_ok "Welcome back! Your agent session is still running in tmux."
            maestro_info "Reattach anytime: tmux attach-session -t my-first-agent"
            maestro_info "Dashboard: http://localhost:${PORT}"
        fi

    elif [ -n "$AI_TOOL" ] && [ "$NON_INTERACTIVE" = true ]; then
        # Non-interactive: don't attach tmux, just print info
        echo ""
        echo "[maestro] AI Maestro installed at $INSTALL_DIR"
        echo "[maestro] Dashboard: http://localhost:${PORT}"
        echo "[maestro] First agent: my-first-agent"
        echo "[maestro] Attach: tmux new-session -s my-first-agent -c $AGENT_DIR '$AI_TOOL'"
        echo ""

    else
        # No AI tool installed — just show the dashboard
        maestro_say "You're all set! The dashboard is running."
        maestro_say "Install Claude Code or Codex, then create agents from the dashboard."
        echo ""
        echo "   Install Claude Code:  npm install -g @anthropic-ai/claude-code"
        echo "   Install Codex:        npm install -g @openai/codex"
        echo ""
        echo "   Dashboard: http://localhost:${PORT}"
        echo ""
    fi
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    parse_args "$@"

    # Strip ANSI after arg parsing (NON_INTERACTIVE may have been set via -y flag)
    if [ "$NON_INTERACTIVE" = true ]; then
        RED='' GREEN='' YELLOW='' BLUE='' PURPLE='' CYAN='' BOLD='' DIM='' NC=''
    fi

    # M1: Warn if running as root (curl | sudo bash is dangerous)
    if [ "$(id -u)" = "0" ]; then
        maestro_warn "Running as root is not recommended."
        maestro_info "AI Maestro doesn't need root — services run as your user."
        maestro_info "Consider: curl -fsSL https://get.aimaestro.dev | bash  (without sudo)"
        if [ "$NON_INTERACTIVE" != true ]; then
            maestro_ask_yn "Continue as root anyway?" "n"
            if [ "$REPLY" != "y" ] && [ "$REPLY" != "Y" ]; then
                exit 1
            fi
        fi
    fi

    detect_os

    # Handle uninstall
    if [ "$UNINSTALL" = true ]; then
        uninstall
        exit 0
    fi

    # ACT 1: Hello & Discovery
    act1_hello_and_discovery

    # ACT 2: Install Prerequisites
    act2_install_prerequisites

    # ACT 2B: Gateway Selection
    act2b_gateway_selection

    # ACT 3: Clone + Build AI Maestro
    act3_clone_and_build

    # ACT 4: Start Service + Register First Agent
    act4_start_and_register

    # ACT 5: Grand Finale
    act5_grand_finale

    # Machine-readable status line for CI log parsing
    if [ "$NON_INTERACTIVE" = true ]; then
        echo "[maestro] STATUS: SUCCESS"
    fi
}

main "$@"
