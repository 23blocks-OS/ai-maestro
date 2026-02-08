#!/bin/bash
# AI Maestro - Migrate to AMP Protocol
# Migrates messages from old AI Maestro format to AMP format
#
# Usage:
#   ./scripts/migrate-to-amp.sh           # Interactive mode
#   ./scripts/migrate-to-amp.sh -y        # Non-interactive (auto-migrate)
#   ./scripts/migrate-to-amp.sh --dry-run # Show what would be migrated

set -e

# Parse command line arguments
NON_INTERACTIVE=false
DRY_RUN=false
while [[ $# -gt 0 ]]; do
    case $1 in
        -y|--yes)
            NON_INTERACTIVE=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            echo "AI Maestro - Migrate to AMP Protocol"
            echo ""
            echo "Usage: ./scripts/migrate-to-amp.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -y, --yes          Non-interactive mode (auto-migrate)"
            echo "  --dry-run          Show what would be migrated without making changes"
            echo "  -h, --help         Show this help message"
            echo ""
            echo "This script migrates messages from the old AI Maestro format"
            echo "(~/.aimaestro/messages/) to the AMP format (~/.agent-messaging/)."
            echo ""
            echo "The migration:"
            echo "  1. Copies messages to the new location"
            echo "  2. Backs up old messages (not deleted)"
            echo "  3. Preserves message content and metadata"
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

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Icons
CHECK="✅"
CROSS="❌"
INFO="ℹ️ "
WARN="⚠️ "

print_success() { echo -e "${GREEN}${CHECK} $1${NC}"; }
print_error() { echo -e "${RED}${CROSS} $1${NC}"; }
print_warning() { echo -e "${YELLOW}${WARN} $1${NC}"; }
print_info() { echo -e "${BLUE}${INFO}$1${NC}"; }

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║           AI Maestro → AMP Protocol Migration                 ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Define paths
OLD_BASE="$HOME/.aimaestro/messages"
OLD_INBOX="$OLD_BASE/inbox"
OLD_SENT="$OLD_BASE/sent"
NEW_BASE="$HOME/.agent-messaging/messages"
NEW_INBOX="$NEW_BASE/inbox"
NEW_SENT="$NEW_BASE/sent"

# Check if old messages exist
if [ ! -d "$OLD_BASE" ]; then
    print_info "No old messaging system found at ~/.aimaestro/messages/"
    echo ""
    echo "Nothing to migrate. You're all set!"
    echo ""
    echo "If you haven't initialized AMP yet, run:"
    echo "  amp-init.sh --auto"
    echo ""
    exit 0
fi

# Count messages
INBOX_COUNT=0
SENT_COUNT=0
AGENT_COUNT=0

if [ -d "$OLD_INBOX" ]; then
    for agent_dir in "$OLD_INBOX"/*; do
        if [ -d "$agent_dir" ]; then
            AGENT_COUNT=$((AGENT_COUNT + 1))
            count=$(find "$agent_dir" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
            INBOX_COUNT=$((INBOX_COUNT + count))
        fi
    done
fi

if [ -d "$OLD_SENT" ]; then
    for agent_dir in "$OLD_SENT"/*; do
        if [ -d "$agent_dir" ]; then
            count=$(find "$agent_dir" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
            SENT_COUNT=$((SENT_COUNT + count))
        fi
    done
fi

TOTAL_COUNT=$((INBOX_COUNT + SENT_COUNT))

if [ "$TOTAL_COUNT" -eq 0 ]; then
    print_info "Old messaging directories exist but contain no messages."
    echo ""

    if [ "$NON_INTERACTIVE" = true ] || [ "$DRY_RUN" = true ]; then
        exit 0
    fi

    read -p "Remove empty old directories? [y/N]: " REMOVE_EMPTY
    if [[ "$REMOVE_EMPTY" =~ ^[Yy]$ ]]; then
        rm -rf "$OLD_BASE"
        print_success "Removed empty ~/.aimaestro/messages/"
    fi
    exit 0
fi

echo "📊 Migration Summary:"
echo ""
echo "   Old location: ~/.aimaestro/messages/"
echo "   New location: ~/.agent-messaging/messages/"
echo ""
echo "   Found:"
echo "   • $AGENT_COUNT agent inbox(es)"
echo "   • $INBOX_COUNT inbox messages"
echo "   • $SENT_COUNT sent messages"
echo "   • $TOTAL_COUNT total messages"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo -e "${CYAN}[DRY RUN] Would migrate:${NC}"
    echo ""

    if [ -d "$OLD_INBOX" ]; then
        for agent_dir in "$OLD_INBOX"/*; do
            if [ -d "$agent_dir" ]; then
                agent_name=$(basename "$agent_dir")
                msg_count=$(find "$agent_dir" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
                echo "   📬 $agent_name: $msg_count messages → $NEW_INBOX/"
            fi
        done
    fi

    if [ -d "$OLD_SENT" ]; then
        for agent_dir in "$OLD_SENT"/*; do
            if [ -d "$agent_dir" ]; then
                agent_name=$(basename "$agent_dir")
                msg_count=$(find "$agent_dir" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
                echo "   📤 $agent_name (sent): $msg_count messages → $NEW_SENT/"
            fi
        done
    fi

    echo ""
    echo "Run without --dry-run to perform migration."
    exit 0
fi

# Confirm migration
if [ "$NON_INTERACTIVE" = false ]; then
    echo "The migration will:"
    echo "  1. Create ~/.agent-messaging/messages/"
    echo "  2. Copy all messages to the new location"
    echo "  3. Backup old messages to ~/.aimaestro/messages.backup.<date>"
    echo ""
    read -p "Proceed with migration? [Y/n]: " CONFIRM
    CONFIRM=${CONFIRM:-Y}

    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
        echo "Migration cancelled."
        exit 0
    fi
fi

echo ""
print_info "Starting migration..."
echo ""

# Create new directories
mkdir -p "$NEW_INBOX" "$NEW_SENT"

# Migrate inbox messages
MIGRATED_INBOX=0
if [ -d "$OLD_INBOX" ]; then
    for agent_dir in "$OLD_INBOX"/*; do
        if [ -d "$agent_dir" ]; then
            agent_name=$(basename "$agent_dir")
            for msg in "$agent_dir"/*.json; do
                if [ -f "$msg" ]; then
                    # Copy to flat structure (AMP doesn't use per-agent subdirs for inbox)
                    cp "$msg" "$NEW_INBOX/"
                    MIGRATED_INBOX=$((MIGRATED_INBOX + 1))
                fi
            done
            print_success "Migrated inbox for: $agent_name"
        fi
    done
fi

# Migrate sent messages
MIGRATED_SENT=0
if [ -d "$OLD_SENT" ]; then
    for agent_dir in "$OLD_SENT"/*; do
        if [ -d "$agent_dir" ]; then
            agent_name=$(basename "$agent_dir")
            for msg in "$agent_dir"/*.json; do
                if [ -f "$msg" ]; then
                    cp "$msg" "$NEW_SENT/"
                    MIGRATED_SENT=$((MIGRATED_SENT + 1))
                fi
            done
            print_success "Migrated sent for: $agent_name"
        fi
    done
fi

echo ""
print_success "Migrated $MIGRATED_INBOX inbox + $MIGRATED_SENT sent = $((MIGRATED_INBOX + MIGRATED_SENT)) messages"

# Backup old messages
BACKUP_DIR="$HOME/.aimaestro/messages.backup.$(date +%Y%m%d_%H%M%S)"
mv "$OLD_BASE" "$BACKUP_DIR"
print_success "Old messages backed up to: $BACKUP_DIR"

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    Migration Complete!                         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo "📍 Your messages are now at:"
echo "   ~/.agent-messaging/messages/inbox/"
echo "   ~/.agent-messaging/messages/sent/"
echo ""

echo "📋 Next steps:"
echo ""
echo "   1. Initialize AMP (if not done):"
echo "      amp-init.sh --auto"
echo ""
echo "   2. Check your inbox:"
echo "      amp-inbox.sh"
echo ""
echo "   3. (Optional) Remove backup after verifying:"
echo "      rm -rf $BACKUP_DIR"
echo ""

# Check if old scripts are still in PATH
if command -v send-aimaestro-message.sh &> /dev/null; then
    print_warning "Old messaging scripts still installed"
    echo ""
    echo "   You can remove them with:"
    echo "   rm ~/.local/bin/*aimaestro-message*.sh"
    echo "   rm ~/.local/bin/check-and-show-messages.sh"
    echo "   rm ~/.local/bin/check-new-messages-arrived.sh"
    echo "   rm ~/.local/bin/send-tmux-message.sh"
    echo ""
fi
