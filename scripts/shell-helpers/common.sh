#!/bin/bash
# AI Maestro Common Shell Helper Functions
# Shared utilities for all agent scripts
#
# Usage: source "$(dirname "$0")/../scripts/shell-helpers/common.sh"
# Or for installed scripts: source ~/.local/share/aimaestro/shell-helpers/common.sh

HOSTS_CONFIG="${HOME}/.aimaestro/hosts.json"

# Hosts config is cached in a simple format (no associative arrays for compatibility)
_HOSTS_LOADED=""
_SELF_HOST_ID=""
_SELF_HOST_URL=""

# Get this machine's host ID and URL from the identity API or hosts.json
# Sets: _SELF_HOST_ID, _SELF_HOST_URL
_init_self_host() {
    # Already initialized
    if [ -n "$_SELF_HOST_ID" ]; then
        return 0
    fi

    # Try identity API first (most reliable)
    local identity
    identity=$(curl -s --max-time 5 "http://127.0.0.1:23000/api/hosts/identity" 2>/dev/null)
    if [ -n "$identity" ]; then
        _SELF_HOST_ID=$(echo "$identity" | jq -r '.host.id // empty' 2>/dev/null)
        _SELF_HOST_URL=$(echo "$identity" | jq -r '.host.url // empty' 2>/dev/null)
        if [ -n "$_SELF_HOST_ID" ] && [ -n "$_SELF_HOST_URL" ]; then
            return 0
        fi
    fi

    # Fallback: Find local host in hosts.json
    if [ -f "$HOSTS_CONFIG" ]; then
        local local_host
        local_host=$(jq -r '.hosts[] | select(.type == "local") | "\(.id)|\(.url)"' "$HOSTS_CONFIG" 2>/dev/null | head -1)
        if [ -n "$local_host" ]; then
            _SELF_HOST_ID="${local_host%%|*}"
            _SELF_HOST_URL="${local_host#*|}"
            return 0
        fi
    fi

    # Last resort: Use hostname
    _SELF_HOST_ID=$(hostname | tr '[:upper:]' '[:lower:]')
    _SELF_HOST_URL="http://${_SELF_HOST_ID}:23000"
}

# Get self host ID (this machine)
get_self_host_id() {
    _init_self_host
    echo "$_SELF_HOST_ID"
}

# Get self host URL (this machine)
get_self_host_url() {
    _init_self_host
    echo "$_SELF_HOST_URL"
}

# API_BASE - dynamically determined, never localhost
get_api_base() {
    if [ -n "$AIMAESTRO_API_BASE" ]; then
        echo "$AIMAESTRO_API_BASE"
    else
        get_self_host_url
    fi
}

# For backwards compatibility - use function instead
API_BASE="${AIMAESTRO_API_BASE:-}"

# Get URL for a host by id or name using jq (no associative arrays needed)
# Usage: get_host_url "mac-mini" or get_host_url "juans-mbp"
get_host_url() {
    local host_id="$1"
    _init_self_host

    # Check if this is the self host (case-insensitive)
    local host_id_lower=$(echo "$host_id" | tr '[:upper:]' '[:lower:]')
    local self_id_lower=$(echo "$_SELF_HOST_ID" | tr '[:upper:]' '[:lower:]')

    # BACKWARDS COMPATIBILITY: "local" always means this machine
    if [ "$host_id_lower" = "local" ]; then
        echo "$_SELF_HOST_URL"
        return 0
    fi

    if [ "$host_id_lower" = "$self_id_lower" ]; then
        echo "$_SELF_HOST_URL"
        return 0
    fi

    # No config file means only self is available
    if [ ! -f "$HOSTS_CONFIG" ]; then
        echo "Error: Unknown host '$host_id' (no hosts.json config)" >&2
        return 1
    fi

    # Query the hosts.json directly with jq (case-insensitive)
    local url
    url=$(jq -r --arg id "$host_id_lower" '.hosts[] | select((.id | ascii_downcase) == $id and .enabled == true) | .url' "$HOSTS_CONFIG" 2>/dev/null | head -1)

    # Try matching by name if id didn't work
    if [ -z "$url" ] || [ "$url" = "null" ]; then
        url=$(jq -r --arg name "$host_id" '.hosts[] | select((.name | ascii_downcase) == ($name | ascii_downcase) and .enabled == true) | .url' "$HOSTS_CONFIG" 2>/dev/null | head -1)
    fi

    if [ -n "$url" ] && [ "$url" != "null" ]; then
        echo "$url"
        return 0
    fi

    echo "Error: Unknown host '$host_id'" >&2
    return 1
}

