#!/bin/bash
# AI Maestro - Remote Installer (Maestro-Guided)
# Usage: curl -fsSL https://raw.githubusercontent.com/23blocks-OS/ai-maestro/main/scripts/remote-install.sh | sh
#    or: curl -fsSL https://get.aimaestro.dev | sh (when domain is configured)
#
# Options:
#   -d, --dir PATH      Install directory (default: ~/ai-maestro)
#   -y, --yes           Non-interactive mode (auto-accept all prompts)
#   --skip-prereqs      Skip prerequisite installation
#   --skip-tools        Skip agent tools installation
#   --auto-start        Automatically start after install
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
VERSION="0.22.2"
REPO_URL="https://github.com/23blocks-OS/ai-maestro.git"
DEFAULT_INSTALL_DIR="$HOME/ai-maestro"
TYPE_SPEED=0.03  # seconds per character (0 in non-interactive)

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
    echo -e "   ${GREEN}✓${NC} $1"
}

maestro_fail() {
    echo -e "   ${RED}✗${NC} $1"
}

maestro_info() {
    echo -e "   ${BLUE}→${NC} $1"
}

maestro_warn() {
    echo -e "   ${YELLOW}!${NC} $1"
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
        cmd.exe /c start "$url" 2>/dev/null || true
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
AUTO_START=false
UNINSTALL=false
NON_INTERACTIVE=false

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
    echo "Usage: curl -fsSL https://get.aimaestro.dev | sh -s -- [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -d, --dir PATH      Install directory (default: ~/ai-maestro)"
    echo "  -y, --yes           Non-interactive mode (auto-accept all prompts)"
    echo "  --skip-prereqs      Skip prerequisite installation"
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
    echo "  # Fully unattended"
    echo "  curl -fsSL https://get.aimaestro.dev | sh -s -- -y"
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

# Helper: install package based on OS
pkg_install() {
    local pkg_name="$1"
    local macos_cmd="$2"
    local linux_cmd="$3"

    if [ "$OS" = "macos" ]; then
        eval "$macos_cmd"
    elif [ "$OS" = "linux" ] || [ "$OS" = "wsl" ]; then
        eval "$linux_cmd"
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

# =============================================================================
# UNINSTALL
# =============================================================================

uninstall() {
    maestro_say "Removing AI Maestro..."
    echo ""

    # Stop PM2 service if running
    if command -v pm2 &>/dev/null; then
        pm2 stop ai-maestro 2>/dev/null || true
        pm2 delete ai-maestro 2>/dev/null || true
        maestro_info "Stopped PM2 service"
    fi

    # Remove agent tool scripts
    local scripts=(
        "check-aimaestro-messages.sh" "read-aimaestro-message.sh"
        "send-aimaestro-message.sh" "reply-aimaestro-message.sh"
        "list-aimaestro-sent.sh" "delete-aimaestro-message.sh"
        "memory-search.sh" "memory-helper.sh"
        "graph-describe.sh" "graph-find-callers.sh" "graph-find-callees.sh"
        "graph-find-related.sh" "graph-find-by-type.sh" "graph-find-serializers.sh"
        "graph-find-associations.sh" "graph-find-path.sh"
        "docs-search.sh" "docs-find-by-type.sh" "docs-stats.sh"
        "docs-index.sh" "docs-index-delta.sh" "docs-list.sh" "docs-get.sh"
    )
    for script in "${scripts[@]}"; do
        rm -f "$HOME/.local/bin/$script" 2>/dev/null || true
    done
    maestro_info "Removed agent tool scripts"

    # Remove Claude skills
    rm -rf "$HOME/.claude/skills/agent-messaging" 2>/dev/null || true
    rm -rf "$HOME/.claude/skills/memory-search" 2>/dev/null || true
    rm -rf "$HOME/.claude/skills/graph-query" 2>/dev/null || true
    rm -rf "$HOME/.claude/skills/docs-search" 2>/dev/null || true
    maestro_info "Removed Claude skills"

    # Remove shell helpers
    rm -rf "$HOME/.local/share/aimaestro/shell-helpers" 2>/dev/null || true
    maestro_info "Removed shell helpers"

    # Remove message storage
    echo ""
    maestro_ask_yn "Remove message history (~/.aimaestro/messages)?" "n"
    if [ "$REPLY" = "y" ] || [ "$REPLY" = "Y" ]; then
        rm -rf "$HOME/.aimaestro/messages" 2>/dev/null || true
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
    maestro_say "Hey! I'm Maestro — I'll get AI Maestro set up for you."
    maestro_say "Let me see what we're working with..."
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

    # Git
    NEED_GIT=false
    if command -v git &>/dev/null; then
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

    # curl is required — bail early
    if ! command -v curl &>/dev/null && ! command -v wget &>/dev/null; then
        maestro_fail "curl or wget is required but not found."
        if [ "$OS" = "linux" ] || [ "$OS" = "wsl" ]; then
            echo "   Install with: sudo apt-get install -y curl"
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
        maestro_say "I need to install a few things. This should take about 5 minutes. Ready?"
        maestro_ask_yn "" "y"
        if [ "$REPLY" != "y" ] && [ "$REPLY" != "Y" ] && [ "$REPLY" != "" ]; then
            maestro_say "No worries. Run me again when you're ready!"
            exit 0
        fi
    else
        maestro_say "Looking good! All core prerequisites are in place."
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
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        if [ -f /opt/homebrew/bin/brew ]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
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
            brew link node@20 2>/dev/null || brew link --overwrite node@20 2>/dev/null || true
        else
            maestro_info "Installing Node.js 20 via nvm"
            if [ ! -d "$HOME/.nvm" ]; then
                curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
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
        npm install -g yarn
        maestro_ok "Yarn installed"
    fi

    # tmux
    if [ "$NEED_TMUX" = true ]; then
        echo ""
        maestro_say "Setting up tmux..."
        if [ "$OS" = "macos" ]; then
            maestro_info "Installing tmux via Homebrew"
            brew install tmux
        else
            maestro_info "Installing tmux"
            sudo apt-get update -qq
            sudo apt-get install -y -qq tmux
        fi
        maestro_ok "tmux installed"
    fi

    # jq
    if [ "$NEED_JQ" = true ]; then
        echo ""
        maestro_info "Installing jq"
        if [ "$OS" = "macos" ]; then
            brew install jq
        else
            sudo apt-get install -y -qq jq 2>/dev/null || true
        fi
        maestro_ok "jq installed"
    fi

    # AI Tool choice
    if [ "$NEED_CLAUDE" = true ] && [ "$HAS_CODEX" != true ]; then
        echo ""
        maestro_ask_choice "Which AI coding assistant do you want?" \
            "Claude Code (Anthropic) — recommended" \
            "OpenAI Codex (OpenAI)" \
            "Both" \
            "Skip for now"

        local ai_choice="${REPLY:-1}"
        case "$ai_choice" in
            1)
                maestro_info "Installing Claude Code"
                npm install -g @anthropic-ai/claude-code 2>/dev/null && {
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
                npm install -g @openai/codex 2>/dev/null && {
                    maestro_ok "OpenAI Codex installed"
                    HAS_CODEX=true
                } || {
                    maestro_warn "Could not install Codex automatically"
                }
                ;;
            3)
                maestro_info "Installing Claude Code"
                npm install -g @anthropic-ai/claude-code 2>/dev/null && {
                    maestro_ok "Claude Code installed"
                    HAS_CLAUDE=true
                    NEED_CLAUDE=false
                } || maestro_warn "Could not install Claude Code"

                maestro_info "Installing OpenAI Codex"
                npm install -g @openai/codex 2>/dev/null && {
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
# ACT 3: CLONE & BUILD AI MAESTRO
# =============================================================================

act3_clone_and_build() {
    echo ""
    maestro_say "Now the main event — installing AI Maestro..."
    echo ""

    # Check for existing installation
    if [ -d "$INSTALL_DIR" ]; then
        if [ -f "$INSTALL_DIR/package.json" ] && grep -q "ai-maestro" "$INSTALL_DIR/package.json" 2>/dev/null; then
            maestro_warn "AI Maestro already installed at $INSTALL_DIR"
            maestro_ask_yn "Update existing installation?" "y"
            if [ "$REPLY" = "y" ] || [ "$REPLY" = "Y" ] || [ "$REPLY" = "" ]; then
                maestro_step 1 4 "Pulling latest changes..." ""
                cd "$INSTALL_DIR"
                git pull origin main 2>/dev/null || git pull 2>/dev/null || true
                git submodule update --init --recursive
                maestro_step 1 4 "Pulling latest changes..." "done"

                maestro_step 2 4 "Installing dependencies..." ""
                yarn install --silent 2>/dev/null || yarn install
                maestro_step 2 4 "Installing dependencies..." "done"

                maestro_step 3 4 "Setting up agent tools..." ""
                if [ -f "install.sh" ] && [ "$SKIP_TOOLS" != true ]; then
                    chmod +x install.sh
                    ./install.sh --from-remote -y
                fi
                maestro_step 3 4 "Setting up agent tools..." "done"

                maestro_step 4 4 "Configuring your system..." ""
                # Already configured from previous install
                maestro_step 4 4 "Configuring your system..." "done"

                echo ""
                maestro_ok "AI Maestro v${VERSION} updated"
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

    # Fresh install
    maestro_step 1 4 "Downloading..." ""
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR" 2>/dev/null
    cd "$INSTALL_DIR"
    git submodule update --init --recursive 2>/dev/null
    maestro_step 1 4 "Downloading..." "done"

    maestro_step 2 4 "Installing dependencies..." ""
    yarn install --silent 2>/dev/null || yarn install
    maestro_step 2 4 "Installing dependencies..." "done"

    maestro_step 3 4 "Setting up agent tools..." ""
    if [ -f "install.sh" ] && [ "$SKIP_TOOLS" != true ]; then
        chmod +x install.sh
        ./install.sh --from-remote -y
    fi
    maestro_step 3 4 "Setting up agent tools..." "done"

    maestro_step 4 4 "Configuring your system..." ""
    # Configure tmux if setup script exists
    if [ -f "scripts/setup-tmux.sh" ]; then
        chmod +x scripts/setup-tmux.sh
        ./scripts/setup-tmux.sh 2>/dev/null || true
    fi
    maestro_step 4 4 "Configuring your system..." "done"

    echo ""
    maestro_ok "AI Maestro v${VERSION} installed"
}

# =============================================================================
# ACT 4: START SERVICE & REGISTER FIRST AGENT
# =============================================================================

act4_start_and_register() {
    echo ""
    maestro_say "Starting the dashboard..."

    # Check if port 23000 is already in use
    if curl -s http://localhost:23000/api/sessions >/dev/null 2>&1; then
        maestro_ok "AI Maestro already running on port 23000"
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
            nohup yarn start > "$INSTALL_DIR/logs/startup.log" 2>&1 &
            mkdir -p "$INSTALL_DIR/logs"
        fi

        # Wait for service to come up
        local attempts=0
        local max_attempts=30
        while [ $attempts -lt $max_attempts ]; do
            if curl -s http://localhost:23000/api/sessions >/dev/null 2>&1; then
                break
            fi
            sleep 1
            attempts=$((attempts + 1))
        done

        if [ $attempts -lt $max_attempts ]; then
            maestro_ok "AI Maestro running on port 23000"
        else
            maestro_warn "Service is starting slowly — it may need a moment"
            maestro_info "Check: curl http://localhost:23000/api/sessions"
        fi
    fi

    echo ""
    maestro_say "Creating your first agent..."

    # Create first agent working directory
    AGENT_DIR="$HOME/my-first-agent"
    mkdir -p "$AGENT_DIR"

    # Copy CLAUDE.md for first agent
    if [ -f "$INSTALL_DIR/scripts/FIRST-RUN-CLAUDE.md" ]; then
        cp "$INSTALL_DIR/scripts/FIRST-RUN-CLAUDE.md" "$AGENT_DIR/CLAUDE.md"
        # Substitute install-time variables (portable sed)
        portable_sed "s|{{INSTALL_DIR}}|$INSTALL_DIR|g" "$AGENT_DIR/CLAUDE.md"
        portable_sed "s|{{VERSION}}|$VERSION|g" "$AGENT_DIR/CLAUDE.md"
    fi

    # Register agent with AI Maestro (initializes AMP messaging)
    curl -s -X POST http://localhost:23000/api/sessions/create \
        -H "Content-Type: application/json" \
        -d "{\"name\":\"my-first-agent\",\"workingDirectory\":\"$AGENT_DIR\"}" \
        >/dev/null 2>&1 || true

    maestro_ok "Registered 'my-first-agent'"

    # Open dashboard in browser
    maestro_info "Opening dashboard in your browser..."
    open_browser "http://localhost:23000"
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

    if [ -n "$AI_TOOL" ] && [ "$NON_INTERACTIVE" != true ]; then
        maestro_say "Launching ${AI_TOOL} in your first agent session."
        maestro_say "If this is your first time with ${AI_TOOL}, it'll ask you to sign in."
        maestro_say "I'm handing you off now. Have fun building!"
        echo ""
        echo "   Tip: Detach anytime with Ctrl+b then d"
        echo "   Dashboard: http://localhost:23000"
        echo ""

        INITIAL_PROMPT="Hi! I just installed AI Maestro. Can you verify everything is working and help me get started?"

        if [ -n "$TMUX" ]; then
            # Already in tmux — create a new window and switch to it
            tmux new-window -n "my-first-agent" -c "$AGENT_DIR" "$AI_TOOL \"$INITIAL_PROMPT\""
        else
            # Not in tmux — create session and attach
            tmux new-session -d -s "my-first-agent" -c "$AGENT_DIR" \
                "$AI_TOOL \"$INITIAL_PROMPT\""
            exec tmux attach-session -t "my-first-agent"
        fi

    elif [ -n "$AI_TOOL" ] && [ "$NON_INTERACTIVE" = true ]; then
        # Non-interactive: don't attach tmux, just print info
        echo ""
        echo "[maestro] AI Maestro installed at $INSTALL_DIR"
        echo "[maestro] Dashboard: http://localhost:23000"
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
        echo "   Dashboard: http://localhost:23000"
        echo ""
    fi
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    parse_args "$@"

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

    # ACT 3: Clone + Build AI Maestro
    act3_clone_and_build

    # ACT 4: Start Service + Register First Agent
    act4_start_and_register

    # ACT 5: Grand Finale
    act5_grand_finale
}

main "$@"
