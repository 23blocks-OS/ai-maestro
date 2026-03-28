#!/bin/bash
# =============================================================================
# AMP Kanban List - List kanban items with optional filters
# =============================================================================
#
# List tasks on the team kanban board via AI Maestro API.
# Resolves team ID from the agent's registration unless --team is provided.
#
# Usage:
#   amp-kanban-list.sh [options]
#
# Examples:
#   amp-kanban-list.sh
#   amp-kanban-list.sh --status in_progress
#   amp-kanban-list.sh --assignee <agent-id> --status review
#   amp-kanban-list.sh --label bug --team <team-id>
#
# =============================================================================

set -e

# Pre-source: extract --id to set agent identity before helper resolves it
_amp_prev=""
for _amp_arg in "$@"; do
    if [ "$_amp_prev" = "--id" ]; then
        export CLAUDE_AGENT_ID="$_amp_arg"
        break
    fi
    _amp_prev="$_amp_arg"
done
unset _amp_prev _amp_arg

# Source helper functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/amp-helper.sh"

# =============================================================================
# Arguments
# =============================================================================
STATUS=""
ASSIGNEE=""
LABEL=""
TASK_TYPE=""
TEAM_ID=""

show_help() {
    echo "Usage: amp-kanban-list.sh [options]"
    echo ""
    echo "List kanban items with optional filters."
    echo ""
    echo "Options:"
    echo "  --status, -s STATUS        Filter by status (backlog|pending|in_progress|review|completed)"
    echo "  --assignee, -a AGENT_ID    Filter by assignee agent UUID"
    echo "  --label, -l LABEL          Filter by label"
    echo "  --task-type TYPE           Filter by task type (bug|feature|chore)"
    echo "  --team TEAM_ID             Team UUID (auto-detected from agent if omitted)"
    echo "  --id UUID                  Operate as this agent (UUID from config.json)"
    echo "  --help, -h                 Show this help"
    echo ""
    echo "Examples:"
    echo "  amp-kanban-list.sh"
    echo "  amp-kanban-list.sh --status in_progress"
    echo "  amp-kanban-list.sh --assignee agent-uuid --status review"
    echo "  amp-kanban-list.sh --label bug --team team-uuid"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --status|-s)
            STATUS="$2"
            shift 2
            ;;
        --assignee|-a)
            ASSIGNEE="$2"
            shift 2
            ;;
        --label|-l)
            LABEL="$2"
            shift 2
            ;;
        --task-type)
            TASK_TYPE="$2"
            shift 2
            ;;
        --team)
            TEAM_ID="$2"
            shift 2
            ;;
        --id)
            shift 2  # Already handled in pre-source parsing
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        -*)
            echo "Unknown option: $1" >&2
            echo "Run 'amp-kanban-list.sh --help' for usage." >&2
            exit 1
            ;;
        *)
            echo "Unexpected argument: $1" >&2
            echo "Run 'amp-kanban-list.sh --help' for usage." >&2
            exit 1
            ;;
    esac
done

API="${AIMAESTRO_API:-http://localhost:23000}"

# =============================================================================
# Resolve team ID from agent's registration if not provided
# =============================================================================
if [ -z "$TEAM_ID" ]; then
    AGENT_UUID="${CLAUDE_AGENT_ID:-}"
    if [ -z "$AGENT_UUID" ] && [ -f "${AMP_CONFIG:-}" ]; then
        AGENT_UUID=$(jq -r '.agent.id // .id // empty' "$AMP_CONFIG" 2>/dev/null)
    fi

    if [ -n "$AGENT_UUID" ]; then
        TEAM_ID=$(curl -sf "$API/api/agents/$AGENT_UUID" 2>/dev/null | jq -r '.agent.teamId // empty' 2>/dev/null) || true
    fi

    if [ -z "$TEAM_ID" ]; then
        echo "Error: Could not determine team ID. Use --team <team-id> to specify." >&2
        exit 1
    fi
fi

# =============================================================================
# Build query string from filters
# =============================================================================
QUERY=""
if [ -n "$STATUS" ]; then
    QUERY="status=$(printf '%s' "$STATUS" | jq -sRr @uri)"
fi
if [ -n "$ASSIGNEE" ]; then
    [ -n "$QUERY" ] && QUERY="${QUERY}&"
    QUERY="${QUERY}assignee=$(printf '%s' "$ASSIGNEE" | jq -sRr @uri)"
fi
if [ -n "$LABEL" ]; then
    [ -n "$QUERY" ] && QUERY="${QUERY}&"
    QUERY="${QUERY}label=$(printf '%s' "$LABEL" | jq -sRr @uri)"
fi
if [ -n "$TASK_TYPE" ]; then
    [ -n "$QUERY" ] && QUERY="${QUERY}&"
    QUERY="${QUERY}taskType=$(printf '%s' "$TASK_TYPE" | jq -sRr @uri)"
fi

URL="$API/api/teams/$TEAM_ID/tasks"
[ -n "$QUERY" ] && URL="${URL}?${QUERY}"

# =============================================================================
# Fetch and display tasks
# =============================================================================
RESPONSE=$(curl -s -w "\n%{http_code}" --connect-timeout 5 --max-time 15 "$URL")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
RESP_BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    # Output formatted JSON
    echo "$RESP_BODY" | jq '.'
else
    echo "❌ Failed to list tasks (HTTP ${HTTP_CODE})" >&2
    ERROR_MSG=$(echo "$RESP_BODY" | jq -r '.error // "Unknown error"' 2>/dev/null)
    if [ -n "$ERROR_MSG" ] && [ "$ERROR_MSG" != "null" ]; then
        echo "   Error: ${ERROR_MSG}" >&2
    fi
    exit 1
fi
