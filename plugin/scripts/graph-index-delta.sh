#!/bin/bash
# AI Maestro - Delta index the code graph (only changed files)
# Usage: graph-index-delta.sh [project-path]
# Example: graph-index-delta.sh
#          graph-index-delta.sh /path/to/project

set -e

# Get script directory and source helper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/graph-helper.sh"

# Initialize (gets SESSION and AGENT_ID)
init_graph || exit 1

PROJECT_PATH="$1"

echo "Delta indexing code graph for session: $SESSION"
echo "Agent: $AGENT_ID"
[ -n "$PROJECT_PATH" ] && echo "Project: $PROJECT_PATH"
echo "---"

# Build request body
BODY='{"delta": true}'
if [ -n "$PROJECT_PATH" ]; then
    BODY=$(echo '{}' | jq --arg path "$PROJECT_PATH" '. + {delta: true, projectPath: $path}')
fi

# Make the POST request
RESPONSE=$(curl -s --max-time 120 -X POST \
    -H "Content-Type: application/json" \
    -d "$BODY" \
    "${API_BASE}/api/agents/${AGENT_ID}/graph/code" 2>/dev/null)

if [ -z "$RESPONSE" ]; then
    echo "Error: API request failed"
    exit 1
fi

# Check for success
SUCCESS=$(echo "$RESPONSE" | jq -r '.success' 2>/dev/null)

if [ "$SUCCESS" != "true" ]; then
    ERROR=$(echo "$RESPONSE" | jq -r '.error // "Unknown error"' 2>/dev/null)
    echo "Error: $ERROR"
    exit 1
fi

# Display results
MODE=$(echo "$RESPONSE" | jq -r '.mode // "unknown"')
echo "Mode: $MODE"
echo ""

# Show stats
STATS=$(echo "$RESPONSE" | jq '.stats')

if [ "$MODE" = "delta" ]; then
    FILES_NEW=$(echo "$STATS" | jq -r '.filesNew // 0')
    FILES_MODIFIED=$(echo "$STATS" | jq -r '.filesModified // 0')
    FILES_DELETED=$(echo "$STATS" | jq -r '.filesDeleted // 0')
    FILES_UNCHANGED=$(echo "$STATS" | jq -r '.filesUnchanged // 0')
    FILES_INDEXED=$(echo "$STATS" | jq -r '.filesIndexed // 0')
    DURATION=$(echo "$STATS" | jq -r '.durationMs // 0')

    echo "Changes detected:"
    echo "  New files:       $FILES_NEW"
    echo "  Modified files:  $FILES_MODIFIED"
    echo "  Deleted files:   $FILES_DELETED"
    echo "  Unchanged files: $FILES_UNCHANGED"
    echo ""
    echo "Indexed: $FILES_INDEXED files in ${DURATION}ms"

    if [ "$FILES_NEW" -eq 0 ] && [ "$FILES_MODIFIED" -eq 0 ] && [ "$FILES_DELETED" -eq 0 ]; then
        echo ""
        echo "No changes detected - graph is up to date."
    fi
else
    # Full index mode (first time)
    FILES_INDEXED=$(echo "$STATS" | jq -r '.filesIndexed // 0')
    FUNCTIONS_INDEXED=$(echo "$STATS" | jq -r '.functionsIndexed // 0')
    DURATION=$(echo "$STATS" | jq -r '.durationMs // 0')
    METADATA_COUNT=$(echo "$RESPONSE" | jq -r '.metadataFilesInitialized // 0')

    echo "Full index completed:"
    echo "  Files:     $FILES_INDEXED"
    echo "  Functions: $FUNCTIONS_INDEXED"
    echo "  Duration:  ${DURATION}ms"

    if [ "$METADATA_COUNT" -gt 0 ]; then
        echo ""
        echo "Initialized metadata for $METADATA_COUNT files."
        echo "Future delta calls will be incremental."
    fi
fi

echo ""
echo "Done."
