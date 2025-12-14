#!/bin/bash
# AI Maestro - Get documentation index statistics
# Usage: docs-stats.sh

set -e

# Source docs helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/docs-helper.sh"

# Initialize (gets SESSION, AGENT_ID, HOST_ID)
init_docs || exit 1

RESPONSE=$(docs_stats "$AGENT_ID")

if echo "$RESPONSE" | jq -e '.success == false' > /dev/null 2>&1; then
  ERROR=$(echo "$RESPONSE" | jq -r '.error')
  echo "Error: $ERROR" >&2
  exit 1
fi

echo "Documentation Index Statistics"
echo "=============================="
echo ""

echo "$RESPONSE" | jq -r '.result | to_entries[] | "\(.key): \(.value)"'
