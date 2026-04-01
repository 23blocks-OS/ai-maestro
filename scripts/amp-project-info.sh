#!/usr/bin/env bash
# =============================================================================
# AMP Project Info - Show Team and Project Info
# =============================================================================
#
# Show team and project info for the current agent.
#
# Usage:
#   amp-project-info.sh [--team <teamId>] [--id <agentUUID>]
#
# Examples:
#   amp-project-info.sh
#   amp-project-info.sh --team my-team-id
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

TEAM_ID=""

show_help() {
    echo "Usage: amp-project-info.sh [--team <teamId>] [--id <agentUUID>]"
    echo ""
    echo "Show team and project info for the current agent."
    echo ""
    echo "Options:"
    echo "  --team TEAMID   Team ID to query (auto-detected from agent if omitted)"
    echo "  --id UUID       Operate as this agent (UUID from config.json)"
    echo "  --help, -h      Show this help"
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --team) TEAM_ID="$2"; shift 2 ;;
        --id) shift 2 ;;  # Already handled in pre-source parsing
        --help|-h) show_help; exit 0 ;;
        *) shift ;;
    esac
done

API="${AIMAESTRO_API:-http://localhost:23000}"

# Auto-detect team from agent registry if not provided
if [ -z "$TEAM_ID" ]; then
    AGENT_ID="${CLAUDE_AGENT_ID:-$(amp_resolve_agent_id)}"
    TEAM_ID=$(curl -sf "$API/api/agents/$AGENT_ID" | jq -r '.agent.teamId // empty')
    if [ -z "$TEAM_ID" ]; then
        echo "Error: Agent is not in a team. Use --team <id>" >&2
        exit 1
    fi
fi

# Fetch team info
TEAM_JSON=$(curl -sf "$API/api/teams/$TEAM_ID")
echo "$TEAM_JSON" | jq '{
  name: .name,
  description: .description,
  type: .type,
  members: (.agentIds | length),
  chiefOfStaff: .chiefOfStaffId,
  orchestrator: .orchestratorId,
  githubProject: .githubProject,
  created: .createdAt
}'
