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
# Extract the recipient agent name from a message JSON file (for inbox placement)
# Checks: toAlias, toSession, .to (plain name), envelope.to (extract name before @)
_extract_recipient() {
    local msg_file="$1"
    local recipient=""

    # Try toAlias first (old flat format)
    recipient=$(jq -r '.toAlias // empty' "$msg_file" 2>/dev/null)
    if [ -n "$recipient" ]; then echo "$recipient"; return; fi

    # Try toSession (some messages have this)
    recipient=$(jq -r '.toSession // empty' "$msg_file" 2>/dev/null)
    if [ -n "$recipient" ]; then echo "$recipient"; return; fi

    # Try .to as plain agent name (old format where to is a name, not UUID)
    local to_val
    to_val=$(jq -r '.to // empty' "$msg_file" 2>/dev/null)
    if [ -n "$to_val" ] && ! echo "$to_val" | grep -qE '^[0-9a-f]{8}-'; then
        # Not a UUID, treat as agent name
        # Strip @domain if present
        recipient=$(echo "$to_val" | cut -d'@' -f1)
        if [ -n "$recipient" ]; then echo "$recipient"; return; fi
    fi

    # Try AMP envelope format
    local env_to
    env_to=$(jq -r '.envelope.to // empty' "$msg_file" 2>/dev/null)
    if [ -n "$env_to" ]; then
        recipient=$(echo "$env_to" | cut -d'@' -f1)
        if [ -n "$recipient" ]; then echo "$recipient"; return; fi
    fi

    echo ""
}

# Extract the sender agent name from a message JSON file (for inbox subdirectory)
# Checks: fromAlias, .from (plain name), envelope.from (extract name before @)
_extract_sender() {
    local msg_file="$1"
    local sender=""

    # Try fromAlias first (old flat format)
    sender=$(jq -r '.fromAlias // empty' "$msg_file" 2>/dev/null)
    if [ -n "$sender" ]; then echo "$sender"; return; fi

    # Try .from as plain agent name
    local from_val
    from_val=$(jq -r '.from // empty' "$msg_file" 2>/dev/null)
    if [ -n "$from_val" ] && ! echo "$from_val" | grep -qE '^[0-9a-f]{8}-'; then
        sender=$(echo "$from_val" | cut -d'@' -f1)
        if [ -n "$sender" ]; then echo "$sender"; return; fi
    fi

    # Try AMP envelope format
    local env_from
    env_from=$(jq -r '.envelope.from // empty' "$msg_file" 2>/dev/null)
    if [ -n "$env_from" ]; then
        sender=$(echo "$env_from" | cut -d'@' -f1)
        if [ -n "$sender" ]; then echo "$sender"; return; fi
    fi

    echo ""
}

