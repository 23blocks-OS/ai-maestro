#!/usr/bin/env bash
# =============================================================================
# AMP Kanban Move - Move a kanban card to a different status column
# =============================================================================
#
# Update a task's status on the team kanban board via AI Maestro API.
# Resolves team ID from the agent's registration unless --team is provided.
#
# Usage:
#   amp-kanban-move.sh <task-id> <status> [options]
#
# Status values:
#   backlog, pending, in_progress, review, completed
#
# Examples:
#   amp-kanban-move.sh abc-123 in_progress
#   amp-kanban-move.sh abc-123 review --team <team-id>
#   amp-kanban-move.sh abc-123 completed
#
# =============================================================================

set -eo pipefail

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
TASK_ID=""
STATUS=""
TEAM_ID=""

show_help() {
    echo "Usage: amp-kanban-move.sh <task-id> <status> [options]"
    echo ""
    echo "Move a kanban card to a different status column."
    echo ""
    echo "Arguments:"
    echo "  task-id    Task UUID or external reference"
    echo "  status     Target status column"
    echo ""
    echo "Status values:"
    echo "  backlog, pending, in_progress, review, completed"
    echo ""
    echo "Options:"
    echo "  --team TEAM_ID    Team UUID (auto-detected from agent if omitted)"
    echo "  --id UUID         Operate as this agent (UUID from config.json)"
    echo "  --help, -h        Show this help"
    echo ""
    echo "Examples:"
    echo "  amp-kanban-move.sh abc-123 in_progress"
    echo "  amp-kanban-move.sh abc-123 review --team team-uuid"
    echo "  amp-kanban-move.sh abc-123 completed"
}

# Parse arguments
POSITIONAL=()
while [[ $# -gt 0 ]]; do
    case $1 in
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
            echo "Run 'amp-kanban-move.sh --help' for usage." >&2
            exit 1
            ;;
        *)
            POSITIONAL+=("$1")
            shift
            ;;
    esac
done

# Require both task-id and status
if [ ${#POSITIONAL[@]} -lt 2 ]; then
    echo "Error: Missing required arguments." >&2
    echo "" >&2
    show_help
    exit 1
fi

TASK_ID="${POSITIONAL[0]}"
STATUS="${POSITIONAL[1]}"

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
# Move the task (update status via PUT)
# =============================================================================
BODY=$(jq -n --arg status "$STATUS" '{status: $status}')

RESPONSE=$(curl -s -w "\n%{http_code}" --connect-timeout 5 --max-time 15 \
    -X PUT "$API/api/teams/$TEAM_ID/tasks/$TASK_ID" \
    -H "Content-Type: application/json" \
    -d "$BODY")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
RESP_BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    UPDATED_STATUS=$(echo "$RESP_BODY" | jq -r '.task.status // .status // "unknown"')
    SUBJECT=$(echo "$RESP_BODY" | jq -r '.task.subject // .subject // "unknown"')

    echo "✅ Task moved to ${UPDATED_STATUS}"
    echo ""
    echo "  Team:    ${TEAM_ID}"
    echo "  Task:    ${TASK_ID}"
    echo "  Subject: ${SUBJECT}"
    echo "  Status:  ${UPDATED_STATUS}"
else
    echo "❌ Failed to move task (HTTP ${HTTP_CODE})" >&2
    ERROR_MSG=$(echo "$RESP_BODY" | jq -r '.error // "Unknown error"' 2>/dev/null)
    if [ -n "$ERROR_MSG" ] && [ "$ERROR_MSG" != "null" ]; then
        echo "   Error: ${ERROR_MSG}" >&2
    fi
    exit 1
fi
