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
# Agent Resolution (simpler than messaging resolve_agent)
# ============================================================================

# Resolve agent by name, alias, or ID
# Sets: RESOLVED_AGENT_ID, RESOLVED_ALIAS (global variables)
# Args: agent_query
# Returns: 0 if found, 1 if not found
#
# MEDIUM-4: Global variables are used here to return multiple values from the function.
# This is a bash limitation - nameref pattern would require bash 4.3+ and break compatibility.
# Callers should use these globals immediately after calling resolve_agent_simple().
# Future refactor: return JSON and parse with jq if multiple values needed.
declare -g RESOLVED_AGENT_ID=""
declare -g RESOLVED_ALIAS=""

resolve_agent_simple() {
    local agent_query="${1:-}"
    
    if [[ -z "$agent_query" ]]; then
        print_error "Agent identifier is required"
        return 1
    fi
    
    local api_base
    _validate_api_base api_base || return 1

    # Validate agent_query format for path safety (CRITICAL-2 fix)
    if [[ ! "$agent_query" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        print_error "Invalid agent identifier format: must contain only letters, numbers, hyphens, underscores"
        return 1
    fi

    # URL-encode the query for search parameter (CRITICAL-1 fix)
    local encoded_query
    encoded_query=$(printf '%s' "$agent_query" | jq -sRr @uri 2>/dev/null)

    # Try search by name/alias
    local search_response
    search_response=$(_api_request "${api_base}/api/agents?q=${encoded_query}" "Search agents") || search_response=""

    # MEDIUM-2: Log debug info if DEBUG is set, otherwise suppress jq errors
    local jq_result
    if ! jq_result=$(echo "$search_response" | jq -r '.agents[0].id // empty' 2>&1); then
        [[ "${DEBUG:-}" == "true" ]] && print_warning "JSON parse warning (search id): $jq_result" >&2
        jq_result=""
    fi
    RESOLVED_AGENT_ID="$jq_result"

    if ! jq_result=$(echo "$search_response" | jq -r '.agents[0].alias // .agents[0].name // empty' 2>&1); then
        [[ "${DEBUG:-}" == "true" ]] && print_warning "JSON parse warning (search alias): $jq_result" >&2
        jq_result=""
    fi
    RESOLVED_ALIAS="$jq_result"

    if [[ -n "$RESOLVED_AGENT_ID" ]]; then
        return 0
    fi

    # Try direct ID lookup (agent_query already validated above)
    local direct_response
    direct_response=$(_api_request "${api_base}/api/agents/${agent_query}" "Get agent by ID") || direct_response=""

    # MEDIUM-2: Log debug info if DEBUG is set, otherwise suppress jq errors
    if ! jq_result=$(echo "$direct_response" | jq -r '.agent.id // empty' 2>&1); then
        [[ "${DEBUG:-}" == "true" ]] && print_warning "JSON parse warning (direct id): $jq_result" >&2
        jq_result=""
    fi
    RESOLVED_AGENT_ID="$jq_result"

    if ! jq_result=$(echo "$direct_response" | jq -r '.agent.alias // .agent.name // empty' 2>&1); then
        [[ "${DEBUG:-}" == "true" ]] && print_warning "JSON parse warning (direct alias): $jq_result" >&2
        jq_result=""
    fi
    RESOLVED_ALIAS="$jq_result"

    if [[ -n "$RESOLVED_AGENT_ID" ]]; then
        return 0
    fi

    print_error "Agent not found: $agent_query"
    return 1
}

# Override resolve_agent if messaging helpers not fully loaded
if ! type resolve_agent &>/dev/null; then
    resolve_agent() {
        resolve_agent_simple "$@"
    }
fi

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