# Check if a host exists
host_exists() {
    local host_id="$1"
    get_host_url "$host_id" >/dev/null 2>&1
}

# Check if a host ID refers to this machine (handles "local" for backwards compatibility)
is_self_host() {
    local host_id="$1"
    _init_self_host

    local host_id_lower=$(echo "$host_id" | tr '[:upper:]' '[:lower:]')
    local self_id_lower=$(echo "$_SELF_HOST_ID" | tr '[:upper:]' '[:lower:]')

    # BACKWARDS COMPATIBILITY: "local" always means this machine
    if [ "$host_id_lower" = "local" ]; then
        return 0
    fi

    # Check against actual self host ID
    if [ "$host_id_lower" = "$self_id_lower" ]; then
        return 0
    fi

    return 1
}

# List all available hosts
list_hosts() {
    _init_self_host
    echo "${_SELF_HOST_ID}: ${_SELF_HOST_URL} (this machine)"

    if [ -f "$HOSTS_CONFIG" ]; then
        # List remote hosts only (not the local one, and not legacy "local" entries)
        jq -r --arg self "$_SELF_HOST_ID" '.hosts[] | select(.enabled == true and (.id | ascii_downcase) != ($self | ascii_downcase) and (.id | ascii_downcase) != "local" and .type != "local") | "\(.id): \(.url)"' "$HOSTS_CONFIG" 2>/dev/null
    fi
}

# Legacy function for compatibility - now a no-op since we query directly
load_hosts_config() {
    _HOSTS_LOADED="1"
}

# Get the current tmux session name (optional - may not be in tmux)
get_session() {
    local session
    session=$(tmux display-message -p '#S' 2>/dev/null)
    if [ -z "$session" ]; then
        # Not in tmux - this is OK for external agents
        return 1
    fi
    echo "$session"
}

# Auto-detect agent identity from git repo name
# Returns repo name if in a git repository, empty otherwise
get_repo_name() {
    local repo_root
    repo_root=$(git rev-parse --show-toplevel 2>/dev/null)
    if [ -n "$repo_root" ]; then
        basename "$repo_root"
    fi
}

