#!/bin/bash
# =============================================================================
# AMP Task Blocked - Report a blocking issue to the Orchestrator
# =============================================================================
#
# Send a high-priority blocking issue message to the team's orchestrator via AMP.
#
# Usage:
#   amp-task-blocked.sh <reason> [--id <agent-uuid>]
#
# Examples:
#   amp-task-blocked.sh "Cannot access staging DB, credentials expired"
#   amp-task-blocked.sh "Dependency conflict blocks build" --id abc-123-def
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

REASON=""
POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --id) shift 2 ;;  # Already handled in pre-source parsing
    --help|-h)
      echo "Usage: amp-task-blocked.sh <reason> [--id <agent-uuid>]"
      echo ""
      echo "Send a high-priority blocking issue to the team's orchestrator."
      echo ""
      echo "Arguments:"
      echo "  reason    Description of what is blocking progress"
      echo ""
      echo "Options:"
      echo "  --id UUID   Operate as this agent (UUID from config.json)"
      echo "  --help, -h  Show this help"
      exit 0
      ;;
    -*) shift ;;
    *) POSITIONAL+=("$1"); shift ;;
  esac
done

if [ ${#POSITIONAL[@]} -lt 1 ]; then
  echo "Usage: amp-task-blocked.sh <reason>" >&2
  exit 1
fi

REASON="${POSITIONAL[0]}"

API="${AIMAESTRO_API:-http://localhost:23000}"

# Resolve agent ID from AMP config
require_init
AGENT_ID=$(jq -r '.agent.id // empty' "$AMP_CONFIG" 2>/dev/null)
if [ -z "$AGENT_ID" ]; then
  AGENT_ID="${CLAUDE_AGENT_ID:-}"
fi

if [ -z "$AGENT_ID" ]; then
  echo "Error: Cannot determine agent ID" >&2
  exit 1
fi

# Find orchestrator from agent's team
TEAM_ID=$(curl -sf "$API/api/agents/$AGENT_ID" | jq -r '.agent.teamId // empty' 2>/dev/null)
if [ -z "$TEAM_ID" ]; then
  echo "Error: Agent is not in a team" >&2
  exit 1
fi

ORCH_ID=$(curl -sf "$API/api/teams/$TEAM_ID" | jq -r '.orchestratorId // empty' 2>/dev/null)
if [ -z "$ORCH_ID" ]; then
  echo "Warning: No orchestrator assigned" >&2
  exit 0
fi

# Get orchestrator name for AMP
ORCH_NAME=$(curl -sf "$API/api/agents/$ORCH_ID" | jq -r '.agent.name // empty' 2>/dev/null)
if [ -n "$ORCH_NAME" ]; then
  "$SCRIPT_DIR/amp-send.sh" "$ORCH_NAME" "Task Blocked" "$REASON" --priority high
  echo "Blocker reported to orchestrator: $ORCH_NAME"
else
  echo "Error: Could not resolve orchestrator name" >&2
  exit 1
fi
