#!/usr/bin/env bash
# shellcheck disable=SC2034  # RESOLVED_ALIAS and RESOLVED_AGENT_ID are used by sourcing scripts
# AI Maestro Agent Helper Functions
# Agent-specific utilities for aimaestro-agent.sh
#
# Version: 1.0.0
# Requires: bash 4.0+, curl, jq
# Note: This script uses bash-specific features ([[ ]], =~, read -p)
#
# Usage: source "$(dirname "$0")/agent-helper.sh"

# Strict mode - but allow functions to return non-zero without exiting
# MEDIUM-1: set -e intentionally omitted to allow graceful error handling in API calls.
# Functions use explicit return codes and error messages instead of immediate exit.
set -uo pipefail

# Set defaults to avoid unbound variable errors
export AIMAESTRO_API_BASE="${AIMAESTRO_API_BASE:-}"
FORCE="${FORCE:-false}"

# Determine script directory with error handling
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" || {
    echo "Error: Could not determine script directory" >&2
    exit 1
}

# ============================================================================
# Dependency Checks
# ============================================================================

# Check required dependencies are available
# Returns: 0 if all dependencies present, 1 if any missing
check_dependencies() {
    local missing=()
    command -v curl >/dev/null 2>&1 || missing+=("curl")
    command -v jq >/dev/null 2>&1 || missing+=("jq")

    if [[ ${#missing[@]} -gt 0 ]]; then
        echo "Error: Missing required commands: ${missing[*]}" >&2
        return 1
    fi
}

check_dependencies || exit 1

# ============================================================================
# Source Helper Files
# ============================================================================

if [ -f "${SCRIPT_DIR}/messaging-helper.sh" ]; then
    source "${SCRIPT_DIR}/messaging-helper.sh"
elif [ -f "${HOME}/.local/share/aimaestro/shell-helpers/messaging-helper.sh" ]; then
    source "${HOME}/.local/share/aimaestro/shell-helpers/messaging-helper.sh"
else
    # Fallback to common.sh directly
    if [ -f "${HOME}/.local/share/aimaestro/shell-helpers/common.sh" ]; then
        source "${HOME}/.local/share/aimaestro/shell-helpers/common.sh"
    elif [ -f "${SCRIPT_DIR}/../../scripts/shell-helpers/common.sh" ]; then
        # From plugin/scripts/ go up two levels to reach scripts/shell-helpers/
        source "${SCRIPT_DIR}/../../scripts/shell-helpers/common.sh"
    else
        echo "Error: common.sh not found. Please reinstall AI Maestro." >&2
        exit 1
    fi
fi

# ============================================================================
# Colors and Output
# ============================================================================

# Check if terminal supports colors before setting them
if [[ -t 1 ]] && [[ -n "${TERM:-}" ]] && [[ "$TERM" != "dumb" ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    CYAN=''
    BOLD=''
    NC=''
fi

# LOW-1: echo -e is bash-specific, acceptable since script requires bash 4.0+ (line 6)
print_error() { echo -e "${RED}Error: $1${NC}" >&2; }
print_success() { echo -e "${GREEN}$1${NC}"; }
print_warning() { echo -e "${YELLOW}$1${NC}"; }
print_info() { echo -e "${BLUE}$1${NC}"; }
print_header() { echo -e "${BOLD}${CYAN}$1${NC}"; }

# ============================================================================
# API Helper Functions
# ============================================================================

# Validate and get API base URL
# Sets api_base variable in caller's scope
# Returns: 0 on success, 1 on failure
_validate_api_base() {
    local api_base_var="$1"

    # MEDIUM-5: Validate variable name before printf -v to prevent injection
    if [[ ! "$api_base_var" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
        print_error "Invalid variable name for API base"
        return 1
    fi

    local base
    base=$(get_api_base) || {
        print_error "Failed to determine API base URL"
        return 1
    }

    if [[ -z "$base" ]]; then
        print_error "API base URL is empty"
        return 1
    fi

    printf -v "$api_base_var" '%s' "$base"
}

# Make API request with proper error handling
# Args: url [description]
# Returns: response body on stdout, 0 on success, 1 on failure
_api_request() {
    local url="$1"
    local desc="${2:-API request}"
    local response http_code

    # MEDIUM-3: Separate stdout/stderr using temp file for reliable parsing
    local tmp_body
    tmp_body=$(mktemp) || {
        print_error "Failed to create temp file for API request"
        return 1
    }

    http_code=$(curl -s -w '%{http_code}' -o "$tmp_body" --max-time 10 "$url" 2>/dev/null)
    local curl_exit=$?
    response=$(<"$tmp_body")
    rm -f "$tmp_body"

    if [[ $curl_exit -ne 0 ]]; then
        print_error "$desc failed (curl error $curl_exit)"
        return 1
    fi

    if [[ "$http_code" != "200" ]]; then
        print_error "$desc failed (HTTP $http_code)"
        return 1
    fi

    echo "$response"
}

# ============================================================================
# Agent API Functions
# ============================================================================

# Get agent's working directory by ID
# Args: agent_id
# Returns: working directory path on stdout, or empty on failure
get_agent_working_dir() {
    local agent_id="${1:-}"

    if [[ -z "$agent_id" ]]; then
        print_error "agent_id is required"
        return 1
    fi

    # CRITICAL-2: Validate agent_id format to prevent URL/path injection
    if [[ ! "$agent_id" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        print_error "Invalid agent_id format"
        return 1
    fi

    local api_base
    _validate_api_base api_base || return 1

    local response
    response=$(_api_request "${api_base}/api/agents/${agent_id}" "Get agent") || return 1

    if [ -z "$response" ]; then
        return 1
    fi

    # MEDIUM-2: Log debug info if DEBUG is set, otherwise suppress jq errors
    local result
    if ! result=$(echo "$response" | jq -r '.agent.workingDirectory // ""' 2>&1); then
        [[ "${DEBUG:-}" == "true" ]] && print_warning "JSON parse warning: $result" >&2
        echo ""
        return 0
    fi
    echo "$result"
}

# Get agent's primary session name by ID
# Args: agent_id
# Returns: session name on stdout, or empty on failure
get_agent_session_name() {
    local agent_id="${1:-}"

    if [[ -z "$agent_id" ]]; then
        print_error "agent_id is required"
        return 1
    fi

    # CRITICAL-2: Validate agent_id format to prevent URL/path injection
    if [[ ! "$agent_id" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        print_error "Invalid agent_id format"
        return 1
    fi

    local api_base
    _validate_api_base api_base || return 1

    local response
    response=$(_api_request "${api_base}/api/agents/${agent_id}" "Get agent") || return 1

    if [ -z "$response" ]; then
        return 1
    fi

    # MEDIUM-2: Log debug info if DEBUG is set, otherwise suppress jq errors
    local result
    if ! result=$(echo "$response" | jq -r '.agent.sessions[0].tmuxSessionName // .agent.name // ""' 2>&1); then
        [[ "${DEBUG:-}" == "true" ]] && print_warning "JSON parse warning: $result" >&2
        echo ""
        return 0
    fi
    echo "$result"
}

# Get full agent data by ID
# Args: agent_id
# Returns: full agent JSON on stdout
get_agent_data() {
    local agent_id="${1:-}"

    if [[ -z "$agent_id" ]]; then
        print_error "agent_id is required"
        return 1
    fi

    # CRITICAL-2: Validate agent_id format to prevent URL/path injection
    if [[ ! "$agent_id" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        print_error "Invalid agent_id format"
        return 1
    fi

    local api_base
    _validate_api_base api_base || return 1

    _api_request "${api_base}/api/agents/${agent_id}" "Get agent data"
}

# List all agents
# Returns: agents JSON array on stdout
list_agents() {
    local api_base
    _validate_api_base api_base || return 1

    _api_request "${api_base}/api/agents" "List agents"
}

# ============================================================================
# Project Template Functions
# ============================================================================

# Create project folder with templates
# Args: dir name
# Returns: 0 on success, 1 on failure
create_project_template() {
    local dir="${1:-}"
    local name="${2:-}"

    if [[ -z "$dir" ]]; then
        print_error "Directory path is required"
        return 1
    fi

    if [[ -z "$name" ]]; then
        print_error "Project name is required"
        return 1
    fi

    # CRITICAL-1: Validate name to prevent shell injection in heredoc
    validate_agent_name "$name" || return 1

    # MEDIUM-6: Pre-compute date with error checking before heredoc
    local creation_date
    creation_date=$(date +%Y-%m-%d) || {
        print_error "Failed to get current date"
        return 1
    }

    # HIGH-3: Resolve to canonical path to prevent symlink/traversal attacks
    local canonical_dir
    if [[ -d "$dir" ]]; then
        canonical_dir=$(cd "$dir" 2>/dev/null && pwd -P) || {
            print_error "Cannot resolve directory: $dir"
            return 1
        }
    else
        # Directory doesn't exist yet, resolve parent and append basename
        local parent_dir base_name
        parent_dir=$(dirname "$dir")
        base_name=$(basename "$dir")
        mkdir -p "$parent_dir" || {
            print_error "Failed to create parent directory: $parent_dir"
            return 1
        }
        canonical_dir=$(cd "$parent_dir" 2>/dev/null && pwd -P)/"$base_name" || {
            print_error "Cannot resolve directory: $dir"
            return 1
        }
    fi

    # Create .claude directory with error checking
    mkdir -p "$canonical_dir/.claude" || {
        print_error "Failed to create directory: $canonical_dir/.claude"
        return 1
    }

    # HIGH-1/HIGH-2: Use atomic write pattern - write to temp file first, then mv
    local tmp_claude tmp_gitignore
    tmp_claude=$(mktemp) || {
        print_error "Failed to create temp file for CLAUDE.md"
        return 1
    }

    # Create CLAUDE.md template atomically
    cat > "$tmp_claude" << EOF
# CLAUDE.md

## Project Overview

**Agent:** ${name}
**Created:** ${creation_date}

## Development Commands

\`\`\`bash
# Add your common commands here
\`\`\`

## Architecture

<!-- Describe key architecture decisions -->

## Conventions

<!-- Project-specific coding conventions -->
EOF
    # Note: $? check is necessary after heredoc (cannot wrap cat with if)
    # shellcheck disable=SC2181
    if [[ $? -ne 0 ]]; then
        rm -f "$tmp_claude"
        print_error "Failed to write CLAUDE.md content"
        return 1
    fi

    mv "$tmp_claude" "$canonical_dir/CLAUDE.md" || {
        rm -f "$tmp_claude"
        print_error "Failed to create CLAUDE.md"
        return 1
    }

    # Create .gitignore atomically
    tmp_gitignore=$(mktemp) || {
        print_error "Failed to create temp file for .gitignore"
        return 1
    }

    cat > "$tmp_gitignore" << 'GITIGNORE'
# OS
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/
*.swp
*.swo

# Dependencies
node_modules/
venv/
.venv/
__pycache__/

# Build
dist/
build/
*.egg-info/

# Logs
*.log
logs/

# Environment
.env
.env.local
GITIGNORE
    # Note: $? check is necessary after heredoc (cannot wrap cat with if)
    # shellcheck disable=SC2181
    if [[ $? -ne 0 ]]; then
        rm -f "$tmp_gitignore"
        print_error "Failed to write .gitignore content"
        return 1
    fi

    mv "$tmp_gitignore" "$canonical_dir/.gitignore" || {
        rm -f "$tmp_gitignore"
        print_error "Failed to create .gitignore"
        return 1
    }

    # Initialize git if not exists with error logging
    # LOW-3: Capture and log git error instead of suppressing
    if [[ ! -d "$canonical_dir/.git" ]]; then
        local git_err
        if ! git_err=$(cd "$canonical_dir" && git init -q 2>&1); then
            print_warning "Git init failed in $canonical_dir: $git_err (non-fatal)"
        fi
    fi
}

# ============================================================================
# User Interaction
# ============================================================================

# Confirm prompt (respects FORCE variable)
# Args: message [default]
# Returns: 0 if confirmed, 1 if declined
# Note: Uses bash-specific 'read -p' for prompt display
confirm() {
    local message="$1"
    local default="${2:-n}"

    # Skip if force mode
    [[ "$FORCE" == "true" ]] && return 0

    local prompt="[y/N]"
    [[ "$default" == "y" ]] && prompt="[Y/n]"

    local response
    read -rp "$message $prompt " response
    response="${response:-$default}"
    [[ "$response" =~ ^[Yy] ]]
}

# ============================================================================
# Table Formatting
# ============================================================================

# Print a formatted table row
# Args: col1 col2 col3 col4
# Note: Escapes % characters to prevent printf format injection
print_table_row() {
    local col1="${1//%/%%}"
    local col2="${2//%/%%}"
    local col3="${3//%/%%}"
    local col4="${4//%/%%}"

    printf "%-30s %-10s %-8s %s\n" "$col1" "$col2" "$col3" "$col4"
}

# Print table separator
# LOW-2: Use UTF-8 box drawing with ASCII fallback for non-UTF-8 terminals
print_table_sep() {
    if [[ "${LC_ALL:-${LANG:-}}" == *UTF-8* ]] || [[ "${LC_ALL:-${LANG:-}}" == *utf8* ]]; then
        echo "────────────────────────────────────────────────────────────────────────"
    else
        echo "------------------------------------------------------------------------"
    fi
}

# ============================================================================
# Unified Agent Resolution (v0.21.25 — consolidation)
# ============================================================================
#
# HISTORY: Previously there were THREE separate agent resolution code paths:
#
#   1. resolve_agent_simple() in this file — local API only (/api/agents?q=)
#   2. resolve_agent() in messaging-helper.sh — multi-host only (searched
#      all hosts via /api/messages?action=resolve but skipped local /api/agents)
#   3. Inline curl calls in cmd_show() in aimaestro-agent.sh — duplicate
#      of resolve_agent_simple
#
# This caused bugs:
#   - messaging-helper's resolve_agent used HOST_URLS array that was removed
#     when load_hosts_config() became a no-op → unbound variable crash
#   - cmd_show had different error messages than all other commands
#   - Multi-host search didn't always include localhost in its search
#   - No input sanitization on the @host part (only agent part was validated)
#
# CONSOLIDATION: This single resolve_agent() replaces all three. It uses a
# three-phase strategy:
#   Phase 1: If @host specified → query that specific host only
#   Phase 2: Try local API first (/api/agents) — fast, covers 99% of CLI use
#   Phase 3: If local fails → fall back to multi-host search via
#            search_agent_all_hosts() from messaging-helper.sh (if loaded)
#
# The multi-host search uses different API endpoints (/api/messages?action=resolve
# and ?action=search) than the local search (/api/agents), so an agent not found
# locally might still be found via multi-host search on a different endpoint.
#
# Resolve agent by name, alias, or ID — single resolver for all scripts.
# Supports "agent", "agent@host", or raw UUID.
#
# Sets globals (use immediately after calling):
#   RESOLVED_AGENT_ID   - Agent UUID
#   RESOLVED_ALIAS      - Agent display name / alias
#   RESOLVED_HOST_ID    - Host ID where agent was found
#   RESOLVED_HOST_URL   - API URL of the host where agent was found
#   RESOLVED_NAME       - Agent display name (for messaging compatibility)
#
# Returns: 0 if found, 1 if not found
declare -g RESOLVED_AGENT_ID=""
declare -g RESOLVED_ALIAS=""
declare -g RESOLVED_HOST_ID=""
declare -g RESOLVED_HOST_URL=""
declare -g RESOLVED_NAME=""

resolve_agent() {
    local agent_query="${1:-}"

    if [[ -z "$agent_query" ]]; then
        print_error "Agent identifier is required"
        return 1
    fi

    # Reset all globals
    RESOLVED_AGENT_ID=""
    RESOLVED_ALIAS=""
    RESOLVED_HOST_ID=""
    RESOLVED_HOST_URL=""
    RESOLVED_NAME=""

    # Parse agent@host syntax (inline — no dependency on messaging-helper)
    local agent_part="$agent_query"
    local host_part=""
    if [[ "$agent_query" == *"@"* ]]; then
        agent_part="${agent_query%%@*}"
        host_part="${agent_query#*@}"
    fi

    # Input sanitization — prevents shell injection via crafted agent/host names.
    # Agent names: only alphanumeric, hyphens, underscores (matches tmux session name rules)
    # Host names: same plus dots (for hostnames like "juans-mbp.local")
    # These are used in URLs and shell commands, so strict validation is critical.
    if [[ ! "$agent_part" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        print_error "Invalid agent identifier: must contain only letters, numbers, hyphens, underscores"
        return 1
    fi
    if [[ -n "$host_part" ]] && [[ ! "$host_part" =~ ^[a-zA-Z0-9_.-]+$ ]]; then
        print_error "Invalid host identifier: must contain only letters, numbers, hyphens, underscores, dots"
        return 1
    fi

    # --- PHASE 1: Host explicitly specified (e.g. "myagent@mac-mini") ---
    # Query only the specified host via its messaging resolve endpoint.
    # This path is used when the user disambiguates after a multi-host match.
    if [[ -n "$host_part" ]]; then
        # get_host_url resolves host ID → API URL via hosts.json (from common.sh)
        local target_api
        target_api=$(get_host_url "$host_part" 2>/dev/null)
        if [[ -z "$target_api" ]]; then
            print_error "Unknown host '${host_part}'"
            if type list_hosts &>/dev/null; then
                echo "Available hosts:" >&2
                list_hosts | sed 's/^/   /' >&2
            fi
            return 1
        fi
        local response
        response=$(curl -s --max-time 10 "${target_api}/api/messages?action=resolve&agent=${agent_part}" 2>/dev/null)
        if [[ -z "$response" ]]; then
            print_error "Cannot connect to AI Maestro at ${target_api}"
            return 1
        fi
        local resolved
        resolved=$(echo "$response" | jq -r '.resolved // empty' 2>/dev/null)
        if [[ -z "$resolved" ]] || [[ "$resolved" == "null" ]]; then
            print_error "Agent '${agent_part}' not found on host '${host_part}'"
            return 1
        fi
        RESOLVED_AGENT_ID=$(echo "$response" | jq -r '.resolved.agentId' 2>/dev/null)
        RESOLVED_HOST_ID="$host_part"
        RESOLVED_HOST_URL="$target_api"
        RESOLVED_ALIAS=$(echo "$response" | jq -r '.resolved.alias // ""' 2>/dev/null)
        RESOLVED_NAME=$(echo "$response" | jq -r '.resolved.displayName // .resolved.alias // ""' 2>/dev/null)
        return 0
    fi

    # --- PHASE 2: No host specified — try local API first (fast path) ---
    # Most CLI commands (show, update, wake, hibernate, etc.) operate on local
    # agents only, so this fast local lookup covers 99% of use cases.
    # Uses /api/agents?q= (search) and /api/agents/{id} (direct lookup).
    local api_base
    _validate_api_base api_base || return 1

    # URL-encode the query to prevent injection in URL parameters (CRITICAL-1)
    local encoded_query
    encoded_query=$(printf '%s' "$agent_part" | jq -sRr @uri 2>/dev/null)

    # Step 2a: Search by name/alias on local API
    local search_response jq_result
    search_response=$(_api_request "${api_base}/api/agents?q=${encoded_query}" "Search agents") || search_response=""

    if ! jq_result=$(echo "$search_response" | jq -r '.agents[0].id // empty' 2>&1); then
        [[ "${DEBUG:-}" == "true" ]] && print_warning "JSON parse warning: $jq_result" >&2
        jq_result=""
    fi
    RESOLVED_AGENT_ID="$jq_result"

    if [[ -n "$RESOLVED_AGENT_ID" ]]; then
        if ! jq_result=$(echo "$search_response" | jq -r '.agents[0].alias // .agents[0].name // empty' 2>&1); then
            jq_result=""
        fi
        RESOLVED_ALIAS="$jq_result"
        RESOLVED_HOST_ID=$(get_self_host_id 2>/dev/null || echo "localhost")
        RESOLVED_HOST_URL="$api_base"
        RESOLVED_NAME="$RESOLVED_ALIAS"
        return 0
    fi

    # Step 2b: Try direct ID lookup on local API (for UUID-based lookups)
    local direct_response
    direct_response=$(_api_request "${api_base}/api/agents/${agent_part}" "Get agent by ID") || direct_response=""

    if ! jq_result=$(echo "$direct_response" | jq -r '.agent.id // empty' 2>&1); then
        [[ "${DEBUG:-}" == "true" ]] && print_warning "JSON parse warning: $jq_result" >&2
        jq_result=""
    fi
    RESOLVED_AGENT_ID="$jq_result"

    if [[ -n "$RESOLVED_AGENT_ID" ]]; then
        if ! jq_result=$(echo "$direct_response" | jq -r '.agent.alias // .agent.name // empty' 2>&1); then
            jq_result=""
        fi
        RESOLVED_ALIAS="$jq_result"
        RESOLVED_HOST_ID=$(get_self_host_id 2>/dev/null || echo "localhost")
        RESOLVED_HOST_URL="$api_base"
        RESOLVED_NAME="$RESOLVED_ALIAS"
        return 0
    fi

    # --- PHASE 3: Local search failed — try multi-host search if available ---
    # search_agent_all_hosts() is defined in messaging-helper.sh, which is sourced
    # at the top of this file (lines 50-53). If messaging-helper failed to load
    # (e.g. common.sh not found), this function won't exist and we skip to the
    # "not found" error below.
    #
    # Multi-host search queries /api/messages?action=resolve on every configured
    # host (from hosts.json) plus localhost:23000 (always injected). This uses
    # different API endpoints than Phase 2, so agents discoverable via messaging
    # but not via /api/agents will still be found.
    if type search_agent_all_hosts &>/dev/null; then
        search_agent_all_hosts "$agent_part"

        if [[ "$SEARCH_COUNT" -eq 1 ]]; then
            RESOLVED_AGENT_ID=$(echo "$SEARCH_RESULTS" | jq -r '.[0].agentId')
            RESOLVED_HOST_ID=$(echo "$SEARCH_RESULTS" | jq -r '.[0].hostId')
            RESOLVED_HOST_URL=$(echo "$SEARCH_RESULTS" | jq -r '.[0].hostUrl')
            RESOLVED_ALIAS=$(echo "$SEARCH_RESULTS" | jq -r '.[0].alias')
            RESOLVED_NAME=$(echo "$SEARCH_RESULTS" | jq -r '.[0].name')
            if [[ "$SEARCH_IS_FUZZY" -eq 1 ]]; then
                echo "Found partial match: ${RESOLVED_ALIAS}@${RESOLVED_HOST_ID}" >&2
            fi
            return 0
        elif [[ "$SEARCH_COUNT" -gt 1 ]]; then
            # Multiple matches across hosts — ask user to disambiguate
            if [[ "$SEARCH_IS_FUZZY" -eq 1 ]]; then
                echo "Found ${SEARCH_COUNT} partial matches for '${agent_part}':" >&2
            else
                echo "Agent '${agent_part}' found on multiple hosts:" >&2
            fi
            echo "" >&2
            local i=0
            while [[ $i -lt "$SEARCH_COUNT" ]]; do
                local h_alias h_id
                h_alias=$(echo "$SEARCH_RESULTS" | jq -r ".[$i].alias")
                h_id=$(echo "$SEARCH_RESULTS" | jq -r ".[$i].hostId")
                echo "   ${h_alias}@${h_id}" >&2
                i=$((i + 1))
            done
            echo "" >&2
            echo "Specify the full agent address: <agent-name>@<host-id>" >&2
            return 1
        fi
    fi

    # --- Not found on any host ---
    # Error messages are designed to be non-interactive so AI agents can parse
    # them and retry with the correct agent@host address automatically.
    print_error "Agent not found: $agent_query"
    # Show helpful context: which hosts were searched and what agents exist
    if type search_agent_all_hosts &>/dev/null; then
        echo "" >&2
        if type list_hosts &>/dev/null; then
            echo "Hosts searched:" >&2
            list_hosts | sed 's/^/   /' >&2
            echo "" >&2
        fi
        # List agents on localhost so the caller can retry with the correct name
        local agent_list
        agent_list=$(curl -s --max-time 3 "http://localhost:23000/api/agents" 2>/dev/null \
            | jq -r '.agents[].name // empty' 2>/dev/null | sort -u)
        if [[ -n "$agent_list" ]]; then
            echo "Agents on localhost:" >&2
            echo "$agent_list" | sed 's/^/   /' >&2
            echo "" >&2
        fi
        echo "To retry with a specific host: <agent-name>@<host-id>" >&2
    fi
    return 1
}

# ============================================================================
# Validation
# ============================================================================

# Check if an agent with the given name already exists (including hibernated)
# Args: name
# Returns: 0 if agent exists, 1 if not found
check_agent_exists() {
    local name="$1"

    if [[ -z "$name" ]]; then
        return 1
    fi

    local api_base
    _validate_api_base api_base || return 1

    # URL-encode the name for search
    local encoded_name
    encoded_name=$(printf '%s' "$name" | jq -sRr @uri 2>/dev/null)

    local response
    response=$(_api_request "${api_base}/api/agents?q=${encoded_name}" "Search agents") || return 1

    # Check if any agent matches the name (case-insensitive)
    local name_lower="${name,,}"
    local found
    found=$(echo "$response" | jq -r --arg n "$name_lower" '
        .agents // [] | map(select(
            (.name | ascii_downcase) == $n or
            (.alias | ascii_downcase) == $n
        )) | length
    ' 2>/dev/null)

    [[ "$found" -gt 0 ]]
}

# Validate agent name format
# Args: name
# Returns: 0 if valid, 1 if invalid
validate_agent_name() {
    local name="$1"

    if [[ -z "$name" ]]; then
        print_error "Agent name is required"
        return 1
    fi

    # Reject names starting with hyphen (could be interpreted as flags)
    if [[ "$name" =~ ^- ]]; then
        print_error "Agent name cannot start with a hyphen"
        return 1
    fi

    if [[ ! "$name" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        print_error "Agent name must contain only letters, numbers, hyphens, and underscores"
        return 1
    fi

    if [[ ${#name} -gt 64 ]]; then
        print_error "Agent name must be 64 characters or less"
        return 1
    fi
}

# Check if AI Maestro API is running
# Returns: 0 if running, 1 if not
check_api_running() {
    local api_base
    _validate_api_base api_base || return 1

    # LOW-4: Use 2>/dev/null instead of 2>&1 to prevent curl errors polluting http_code
    local http_code
    http_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "${api_base}/api/sessions" 2>/dev/null)

    # LOW-4: Explicit check for empty or connection-failed (000) http_code
    if [[ -z "$http_code" ]] || [[ "$http_code" == "000" ]]; then
        print_error "Cannot connect to AI Maestro at ${api_base}"
        echo "" >&2
        echo "Start AI Maestro with:" >&2
        echo "   cd ~/ai-maestro && pm2 start ai-maestro" >&2
        return 1
    fi

    if [[ "$http_code" != "200" ]]; then
        print_error "AI Maestro is not running at ${api_base} (HTTP $http_code)"
        echo "" >&2
        echo "Start AI Maestro with:" >&2
        echo "   cd ~/ai-maestro && pm2 start ai-maestro" >&2
        return 1
    fi
}

# ============================================================================
# Plugin Management Helpers
# ============================================================================

# Execute claude command in agent's working directory
# Args: agent_id [claude_args...]
# Returns: claude command exit code
run_claude_in_agent_dir() {
    if [[ $# -lt 1 ]]; then
        print_error "agent_id is required"
        return 1
    fi

    local agent_id="$1"
    shift
    local claude_args=("$@")

    # Check if claude command exists
    if ! command -v claude >/dev/null 2>&1; then
        print_error "claude command not found in PATH"
        return 1
    fi

    # LOW-5: get_agent_working_dir may return empty on API failure or if agent has no workingDirectory.
    # The subsequent checks for empty/non-existent directory handle both cases.
    local agent_dir
    agent_dir=$(get_agent_working_dir "$agent_id")

    if [[ -z "$agent_dir" ]] || [[ ! -d "$agent_dir" ]]; then
        print_error "Agent working directory not found"
        return 1
    fi

    # HIGH-3: Resolve to canonical path to prevent symlink/traversal attacks
    local canonical_dir
    canonical_dir=$(cd "$agent_dir" 2>/dev/null && pwd -P) || {
        print_error "Cannot resolve directory: $agent_dir"
        return 1
    }

    (cd "$canonical_dir" && claude "${claude_args[@]}")
}

# ============================================================================
# Export/Import Helpers
# ============================================================================

# Create export JSON structure
# Args: agent_data (JSON string)
# Returns: export JSON on stdout
create_export_json() {
    local agent_data="$1"

    # Check if get_self_host_id function exists
    if ! type get_self_host_id &>/dev/null; then
        print_error "get_self_host_id function not available"
        return 1
    fi

    # Capture values with error handling
    local export_date host_id
    export_date=$(date -u +%Y-%m-%dT%H:%M:%SZ) || {
        print_error "Failed to get current date"
        return 1
    }
    host_id=$(get_self_host_id) || {
        print_error "Failed to get host ID"
        return 1
    }

    # LOW-011: date -u +%Y-%m-%dT%H:%M:%SZ is POSIX portable ISO 8601 format
    # MEDIUM-2: Log debug info if DEBUG is set, otherwise suppress jq errors
    local result
    if ! result=$(jq -n \
        --arg version "1.0" \
        --arg exportedAt "$export_date" \
        --arg hostId "$host_id" \
        --argjson agent "$agent_data" \
        '{
            version: $version,
            exportedAt: $exportedAt,
            sourceHost: $hostId,
            agent: $agent.agent
        }' 2>&1); then
        [[ "${DEBUG:-}" == "true" ]] && print_warning "JSON construction warning: $result" >&2
        return 1
    fi
    echo "$result"
}

# Validate import file structure
# Args: file
# Returns: 0 if valid, 1 if invalid
validate_import_file() {
    local file="$1"

    if [[ ! -f "$file" ]]; then
        print_error "File not found: $file"
        return 1
    fi

    # MEDIUM-7: Use jq -e for parse validation to catch JSON errors
    # MEDIUM-2: Log debug info if DEBUG is set, otherwise suppress jq errors
    local jq_err
    if ! jq_err=$(jq -e empty "$file" 2>&1); then
        [[ "${DEBUG:-}" == "true" ]] && print_warning "JSON validation warning: $jq_err" >&2
        print_error "Invalid JSON file: $file"
        return 1
    fi

    # Check for required fields
    # MEDIUM-7: Use jq -e to properly detect null/false values
    # MEDIUM-2: Log debug info if DEBUG is set, otherwise suppress jq errors
    local has_agent
    if ! has_agent=$(jq -e -r '.agent // empty' "$file" 2>&1); then
        [[ "${DEBUG:-}" == "true" ]] && print_warning "JSON field extraction warning: $has_agent" >&2
        has_agent=""
    fi

    if [[ -z "$has_agent" ]]; then
        print_error "Import file missing 'agent' field"
        return 1
    fi
}
