#!/bin/bash
#
# list-agents.sh - List all agents available for export
#
# Usage: list-agents.sh [--json]
#

set -e

# Configuration
AIMAESTRO_API="${AIMAESTRO_API:-http://localhost:23000}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check for --json flag
if [ "$1" = "--json" ]; then
    curl -s "${AIMAESTRO_API}/api/agents" | python3 -c "import sys, json; print(json.dumps(json.load(sys.stdin), indent=2))" 2>/dev/null || curl -s "${AIMAESTRO_API}/api/agents"
    exit 0
fi

echo -e "${BLUE}AI Maestro Agents${NC}"
echo -e "${BLUE}=================${NC}"
echo ""

# Get agents
RESPONSE=$(curl -s "${AIMAESTRO_API}/api/agents")

# Check if response is valid
if [ -z "$RESPONSE" ] || [ "$RESPONSE" = "null" ]; then
    echo -e "${RED}Error: Could not connect to AI Maestro API at $AIMAESTRO_API${NC}"
    echo -e "Make sure AI Maestro is running."
    exit 1
fi

# Parse and display agents
echo "$RESPONSE" | python3 -c "
import sys, json

try:
    data = json.load(sys.stdin)
    agents = data.get('agents', [])

    if not agents:
        print('No agents found.')
        print('')
        print('Register agents using the AI Maestro dashboard or:')
        print('  POST /api/agents/register')
        sys.exit(0)

    print(f'Found {len(agents)} agent(s):')
    print('')

    for agent in agents:
        alias = agent.get('alias', 'Unknown')
        agent_id = agent.get('id', 'Unknown')[:8]
        display_name = agent.get('displayName', '')
        status = agent.get('status', 'offline')
        session = agent.get('currentSession', '')

        # Status color
        if status == 'active':
            status_icon = '\033[32m●\033[0m'  # Green
        elif status == 'idle':
            status_icon = '\033[33m●\033[0m'  # Yellow
        else:
            status_icon = '\033[90m●\033[0m'  # Gray

        # Format output
        name_part = f'{alias}'
        if display_name and display_name != alias:
            name_part += f' ({display_name})'

        print(f'{status_icon} {name_part}')
        print(f'    ID: {agent_id}...')
        if session:
            print(f'    Session: {session}')
        print(f'    Export: export-agent.sh {alias}')
        print('')

except json.JSONDecodeError:
    print('Error: Invalid response from API')
    sys.exit(1)
except Exception as e:
    print(f'Error: {e}')
    sys.exit(1)
"

echo -e "${BLUE}Commands:${NC}"
echo -e "  export-agent.sh <alias>          Export an agent to ZIP"
echo -e "  import-agent.sh <file.zip>       Import an agent from ZIP"
