#!/bin/bash
# =============================================================================
# AMP Kanban Create Task - Create a task on the team's kanban board
# =============================================================================
#
# Create a new task on the team kanban board via AI Maestro API.
# Resolves team ID from the agent's registration unless --team is provided.
#
# Usage:
#   amp-kanban-create-task.sh <title> [options]
#
# Examples:
#   amp-kanban-create-task.sh "Fix login bug"
#   amp-kanban-create-task.sh "Deploy v2" --assignee <agent-id> --labels "deploy,urgent"
#   amp-kanban-create-task.sh "Review PR #42" --team <team-id> --status review
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
TITLE=""
DESCRIPTION=""
ASSIGNEE=""
LABELS=""
TEAM_ID=""
STATUS=""
PRIORITY=""
TASK_TYPE=""

show_help() {
    echo "Usage: amp-kanban-create-task.sh <title> [options]"
    echo ""
    echo "Create a new task on the team kanban board."
    echo ""
    echo "Arguments:"
    echo "  title                      Task title (subject)"
    echo ""
    echo "Options:"
    echo "  --description, -d TEXT     Task description"
    echo "  --assignee, -a AGENT_ID   Agent UUID to assign the task to"
    echo "  --labels, -l \"a,b,c\"      Comma-separated labels"
    echo "  --status, -s STATUS        Initial status (backlog|pending|in_progress|review|completed)"
    echo "  --priority, -p NUMBER      Priority (numeric, higher = more urgent)"
    echo "  --task-type TYPE           Task type (e.g. bug, feature, chore)"
    echo "  --team TEAM_ID             Team UUID (auto-detected from agent if omitted)"
    echo "  --id UUID                  Operate as this agent (UUID from config.json)"
    echo "  --help, -h                 Show this help"
    echo ""
    echo "Examples:"
    echo "  amp-kanban-create-task.sh \"Fix login bug\""
    echo "  amp-kanban-create-task.sh \"Deploy v2\" --assignee abc-123 --labels \"deploy,urgent\""
    echo "  amp-kanban-create-task.sh \"Review PR\" --team team-uuid --status review"
}

# Parse arguments
POSITIONAL=()
while [[ $# -gt 0 ]]; do
    case $1 in
        --description|-d)
            DESCRIPTION="$2"
            shift 2
            ;;
        --assignee|-a)
            ASSIGNEE="$2"
            shift 2
            ;;
        --labels|-l)
            LABELS="$2"
            shift 2
            ;;
        --status|-s)
            STATUS="$2"
            shift 2
            ;;
        --priority|-p)
            PRIORITY="$2"
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
            echo "Run 'amp-kanban-create-task.sh --help' for usage." >&2
            exit 1
            ;;
        *)
            POSITIONAL+=("$1")
            shift
            ;;
    esac
done

# Title is the first positional argument
if [ ${#POSITIONAL[@]} -lt 1 ]; then
    echo "Error: Missing required argument: title" >&2
    echo "" >&2
    show_help
    exit 1
fi
TITLE="${POSITIONAL[0]}"

API="${AIMAESTRO_API:-http://localhost:23000}"

# =============================================================================
# Resolve team ID from agent's registration if not provided
# =============================================================================
if [ -z "$TEAM_ID" ]; then
    # Try to get agent UUID from AMP config
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
# Build JSON request body using jq for proper escaping
# =============================================================================
BODY=$(jq -n --arg subject "$TITLE" '{subject: $subject}')

if [ -n "$DESCRIPTION" ]; then
    BODY=$(echo "$BODY" | jq --arg desc "$DESCRIPTION" '. + {description: $desc}')
fi

if [ -n "$ASSIGNEE" ]; then
    BODY=$(echo "$BODY" | jq --arg a "$ASSIGNEE" '. + {assigneeAgentId: $a}')
fi

if [ -n "$LABELS" ]; then
    # Convert comma-separated string to JSON array
    LABELS_JSON=$(echo "$LABELS" | jq -R 'split(",") | map(gsub("^\\s+|\\s+$"; ""))')
    BODY=$(echo "$BODY" | jq --argjson labels "$LABELS_JSON" '. + {labels: $labels}')
fi

if [ -n "$STATUS" ]; then
    BODY=$(echo "$BODY" | jq --arg s "$STATUS" '. + {status: $s}')
fi

if [ -n "$PRIORITY" ]; then
    BODY=$(echo "$BODY" | jq --argjson p "$PRIORITY" '. + {priority: $p}')
fi

if [ -n "$TASK_TYPE" ]; then
    BODY=$(echo "$BODY" | jq --arg t "$TASK_TYPE" '. + {taskType: $t}')
fi

# =============================================================================
# Create the task
# =============================================================================
RESPONSE=$(curl -s -w "\n%{http_code}" --connect-timeout 5 --max-time 15 \
    -X POST "$API/api/teams/$TEAM_ID/tasks" \
    -H "Content-Type: application/json" \
    -d "$BODY")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
RESP_BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    TASK_ID=$(echo "$RESP_BODY" | jq -r '.task.id // .id // "unknown"')
    TASK_STATUS=$(echo "$RESP_BODY" | jq -r '.task.status // .status // "backlog"')

    echo "✅ Task created"
    echo ""
    echo "  Team:     ${TEAM_ID}"
    echo "  Task ID:  ${TASK_ID}"
    echo "  Subject:  ${TITLE}"
    echo "  Status:   ${TASK_STATUS}"
    [ -n "$ASSIGNEE" ] && echo "  Assignee: ${ASSIGNEE}"
    [ -n "$LABELS" ] && echo "  Labels:   ${LABELS}"

    # Send assignment notification if assignee specified
    if [ -n "$ASSIGNEE" ]; then
        "$SCRIPT_DIR/amp-send.sh" "$ASSIGNEE" "Task Assignment" "New task: ${TITLE} (${TASK_ID})" --priority high 2>/dev/null || true
    fi
else
    echo "❌ Failed to create task (HTTP ${HTTP_CODE})" >&2
    ERROR_MSG=$(echo "$RESP_BODY" | jq -r '.error // "Unknown error"' 2>/dev/null)
    if [ -n "$ERROR_MSG" ] && [ "$ERROR_MSG" != "null" ]; then
        echo "   Error: ${ERROR_MSG}" >&2
    fi
    exit 1
fi
