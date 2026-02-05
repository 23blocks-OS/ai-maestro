#!/bin/bash
#
# migrate-messages-to-amp.sh
#
# Migrates existing AI Maestro messages to AMP-compatible format.
# Creates backups before migration and can be run multiple times safely.
#
# Usage:
#   ./migrate-messages-to-amp.sh [options]
#
# Options:
#   --dry-run       Show what would be migrated without making changes
#   --tenant NAME   Set tenant name (default: derived from hostname)
#   --backup-dir    Custom backup directory (default: ~/.aimaestro/messages-backup-<timestamp>)
#   --no-backup     Skip backup (not recommended)
#   --force         Re-migrate already migrated messages
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
MESSAGES_DIR="$HOME/.aimaestro/messages"
DRY_RUN=false
TENANT=""
BACKUP_DIR=""
NO_BACKUP=false
FORCE=false
PROVIDER="aimaestro.local"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --tenant)
      TENANT="$2"
      shift 2
      ;;
    --backup-dir)
      BACKUP_DIR="$2"
      shift 2
      ;;
    --no-backup)
      NO_BACKUP=true
      shift
      ;;
    --force)
      FORCE=true
      shift
      ;;
    -h|--help)
      head -25 "$0" | tail -22
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Derive tenant from hostname if not specified
if [ -z "$TENANT" ]; then
  TENANT=$(hostname | tr '[:upper:]' '[:lower:]' | sed 's/\.local$//' | tr '.' '-')
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  AI Maestro Message Migration to AMP Format${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Messages dir: ${GREEN}$MESSAGES_DIR${NC}"
echo -e "  Tenant:       ${GREEN}$TENANT${NC}"
echo -e "  Provider:     ${GREEN}$PROVIDER${NC}"
echo -e "  Dry run:      ${YELLOW}$DRY_RUN${NC}"
echo ""

# Check if messages directory exists
if [ ! -d "$MESSAGES_DIR" ]; then
  echo -e "${YELLOW}No messages directory found at $MESSAGES_DIR${NC}"
  echo "Nothing to migrate."
  exit 0
fi

# Count messages
TOTAL_MESSAGES=$(find "$MESSAGES_DIR" -name "*.json" -type f 2>/dev/null | wc -l | tr -d ' ')

if [ "$TOTAL_MESSAGES" -eq 0 ]; then
  echo -e "${YELLOW}No messages found to migrate.${NC}"
  exit 0
fi

echo -e "  Found:        ${GREEN}$TOTAL_MESSAGES messages${NC}"
echo ""

# Create backup unless disabled
if [ "$DRY_RUN" = false ] && [ "$NO_BACKUP" = false ]; then
  if [ -z "$BACKUP_DIR" ]; then
    BACKUP_DIR="$HOME/.aimaestro/messages-backup-$(date +%Y%m%d-%H%M%S)"
  fi

  echo -e "${BLUE}Creating backup at $BACKUP_DIR...${NC}"
  cp -r "$MESSAGES_DIR" "$BACKUP_DIR"
  echo -e "${GREEN}✓ Backup created${NC}"
  echo ""
fi

# Migration function
migrate_message() {
  local file="$1"
  local filename=$(basename "$file")

  # Check if already migrated (has envelope field)
  if jq -e '.envelope' "$file" > /dev/null 2>&1; then
    if [ "$FORCE" = false ]; then
      echo -e "  ${YELLOW}⏭  Already migrated: $filename${NC}"
      return 0
    fi
  fi

  # Read current message
  local msg=$(cat "$file")

  # Extract fields from current format
  local id=$(echo "$msg" | jq -r '.id // empty')
  local from_id=$(echo "$msg" | jq -r '.from // empty')
  local from_alias=$(echo "$msg" | jq -r '.fromAlias // .from // "unknown"')
  local from_host=$(echo "$msg" | jq -r '.fromHost // "local"')
  local to_id=$(echo "$msg" | jq -r '.to // empty')
  local to_alias=$(echo "$msg" | jq -r '.toAlias // .to // "unknown"')
  local to_host=$(echo "$msg" | jq -r '.toHost // "local"')
  local timestamp=$(echo "$msg" | jq -r '.timestamp // empty')
  local subject=$(echo "$msg" | jq -r '.subject // "(no subject)"')
  local priority=$(echo "$msg" | jq -r '.priority // "normal"')
  local status=$(echo "$msg" | jq -r '.status // "unread"')
  local content_type=$(echo "$msg" | jq -r '.content.type // "notification"')
  local content_message=$(echo "$msg" | jq -r '.content.message // ""')
  local content_context=$(echo "$msg" | jq '.content.context // null')
  local in_reply_to=$(echo "$msg" | jq -r '.inReplyTo // .content.inReplyTo // null')

  # Build AMP addresses
  local from_address="${from_alias}@${TENANT}.${PROVIDER}"
  local to_address="${to_alias}@${TENANT}.${PROVIDER}"

  # Detect if it's a reply (subject starts with "Re:")
  local thread_id="$id"
  if [[ "$subject" == Re:* ]] && [ "$in_reply_to" != "null" ] && [ -n "$in_reply_to" ]; then
    thread_id="$in_reply_to"
  fi

  # Build new AMP-compatible message
  local new_msg=$(jq -n \
    --arg version "amp/0.1" \
    --arg id "$id" \
    --arg from "$from_address" \
    --arg to "$to_address" \
    --arg subject "$subject" \
    --arg priority "$priority" \
    --arg timestamp "$timestamp" \
    --arg thread_id "$thread_id" \
    --arg in_reply_to "$in_reply_to" \
    --arg content_type "$content_type" \
    --arg content_message "$content_message" \
    --argjson content_context "$content_context" \
    --arg status "$status" \
    --arg from_id "$from_id" \
    --arg to_id "$to_id" \
    --arg from_host "$from_host" \
    --arg to_host "$to_host" \
    '{
      envelope: {
        version: $version,
        id: $id,
        from: $from,
        to: $to,
        subject: $subject,
        priority: $priority,
        timestamp: $timestamp,
        thread_id: $thread_id,
        in_reply_to: (if $in_reply_to == "null" or $in_reply_to == "" then null else $in_reply_to end),
        expires_at: null,
        signature: null
      },
      payload: {
        type: $content_type,
        message: $content_message,
        context: $content_context
      },
      metadata: {
        status: $status,
        queued_at: $timestamp,
        delivery_attempts: 0,
        migrated_at: (now | todate),
        legacy: {
          from_id: $from_id,
          to_id: $to_id,
          from_host: $from_host,
          to_host: $to_host
        }
      }
    }')

  if [ "$DRY_RUN" = true ]; then
    echo -e "  ${BLUE}Would migrate: $filename${NC}"
    echo -e "    From: $from_alias → $from_address"
    echo -e "    To:   $to_alias → $to_address"
  else
    # Write migrated message
    echo "$new_msg" > "$file"
    echo -e "  ${GREEN}✓ Migrated: $filename${NC}"
  fi

  return 1  # Return 1 to indicate a migration was performed
}

# Process all messages
MIGRATED=0
SKIPPED=0

echo -e "${BLUE}Processing messages...${NC}"
echo ""

while IFS= read -r file; do
  if migrate_message "$file"; then
    ((SKIPPED++))
  else
    ((MIGRATED++))
  fi
done < <(find "$MESSAGES_DIR" -name "*.json" -type f 2>/dev/null)

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Migration complete!${NC}"
echo ""
echo -e "  Total messages: $TOTAL_MESSAGES"
echo -e "  Migrated:       ${GREEN}$MIGRATED${NC}"
echo -e "  Skipped:        ${YELLOW}$SKIPPED${NC} (already AMP format)"

if [ "$DRY_RUN" = true ]; then
  echo ""
  echo -e "${YELLOW}This was a dry run. No changes were made.${NC}"
  echo "Run without --dry-run to perform the actual migration."
fi

if [ "$NO_BACKUP" = false ] && [ "$DRY_RUN" = false ] && [ -n "$BACKUP_DIR" ]; then
  echo ""
  echo -e "  Backup at:      ${BLUE}$BACKUP_DIR${NC}"
fi

echo ""

# Save tenant config for future use
if [ "$DRY_RUN" = false ]; then
  CONFIG_FILE="$HOME/.aimaestro/amp-config.json"
  if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${BLUE}Creating AMP configuration...${NC}"
    cat > "$CONFIG_FILE" << EOF
{
  "tenant": "$TENANT",
  "provider": "$PROVIDER",
  "local_address_suffix": "@$TENANT.$PROVIDER",
  "migrated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "version": "0.1.0"
}
EOF
    echo -e "${GREEN}✓ Created $CONFIG_FILE${NC}"
  fi
fi
