#!/bin/bash
# AI Maestro - Index project documentation
# Usage: doc-index.sh [--clear]
# Example: doc-index.sh
#          doc-index.sh --clear

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/doc-helper.sh"

CLEAR=""
while [ $# -gt 0 ]; do
    case "$1" in
        --clear)
            CLEAR="true"
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# Initialize (gets SESSION and AGENT_ID)
init_doc || exit 1

echo "Indexing project documentation..."
echo "---"

# Build request body
BODY="{}"
if [ -n "$CLEAR" ]; then
    BODY='{"clear": true}'
    echo "(Clearing existing index first)"
fi

# Make the indexing request
RESPONSE=$(curl -s --max-time 300 -X POST \
    "${API_BASE}/api/agents/${AGENT_ID}/graph/docs" \
    -H "Content-Type: application/json" \
    -d "$BODY" 2>/dev/null)

if [ -z "$RESPONSE" ]; then
    echo "Error: Indexing request failed" >&2
    exit 1
fi

SUCCESS=$(echo "$RESPONSE" | jq -r '.success' 2>/dev/null)

if [ "$SUCCESS" != "true" ]; then
    ERROR=$(echo "$RESPONSE" | jq -r '.error // "Unknown error"' 2>/dev/null)
    echo "Error: $ERROR" >&2
    exit 1
fi

# Display results
RESULT=$(echo "$RESPONSE" | jq '.result // {}')

DOCS=$(echo "$RESULT" | jq -r '.documents // 0')
CHUNKS=$(echo "$RESULT" | jq -r '.chunks // 0')
EMBEDDINGS=$(echo "$RESULT" | jq -r '.embeddings // 0')

echo "Indexed successfully!"
echo "  Documents:  $DOCS"
echo "  Chunks:     $CHUNKS"
echo "  Embeddings: $EMBEDDINGS"
