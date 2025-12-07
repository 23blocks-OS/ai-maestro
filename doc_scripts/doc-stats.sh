#!/bin/bash
# AI Maestro - Show documentation statistics
# Usage: doc-stats.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/doc-helper.sh"

# Initialize (gets SESSION and AGENT_ID)
init_doc || exit 1

echo "Documentation Statistics"
echo "---"

# Make the query
RESPONSE=$(doc_query "$AGENT_ID" "stats") || exit 1

# Display results
RESULT=$(echo "$RESPONSE" | jq '.result')

DOCS=$(echo "$RESULT" | jq -r '.documents // 0')
SECTIONS=$(echo "$RESULT" | jq -r '.sections // 0')
CHUNKS=$(echo "$RESULT" | jq -r '.chunks // 0')
EMBEDDINGS=$(echo "$RESULT" | jq -r '.embeddings // 0')

echo "Documents:  $DOCS"
echo "Sections:   $SECTIONS"
echo "Chunks:     $CHUNKS"
echo "Embeddings: $EMBEDDINGS"

BY_TYPE=$(echo "$RESULT" | jq -r '.byType // {}')
if [ "$BY_TYPE" != "{}" ]; then
    echo ""
    echo "By Type:"
    echo "$BY_TYPE" | jq -r 'to_entries | .[] | "  \(.key): \(.value)"'
fi

if [ "$DOCS" = "0" ]; then
    echo ""
    echo "No documents indexed. Run doc-index.sh to index documentation."
fi
