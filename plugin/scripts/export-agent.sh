#!/bin/bash
#
# export-agent.sh - Export an agent to a portable ZIP file
#
# Usage: export-agent.sh <agent-alias-or-id> [output-dir]
#
# Examples:
#   export-agent.sh backend-api           # Export to current directory
#   export-agent.sh backend-api ~/exports # Export to ~/exports/
#   export-agent.sh 633f6cdc-4404-...     # Export by ID
#

set -e

# Configuration - detect API URL if not set
if [ -z "$AIMAESTRO_API" ]; then
    # Try identity API first
    AIMAESTRO_API=$(curl -s --max-time 5 "http://127.0.0.1:23000/api/hosts/identity" | jq -r '.host.url // empty' 2>/dev/null)
    if [ -z "$AIMAESTRO_API" ]; then
        # Fallback to hostname
        AIMAESTRO_API="http://$(hostname | tr '[:upper:]' '[:lower:]'):23000"
    fi
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Show usage
show_usage() {
    echo "Usage: export-agent.sh <agent-alias-or-id> [output-dir]"
    echo ""
    echo "Export an AI Maestro agent to a portable ZIP file."
    echo ""
    echo "Arguments:"
    echo "  agent-alias-or-id  The agent's alias (e.g., 'backend-api') or UUID"
    echo "  output-dir         Directory to save the ZIP file (default: current directory)"
    echo ""
    echo "Examples:"
    echo "  export-agent.sh backend-api"
    echo "  export-agent.sh backend-api ~/exports"
    echo "  export-agent.sh 633f6cdc-4404-431a-a95c-80f66a520401"
    echo ""
    echo "Environment Variables:"
    echo "  AIMAESTRO_API  API endpoint (auto-detected from running instance)"
}

# Check arguments
if [ -z "$1" ]; then
    echo -e "${RED}Error: Agent alias or ID is required${NC}"
    echo ""
    show_usage
    exit 1
fi

AGENT_ID="$1"
OUTPUT_DIR="${2:-.}"

# Expand ~ in output directory
OUTPUT_DIR="${OUTPUT_DIR/#\~/$HOME}"

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

echo -e "${BLUE}Exporting agent: ${YELLOW}$AGENT_ID${NC}"
echo -e "${BLUE}Output directory: ${YELLOW}$OUTPUT_DIR${NC}"
echo ""

# Make API request and save to temp file first to capture headers
TEMP_FILE=$(mktemp)
HEADERS_FILE=$(mktemp)

HTTP_CODE=$(curl -s -w "%{http_code}" \
    -D "$HEADERS_FILE" \
    -o "$TEMP_FILE" \
    "${AIMAESTRO_API}/api/agents/${AGENT_ID}/export")

# Check response
if [ "$HTTP_CODE" != "200" ]; then
    echo -e "${RED}Error: Failed to export agent (HTTP $HTTP_CODE)${NC}"

    # Try to parse error message from JSON
    if [ -f "$TEMP_FILE" ]; then
        ERROR_MSG=$(cat "$TEMP_FILE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('error', 'Unknown error'))" 2>/dev/null || echo "Unknown error")
        echo -e "${RED}$ERROR_MSG${NC}"
    fi

    rm -f "$TEMP_FILE" "$HEADERS_FILE"
    exit 1
fi

# Check content type
CONTENT_TYPE=$(grep -i "content-type:" "$HEADERS_FILE" | head -1 | tr -d '\r\n' || echo "")
if [[ ! "$CONTENT_TYPE" =~ "application/zip" ]]; then
    echo -e "${RED}Error: Unexpected response type${NC}"
    cat "$TEMP_FILE"
    rm -f "$TEMP_FILE" "$HEADERS_FILE"
    exit 1
fi

# Extract filename from Content-Disposition header or generate one
FILENAME=$(grep -i "content-disposition:" "$HEADERS_FILE" | sed 's/.*filename="\([^"]*\)".*/\1/' | tr -d '\r\n' || echo "")
if [ -z "$FILENAME" ]; then
    TIMESTAMP=$(date +%Y-%m-%dT%H-%M-%S)
    FILENAME="${AGENT_ID}-export-${TIMESTAMP}.zip"
fi

# Move temp file to final location
OUTPUT_PATH="$OUTPUT_DIR/$FILENAME"
mv "$TEMP_FILE" "$OUTPUT_PATH"
rm -f "$HEADERS_FILE"

# Get file size
FILE_SIZE=$(ls -lh "$OUTPUT_PATH" | awk '{print $5}')

# Show manifest info
echo -e "${GREEN}Export successful!${NC}"
echo ""
echo -e "File: ${YELLOW}$OUTPUT_PATH${NC}"
echo -e "Size: ${YELLOW}$FILE_SIZE${NC}"
echo ""

# Try to show manifest summary
if command -v unzip &> /dev/null; then
    MANIFEST=$(unzip -p "$OUTPUT_PATH" manifest.json 2>/dev/null || echo "{}")
    if [ ! -z "$MANIFEST" ] && [ "$MANIFEST" != "{}" ]; then
        echo -e "${BLUE}Export Contents:${NC}"
        echo "$MANIFEST" | python3 -c "
import sys, json
try:
    m = json.load(sys.stdin)
    print(f\"  Agent: {m.get('agent', {}).get('alias', 'Unknown')} ({m.get('agent', {}).get('id', 'Unknown')[:8]}...)\")
    print(f\"  Exported: {m.get('exportedAt', 'Unknown')}\")
    print(f\"  From: {m.get('exportedFrom', {}).get('hostname', 'Unknown')}\")
    c = m.get('contents', {})
    print(f\"  Database: {'Yes' if c.get('hasDatabase') else 'No'}\")
    if c.get('hasMessages'):
        stats = c.get('messageStats', {})
        print(f\"  Messages: {stats.get('inbox', 0)} inbox, {stats.get('sent', 0)} sent, {stats.get('archived', 0)} archived\")
except:
    pass
" 2>/dev/null || true
    fi
fi

echo ""
echo -e "${GREEN}To import this agent on another machine:${NC}"
echo -e "  import-agent.sh \"$OUTPUT_PATH\""