# Distribute messages from shared directory to per-agent directories
# This is the critical Phase 2 that ensures messages end up where agents read them
# Convert old flat-format message to AMP envelope format
# If message already has .envelope, returns it unchanged
_convert_to_amp_format() {
    local msg_file="$1"
    local now_ts
    now_ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    # Check if already in AMP envelope format
    local has_envelope
    has_envelope=$(jq -r 'has("envelope")' "$msg_file" 2>/dev/null)
    if [ "$has_envelope" = "true" ]; then
        cat "$msg_file"
        return
    fi

    # Convert old flat format to AMP envelope
    jq --arg now "$now_ts" '
    {
        envelope: {
            version: "amp/0.1",
            id: .id,
            from: ((.fromAlias // .from // "unknown") + "@local"),
            to: ((.toAlias // .to // "unknown") + "@local"),
            subject: (.subject // ""),
            priority: (.priority // "normal"),
            timestamp: (.timestamp // $now),
            thread_id: (.inReplyTo // .id),
            in_reply_to: (.inReplyTo // null),
            expires_at: null,
            signature: null
        },
        payload: (
            if (.content | type) == "object" then
                {
                    type: (.content.type // .type // "notification"),
                    message: (.content.message // ""),
                    context: (.content.context // null)
                }
            elif (.content | type) == "string" then
                {
                    type: (.type // "notification"),
                    message: .content,
                    context: null
                }
            else
                {
                    type: (.type // "notification"),
                    message: "",
                    context: null
                }
            end
        ),
        metadata: {
            status: (.status // "unread"),
            migrated_from: "flat_format",
            migrated_at: $now
        },
        local: {
            status: (.status // "unread"),
            received_at: (.timestamp // $now)
        }
    }' "$msg_file" 2>/dev/null
}

distribute_shared_to_per_agent() {
    local SHARED_INBOX="$HOME/.agent-messaging/messages/inbox"
    local SHARED_SENT="$HOME/.agent-messaging/messages/sent"
    local AGENTS_BASE="$HOME/.agent-messaging/agents"
    local DISTRIBUTED=0
    local SKIPPED=0

    # Distribute inbox messages
    if [ -d "$SHARED_INBOX" ]; then
        while IFS= read -r msg_file; do
            local recipient
            recipient=$(_extract_recipient "$msg_file")
            local sender
            sender=$(_extract_sender "$msg_file")

            if [ -n "$recipient" ] && [ -n "$sender" ]; then
                local dest_dir="$AGENTS_BASE/$recipient/messages/inbox/$sender"
                local msg_basename
                msg_basename=$(basename "$msg_file")

                # Skip if already exists in destination
                if [ -f "$dest_dir/$msg_basename" ]; then
                    continue
                fi

                mkdir -p "$dest_dir"
                # Convert to AMP format and write
                _convert_to_amp_format "$msg_file" > "$dest_dir/$msg_basename"
                DISTRIBUTED=$((DISTRIBUTED + 1))
            else
                SKIPPED=$((SKIPPED + 1))
            fi
        done < <(find "$SHARED_INBOX" -name "*.json" -type f 2>/dev/null)
    fi

    # Distribute sent messages
    if [ -d "$SHARED_SENT" ]; then
        while IFS= read -r msg_file; do
            local sender
            sender=$(_extract_sender "$msg_file")
            local recipient
            recipient=$(_extract_recipient "$msg_file")

            if [ -n "$sender" ] && [ -n "$recipient" ]; then
                local dest_dir="$AGENTS_BASE/$sender/messages/sent/$recipient"
                local msg_basename
                msg_basename=$(basename "$msg_file")

                if [ -f "$dest_dir/$msg_basename" ]; then
                    continue
                fi

                mkdir -p "$dest_dir"
                _convert_to_amp_format "$msg_file" > "$dest_dir/$msg_basename"
                DISTRIBUTED=$((DISTRIBUTED + 1))
            else
                SKIPPED=$((SKIPPED + 1))
            fi
        done < <(find "$SHARED_SENT" -name "*.json" -type f 2>/dev/null)
    fi

    if [ "$DISTRIBUTED" -gt 0 ]; then
        print_success "Distributed $DISTRIBUTED messages to per-agent directories (AMP format)"
    fi
    if [ "$SKIPPED" -gt 0 ]; then
        print_warning "Skipped $SKIPPED messages (could not determine recipient/sender)"
    fi

    echo "$DISTRIBUTED"
}

migrate_old_messages() {
    echo ""
    print_info "Checking for messages to migrate..."

    local OLD_INBOX="$HOME/.aimaestro/messages/inbox"
    local OLD_SENT="$HOME/.aimaestro/messages/sent"
    local SHARED_INBOX="$HOME/.agent-messaging/messages/inbox"
    local SHARED_SENT="$HOME/.agent-messaging/messages/sent"
    local PHASE1_DONE=false

    # ── Phase 1: Migrate from old ~/.aimaestro/messages/ to shared location ──
    if [ -d "$OLD_INBOX" ] || [ -d "$OLD_SENT" ]; then
        local OLD_COUNT=0
        if [ -d "$OLD_INBOX" ]; then
            OLD_COUNT=$(find "$OLD_INBOX" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
        fi
        local OLD_SENT_COUNT=0
        if [ -d "$OLD_SENT" ]; then
            OLD_SENT_COUNT=$(find "$OLD_SENT" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
        fi

        if [ "$((OLD_COUNT + OLD_SENT_COUNT))" -gt 0 ]; then
            print_warning "Found $((OLD_COUNT + OLD_SENT_COUNT)) messages in old format (~/.aimaestro/messages/)"

            if [ "$NON_INTERACTIVE" = true ]; then
                local MIGRATE_CHOICE="y"
            else
                echo ""
                echo "  Messages will be migrated to per-agent directories."
                echo ""
                read -p "Migrate old messages? [Y/n]: " MIGRATE_CHOICE
                MIGRATE_CHOICE=${MIGRATE_CHOICE:-Y}
            fi

            if [[ "$MIGRATE_CHOICE" =~ ^[Yy]$ ]]; then
                mkdir -p "$SHARED_INBOX" "$SHARED_SENT"

                # Copy inbox messages to shared (preserving them for Phase 2)
                if [ -d "$OLD_INBOX" ]; then
                    for agent_dir in "$OLD_INBOX"/*; do
                        if [ -d "$agent_dir" ]; then
                            for msg in "$agent_dir"/*.json; do
                                if [ -f "$msg" ]; then
                                    cp -n "$msg" "$SHARED_INBOX/" 2>/dev/null || true
                                fi
                            done
                        fi
                    done
                fi

                # Copy sent messages to shared
                if [ -d "$OLD_SENT" ]; then
                    for agent_dir in "$OLD_SENT"/*; do
                        if [ -d "$agent_dir" ]; then
                            for msg in "$agent_dir"/*.json; do
                                if [ -f "$msg" ]; then
                                    cp -n "$msg" "$SHARED_SENT/" 2>/dev/null || true
                                fi
                            done
                        fi
                    done
                fi

                # Backup old messages
                local BACKUP_DIR="$HOME/.aimaestro/messages.backup.$(date +%Y%m%d-%H%M%S)"
                if [ -d "$HOME/.aimaestro/messages" ]; then
                    mv "$HOME/.aimaestro/messages" "$BACKUP_DIR"
                    print_info "Old messages backed up to: $BACKUP_DIR"
                fi
                PHASE1_DONE=true
            fi
        fi
    fi

    # ── Phase 2: Distribute from shared to per-agent directories ──
    # This runs regardless of Phase 1 - catches messages that were
    # previously migrated to shared but never distributed
    local SHARED_COUNT=0
    if [ -d "$SHARED_INBOX" ]; then
        SHARED_COUNT=$(find "$SHARED_INBOX" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
    fi
    local SHARED_SENT_COUNT=0
    if [ -d "$SHARED_SENT" ]; then
        SHARED_SENT_COUNT=$(find "$SHARED_SENT" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
    fi

    if [ "$((SHARED_COUNT + SHARED_SENT_COUNT))" -gt 0 ]; then
        print_info "Distributing $((SHARED_COUNT + SHARED_SENT_COUNT)) messages to per-agent directories..."
        local result
        result=$(distribute_shared_to_per_agent)

        if [ "$result" -gt 0 ] 2>/dev/null; then
            # Backup shared messages and clean up
            local SHARED_BACKUP="$HOME/.agent-messaging/messages.backup.$(date +%Y%m%d-%H%M%S)"
            mv "$HOME/.agent-messaging/messages" "$SHARED_BACKUP"
            print_info "Shared messages backed up to: $SHARED_BACKUP"
            print_success "Messages are now in per-agent directories (~/.agent-messaging/agents/<name>/messages/)"
        fi
    else
        if [ "$PHASE1_DONE" != true ]; then
            print_info "No messages to migrate."
        fi
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

# Migrate messages: old format → shared → per-agent directories
# Runs if old messages exist OR if shared messages need distribution
if [ -d "$HOME/.aimaestro/messages" ] || [ -d "$HOME/.agent-messaging/messages/inbox" ] || [ -d "$HOME/.agent-messaging/messages/sent" ]; then
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

    # Remove old messaging scripts that have been replaced by AMP
    echo ""
    print_info "Cleaning up old messaging scripts..."
    OLD_SCRIPTS=(
        "send-aimaestro-message.sh"
        "check-aimaestro-messages.sh"
        "read-aimaestro-message.sh"
        "aimaestro-message-send.sh"
        "aimaestro-message-check.sh"
        "check-and-show-messages.sh"
        "check-new-messages-arrived.sh"
        "send-tmux-message.sh"
        "forward-aimaestro-message.sh"
        "reply-aimaestro-message.sh"
        "messaging-helper.sh"
    )
    OLD_REMOVED=0
    for old_script in "${OLD_SCRIPTS[@]}"; do
        if [ -f "$HOME/.local/bin/$old_script" ]; then
            rm -f "$HOME/.local/bin/$old_script"
            print_success "Removed old script: $old_script"
            OLD_REMOVED=$((OLD_REMOVED + 1))
        fi
    done
    if [ "$OLD_REMOVED" -gt 0 ]; then
        print_success "Removed $OLD_REMOVED old messaging script(s)"
    else
        echo "  No old scripts found"
    fi

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

# Sync Claude Code marketplace plugin (if installed via /install command)
MARKETPLACE_DIR="$HOME/.claude/plugins/marketplaces/ai-maestro-marketplace"
if [ -d "$MARKETPLACE_DIR" ]; then
    echo ""
    print_info "Syncing Claude Code marketplace plugin..."

    # Update CLAUDE.md so agents get current instructions (not stale old ones)
    if [ -f "CLAUDE.md" ]; then
        cp -f CLAUDE.md "$MARKETPLACE_DIR/CLAUDE.md" 2>/dev/null && \
            print_success "CLAUDE.md synced to marketplace plugin" || \
            print_warning "Failed to sync CLAUDE.md"
    fi

    # Also sync the plugin skill/hook definitions
    if [ -d "plugin/.claude-plugin" ]; then
        cp -rf plugin/.claude-plugin "$MARKETPLACE_DIR/plugin/.claude-plugin" 2>/dev/null
        [ -f "plugin/hooks/hooks.json" ] && \
            cp -f plugin/hooks/hooks.json "$MARKETPLACE_DIR/plugin/hooks/hooks.json" 2>/dev/null
    fi
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
