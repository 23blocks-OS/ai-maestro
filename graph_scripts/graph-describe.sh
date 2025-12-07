#!/bin/bash
# AI Maestro - Describe a component or function
# Usage: graph-describe.sh <component-name>
# Example: graph-describe.sh User
#          graph-describe.sh PaymentService
#          graph-describe.sh process_payment

set -e

# Get script directory and source helper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/graph-helper.sh"

if [ -z "$1" ]; then
    echo "Usage: graph-describe.sh <component-name>"
    echo ""
    echo "Describe a component (class, model, service) or function and its relationships."
    echo ""
    echo "Examples:"
    echo "  graph-describe.sh User              # Describe User model"
    echo "  graph-describe.sh PaymentService    # Describe PaymentService"
    echo "  graph-describe.sh authenticate      # Describe authenticate function"
    exit 1
fi

NAME="$1"

# Initialize (gets SESSION and AGENT_ID)
init_graph || exit 1

echo "Describing: $NAME"
echo "---"

# Make the query
RESPONSE=$(graph_query "$AGENT_ID" "describe" "&name=${NAME}") || exit 1

# Format output
RESULT=$(echo "$RESPONSE" | jq '.result')
FOUND=$(echo "$RESULT" | jq -r '.found')

if [ "$FOUND" = "false" ]; then
    echo "Component '$NAME' not found in graph database."
    echo ""
    echo "Tips:"
    echo "  - Check the exact name (case-sensitive)"
    echo "  - Ensure the codebase has been indexed"
    echo "  - Try graph-find-by-type.sh to list available components"
    exit 0
fi

# Display nicely formatted result
TYPE=$(echo "$RESULT" | jq -r '.type // "unknown"')
FILE=$(echo "$RESULT" | jq -r '.file // "unknown"')
CLASS_TYPE=$(echo "$RESULT" | jq -r '.class_type // empty')

echo "Type: $TYPE"
[ -n "$CLASS_TYPE" ] && echo "Class Type: $CLASS_TYPE"
echo "File: $FILE"

# For functions, show callers/callees
if [ "$TYPE" = "function" ]; then
    IS_EXPORT=$(echo "$RESULT" | jq -r '.is_export // false')
    echo "Exported: $IS_EXPORT"
    echo ""

    CALLERS=$(echo "$RESULT" | jq -r '.callers // [] | .[]' 2>/dev/null)
    if [ -n "$CALLERS" ]; then
        echo "Called by:"
        echo "$CALLERS" | while read -r caller; do
            echo "  - $caller"
        done
    fi

    CALLEES=$(echo "$RESULT" | jq -r '.callees // [] | .[]' 2>/dev/null)
    if [ -n "$CALLEES" ]; then
        echo ""
        echo "Calls:"
        echo "$CALLEES" | while read -r callee; do
            echo "  - $callee"
        done
    fi
fi

# For components, show relationships
if [ "$TYPE" = "component" ]; then
    RELS=$(echo "$RESULT" | jq '.relationships // {}')

    EXTENDS=$(echo "$RELS" | jq -r '.extends_from // [] | .[]' 2>/dev/null)
    [ -n "$EXTENDS" ] && echo "" && echo "Extends:" && echo "$EXTENDS" | while read -r e; do echo "  - $e"; done

    EXTENDED_BY=$(echo "$RELS" | jq -r '.extended_by // [] | .[]' 2>/dev/null)
    [ -n "$EXTENDED_BY" ] && echo "" && echo "Extended by:" && echo "$EXTENDED_BY" | while read -r e; do echo "  - $e"; done

    INCLUDES=$(echo "$RELS" | jq -r '.includes // [] | .[]' 2>/dev/null)
    [ -n "$INCLUDES" ] && echo "" && echo "Includes:" && echo "$INCLUDES" | while read -r i; do echo "  - $i"; done

    SERIALIZERS=$(echo "$RELS" | jq -r '.serialized_by // [] | .[]' 2>/dev/null)
    [ -n "$SERIALIZERS" ] && echo "" && echo "Serialized by:" && echo "$SERIALIZERS" | while read -r s; do echo "  - $s"; done

    # Associations
    ASSOCS=$(echo "$RELS" | jq -r '.associations // []')
    ASSOC_COUNT=$(echo "$ASSOCS" | jq 'length')
    if [ "$ASSOC_COUNT" -gt 0 ]; then
        echo ""
        echo "Associations:"
        echo "$ASSOCS" | jq -r '.[] | "  - \(.type): \(.target)"'
    fi
fi
