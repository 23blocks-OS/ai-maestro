#!/bin/bash
#
# import-agent.sh - Import an agent from a portable ZIP file
#
# Usage: import-agent.sh <zip-file> [options]
#
# Options:
#   --alias <name>     Override the agent alias
#   --new-id           Generate a new agent ID
#   --skip-messages    Don't import messages
#   --overwrite        Overwrite existing agent with same alias
#
# Examples:
#   import-agent.sh backend-api-export.zip
#   import-agent.sh backend-api-export.zip --alias backend-api-v2
#   import-agent.sh backend-api-export.zip --new-id --overwrite
#

set -e

# Configuration
AIMAESTRO_API="${AIMAESTRO_API:-http://localhost:23000}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Show usage
show_usage() {
    echo "Usage: import-agent.sh <zip-file> [options]"
    echo ""
    echo "Import an AI Maestro agent from a portable ZIP file."
    echo ""
    echo "Arguments:"
    echo "  zip-file           Path to the agent export ZIP file"
    echo ""
    echo "Options:"
    echo "  --alias <name>     Override the agent alias"
    echo "  --new-id           Generate a new agent ID instead of keeping original"
    echo "  --skip-messages    Don't import messages"
    echo "  --overwrite        Overwrite existing agent with same alias"
    echo ""
    echo "Examples:"
    echo "  import-agent.sh backend-api-export.zip"
    echo "  import-agent.sh backend-api-export.zip --alias backend-api-v2"
    echo "  import-agent.sh backend-api-export.zip --new-id --overwrite"
    echo ""
    echo "Environment Variables:"
    echo "  AIMAESTRO_API  API endpoint (default: http://localhost:23000)"
}

# Parse arguments
ZIP_FILE=""
NEW_ALIAS=""
NEW_ID="false"
SKIP_MESSAGES="false"
OVERWRITE="false"

while [[ $# -gt 0 ]]; do
    case $1 in
        --alias)
            NEW_ALIAS="$2"
            shift 2
            ;;
        --new-id)
            NEW_ID="true"
            shift
            ;;
        --skip-messages)
            SKIP_MESSAGES="true"
            shift
            ;;
        --overwrite)
            OVERWRITE="true"
            shift
            ;;
        --help|-h)
            show_usage
            exit 0
            ;;
        -*)
            echo -e "${RED}Error: Unknown option $1${NC}"
            echo ""
            show_usage
            exit 1
            ;;
        *)
            if [ -z "$ZIP_FILE" ]; then
                ZIP_FILE="$1"
            else
                echo -e "${RED}Error: Unexpected argument $1${NC}"
                echo ""
                show_usage
                exit 1
            fi
            shift
            ;;
    esac
done

# Check arguments
if [ -z "$ZIP_FILE" ]; then
    echo -e "${RED}Error: ZIP file is required${NC}"
    echo ""
    show_usage
    exit 1
fi

# Expand ~ in path
ZIP_FILE="${ZIP_FILE/#\~/$HOME}"

# Check file exists
if [ ! -f "$ZIP_FILE" ]; then
    echo -e "${RED}Error: File not found: $ZIP_FILE${NC}"
    exit 1
fi

# Check it's a ZIP file
if ! file "$ZIP_FILE" | grep -q "Zip archive"; then
    echo -e "${RED}Error: Not a valid ZIP file: $ZIP_FILE${NC}"
    exit 1
fi

echo -e "${BLUE}Importing agent from: ${YELLOW}$ZIP_FILE${NC}"

# Show manifest preview
echo ""
echo -e "${BLUE}Package Contents:${NC}"
if command -v unzip &> /dev/null; then
    MANIFEST=$(unzip -p "$ZIP_FILE" manifest.json 2>/dev/null || echo "{}")
    if [ ! -z "$MANIFEST" ] && [ "$MANIFEST" != "{}" ]; then
        echo "$MANIFEST" | python3 -c "
