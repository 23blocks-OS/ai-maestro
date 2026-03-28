#!/bin/bash
# =============================================================================
# AMP Project Repos - List Project Repositories
# =============================================================================
#
# List repositories for a team's project.
#
# Usage:
#   amp-project-repos.sh [--team <teamId>] [--id <agentUUID>]
#
# Examples:
#   amp-project-repos.sh
#   amp-project-repos.sh --team my-team-id
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

TEAM_ID=""

show_help() {
    echo "Usage: amp-project-repos.sh [--team <teamId>] [--id <agentUUID>]"
    echo ""
    echo "List repositories for a team's project."
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

if [ -z "$TEAM_ID" ]; then
    AGENT_ID="${CLAUDE_AGENT_ID:-$(amp_resolve_agent_id)}"
    TEAM_ID=$(curl -sf "$API/api/agents/$AGENT_ID" | jq -r '.agent.teamId // empty')
    if [ -z "$TEAM_ID" ]; then
        echo "Error: Agent is not in a team. Use --team <id>" >&2
        exit 1
    fi
fi

curl -sf "$API/api/teams/$TEAM_ID/repos" | jq '.'