# Lookup agent by tmux session name in registry
# AGENT-FIRST: The registry owns the mapping, not the session name format
# Returns agent info if found, empty if not
lookup_agent_by_session() {
    local session_name="$1"
    local api_url
    api_url=$(get_api_base)

    local response
    response=$(curl -s --max-time 5 "${api_url}/api/agents" 2>/dev/null)

    if [ -z "$response" ]; then
        return 1
    fi

    # Find agent that owns this tmux session
    # Agents can have multiple sessions, so we check the sessions array
    local agent_info
    agent_info=$(echo "$response" | jq -r --arg session "$session_name" '
        .agents[] |
        select(
            (.session.tmuxSessionName == $session) or
            (.sessions[]? | .tmuxSessionName == $session)
        ) |
        "\(.id)|\(.name)|\(.alias // .name)"
    ' 2>/dev/null | head -1)

    if [ -n "$agent_info" ] && [ "$agent_info" != "null" ]; then
        echo "$agent_info"
        return 0
    fi

    return 1
}

# Check if jq is available
check_jq() {
    if ! command -v jq &> /dev/null; then
        echo "Error: jq is required but not installed" >&2
        echo "Install with: brew install jq" >&2
        return 1
    fi
}

# Lookup agent by working directory in registry
# Returns agent info if found, empty if not
lookup_agent_by_directory() {
    local current_dir="$1"
    local api_url
    api_url=$(get_api_base)

    # Query the agents API and find agent with matching workingDirectory
    local response
    response=$(curl -s --max-time 5 "${api_url}/api/agents" 2>/dev/null)

    if [ -z "$response" ]; then
        return 1
    fi

    # Find agent where workingDirectory matches or is parent of current_dir
    local agent_info
    agent_info=$(echo "$response" | jq -r --arg dir "$current_dir" '
        .agents[] |
        select(.workingDirectory != null and ($dir | startswith(.workingDirectory))) |
        "\(.id)|\(.name)|\(.alias // .name)"
    ' 2>/dev/null | head -1)

    if [ -n "$agent_info" ] && [ "$agent_info" != "null" ]; then
        echo "$agent_info"
        return 0
    fi

    return 1
}

# Initialize common variables - AGENT-FIRST approach
# Sets: SESSION (optional), AGENT_ID, HOST_ID
#
# Identity resolution priority:
#   1. Environment variables (explicit override)
#   2. Tmux session → Registry lookup (find agent that OWNS this session)
#   3. Working directory → Registry lookup (for sessionless agents)
#   4. Git repo name (external agent identity fallback)
#
# AGENT-FIRST PRINCIPLE:
#   - The agent registry is the source of truth for identity
#   - Session names are just names, not encoded identities
#   - An agent can have multiple sessions (future support)
#   - Sessions are properties of agents, not the other way around
#
# Environment variables:
#   AI_MAESTRO_AGENT_ID  - Agent identifier (name, alias, or UUID)
#   AI_MAESTRO_HOST_ID   - Host identifier (optional, defaults to self)
#
init_common() {
    check_jq || return 1

    # Reset variables
    SESSION=""
    AGENT_ID=""
    HOST_ID=""

    # Priority 1: Explicit identity via environment variables
    if [ -n "$AI_MAESTRO_AGENT_ID" ]; then
        AGENT_ID="$AI_MAESTRO_AGENT_ID"
        HOST_ID="${AI_MAESTRO_HOST_ID:-$(get_self_host_id)}"
    fi

    # Priority 2: Tmux session → Registry lookup
    # AGENT-FIRST: Query the registry to find which agent owns this session
    if [ -z "$AGENT_ID" ]; then
        SESSION=$(get_session 2>/dev/null) || true
        if [ -n "$SESSION" ]; then
            local agent_info
            agent_info=$(lookup_agent_by_session "$SESSION" 2>/dev/null)

            if [ -n "$agent_info" ]; then
                # Parse: id|name|alias
                AGENT_ID=$(echo "$agent_info" | cut -d'|' -f1)
                HOST_ID=$(get_self_host_id)
            fi
        fi
    fi

    # Priority 3: Lookup agent by working directory in registry
    # For agents without active sessions (external, sessionless)
    if [ -z "$AGENT_ID" ]; then
        local current_dir
        current_dir=$(pwd)
        local agent_info
        agent_info=$(lookup_agent_by_directory "$current_dir" 2>/dev/null)

        if [ -n "$agent_info" ]; then
            # Parse: id|name|alias
            AGENT_ID=$(echo "$agent_info" | cut -d'|' -f1)
            HOST_ID=$(get_self_host_id)
        fi
    fi

    # Priority 4: Auto-detect from git repo name (external agent identity)
    # This is a fallback for agents not registered in AI Maestro
    if [ -z "$AGENT_ID" ]; then
        local repo_name
        repo_name=$(get_repo_name)
        if [ -n "$repo_name" ]; then
            AGENT_ID="$repo_name"
            HOST_ID="${AI_MAESTRO_HOST_ID:-$(get_self_host_id)}"
            # Inform user about auto-detected identity
            echo "ℹ️  Using repo-based identity: ${AGENT_ID}@${HOST_ID}" >&2
            echo "   Register this agent or set AI_MAESTRO_AGENT_ID to override" >&2
        fi
    fi

    # Final check: Agent must have an identity
    if [ -z "$AGENT_ID" ]; then
        echo "Error: No agent identity found" >&2
        echo "" >&2
        echo "Options:" >&2
        echo "  1. Set environment variable: export AI_MAESTRO_AGENT_ID='my-agent'" >&2
        echo "  2. Register your tmux session: register-agent-from-session.mjs" >&2
        echo "  3. Run from an agent's working directory (registered in AI Maestro)" >&2
        echo "  4. Run from within a git repository" >&2
        return 1
    fi

    export SESSION
    export AGENT_ID
    export HOST_ID
}

# Make an API query with common error handling
# Usage: api_query "GET" "/api/agents/${AGENT_ID}/endpoint" [extra_curl_args...]
api_query() {
    local method="$1"
    local endpoint="$2"
    shift 2
    local extra_args=("$@")

    local api_base
    api_base=$(get_api_base)
    local url="${api_base}${endpoint}"
    local response

    response=$(curl -s --max-time 30 -X "$method" "${extra_args[@]}" "$url" 2>/dev/null)

    if [ -z "$response" ]; then
        echo "Error: API request failed" >&2
        return 1
    fi

    # Check for success field in response
    local success
    success=$(echo "$response" | jq -r '.success // "true"' 2>/dev/null)

    if [ "$success" = "false" ]; then
        local error
        error=$(echo "$response" | jq -r '.error // "Unknown error"' 2>/dev/null)
        echo "Error: $error" >&2
        return 1
    fi

    echo "$response"
}

# Format and display JSON results nicely
format_result() {
    local response="$1"
    local field="${2:-.result}"
    echo "$response" | jq "$field" 2>/dev/null
}

# ============================================================================
# PATH Setup Functions (for installers)
# ============================================================================

# Setup ~/.local/bin in PATH - works on both macOS and Linux
# Usage: setup_local_bin_path [--quiet]
# Returns: 0 if PATH is configured, 1 if manual action needed
setup_local_bin_path() {
    local quiet=false
    if [ "$1" = "--quiet" ]; then
        quiet=true
    fi

    local INSTALL_DIR="$HOME/.local/bin"

    # Detect the appropriate shell config file
    local SHELL_RC=""
    if [[ "$SHELL" == *"zsh"* ]]; then
        SHELL_RC="$HOME/.zshrc"
    elif [[ "$SHELL" == *"bash"* ]]; then
        # On Linux, .bashrc is standard. On macOS, .bash_profile is often used.
        if [ -f "$HOME/.bashrc" ]; then
            SHELL_RC="$HOME/.bashrc"
        elif [ -f "$HOME/.bash_profile" ]; then
            SHELL_RC="$HOME/.bash_profile"
        else
            SHELL_RC="$HOME/.bashrc"
        fi
    else
        # Fallback: check what exists
        if [ -f "$HOME/.zshrc" ]; then
            SHELL_RC="$HOME/.zshrc"
        elif [ -f "$HOME/.bashrc" ]; then
            SHELL_RC="$HOME/.bashrc"
        else
            SHELL_RC="$HOME/.profile"
        fi
    fi

    # Check if already in PATH
    if [[ ":$PATH:" == *":$INSTALL_DIR:"* ]]; then
        [ "$quiet" = false ] && echo "✅ ~/.local/bin is already in PATH"
        return 0
    fi

    # Dual guard: check for AI Maestro marker OR existing .local/bin PATH entry
    # Use pattern that requires /.local/bin to end at a word boundary (: " ' or EOL) to prevent
    # false positives like /.local/bin-extra matching
    if grep -qF "# AI Maestro" "$SHELL_RC" 2>/dev/null || grep -qE '/\.local/bin(["'"'"':]|$)' "$SHELL_RC" 2>/dev/null; then
        [ "$quiet" = false ] && echo "✅ PATH configured in $SHELL_RC (restart terminal or run: source $SHELL_RC)"
        # Add to current session
        export PATH="$HOME/.local/bin:$PATH"
        return 0
    fi

    # Add to shell config with marker comment to prevent future duplicates
    echo "" >> "$SHELL_RC"
    echo "# AI Maestro PATH (added by installer)" >> "$SHELL_RC"
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"

    # Add to current session
    export PATH="$HOME/.local/bin:$PATH"

    [ "$quiet" = false ] && echo "✅ Added ~/.local/bin to PATH in $SHELL_RC"
    [ "$quiet" = false ] && echo "   Restart terminal or run: source $SHELL_RC"

    return 0
}

# Verify scripts are accessible in PATH
# Usage: verify_scripts_in_path "script1.sh" "script2.sh" ...
verify_scripts_in_path() {
    local all_found=true
    for script in "$@"; do
        if command -v "$script" &> /dev/null; then
            echo "✅ $script is accessible"
        else
            echo "⚠️  $script not in PATH yet"
            all_found=false
        fi
    done

    if [ "$all_found" = false ]; then
        echo ""
        echo "Restart your terminal or run: source ~/.bashrc (or ~/.zshrc)"
    fi
}