import sys, json
try:
    m = json.load(sys.stdin)
    print(f\"  Agent: {m.get('agent', {}).get('alias', 'Unknown')} ({m.get('agent', {}).get('id', 'Unknown')[:8]}...)\")
    print(f\"  Display Name: {m.get('agent', {}).get('displayName', 'N/A')}\")
    print(f\"  Exported: {m.get('exportedAt', 'Unknown')}\")
    print(f\"  From: {m.get('exportedFrom', {}).get('hostname', 'Unknown')} ({m.get('exportedFrom', {}).get('platform', 'Unknown')})\")
    c = m.get('contents', {})
    print(f\"  Database: {'Yes' if c.get('hasDatabase') else 'No'}\")
    if c.get('hasMessages'):
        stats = c.get('messageStats', {})
        total = stats.get('inbox', 0) + stats.get('sent', 0) + stats.get('archived', 0)
        print(f\"  Messages: {total} total ({stats.get('inbox', 0)} inbox, {stats.get('sent', 0)} sent, {stats.get('archived', 0)} archived)\")
    else:
        print(f\"  Messages: None\")
except Exception as e:
    print(f\"  (Could not parse manifest: {e})\")
" 2>/dev/null || echo "  (Could not parse manifest)"
    fi
fi

# Build options JSON
OPTIONS_JSON="{\"newId\":$NEW_ID,\"skipMessages\":$SKIP_MESSAGES,\"overwrite\":$OVERWRITE"
if [ ! -z "$NEW_ALIAS" ]; then
    OPTIONS_JSON="$OPTIONS_JSON,\"newAlias\":\"$NEW_ALIAS\""
fi
OPTIONS_JSON="$OPTIONS_JSON}"

echo ""
echo -e "${BLUE}Import Options:${NC}"
[ "$NEW_ALIAS" != "" ] && echo -e "  New Alias: ${YELLOW}$NEW_ALIAS${NC}"
[ "$NEW_ID" = "true" ] && echo -e "  Generate New ID: ${YELLOW}Yes${NC}"
[ "$SKIP_MESSAGES" = "true" ] && echo -e "  Skip Messages: ${YELLOW}Yes${NC}"
[ "$OVERWRITE" = "true" ] && echo -e "  Overwrite Existing: ${YELLOW}Yes${NC}"

echo ""
echo -e "${BLUE}Uploading to AI Maestro...${NC}"

# Make API request with multipart form data
RESPONSE=$(curl -s \
    -X POST \
    -F "file=@$ZIP_FILE" \
    -F "options=$OPTIONS_JSON" \
    "${AIMAESTRO_API}/api/agents/import")

# Parse response
SUCCESS=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))" 2>/dev/null || echo "false")

if [ "$SUCCESS" = "True" ] || [ "$SUCCESS" = "true" ]; then
    echo ""
    echo -e "${GREEN}Import successful!${NC}"

    # Show imported agent details
    echo "$RESPONSE" | python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    agent = r.get('agent', {})
    stats = r.get('stats', {})
    warnings = r.get('warnings', [])

    print(f\"\nImported Agent:\")
    print(f\"  ID: {agent.get('id', 'Unknown')}\")
    print(f\"  Alias: {agent.get('alias', 'Unknown')}\")
    print(f\"  Display Name: {agent.get('displayName', 'N/A')}\")
    print(f\"  Program: {agent.get('program', 'Unknown')}\")

    print(f\"\nImport Stats:\")
    print(f\"  Registry: {'Yes' if stats.get('registryImported') else 'No'}\")
    print(f\"  Database: {'Yes' if stats.get('databaseImported') else 'No'}\")
    msgs = stats.get('messagesImported', {})
    total_msgs = msgs.get('inbox', 0) + msgs.get('sent', 0) + msgs.get('archived', 0)
    if total_msgs > 0:
        print(f\"  Messages: {total_msgs} ({msgs.get('inbox', 0)} inbox, {msgs.get('sent', 0)} sent, {msgs.get('archived', 0)} archived)\")

    if warnings:
        print(f\"\nWarnings:\")
        for w in warnings:
            print(f\"  - {w}\")
except Exception as e:
    print(f\"(Could not parse response: {e})\")
" 2>/dev/null || true

    echo ""
    echo -e "${GREEN}The agent is now available in AI Maestro.${NC}"
    echo -e "You can create a session for it or link it to an existing tmux session."

else
    echo ""
    echo -e "${RED}Import failed!${NC}"

    # Show error details
    echo "$RESPONSE" | python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    errors = r.get('errors', [])
    if errors:
        print('Errors:')
        for e in errors:
            print(f'  - {e}')
    else:
        error = r.get('error', 'Unknown error')
        print(f'Error: {error}')

        # Check for existing agent conflict
        existing_id = r.get('existingAgentId')
        if existing_id:
            print(f'\nExisting agent ID: {existing_id}')
            print('Use --overwrite to replace, or --alias to use a different name.')
except Exception as e:
    print(f'Error: {e}')
" 2>/dev/null || echo "Error: Could not parse server response"

    exit 1
fi
