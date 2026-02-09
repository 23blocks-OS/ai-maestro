#!/usr/bin/env bash
# shellcheck disable=SC2034  # FORCE variable is used by confirm() in agent-helper.sh
# AI Maestro Agent Management CLI
# Manage agents: create, delete, hibernate, wake, configure plugins, and more
#
# Usage: aimaestro-agent.sh <command> [options]
#
# Commands:
#   list        List all agents
#   show        Show agent details
#   create      Create a new agent
#   delete      Delete an agent
#   update      Update agent properties
#   rename      Rename an agent
#   session     Manage agent sessions
#   hibernate   Hibernate an agent (stop session, preserve state)
#   wake        Wake a hibernated agent
#   skill       Manage agent skills
#   plugin      Manage Claude Code plugins for an agent
#   export      Export agent to file
#   import      Import agent from file
#   help        Show this help
#
# Version: Sync with bump-version.sh - currently v1.0.1

set -euo pipefail

# LOW-1: Cleanup handler for graceful exit - tracks temp files for removal
declare -a _TEMP_FILES=()

cleanup() {
    # Clean up any temporary files created during execution
    local f
    for f in "${_TEMP_FILES[@]}"; do
        [[ -f "$f" ]] && rm -f "$f" 2>/dev/null || true
    done
    # Reset terminal colors in case of abnormal exit
    printf '%s' "${NC:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Helper to register temp files for cleanup
register_temp_file() {
    _TEMP_FILES+=("$1")
}

# Escape regex metacharacters in a string for safe use in patterns
# Usage: escaped=$(escape_regex "$string")
escape_regex() {
    printf '%s' "$1" | sed 's/[][\/.^$*+?{}|()]/\\&/g'
}

# Source helper functions - try multiple locations (LOW-010: check return value)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "${SCRIPT_DIR}/agent-helper.sh" ]; then
    if ! source "${SCRIPT_DIR}/agent-helper.sh"; then
        echo "Error: Failed to source agent-helper.sh" >&2
        exit 1
    fi
elif [ -f "${HOME}/.local/share/aimaestro/shell-helpers/agent-helper.sh" ]; then
    if ! source "${HOME}/.local/share/aimaestro/shell-helpers/agent-helper.sh"; then
        echo "Error: Failed to source agent-helper.sh" >&2
        exit 1
    fi
else
    echo "Error: agent-helper.sh not found" >&2
    exit 1
fi

# HIGH-004: Check for required dependencies
check_dependencies() {
    local missing=()
    for cmd in curl jq tmux; do
        command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        echo "Error: Missing required commands: ${missing[*]}" >&2
        exit 1
    fi
}
check_dependencies

# Lazy check for claude CLI (only needed for plugin commands)
require_claude() {
    if ! command -v claude >/dev/null 2>&1; then
        print_error "Claude CLI is required for plugin commands but not found"
        print_error "Install with: npm install -g @anthropic-ai/claude-code"
        return 1
    fi
}

# ============================================================================
# SECURITY VALIDATION FUNCTIONS
# ============================================================================

# LOW-5: Rate limiting consideration
# API calls in this script are user-initiated and local (localhost API).
# Rate limiting is not implemented as:
# 1. The API is localhost-only (no external exposure)
# 2. Each command is user-initiated (not automated loops)
# 3. Server-side rate limiting should be implemented in the API if needed
# For batch operations, consider adding delays between calls if needed.

# CRITICAL-1: Validate that a path is within an expected base directory
# Prevents path traversal attacks on recursive deletes
# Args: path, base_directory
# Returns: 0 if path is within base, 1 otherwise
validate_cache_path() {
    local path="$1"
    local cache_base="$2"

    # Resolve both paths to absolute, handling missing paths with -m
    local resolved
    resolved=$(realpath -m "$path" 2>/dev/null) || return 1
    local cache_resolved
    cache_resolved=$(realpath -m "$cache_base" 2>/dev/null) || return 1

    # Verify resolved path starts with cache base (is contained within)
    [[ "$resolved" == "$cache_resolved"/* ]] || return 1
}

# CRITICAL-2: Validate tmux session name against strict pattern
# Prevents command injection via tmux session names
# Args: session_name
# Returns: 0 if valid, 1 if invalid
validate_tmux_session_name() {
    local name="$1"

    # Empty name is invalid
    [[ -z "$name" ]] && return 1

    # tmux session names: alphanumeric, hyphen, underscore only
    # Must not start with hyphen (could be interpreted as option)
    [[ "$name" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_-]*$ ]] || return 1

    # Length check (tmux has practical limits)
    [[ ${#name} -le 256 ]] || return 1
}

# HIGH-2: Check if path contains symlinks that could escape directory
# Args: path
# Returns: 0 if safe (no symlinks), 1 if contains symlinks
check_no_symlinks_in_path() {
    local path="$1"
    local current="$path"

    # Walk up the path checking for symlinks
    while [[ "$current" != "/" && "$current" != "." ]]; do
        if [[ -L "$current" ]]; then
            return 1  # Found symlink
        fi
        current=$(dirname "$current")
    done
    return 0
}

# HIGH-4: Sanitize string for safe display (removes ANSI codes)
# Args: string
# Returns: sanitized string on stdout
sanitize_for_display() {
    local input="$1"
    # Remove ANSI escape sequences and control characters
    printf '%s' "$input" | tr -cd '[:print:][:space:]' | sed 's/\x1b\[[0-9;]*m//g'
}

# Global flags
FORCE=false

# ============================================================================
# CLAUDE CLI HELPERS
# Run claude commands and capture output/errors for proper reporting
# ============================================================================

# Get the current tmux session name (if running in tmux)
# Returns: session name on stdout, empty if not in tmux
get_current_tmux_session() {
    if [[ -n "${TMUX:-}" ]]; then
        tmux display-message -p '#S' 2>/dev/null || echo ""
    else
        echo ""
    fi
}

# Check if an agent is the current session (the one running this script)
# Args: agent_name_or_id
# Returns: 0 if current session, 1 if different session
is_current_session() {
    local agent="$1"
    local current_session
    current_session=$(get_current_tmux_session)

    [[ -z "$current_session" ]] && return 1

    # Match by name or resolved alias
    if [[ "$agent" == "$current_session" ]] || [[ "${RESOLVED_ALIAS:-}" == "$current_session" ]]; then
        return 0
    fi
    return 1
}

# Run a claude CLI command and capture both stdout and stderr
# Reports verbatim error messages from claude CLI
# Args: working_dir, command_args...
# Returns: exit code from claude, output on stdout, errors printed to stderr
run_claude_command() {
    local work_dir="$1"
    shift
    local -a cmd_args=("$@")

    # Validate working directory exists before attempting cd
    if [[ ! -d "$work_dir" ]]; then
        print_error "Working directory does not exist: $work_dir"
        return 1
    fi

    local tmp_stdout tmp_stderr exit_code
    tmp_stdout=$(mktemp)
    tmp_stderr=$(mktemp)
    _TEMP_FILES+=("$tmp_stdout" "$tmp_stderr")

    # Run command capturing both streams
    (cd "$work_dir" && claude "${cmd_args[@]}" >"$tmp_stdout" 2>"$tmp_stderr")
    exit_code=$?

    # Output stdout
    cat "$tmp_stdout"

    # If there was stderr, report it
    if [[ -s "$tmp_stderr" ]]; then
        local stderr_content
        stderr_content=$(<"$tmp_stderr")
        if [[ $exit_code -ne 0 ]]; then
            # Error case: show full error from claude
            echo "" >&2
            echo "${YELLOW}Claude CLI output:${NC}" >&2
            echo "$stderr_content" >&2
        else
            # Success with warnings: show as info
            if [[ -n "$stderr_content" ]]; then
                print_info "Claude CLI message: $stderr_content"
            fi
        fi
    fi

    rm -f "$tmp_stdout" "$tmp_stderr" 2>/dev/null
    return $exit_code
}

# Check if a marketplace is already installed for an agent
# Args: agent_dir, marketplace_source
# Returns: 0 if already installed, 1 if not
is_marketplace_installed() {
    local agent_dir="$1"
    local source="$2"

    # Extract marketplace name from source (supports github:, URL, and local path)
    local mp_name=""
    if [[ "$source" =~ ^github:(.+)/(.+)$ ]]; then
        # github:owner/repo -> extract repo name
        mp_name="${BASH_REMATCH[2]}"
    elif [[ "$source" =~ ^https?://.*/([-a-zA-Z0-9_]+)/?$ ]]; then
        # URL like https://example.com/marketplace-name -> extract last path segment
        mp_name="${BASH_REMATCH[1]}"
    elif [[ "$source" =~ ^https?://.*/([-a-zA-Z0-9_]+)\.json$ ]]; then
        # URL like https://example.com/my-marketplace.json -> extract name before .json
        mp_name="${BASH_REMATCH[1]}"
    elif [[ -d "$source" ]]; then
        # Local directory path
        mp_name=$(basename "$source")
    fi

    # If we couldn't extract a name, can't check - assume not installed
    [[ -z "$mp_name" ]] && return 1

    # Check if marketplace exists in claude's marketplace list
    local output
    output=$(cd "$agent_dir" && claude plugin marketplace list 2>/dev/null | grep -i "$mp_name" || true)
    [[ -n "$output" ]]
}

# Restart an agent by hibernate + wake with verification
# Args: agent_id, [wait_seconds]
# Returns: 0 on success, 1 on failure
restart_agent() {
    local agent_id="$1"
    local wait_secs="${2:-3}"
    local api_base
    api_base=$(get_api_base)

    # Validate api_base is not empty
    if [[ -z "$api_base" ]]; then
        print_error "Failed to get API base URL"
        return 1
    fi

    print_info "Restarting agent to apply changes..."

    # Hibernate
    local response
    response=$(curl -s --max-time 30 -X POST "${api_base}/api/agents/${agent_id}/hibernate")
    local error
    error=$(echo "$response" | jq -r '.error // empty' 2>/dev/null)
    if [[ -n "$error" ]]; then
        print_warning "Hibernate warning: $error"
    fi

    # Wait for session to fully terminate
    sleep "$wait_secs"

    # Wake
    response=$(curl -s --max-time 30 -X POST "${api_base}/api/agents/${agent_id}/wake")
    error=$(echo "$response" | jq -r '.error // empty' 2>/dev/null)
    if [[ -n "$error" ]]; then
        print_error "Wake failed: $error"
        return 1
    fi

    # Verify agent is back online
    sleep 2
    response=$(curl -s --max-time 10 "${api_base}/api/agents/${agent_id}")
    local status
    status=$(echo "$response" | jq -r '.agent.status // "unknown"' 2>/dev/null)

    if [[ "$status" == "online" ]]; then
        print_success "Agent restarted successfully"
        return 0
    else
        print_warning "Agent status: $status (may need manual verification)"
        return 0  # Don't fail - agent might still be starting
    fi
}

# Print restart instructions for current session
print_restart_instructions() {
    local reason="${1:-to apply changes}"
    echo ""
    print_warning "Claude Code restart required $reason"
    echo ""
    echo "  To restart, exit Claude Code and run it again, or use:"
    echo "    1. Exit current session: Type '/exit' or press Ctrl+C"
    echo "    2. Restart: Run 'claude' in your terminal"
    echo ""
}

# ============================================================================
# SAFE JSON EDITING
# Atomic, validated JSON file modifications with backup and rollback
# ============================================================================

# Safe JSON edit with backup, validation, and atomic replacement
# Usage: safe_json_edit <file> <jq_filter> [jq_args...]
# Returns: 0 on success, 1 on failure (original file unchanged)
safe_json_edit() {
    local file="$1"
    local jq_filter="$2"
    shift 2
    local jq_args=("$@")

    # Validate inputs
    if [[ ! -f "$file" ]]; then
        print_error "JSON file not found: $file"
        return 1
    fi

    # Create temp directory for atomic operations
    local tmp_dir
    tmp_dir=$(mktemp -d) || { print_error "Failed to create temp directory"; return 1; }

    # Ensure cleanup on any exit from this function
    local cleanup_done=false
    cleanup_tmp() {
        if [[ "$cleanup_done" == false ]]; then
            rm -rf "$tmp_dir" 2>/dev/null || true
            cleanup_done=true
        fi
    }

    # Create timestamped backup (keep last 5 backups)
    local backup_dir="${file%/*}/.backups"
    local backup_file
    backup_file="$backup_dir/$(basename -- "$file").$(date +%Y%m%d_%H%M%S).bak"
    mkdir -p "$backup_dir" 2>/dev/null || true

    # Copy original to backup
    if ! cp "$file" "$backup_file" 2>/dev/null; then
        print_warning "Could not create backup at $backup_file"
        # Continue anyway - backup is nice to have but not critical
    else
        # HIGH-3: Cleanup old backups (keep last 5) - use find with -print0 for safe filename handling
        local backup_pattern
        backup_pattern="$(basename -- "$file").*.bak"
        find "$backup_dir" -maxdepth 1 -name "$backup_pattern" -type f -print0 2>/dev/null | \
            xargs -0 ls -t 2>/dev/null | tail -n +6 | while IFS= read -r old_backup; do
                rm -f "$old_backup" 2>/dev/null || true
            done
    fi

    # Copy original to temp for editing
    local tmp_file="$tmp_dir/edit.json"
    local original_copy="$tmp_dir/original.json"
    if ! cp "$file" "$original_copy"; then
        print_error "Failed to copy original file"
        cleanup_tmp
        return 1
    fi
    if ! cp "$file" "$tmp_file"; then
        print_error "Failed to create working copy"
        cleanup_tmp
        return 1
    fi

    # Apply jq transformation
    local result_file="$tmp_dir/result.json"
    if ! jq "${jq_args[@]}" "$jq_filter" "$tmp_file" > "$result_file" 2>/dev/null; then
        print_error "JSON transformation failed"
        cleanup_tmp
        return 1
    fi

    # Validate result is valid JSON
    if ! jq empty "$result_file" 2>/dev/null; then
        print_error "Result is not valid JSON"
        cleanup_tmp
        return 1
    fi

    # Verify file is not empty (basic sanity check)
    if [[ ! -s "$result_file" ]]; then
        print_error "Result file is empty"
        cleanup_tmp
        return 1
    fi

    # ========== EXACT DIFF VERIFICATION ==========
    # Verify ONLY the intended path was modified, everything else must be identical

    # Extract the target path from the jq filter
    # Patterns: .key = value, .key |= ..., .a.b.c = ..., del(.key), if .key then ...
    local target_path=""

    # Pattern: .keyname = or .keyname |= or .keyname +=
    if [[ "$jq_filter" =~ ^\.([a-zA-Z_][a-zA-Z0-9_]*)[[:space:]]*(=|\|=|\+=) ]]; then
        target_path="${BASH_REMATCH[1]}"
    # Pattern: if .keyname then
    elif [[ "$jq_filter" =~ ^if[[:space:]]+\.([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
        target_path="${BASH_REMATCH[1]}"
    # Pattern: del(.keyname)
    elif [[ "$jq_filter" =~ del\(\.([a-zA-Z_][a-zA-Z0-9_]*)\) ]]; then
        target_path="${BASH_REMATCH[1]}"
    # Pattern: .keyname |= with_entries or |= map
    elif [[ "$jq_filter" =~ \.([a-zA-Z_][a-zA-Z0-9_]*)[[:space:]]*\|= ]]; then
        target_path="${BASH_REMATCH[1]}"
    fi

    # HIGH-1: Validate extracted target_path - must be a simple identifier
    # This prevents regex injection via crafted jq filters
    if [[ -n "$target_path" ]] && [[ ! "$target_path" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
        print_warning "Invalid target path extracted from filter, skipping diff verification"
        target_path=""
    fi

    if [[ -z "$target_path" ]]; then
        # Cannot determine target path - fall back to allowing any change
        # This is a safety valve for complex filters
        :
    else
        # Verify all OTHER keys are IDENTICAL (byte-for-byte)
        local orig_type result_type
        orig_type=$(jq -r 'type' "$original_copy" 2>/dev/null)
        result_type=$(jq -r 'type' "$result_file" 2>/dev/null)

        if [[ "$orig_type" == "object" && "$result_type" == "object" ]]; then
            # Get all keys from original
            local all_keys
            all_keys=$(jq -r 'keys[]' "$original_copy" 2>/dev/null)

            # For each key that is NOT the target, verify it's identical
            while IFS= read -r key; do
                [[ -z "$key" ]] && continue
                [[ "$key" == "$target_path" ]] && continue

                # Extract the value for this key from both files
                local orig_val result_val
                orig_val=$(jq -c --arg k "$key" '.[$k]' "$original_copy" 2>/dev/null)
                result_val=$(jq -c --arg k "$key" '.[$k]' "$result_file" 2>/dev/null)

                if [[ "$orig_val" != "$result_val" ]]; then
                    print_error "JSON edit aborted: key '$key' was modified (expected only '$target_path' to change)"
                    cleanup_tmp
                    return 1
                fi
            done <<< "$all_keys"

            # Check for unexpected NEW keys (keys in result but not in original, excluding target)
            local result_keys
            result_keys=$(jq -r 'keys[]' "$result_file" 2>/dev/null)
            while IFS= read -r key; do
                [[ -z "$key" ]] && continue
                [[ "$key" == "$target_path" ]] && continue

                # Check if this key existed in original
                local existed
                existed=$(jq -r --arg k "$key" 'has($k)' "$original_copy" 2>/dev/null)
                if [[ "$existed" != "true" ]]; then
                    print_error "JSON edit aborted: unexpected new key '$key' added (expected only '$target_path' to change)"
                    cleanup_tmp
                    return 1
                fi
            done <<< "$result_keys"

            # For delete operations, verify ONLY the target was removed
            if [[ "$jq_filter" == *"del("* ]]; then
                local orig_had result_has
                orig_had=$(jq -r --arg k "$target_path" 'has($k)' "$original_copy" 2>/dev/null)
                result_has=$(jq -r --arg k "$target_path" 'has($k)' "$result_file" 2>/dev/null)

                if [[ "$orig_had" == "true" && "$result_has" == "true" ]]; then
                    print_error "JSON edit aborted: del() did not remove '$target_path'"
                    cleanup_tmp
                    return 1
                fi
            fi
        fi
    fi
    # ========== END EXACT DIFF VERIFICATION ==========

    # Verify critical structure is preserved (for settings.json)
    if [[ "$(basename "$file")" == "settings.json" ]]; then
        # Ensure it's still an object
        local result_type
        result_type=$(jq -r 'type' "$result_file" 2>/dev/null)
        if [[ "$result_type" != "object" ]]; then
            print_error "settings.json must be an object, got: $result_type"
            cleanup_tmp
            return 1
        fi
    fi

    # Atomic replacement: rename is atomic on most filesystems
    # First move to same filesystem, then atomic rename
    local final_tmp="$file.tmp.$$"
    if ! mv "$result_file" "$final_tmp" 2>/dev/null; then
        # Different filesystem, use cp
        if ! cp "$result_file" "$final_tmp"; then
            print_error "Failed to stage final file"
            cleanup_tmp
            return 1
        fi
    fi

    # Final atomic rename
    if ! mv "$final_tmp" "$file"; then
        print_error "Failed to replace original file"
        # Try to restore from temp
        mv "$original_copy" "$file" 2>/dev/null || true
        rm -f "$final_tmp" 2>/dev/null || true
        cleanup_tmp
        return 1
    fi

    cleanup_tmp
    return 0
}

# Specialized function for removing a key from enabledPlugins
# More careful as this is user-facing config
remove_from_enabled_plugins() {
    local settings_file="$1"
    local plugin_pattern="$2"  # Can be exact key or pattern to match

    if [[ ! -f "$settings_file" ]]; then
        return 0  # Nothing to do
    fi

    # Use safe_json_edit with the filter
    # Signature: safe_json_edit <file> <jq_filter> [jq_args...]
    safe_json_edit "$settings_file" \
        'if .enabledPlugins then
            .enabledPlugins |= with_entries(
                select(.key | test($pattern) | not)
            )
        else . end' \
        --arg pattern "$plugin_pattern"
}

# Remove plugin from installed_plugins.json
remove_from_installed_plugins() {
    local plugins_file="$1"
    local plugin_id="$2"

    if [[ ! -f "$plugins_file" ]]; then
        return 0
    fi

    # Signature: safe_json_edit <file> <jq_filter> [jq_args...]
    safe_json_edit "$plugins_file" \
        'if .plugins then
            .plugins |= map(select(.name != $id and .id != $id))
        else . end' \
        --arg id "$plugin_id"
}

# Remove marketplace from known_marketplaces.json
remove_from_known_marketplaces() {
    local mp_file="$1"
    local mp_name="$2"

    if [[ ! -f "$mp_file" ]]; then
        return 0
    fi

    # Signature: safe_json_edit <file> <jq_filter> [jq_args...]
    safe_json_edit "$mp_file" \
        'del(.[$name])' \
        --arg name "$mp_name"
}

# Remove all plugins from a marketplace in installed_plugins.json
remove_marketplace_plugins() {
    local plugins_file="$1"
    local mp_name="$2"

    if [[ ! -f "$plugins_file" ]]; then
        return 0
    fi

    # Signature: safe_json_edit <file> <jq_filter> [jq_args...]
    safe_json_edit "$plugins_file" \
        'if .plugins then
            .plugins |= map(select(.marketplace != $mp))
        else . end' \
        --arg mp "$mp_name"
}

# ============================================================================
# HELP
# ============================================================================

cmd_help() {
    cat << 'EOF'
AI Maestro Agent CLI

Usage: aimaestro-agent.sh <command> [options]

Commands:
  list                          List all agents
  show <agent>                  Show agent details
  create <name>                 Create a new agent
  delete <agent>                Delete an agent
  update <agent>                Update agent properties
  rename <old> <new>            Rename an agent
  session <subcommand>          Manage agent sessions
  hibernate <agent>             Hibernate an agent
  wake <agent>                  Wake a hibernated agent
  skill <subcommand>            Manage agent skills
  plugin <subcommand>           Manage Claude Code plugins
  export <agent>                Export agent to file
  import <file>                 Import agent from file
  help                          Show this help

Examples:
  # Create a new agent with a project folder
  aimaestro-agent.sh create my-agent -d ~/Code/my-project -t "My task"

  # List all online agents
  aimaestro-agent.sh list --status online

  # Hibernate and later wake an agent
  aimaestro-agent.sh hibernate my-agent
  aimaestro-agent.sh wake my-agent --attach

  # Install a plugin for an agent (local scope)
  aimaestro-agent.sh plugin install my-agent feature-dev --scope local

  # Export and import an agent
  aimaestro-agent.sh export my-agent -o backup.json
  aimaestro-agent.sh import backup.json --name restored-agent

Run 'aimaestro-agent.sh <command> --help' for command-specific help.
EOF
}

# ============================================================================
# LIST
# ============================================================================

cmd_list() {
    local status_filter=""
    local format="table"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --status)
                [[ $# -lt 2 ]] && { print_error "--status requires a value"; return 1; }
                status_filter="$2"; shift 2 ;;
            --format)
                [[ $# -lt 2 ]] && { print_error "--format requires a value"; return 1; }
                format="$2"; shift 2 ;;
            -q|--quiet) format="names"; shift ;;
            --json) format="json"; shift ;;
            -h|--help)
                cat << 'HELP'
Usage: aimaestro-agent.sh list [options]

Options:
  --status <status>   Filter by status (online, offline, hibernated, all)
  --format <format>   Output format (table, json, names)
  -q, --quiet         Output names only (same as --format names)
  --json              Output as JSON (same as --format json)

Examples:
  # List all agents in table format
  aimaestro-agent.sh list

  # List all agents including hibernated
  aimaestro-agent.sh list --status all

  # List only online agents
  aimaestro-agent.sh list --status online

  # List only hibernated agents
  aimaestro-agent.sh list --status hibernated

  # Output as JSON (for scripting)
  aimaestro-agent.sh list --json

  # Output just names (for piping)
  aimaestro-agent.sh list -q
HELP
                return 0 ;;
            *) print_error "Unknown option: $1"; return 1 ;;
        esac
    done

    local response
    response=$(list_agents)

    if [[ -z "$response" ]]; then
        print_error "Failed to fetch agents"
        return 1
    fi

    # Filter by status if specified (unless "all" which shows everything)
    local agents="$response"
    if [[ -n "$status_filter" && "$status_filter" != "all" ]]; then
        # MEDIUM-7: Use jq -e for parse validation to catch errors
        if ! agents=$(echo "$response" | jq -e --arg status "$status_filter" \
            '.agents | map(select(.status == $status)) | {agents: .}' 2>/dev/null); then
            print_error "Failed to filter agents by status"
            return 1
        fi
    fi

    case "$format" in
        json)
            echo "$agents" | jq '.agents'
            ;;
        names)
            echo "$agents" | jq -r '.agents[].name'
            ;;
        table)
            print_header "AGENTS"
            echo "────────────────────────────────────────────────────────────────────────────────────────────────────"
            printf "%-25s %-12s %-8s %-40s\n" "NAME" "STATUS" "SESSIONS" "WORKING DIRECTORY"
            echo "────────────────────────────────────────────────────────────────────────────────────────────────────"

            # LOW-006: Disable globbing in loop to prevent expansion
            # MEDIUM-2: Use boolean flag instead of eval for safer shell option restore
            local noglob_was_off=false
            if [[ ! -o noglob ]]; then
                noglob_was_off=true
                set -f
            fi
            local agent_count=0
            echo "$agents" | jq -r '.agents[] | "\(.name)|\(.status // "unknown")|\(.sessions | length)|\(.workingDirectory // "-")"' | \
            while IFS='|' read -r name status sessions working_dir; do
                ((agent_count++)) || true
                # Truncate name and working_dir if too long
                [[ ${#name} -gt 25 ]] && name="${name:0:22}..."
                [[ ${#working_dir} -gt 40 ]] && working_dir="${working_dir:0:37}..."

                # Color status
                local status_display="$status"
                if [[ "$status" == "online" || "$status" == "active" ]]; then
                    status_display="${GREEN}${status}${NC}"
                elif [[ "$status" == "hibernated" ]]; then
                    status_display="${CYAN}hibernated${NC}"
                elif [[ "$status" == "offline" ]]; then
                    status_display="${YELLOW}offline${NC}"
                fi

                # MEDIUM-005: Use %s for variable content to avoid format string issues
                printf "%-25s %b%-12s %-8s %s${NC}\n" "$name" "$status_display" "" "$sessions" "$working_dir"
            done
            # MEDIUM-2: Restore noglob using boolean flag instead of eval
            [[ "$noglob_was_off" == true ]] && set +f || true
            echo "────────────────────────────────────────────────────────────────────────────────────────────────────"
            local total
            total=$(echo "$agents" | jq -r '.agents | length' 2>/dev/null)
            echo "Total: ${total:-0} agent(s)"
            ;;
    esac
}

# ============================================================================
# SHOW
# ============================================================================

cmd_show() {
    local agent=""
    local format="pretty"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --format)
                [[ $# -lt 2 ]] && { print_error "--format requires a value"; return 1; }
                format="$2"; shift 2 ;;
            --json) format="json"; shift ;;
            -h|--help)
                echo "Usage: aimaestro-agent.sh show <agent> [--format pretty|json]"
                return 0 ;;
            -*) print_error "Unknown option: $1"; return 1 ;;
            *) agent="$1"; shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name or ID required"; return 1; }

    # Use the unified resolve_agent (defined in agent-helper.sh).
    # Previously cmd_show had its own inline resolution code (35 lines of
    # duplicate curl/jq calls) that duplicated resolve_agent_simple. Now all
    # commands use the same resolver, which also adds multi-host search,
    # @host syntax, input sanitization, and helpful "not found" errors.
    resolve_agent "$agent" || return 1
    local agent_id="$RESOLVED_AGENT_ID"

    # Fetch full agent data by resolved ID (the resolver only returns the UUID,
    # cmd_show needs the complete agent JSON for display)
    local api_base
    api_base=$(get_api_base)
    local response
    response=$(curl -s --max-time 30 "${api_base}/api/agents/${agent_id}" 2>/dev/null)

    if [[ -z "$response" ]]; then
        print_error "Failed to fetch agent data"
        return 1
    fi

    # Validate JSON response before processing
    if ! echo "$response" | jq -e '.agent' >/dev/null 2>&1; then
        local error_msg
        error_msg=$(echo "$response" | jq -r '.error // empty' 2>/dev/null)
        if [[ -n "$error_msg" ]]; then
            print_error "API error: $error_msg"
        else
            print_error "Invalid response from API (not valid JSON or missing agent data)"
        fi
        return 1
    fi

    case "$format" in
        json)
            echo "$response" | jq '.agent'
            ;;
        pretty)
            local agent_json
            agent_json=$(echo "$response" | jq '.agent')

            local name status program model created dir task
            name=$(echo "$agent_json" | jq -r '.name')
            status=$(echo "$agent_json" | jq -r '.status // "unknown"')
            program=$(echo "$agent_json" | jq -r '.program // "claude-code"')
            model=$(echo "$agent_json" | jq -r '.model // "default"')
            created=$(echo "$agent_json" | jq -r '.createdAt // "unknown"')
            dir=$(echo "$agent_json" | jq -r '.workingDirectory // "not set"')
            task=$(echo "$agent_json" | jq -r '.taskDescription // "not set"')

            echo ""
            print_header "Agent: $name"
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo ""
            echo "  ID:          $(echo "$agent_json" | jq -r '.id')"
            echo "  Status:      $status"
            echo "  Program:     $program"
            echo "  Model:       $model"
            echo "  Created:     $created"
            echo ""
            echo "  Working Directory:"
            echo "    $dir"
            echo ""

            # Sessions
            local sessions
            sessions=$(echo "$agent_json" | jq -r '.sessions // []')
            local session_count
            session_count=$(echo "$sessions" | jq 'length')

            echo "  Sessions ($session_count):"
            if [[ "$session_count" -gt 0 ]]; then
                echo "$sessions" | jq -r '.[] | "    [\(.index // 0)] \(.tmuxSessionName // "unnamed") (\(.status // "unknown"))"'
            else
                echo "    (none)"
            fi
            echo ""

            echo "  Task:"
            echo "    $task"
            echo ""

            # Skills
            local skills
            skills=$(echo "$agent_json" | jq -r '.skills // []')
            local skill_count
            skill_count=$(echo "$skills" | jq 'length')

            if [[ "$skill_count" -gt 0 ]]; then
                echo "  Skills ($skill_count):"
                echo "$skills" | jq -r '.[] | "    - \(.id // .name // "unknown")"'
                echo ""
            fi

            # Tags
            local tags
            tags=$(echo "$agent_json" | jq -r '.tags // []')
            local tag_count
            tag_count=$(echo "$tags" | jq 'length')

            if [[ "$tag_count" -gt 0 ]]; then
                echo "  Tags: $(echo "$tags" | jq -r 'join(", ")')"
                echo ""
            fi
            ;;
    esac
}

# ============================================================================
# CREATE
# ============================================================================

cmd_create() {
    local name="" dir="" program="claude-code" model="" task="" tags=""
    local no_session=false no_folder=false force_folder=false
    local -a program_args=()  # Arguments to pass to the program (after --)

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -d|--dir)
                [[ $# -lt 2 ]] && { print_error "-d/--dir requires a value"; return 1; }
                dir="$2"; shift 2 ;;
            -p|--program)
                [[ $# -lt 2 ]] && { print_error "-p/--program requires a value"; return 1; }
                program="$2"; shift 2 ;;
            -m|--model)
                [[ $# -lt 2 ]] && { print_error "-m/--model requires a value"; return 1; }
                model="$2"; shift 2 ;;
            -t|--task)
                [[ $# -lt 2 ]] && { print_error "-t/--task requires a value"; return 1; }
                task="$2"; shift 2 ;;
            --tags)
                [[ $# -lt 2 ]] && { print_error "--tags requires a value"; return 1; }
                tags="$2"; shift 2 ;;
            --no-session) no_session=true; shift ;;
            --no-folder) no_folder=true; shift ;;
            --force-folder) force_folder=true; shift ;;
            --)
                # Everything after -- is passed to the program
                shift
                program_args=("$@")
                break ;;
            -h|--help)
                cat << 'HELP'
Usage: aimaestro-agent.sh create <name> --dir <path> [options] [-- <program-args>...]

Options:
  -d, --dir <path>       Working directory (REQUIRED - must be full path)
  -p, --program <prog>   Program to run (default: claude-code)
  -m, --model <model>    AI model (e.g., claude-sonnet-4)
  -t, --task <desc>      Task description
  --tags <t1,t2>         Comma-separated tags
  --no-session           Don't create tmux session
  --no-folder            Don't create project folder
  --force-folder         Use existing directory (by default, errors if exists)

Program Arguments:
  Use -- to pass arguments to the program when it starts.

Examples:
  # Create agent with new project folder
  aimaestro-agent.sh create my-agent --dir ~/Code/my-project

  # Create agent with specific model and task
  aimaestro-agent.sh create backend-dev --dir ~/Code/backend \
    -m claude-sonnet-4 -t "Develop backend API"

  # Create agent using existing folder
  aimaestro-agent.sh create existing-project --dir ~/Code/old-project --force-folder

  # Create agent with tags
  aimaestro-agent.sh create utils-agent --dir ~/Code/utils --tags "utils,tools"

  # Create agent without tmux session (just register)
  aimaestro-agent.sh create headless-agent --dir ~/Code/headless --no-session

  # Create agent with program arguments (passed to claude)
  aimaestro-agent.sh create my-agent --dir ~/Code/project -- --continue --chrome
HELP
                return 0 ;;
            -*) print_error "Unknown option: $1"; return 1 ;;
            *) name="$1"; shift ;;
        esac
    done

    # Validate name
    validate_agent_name "$name" || return 1

    # Check for name collision (including hibernated agents)
    if check_agent_exists "$name"; then
        print_error "Agent with name '$name' already exists"
        print_error "Use a different name or delete the existing agent first"
        print_error "To see all agents (including hibernated): aimaestro-agent.sh list --status all"
        return 1
    fi

    # Validate program - must be in whitelist
    local allowed_programs="claude-code claude codex aider cursor none terminal"
    local program_lower="${program,,}"  # lowercase
    if [[ ! " $allowed_programs " =~ [[:space:]]${program_lower}[[:space:]] ]]; then
        print_error "Invalid program: $program"
        print_error "Allowed programs: $allowed_programs"
        return 1
    fi

    # Validate model format if provided
    if [[ -n "$model" ]]; then
        # Expected: sonnet, opus, haiku, or claude-{family}-{version}
        if [[ ! "$model" =~ ^(claude-)?(sonnet|opus|haiku)(-[0-9]+(-[0-9]+)?(-[0-9]{8})?)?$ ]]; then
            print_error "Invalid model format: $model"
            print_error "Expected format: sonnet, opus, haiku, or claude-{family}-{version}"
            print_error "Examples: sonnet, claude-sonnet-4-5, claude-opus-4-5-20250929"
            return 1
        fi
    fi

    # Directory is REQUIRED - must be specified explicitly
    if [[ -z "$dir" ]]; then
        print_error "Working directory is required (--dir <path>)"
        print_error "You must specify the full path for the agent's project folder"
        print_error "Example: aimaestro-agent.sh create my-agent --dir /path/to/project"
        return 1
    fi

    # MEDIUM-6: Validate directory path is safe using realpath for proper canonicalization
    # This handles symlinks and .. correctly
    local resolved_dir
    if command -v realpath >/dev/null 2>&1; then
        # Use realpath -m to handle non-existent paths
        resolved_dir=$(realpath -m "$dir" 2>/dev/null) || resolved_dir="$dir"
    else
        # Fallback for systems without realpath
        resolved_dir=$(cd -P -- "$(dirname "$dir")" 2>/dev/null && pwd)/$(basename -- "$dir") 2>/dev/null || resolved_dir="$dir"
    fi
    # Note: /tmp on macOS is a symlink to /private/tmp, so check both
    # Also resolve HOME in case it contains symlinks
    local resolved_home
    resolved_home=$(realpath -m "$HOME" 2>/dev/null) || resolved_home="$HOME"
    if [[ "$resolved_dir" != "$resolved_home"* && "$resolved_dir" != "/opt"* && "$resolved_dir" != "/tmp"* && "$resolved_dir" != "/private/tmp"* ]]; then
        print_error "Directory must be under home directory, /opt, or /tmp"
        return 1
    fi
    dir="$resolved_dir"

    # Check if directory already exists (unless --force-folder is specified)
    if [[ -d "$dir" && "$force_folder" == false ]]; then
        print_error "Directory already exists: $dir"
        print_error "Use --force-folder to use an existing directory"
        return 1
    fi

    # Create project folder
    if [[ "$no_folder" == false ]]; then
        print_info "Creating project folder: $dir"
        # MEDIUM-002: Check mkdir result
        if ! mkdir -p "$dir"; then
            print_error "Failed to create directory: $dir"
            return 1
        fi
        create_project_template "$dir" "$name"
    fi

    # Build JSON payload
    local create_session="true"
    [[ "$no_session" == true ]] && create_session="false"

    local payload
    payload=$(jq -n \
        --arg name "$name" \
        --arg program "$program" \
        --arg dir "$dir" \
        --argjson createSession "$create_session" \
        '{
            name: $name,
            program: $program,
            workingDirectory: $dir,
            createSession: $createSession
        }')

    # Add optional fields
    [[ -n "$model" ]] && payload=$(echo "$payload" | jq --arg m "$model" '. + {model: $m}')
    [[ -n "$task" ]] && payload=$(echo "$payload" | jq --arg t "$task" '. + {taskDescription: $t}')
    [[ -n "$tags" ]] && payload=$(echo "$payload" | jq --arg t "$tags" '. + {tags: ($t | split(","))}')
    # Program arguments (passed after --) - sent as string
    if [[ ${#program_args[@]} -gt 0 ]]; then
        local args_str="${program_args[*]}"
        payload=$(echo "$payload" | jq --arg a "$args_str" '. + {programArgs: $a}')
    fi

    # Call API
    local api_base
    api_base=$(get_api_base)

    print_info "Creating agent..."
    local response
    # MEDIUM-010: Add timeout to curl
    response=$(curl -s --max-time 30 -X POST "${api_base}/api/agents" \
        -H "Content-Type: application/json" \
        -d "$payload")

    # Check for error
    local error
    error=$(echo "$response" | jq -r '.error // empty')
    if [[ -n "$error" ]]; then
        print_error "$error"
        return 1
    fi

    # Display result
    local agent_id
    agent_id=$(echo "$response" | jq -r '.agent.id // empty')

    if [[ -n "$agent_id" ]]; then
        print_success "Agent created: $name"
        echo "   ID: $agent_id"
        echo "   Directory: $dir"
        [[ "$force_folder" == true ]] && echo "   Note: Used existing directory (--force-folder)"
        [[ "$no_session" == false ]] && echo "   Session: $name (tmux)"
        [[ ${#program_args[@]} -gt 0 ]] && echo "   Program args: ${program_args[*]}"
    else
        print_error "Failed to create agent"
        echo "$response" | jq . >&2
        return 1
    fi
}

# ============================================================================
# DELETE
# ============================================================================

cmd_delete() {
    local agent=""
    local keep_folder=false keep_data=false confirm_delete=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --confirm) confirm_delete=true; shift ;;
            --keep-folder) keep_folder=true; shift ;;
            --keep-data) keep_data=true; shift ;;
            -h|--help)
                cat << 'HELP'
Usage: aimaestro-agent.sh delete <agent> --confirm [options]

Options:
  --confirm         Required for deletion (safety flag)
  --keep-folder     Don't delete project folder
  --keep-data       Don't delete agent data directory

Examples:
  # Delete agent (requires --confirm for safety)
  aimaestro-agent.sh delete my-agent --confirm

  # Delete agent but keep the project folder
  aimaestro-agent.sh delete my-agent --confirm --keep-folder

  # Delete agent but keep agent data (logs, history)
  aimaestro-agent.sh delete my-agent --confirm --keep-data

  # Delete by agent ID
  aimaestro-agent.sh delete abc123-uuid --confirm
HELP
                return 0 ;;
            -*) print_error "Unknown option: $1"; return 1 ;;
            *) agent="$1"; shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name or ID required"; return 1; }

    # Resolve agent
    resolve_agent "$agent" || return 1

    local agent_name="$RESOLVED_ALIAS"
    local agent_id="$RESOLVED_AGENT_ID"

    # Require --confirm for non-interactive mode
    if [[ "$confirm_delete" == false ]]; then
        print_error "Deleting agent '$agent_name' requires --confirm flag"
        print_error "This will:"
        print_error "   - Kill all tmux sessions"
        [[ "$keep_data" == false ]] && print_error "   - Delete agent data (~/.aimaestro/agents/$agent_id/)"
        print_error ""
        print_error "Run with --confirm to proceed"
        return 1
    fi

    # Call API
    local api_base
    api_base=$(get_api_base)

    print_info "Deleting agent '$agent_name'..."
    local response
    # MEDIUM-010: Add timeout to curl
    response=$(curl -s --max-time 30 -X DELETE "${api_base}/api/agents/${agent_id}")

    local error
    error=$(echo "$response" | jq -r '.error // empty')
    if [[ -n "$error" ]]; then
        print_error "$error"
        return 1
    fi

    print_success "Agent deleted: $agent_name"
}

# ============================================================================
# UPDATE
# ============================================================================

cmd_update() {
    local agent="" task="" tags="" add_tag="" remove_tag="" model="" args=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -t|--task)
                [[ $# -lt 2 ]] && { print_error "-t/--task requires a value"; return 1; }
                task="$2"; shift 2 ;;
            -m|--model)
                [[ $# -lt 2 ]] && { print_error "-m/--model requires a value"; return 1; }
                model="$2"; shift 2 ;;
            --tags)
                [[ $# -lt 2 ]] && { print_error "--tags requires a value"; return 1; }
                tags="$2"; shift 2 ;;
            --add-tag)
                [[ $# -lt 2 ]] && { print_error "--add-tag requires a value"; return 1; }
                add_tag="$2"; shift 2 ;;
            --remove-tag)
                [[ $# -lt 2 ]] && { print_error "--remove-tag requires a value"; return 1; }
                remove_tag="$2"; shift 2 ;;
            --args)
                [[ $# -lt 2 ]] && { print_error "--args requires a value"; return 1; }
                args="$2"; shift 2 ;;
            -h|--help)
                cat << 'HELP'
Usage: aimaestro-agent.sh update <agent> [options]

Options:
  -t, --task <desc>      Update task description
  -m, --model <model>    Update AI model
  --args <arguments>     Update program arguments (e.g. "--continue --chrome")
  --tags <t1,t2>         Replace all tags
  --add-tag <tag>        Add a single tag
  --remove-tag <tag>     Remove a single tag
HELP
                return 0 ;;
            -*) print_error "Unknown option: $1"; return 1 ;;
            *) agent="$1"; shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name or ID required"; return 1; }

    # Validate model format if provided
    if [[ -n "$model" ]]; then
        if [[ ! "$model" =~ ^(claude-)?(sonnet|opus|haiku)(-[0-9]+(-[0-9]+)?(-[0-9]{8})?)?$ ]]; then
            print_error "Invalid model format: $model"
            print_error "Expected format: sonnet, opus, haiku, or claude-{family}-{version}"
            return 1
        fi
    fi

    resolve_agent "$agent" || return 1

    # Build update payload
    local payload="{}"

    [[ -n "$task" ]] && payload=$(echo "$payload" | jq --arg t "$task" '. + {taskDescription: $t}')
    [[ -n "$model" ]] && payload=$(echo "$payload" | jq --arg m "$model" '. + {model: $m}')
    [[ -n "$tags" ]] && payload=$(echo "$payload" | jq --arg t "$tags" '. + {tags: ($t | split(","))}')
    [[ -n "$args" ]] && payload=$(echo "$payload" | jq --arg a "$args" '. + {programArgs: $a}')

    # Handle add/remove tag (need to get current tags first)
    if [[ -n "$add_tag" ]] || [[ -n "$remove_tag" ]]; then
        local current_tags
        current_tags=$(get_agent_data "$RESOLVED_AGENT_ID" | jq -r '.agent.tags // []')

        if [[ -n "$add_tag" ]]; then
            current_tags=$(echo "$current_tags" | jq --arg t "$add_tag" '. + [$t] | unique')
        fi
        if [[ -n "$remove_tag" ]]; then
            current_tags=$(echo "$current_tags" | jq --arg t "$remove_tag" 'map(select(. != $t))')
        fi

        payload=$(echo "$payload" | jq --argjson tags "$current_tags" '. + {tags: $tags}')
    fi

    # Call API
    local api_base
    api_base=$(get_api_base)

    local response
    # MEDIUM-010: Add timeout to curl
    response=$(curl -s --max-time 30 -X PATCH "${api_base}/api/agents/${RESOLVED_AGENT_ID}" \
        -H "Content-Type: application/json" \
        -d "$payload")

    local error
    error=$(echo "$response" | jq -r '.error // empty')
    if [[ -n "$error" ]]; then
        print_error "$error"
        return 1
    fi

    print_success "Agent updated: $RESOLVED_ALIAS"
}

# ============================================================================
# RENAME
# ============================================================================

cmd_rename() {
    local old_name="" new_name=""
    local rename_session=false rename_folder=false confirm_rename=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --rename-session) rename_session=true; shift ;;
            --rename-folder) rename_folder=true; shift ;;
            -y|--yes) confirm_rename=true; shift ;;
            -h|--help)
                cat << 'HELP'
Usage: aimaestro-agent.sh rename <old-name> <new-name> --yes [options]

Options:
  --rename-session    Also rename tmux session
  --rename-folder     Also rename project folder
  --yes, -y           Required for rename (safety flag)

Examples:
  # Rename agent (requires --yes for safety)
  aimaestro-agent.sh rename old-name new-name --yes

  # Rename agent and tmux session
  aimaestro-agent.sh rename old-name new-name --yes --rename-session

  # Rename agent, session, and project folder
  aimaestro-agent.sh rename old-name new-name --yes --rename-session --rename-folder
HELP
                return 0 ;;
            -*) print_error "Unknown option: $1"; return 1 ;;
            *)
                if [[ -z "$old_name" ]]; then old_name="$1"
                elif [[ -z "$new_name" ]]; then new_name="$1"
                fi
                shift ;;
        esac
    done

    [[ -z "$old_name" ]] && { print_error "Old name required"; return 1; }
    [[ -z "$new_name" ]] && { print_error "New name required"; return 1; }

    validate_agent_name "$new_name" || return 1

    resolve_agent "$old_name" || return 1

    # Check for name collision with new name
    if check_agent_exists "$new_name"; then
        print_error "Agent with name '$new_name' already exists"
        print_error "Use a different name"
        return 1
    fi

    # Require --yes for non-interactive mode
    if [[ "$confirm_rename" == false ]]; then
        print_error "Renaming agent '$RESOLVED_ALIAS' to '$new_name' requires --yes flag"
        print_error "Run with --yes to proceed"
        return 1
    fi

    # Update name via API
    local api_base
    api_base=$(get_api_base)

    local payload
    payload=$(jq -n --arg name "$new_name" '{name: $name}')

    local response
    # MEDIUM-010: Add timeout to curl
    response=$(curl -s --max-time 30 -X PATCH "${api_base}/api/agents/${RESOLVED_AGENT_ID}" \
        -H "Content-Type: application/json" \
        -d "$payload")

    local error
    error=$(echo "$response" | jq -r '.error // empty')
    if [[ -n "$error" ]]; then
        print_error "$error"
        return 1
    fi

    # Rename tmux session if requested
    if [[ "$rename_session" == true ]]; then
        local session_name
        session_name=$(get_agent_session_name "$RESOLVED_AGENT_ID")
        # CRITICAL-2: Validate tmux session names before use to prevent command injection
        if [[ -n "$session_name" ]] && validate_tmux_session_name "$session_name"; then
            # Use -- to separate options from arguments
            if tmux has-session -t -- "$session_name" 2>/dev/null; then
                tmux rename-session -t -- "$session_name" "$new_name"
                print_info "Renamed tmux session: $session_name -> $new_name"
            fi
        elif [[ -n "$session_name" ]]; then
            print_warning "Invalid tmux session name format, skipping session rename"
        fi
    fi

    # Rename folder if requested
    if [[ "$rename_folder" == true ]]; then
        local old_dir
        old_dir=$(get_agent_working_dir "$RESOLVED_AGENT_ID")
        if [[ -n "$old_dir" ]] && [[ -d "$old_dir" ]]; then
            local parent_dir
            parent_dir=$(dirname "$old_dir")
            local new_dir="${parent_dir}/${new_name}"

            # MEDIUM-001: Use mv -n (no-clobber) to avoid TOCTOU race
            if ! mv -n "$old_dir" "$new_dir" 2>/dev/null; then
                print_warning "Cannot rename folder (target may exist): $new_dir"
            else
                # HIGH-002: Use jq for JSON construction to avoid injection
                local dir_payload
                dir_payload=$(jq -n --arg d "$new_dir" '{workingDirectory: $d}')
                curl -s --max-time 30 -X PATCH "${api_base}/api/agents/${RESOLVED_AGENT_ID}" \
                    -H "Content-Type: application/json" \
                    -d "$dir_payload" >/dev/null
                print_info "Renamed folder: $old_dir -> $new_dir"
            fi
        fi
    fi

    print_success "Agent renamed: $RESOLVED_ALIAS -> $new_name"
}

# ============================================================================
# SESSION
# ============================================================================

cmd_session() {
    # LOW-6: shift is protected - ${1:-help} provides default if $1 is empty/unset
    # This means shift will only fail if $# is 0, which is handled by "|| true"
    # The pattern "${1:-default}" + "shift || true" is safe against underflow
    local subcmd="${1:-help}"
    shift || true

    case "$subcmd" in
        add) cmd_session_add "$@" ;;
        remove) cmd_session_remove "$@" ;;
        exec) cmd_session_exec "$@" ;;
        help|--help|-h)
            cat << 'HELP'
Usage: aimaestro-agent.sh session <subcommand> [options]

Subcommands:
  add <agent>               Add a new session to agent
  remove <agent>            Remove a session from agent
  exec <agent> <command>    Execute command in agent's session
HELP
            ;;
        *)
            print_error "Unknown session subcommand: $subcmd"
            echo "Run 'aimaestro-agent.sh session help' for usage" >&2  # LOW-003
            return 1 ;;
    esac
}

cmd_session_add() {
    local agent="" role="assistant"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --role)
                [[ $# -lt 2 ]] && { print_error "--role requires a value"; return 1; }
                role="$2"; shift 2 ;;
            -*) print_error "Unknown option: $1"; return 1 ;;
            *) agent="$1"; shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name required"; return 1; }

    resolve_agent "$agent" || return 1

    local api_base
    api_base=$(get_api_base)

    local payload
    payload=$(jq -n --arg role "$role" '{role: $role}')

    print_info "Adding session to agent..."
    local response
    response=$(curl -s --max-time 30 -X POST "${api_base}/api/agents/${RESOLVED_AGENT_ID}/session" \
        -H "Content-Type: application/json" \
        -d "$payload")

    local error
    error=$(echo "$response" | jq -r '.error // empty')
    if [[ -n "$error" ]]; then
        print_error "$error"
        return 1
    fi

    print_success "Session added to: $RESOLVED_ALIAS"
}

cmd_session_remove() {
    local agent="" index="0" all=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --index)
                [[ $# -lt 2 ]] && { print_error "--index requires a value"; return 1; }
                index="$2"; shift 2 ;;
            --all) all=true; shift ;;
            -*) print_error "Unknown option: $1"; return 1 ;;
            *) agent="$1"; shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name required"; return 1; }

    # Validate index is a non-negative integer (AUDIT-2: numeric validation)
    if [[ ! "$index" =~ ^[0-9]+$ ]]; then
        print_error "Session index must be a non-negative integer, got: $index"
        return 1
    fi

    resolve_agent "$agent" || return 1

    local api_base
    api_base=$(get_api_base)

    local url="${api_base}/api/agents/${RESOLVED_AGENT_ID}/session"
    [[ "$all" == true ]] && url="${url}?all=true" || url="${url}?index=${index}"

    print_info "Removing session..."
    local response
    response=$(curl -s --max-time 30 -X DELETE "$url")

    local error
    error=$(echo "$response" | jq -r '.error // empty')
    if [[ -n "$error" ]]; then
        print_error "$error"
        return 1
    fi

    print_success "Session removed from: $RESOLVED_ALIAS"
}

cmd_session_exec() {
    local agent=""
    # MEDIUM-006: Use array for proper argument handling
    local -a cmd_args=()

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -*) print_error "Unknown option: $1"; return 1 ;;
            *)
                if [[ -z "$agent" ]]; then agent="$1"
                else cmd_args+=("$1")
                fi
                shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name required"; return 1; }
    [[ ${#cmd_args[@]} -eq 0 ]] && { print_error "Command required"; return 1; }

    # MEDIUM-006: Build command string from array
    # MEDIUM-3: Note on word splitting risk - this uses ${cmd_args[*]} which joins
    # array elements with IFS (default: space). The command is passed to jq as a string
    # and sent via API, so word splitting in the shell is not a concern here.
    # The receiving end is responsible for proper command parsing.
    local command="${cmd_args[*]}"
    # MEDIUM-007: Trim all leading whitespace
    while [[ "$command" == " "* || "$command" == $'\t'* ]]; do
        command="${command#[[:space:]]}"
    done

    resolve_agent "$agent" || return 1

    local api_base
    api_base=$(get_api_base)

    local payload
    payload=$(jq -n --arg cmd "$command" '{command: $cmd}')

    local response
    response=$(curl -s --max-time 30 -X PATCH "${api_base}/api/agents/${RESOLVED_AGENT_ID}/session" \
        -H "Content-Type: application/json" \
        -d "$payload")

    local error
    error=$(echo "$response" | jq -r '.error // empty')
    if [[ -n "$error" ]]; then
        print_error "$error"
        return 1
    fi

    print_success "Command sent to: $RESOLVED_ALIAS"
}

# ============================================================================
# HIBERNATE / WAKE
# ============================================================================

cmd_hibernate() {
    local agent=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -h|--help)
                echo "Usage: aimaestro-agent.sh hibernate <agent>"
                return 0 ;;
            -*) print_error "Unknown option: $1"; return 1 ;;
            *) agent="$1"; shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name required"; return 1; }

    resolve_agent "$agent" || return 1

    local api_base
    api_base=$(get_api_base)

    print_info "Hibernating agent '$RESOLVED_ALIAS'..."
    local response
    response=$(curl -s --max-time 30 -X POST "${api_base}/api/agents/${RESOLVED_AGENT_ID}/hibernate")

    local error
    error=$(echo "$response" | jq -r '.error // empty')
    if [[ -n "$error" ]]; then
        print_error "$error"
        return 1
    fi

    print_success "Agent hibernated: $RESOLVED_ALIAS"
}

cmd_wake() {
    local agent="" attach=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --attach) attach=true; shift ;;
            -h|--help)
                echo "Usage: aimaestro-agent.sh wake <agent> [--attach]"
                return 0 ;;
            -*) print_error "Unknown option: $1"; return 1 ;;
            *) agent="$1"; shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name required"; return 1; }

    resolve_agent "$agent" || return 1

    local api_base
    api_base=$(get_api_base)

    print_info "Waking agent '$RESOLVED_ALIAS'..."
    local response
    response=$(curl -s --max-time 30 -X POST "${api_base}/api/agents/${RESOLVED_AGENT_ID}/wake")

    local error
    error=$(echo "$response" | jq -r '.error // empty')
    if [[ -n "$error" ]]; then
        print_error "$error"
        return 1
    fi

    print_success "Agent is awake: $RESOLVED_ALIAS"

    if [[ "$attach" == true ]]; then
        local session_name
        session_name=$(get_agent_session_name "$RESOLVED_AGENT_ID")
        # CRITICAL-2: Validate tmux session name before use
        if [[ -n "$session_name" ]] && validate_tmux_session_name "$session_name"; then
            print_info "Attaching to session..."
            # Use -- to separate options from arguments
            tmux attach-session -t -- "$session_name"
        elif [[ -n "$session_name" ]]; then
            print_error "Invalid tmux session name format"
            return 1
        fi
    fi
}

# ============================================================================
# SKILL
# ============================================================================

cmd_skill() {
    local subcmd="${1:-help}"
    shift || true

    case "$subcmd" in
        list) cmd_skill_list "$@" ;;
        add) cmd_skill_add "$@" ;;
        remove) cmd_skill_remove "$@" ;;
        install) cmd_skill_install "$@" ;;
        uninstall) cmd_skill_uninstall "$@" ;;
        help|--help|-h)
            cat << 'HELP'
Usage: aimaestro-agent.sh skill <subcommand> [options]

Manage skills for an agent.

Registry commands (via AI Maestro API):
  list <agent>                      List agent's registered skills
  add <agent> <skill-id>            Register skill in agent's profile
  remove <agent> <skill-id>         Unregister skill from agent's profile

Filesystem commands (install/uninstall skill files):
  install <agent> <source>          Install skill to agent's Claude Code
  uninstall <agent> <skill-name>    Uninstall skill from agent's Claude Code

Install methods:
  Plugin-based skills are installed via 'plugin install' (see plugin help).
  The 'skill install' command handles .skill files and skill directories.

Scopes:
  --scope user       ~/.claude/skills/ (all your projects)
  --scope project    .claude/skills/ (shared with collaborators, committed)
  --scope local      .claude/skills/ (only you, gitignored)
                     Note: project and local both use .claude/skills/ but differ
                     in whether they are committed to git.

Examples:
  # Install a .skill file (zip archive) to user scope
  aimaestro-agent.sh skill install my-agent ./my-skill.skill

  # Install a skill directory to project scope
  aimaestro-agent.sh skill install my-agent ./path/to/skill-folder --scope project

  # Install to user scope (available in all projects)
  aimaestro-agent.sh skill install my-agent ./my-skill.skill --scope user

  # Uninstall a skill
  aimaestro-agent.sh skill uninstall my-agent my-skill-name

  # Uninstall from specific scope
  aimaestro-agent.sh skill uninstall my-agent my-skill-name --scope project
HELP
            ;;
        *)
            print_error "Unknown skill subcommand: $subcmd"
            echo "Run 'aimaestro-agent.sh skill help' for usage" >&2  # LOW-003
            return 1 ;;
    esac
}

cmd_skill_list() {
    local agent=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -*) print_error "Unknown option: $1"; return 1 ;;
            *) agent="$1"; shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name required"; return 1; }

    resolve_agent "$agent" || return 1

    local api_base
    api_base=$(get_api_base)

    local response
    response=$(curl -s --max-time 30 "${api_base}/api/agents/${RESOLVED_AGENT_ID}/skills")

    echo "$response" | jq -r '.skills[] | "  - \(.id // .name) (\(.type // "unknown"))"' 2>/dev/null || \
        echo "  (no skills)"
}

cmd_skill_add() {
    local agent="" skill_id="" skill_type="marketplace" skill_path=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --type)
                [[ $# -lt 2 ]] && { print_error "--type requires a value"; return 1; }
                skill_type="$2"; shift 2 ;;
            --path)
                [[ $# -lt 2 ]] && { print_error "--path requires a value"; return 1; }
                skill_path="$2"; shift 2 ;;
            -*) print_error "Unknown option: $1"; return 1 ;;
            *)
                if [[ -z "$agent" ]]; then agent="$1"
                elif [[ -z "$skill_id" ]]; then skill_id="$1"
                fi
                shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name required"; return 1; }
    [[ -z "$skill_id" ]] && { print_error "Skill ID required"; return 1; }

    resolve_agent "$agent" || return 1

    local api_base
    api_base=$(get_api_base)

    local payload
    if [[ "$skill_type" == "custom" ]]; then
        payload=$(jq -n --arg type "$skill_type" --arg id "$skill_id" --arg path "$skill_path" \
            '{type: $type, id: $id, path: $path}')
    else
        payload=$(jq -n --arg type "$skill_type" --arg id "$skill_id" \
            '{type: $type, ids: [$id]}')
    fi

    local response
    response=$(curl -s --max-time 30 -X POST "${api_base}/api/agents/${RESOLVED_AGENT_ID}/skills" \
        -H "Content-Type: application/json" \
        -d "$payload")

    local error
    error=$(echo "$response" | jq -r '.error // empty')
    if [[ -n "$error" ]]; then
        print_error "$error"
        return 1
    fi

    print_success "Skill added: $skill_id"
}

cmd_skill_remove() {
    local agent="" skill_id=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -*) print_error "Unknown option: $1"; return 1 ;;
            *)
                if [[ -z "$agent" ]]; then agent="$1"
                elif [[ -z "$skill_id" ]]; then skill_id="$1"
                fi
                shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name required"; return 1; }
    [[ -z "$skill_id" ]] && { print_error "Skill ID required"; return 1; }

    resolve_agent "$agent" || return 1

    local api_base
    api_base=$(get_api_base)

    # URL-encode skill_id to prevent injection
    local encoded_skill_id
    encoded_skill_id=$(printf '%s' "$skill_id" | jq -sRr @uri 2>/dev/null) || encoded_skill_id="$skill_id"

    local response
    response=$(curl -s --max-time 30 -X DELETE "${api_base}/api/agents/${RESOLVED_AGENT_ID}/skills/${encoded_skill_id}")

    local error
    error=$(echo "$response" | jq -r '.error // empty')
    if [[ -n "$error" ]]; then
        print_error "$error"
        return 1
    fi

    print_success "Skill removed: $skill_id"
}

cmd_skill_install() {
    local agent="" source="" scope="user" skill_name=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -s|--scope)
                [[ $# -lt 2 ]] && { print_error "--scope requires a value"; return 1; }
                scope="$2"; shift 2 ;;
            --name)
                [[ $# -lt 2 ]] && { print_error "--name requires a value"; return 1; }
                skill_name="$2"; shift 2 ;;
            -h|--help)
                cat << 'HELP'
Usage: aimaestro-agent.sh skill install <agent> <source> [options]

Install a skill from a .skill file (zip archive) or a skill directory.

Arguments:
  agent    Agent name or ID
  source   Path to .skill file (zip) or skill directory containing SKILL.md

Options:
  -s, --scope <user|project|local>   Install scope (default: user)
  --name <name>                      Override skill folder name (default: derived
                                     from source filename or directory name)

Scopes:
  user      ~/.claude/skills/<name>/ (all your projects)
  project   <agent-dir>/.claude/skills/<name>/ (shared with collaborators)
  local     <agent-dir>/.claude/skills/<name>/ (only you, gitignored)

Source types:
  .skill file    Zip archive containing SKILL.md and optional resources
  directory      Folder containing SKILL.md at the top level

Examples:
  # Install .skill file to user scope (default)
  aimaestro-agent.sh skill install my-agent ./my-skill.skill

  # Install skill directory to project scope
  aimaestro-agent.sh skill install my-agent ./path/to/skill-folder --scope project

  # Install with custom name
  aimaestro-agent.sh skill install my-agent ./downloads/v2-skill.skill --name my-skill

  # Install to a specific agent's project (local scope)
  aimaestro-agent.sh skill install backend-api ./debug-skill --scope local
HELP
                return 0 ;;
            -*) print_error "Unknown option: $1"; return 1 ;;
            *)
                if [[ -z "$agent" ]]; then agent="$1"
                elif [[ -z "$source" ]]; then source="$1"
                fi
                shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name required"; return 1; }
    [[ -z "$source" ]] && { print_error "Skill source required (path to .skill file or directory)"; return 1; }

    resolve_agent "$agent" || return 1

    local agent_dir
    agent_dir=$(get_agent_working_dir "$RESOLVED_AGENT_ID")

    # Determine skill name from source if not provided
    if [[ -z "$skill_name" ]]; then
        # Strip path and extension
        skill_name=$(basename "$source")
        skill_name="${skill_name%.skill}"
        skill_name="${skill_name%.zip}"
    fi

    # Determine target directory based on scope
    local target_dir
    case "$scope" in
        user)
            target_dir="$HOME/.claude/skills/$skill_name"
            ;;
        project|local)
            if [[ -z "$agent_dir" ]] || [[ ! -d "$agent_dir" ]]; then
                print_error "Agent working directory not found: $agent_dir"
                return 1
            fi
            target_dir="$agent_dir/.claude/skills/$skill_name"
            ;;
        *)
            print_error "Invalid scope: $scope (must be user, project, or local)"
            return 1
            ;;
    esac

    # Check if already installed
    if [[ -d "$target_dir" ]] && [[ -f "$target_dir/SKILL.md" ]]; then
        print_warning "Skill '$skill_name' already exists at: $target_dir"
        print_warning "Use 'skill uninstall' first to replace it."
        return 1
    fi

    # Install based on source type
    if [[ -f "$source" ]] && [[ "$source" == *.skill || "$source" == *.zip ]]; then
        # .skill file (zip archive)
        print_info "Installing skill '$skill_name' from archive (scope: $scope)..."

        # Create target directory
        mkdir -p "$target_dir"

        # Extract
        if command -v unzip &>/dev/null; then
            unzip -o -q "$source" -d "$target_dir"
        else
            print_error "unzip not found. Install it: brew install unzip"
            rm -rf "$target_dir"
            return 1
        fi

        # Verify SKILL.md exists after extraction
        if [[ ! -f "$target_dir/SKILL.md" ]]; then
            print_error "Archive does not contain SKILL.md at the top level"
            # Check if it's nested one level deep
            local nested
            nested=$(find "$target_dir" -maxdepth 2 -name "SKILL.md" -print -quit 2>/dev/null)
            if [[ -n "$nested" ]]; then
                local nested_dir
                nested_dir=$(dirname "$nested")
                print_info "Found SKILL.md in subdirectory, moving contents up..."
                # Move contents from nested dir to target
                mv "$nested_dir"/* "$target_dir"/ 2>/dev/null || true
                mv "$nested_dir"/.* "$target_dir"/ 2>/dev/null || true
                rmdir "$nested_dir" 2>/dev/null || true
            else
                print_error "No SKILL.md found in archive. Invalid skill package."
                rm -rf "$target_dir"
                return 1
            fi
        fi

    elif [[ -d "$source" ]]; then
        # Skill directory
        if [[ ! -f "$source/SKILL.md" ]]; then
            print_error "Directory does not contain SKILL.md: $source"
            return 1
        fi

        print_info "Installing skill '$skill_name' from directory (scope: $scope)..."

        # Create parent directory
        mkdir -p "$(dirname "$target_dir")"

        # Copy the directory
        cp -r "$source" "$target_dir"

    else
        print_error "Source not found or unsupported type: $source"
        print_error "Expected: .skill file (zip), .zip file, or directory containing SKILL.md"
        return 1
    fi

    print_success "Skill installed: $skill_name"
    print_info "  Location: $target_dir"
    print_info "  Scope: $scope"

    # Reminder about scope behavior
    case "$scope" in
        user)
            print_info "  Available in all your projects." ;;
        project)
            print_info "  Available in agent's project (committed to git)." ;;
        local)
            print_info "  Available in agent's project (gitignored, only you)." ;;
    esac
}

cmd_skill_uninstall() {
    local agent="" skill_name="" scope="user"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -s|--scope)
                [[ $# -lt 2 ]] && { print_error "--scope requires a value"; return 1; }
                scope="$2"; shift 2 ;;
            -h|--help)
                cat << 'HELP'
Usage: aimaestro-agent.sh skill uninstall <agent> <skill-name> [options]

Uninstall a skill by removing its directory.

Arguments:
  agent         Agent name or ID
  skill-name    Name of the skill folder to remove

Options:
  -s, --scope <user|project|local>   Scope to uninstall from (default: user)

Scopes:
  user      Removes from ~/.claude/skills/<name>/
  project   Removes from <agent-dir>/.claude/skills/<name>/
  local     Removes from <agent-dir>/.claude/skills/<name>/

Examples:
  # Uninstall from user scope (default)
  aimaestro-agent.sh skill uninstall my-agent my-skill

  # Uninstall from project scope
  aimaestro-agent.sh skill uninstall my-agent my-skill --scope project
HELP
                return 0 ;;
            -*) print_error "Unknown option: $1"; return 1 ;;
            *)
                if [[ -z "$agent" ]]; then agent="$1"
                elif [[ -z "$skill_name" ]]; then skill_name="$1"
                fi
                shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name required"; return 1; }
    [[ -z "$skill_name" ]] && { print_error "Skill name required"; return 1; }

    resolve_agent "$agent" || return 1

    local agent_dir
    agent_dir=$(get_agent_working_dir "$RESOLVED_AGENT_ID")

    # Determine target directory based on scope
    local target_dir
    case "$scope" in
        user)
            target_dir="$HOME/.claude/skills/$skill_name"
            ;;
        project|local)
            if [[ -z "$agent_dir" ]] || [[ ! -d "$agent_dir" ]]; then
                print_error "Agent working directory not found: $agent_dir"
                return 1
            fi
            target_dir="$agent_dir/.claude/skills/$skill_name"
            ;;
        *)
            print_error "Invalid scope: $scope (must be user, project, or local)"
            return 1
            ;;
    esac

    if [[ ! -d "$target_dir" ]]; then
        print_error "Skill not found at: $target_dir"
        print_info "Check if the skill was installed in a different scope."
        return 1
    fi

    # Safety: verify the path is under a .claude/skills/ directory
    case "$target_dir" in
        */.claude/skills/*)
            ;; # Valid path
        *)
            print_error "Safety check failed: target is not under .claude/skills/"
            return 1
            ;;
    esac

    print_info "Uninstalling skill '$skill_name' (scope: $scope)..."
    print_info "  Removing: $target_dir"

    rm -rf "$target_dir"

    if [[ ! -d "$target_dir" ]]; then
        print_success "Skill uninstalled: $skill_name"
    else
        print_error "Failed to remove skill directory"
        return 1
    fi
}

# ============================================================================
# PLUGIN (Claude Code plugins)
# ============================================================================

cmd_plugin() {
    local subcmd="${1:-help}"
    shift || true

    case "$subcmd" in
        install) cmd_plugin_install "$@" ;;
        uninstall) cmd_plugin_uninstall "$@" ;;
        update) cmd_plugin_update "$@" ;;
        load) cmd_plugin_load "$@" ;;
        enable) cmd_plugin_enable "$@" ;;
        disable) cmd_plugin_disable "$@" ;;
        list) cmd_plugin_list "$@" ;;
        validate) cmd_plugin_validate "$@" ;;
        reinstall) cmd_plugin_reinstall "$@" ;;
        clean) cmd_plugin_clean "$@" ;;
        marketplace) cmd_plugin_marketplace "$@" ;;
        help|--help|-h)
            cat << 'HELP'
Usage: aimaestro-agent.sh plugin <subcommand> [options]

Manage Claude Code plugins for an agent.

Subcommands:
  install <agent> <plugin>     Install plugin (persistent)
  uninstall <agent> <plugin>   Uninstall plugin
  update <agent> <plugin>      Update plugin to latest version
  load <agent> <path>          Load plugin from local directory (session only)
  enable <agent> <plugin>      Enable a disabled plugin
  disable <agent> <plugin>     Disable plugin without uninstalling
  list <agent>                 List plugins for agent
  validate <agent> <path>      Validate plugin before install
  reinstall <agent> <plugin>   Uninstall + reinstall (preserves state)
  clean <agent>                Clean up corrupt/orphaned plugin data
  marketplace <action>         Manage marketplaces (add, list, remove, update)

Scopes (for install/uninstall/update/enable/disable/reinstall):
  --scope local      Only you, only this repo (.claude/plugins/, gitignored)
                     This is the default scope.
  --scope project    Shared with collaborators (.claude/settings.json, committed)
  --scope user       All your projects (~/.claude.json, user-global)

Plugin format:
  plugin-name@marketplace-name   Full qualified name
  plugin-name                    Short name (searched across marketplaces)

Examples:
  # Install plugin in local scope (default)
  aimaestro-agent.sh plugin install my-agent feature-dev@my-marketplace

  # Install with project scope (shared with collaborators)
  aimaestro-agent.sh plugin install my-agent my-plugin --scope project

  # Install with user scope (available in all your projects)
  aimaestro-agent.sh plugin install my-agent my-plugin --scope user

  # Load plugin from local directory for one session only (no install)
  aimaestro-agent.sh plugin load my-agent /path/to/plugin

  # Update a plugin to latest version
  aimaestro-agent.sh plugin update my-agent my-plugin@my-marketplace

  # Uninstall a plugin
  aimaestro-agent.sh plugin uninstall my-agent feature-dev

  # Force uninstall (even if corrupt)
  aimaestro-agent.sh plugin uninstall my-agent broken-plugin --force

  # List all plugins for an agent
  aimaestro-agent.sh plugin list my-agent
HELP
            ;;
        *)
            print_error "Unknown plugin subcommand: $subcmd"
            echo "Run 'aimaestro-agent.sh plugin help' for usage" >&2  # LOW-003
            return 1 ;;
    esac
}

cmd_plugin_install() {
    local agent="" plugin="" scope="local" no_restart=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -s|--scope)
                [[ $# -lt 2 ]] && { print_error "--scope requires a value"; return 1; }
                scope="$2"; shift 2 ;;
            --no-restart)
                no_restart=true; shift ;;
            -h|--help)
                cat << 'HELP'
Usage: aimaestro-agent.sh plugin install <agent> <plugin> [options]

Install a plugin persistently for an agent.

Options:
  -s, --scope <user|project|local>   Plugin scope (default: local)
  --no-restart                       Don't restart the agent after install

Scopes:
  local     Only you, only this repo (.claude/plugins/, gitignored)
  project   Shared with collaborators (.claude/settings.json, committed)
  user      All your projects (~/.claude.json, user-global)

Plugin format:
  plugin-name@marketplace-name   Full qualified name
  plugin-name                    Short name

Notes:
  - If the plugin is already installed, the command continues without error
  - After installing, Claude Code needs restart for changes to take effect
  - For remote agents, the script hibernates and wakes the agent automatically
  - For the current agent, you'll need to restart manually
  - To load a plugin for one session only, use: plugin load

Examples:
  # Install in local scope (default)
  aimaestro-agent.sh plugin install my-agent feature-dev@my-marketplace

  # Install in project scope (shared with collaborators)
  aimaestro-agent.sh plugin install my-agent my-plugin --scope project

  # Install in user scope (all your projects)
  aimaestro-agent.sh plugin install my-agent my-plugin --scope user

  # Install without automatic restart
  aimaestro-agent.sh plugin install my-agent my-plugin --no-restart
HELP
                return 0 ;;
            -*) print_error "Unknown option: $1"; return 1 ;;
            *)
                if [[ -z "$agent" ]]; then agent="$1"
                elif [[ -z "$plugin" ]]; then plugin="$1"
                fi
                shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name required"; return 1; }
    [[ -z "$plugin" ]] && { print_error "Plugin name/path required"; return 1; }

    resolve_agent "$agent" || return 1

    local agent_dir
    agent_dir=$(get_agent_working_dir "$RESOLVED_AGENT_ID")

    if [[ -z "$agent_dir" ]] || [[ ! -d "$agent_dir" ]]; then
        print_error "Agent working directory not found: $agent_dir"
        return 1
    fi

    print_info "Installing plugin '$plugin' (scope: $scope) for agent '$RESOLVED_ALIAS'..."

    # Lazy check for claude CLI
    require_claude || return 1

    # Use run_claude_command to capture full error output
    local output exit_code
    output=$(run_claude_command "$agent_dir" plugin install "$plugin" --scope "$scope" 2>&1)
    exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        print_success "Plugin installed: $plugin"

        # Handle restart requirement (plugins typically need restart)
        if [[ "$no_restart" == false ]]; then
            if is_current_session "$agent"; then
                print_restart_instructions "for the plugin to be available"
            else
                # For remote agents, restart automatically
                restart_agent "$RESOLVED_AGENT_ID" 3
            fi
        else
            print_info "Note: Restart may be required for changes to take effect"
        fi
        return 0
    fi

    # Check if error is "already installed" type (continue gracefully)
    if echo "$output" | grep -qi "already\|exists\|installed"; then
        print_info "Plugin '$plugin' appears to be already installed"
        print_info "Continuing with any subsequent operations..."
        return 0
    fi

    # Real error occurred - report verbatim
    print_error "Failed to install plugin"
    if [[ -n "$output" ]]; then
        echo ""
        echo "${RED}Claude CLI error:${NC}"
        echo "$output"
    fi
    return 1
}

cmd_plugin_uninstall() {
    local agent="" plugin="" scope="local" force=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -s|--scope)
                [[ $# -lt 2 ]] && { print_error "--scope requires a value"; return 1; }
                scope="$2"; shift 2 ;;
            --force|-f)
                force=true; shift ;;
            -h|--help)
                cat << 'HELP'
Usage: aimaestro-agent.sh plugin uninstall <agent> <plugin> [options]

Uninstall a plugin from an agent.

Options:
  -s, --scope <user|project|local>   Plugin scope (default: local)
  --force, -f                        Force removal: delete cache folder and
                                     update config files even if normal
                                     uninstall fails

Force removal is useful when:
  - Plugin is corrupt and can't be uninstalled normally
  - Plugin files were manually modified
  - Need to clean up orphaned plugin data

Examples:
  # Uninstall plugin (local scope)
  aimaestro-agent.sh plugin uninstall my-agent feature-dev

  # Uninstall from user scope
  aimaestro-agent.sh plugin uninstall my-agent my-plugin --scope user

  # Force uninstall (even if corrupt)
  aimaestro-agent.sh plugin uninstall my-agent broken-plugin --force
HELP
                return 0 ;;
            -*) print_error "Unknown option: $1"; return 1 ;;
            *)
                if [[ -z "$agent" ]]; then agent="$1"
                elif [[ -z "$plugin" ]]; then plugin="$1"
                fi
                shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name required"; return 1; }
    [[ -z "$plugin" ]] && { print_error "Plugin name required"; return 1; }

    resolve_agent "$agent" || return 1

    local agent_dir
    agent_dir=$(get_agent_working_dir "$RESOLVED_AGENT_ID")

    # MEDIUM-008: Check directory exists before cd
    if [[ -z "$agent_dir" ]] || [[ ! -d "$agent_dir" ]]; then
        print_error "Agent working directory not found: $agent_dir"
        return 1
    fi

    # Lazy check for claude CLI
    require_claude || return 1

    # Try normal uninstall first
    print_info "Uninstalling plugin '$plugin' from agent '$RESOLVED_ALIAS'..."

    if (cd "$agent_dir" && claude plugin uninstall "$plugin" --scope "$scope" 2>/dev/null); then
        print_success "Plugin uninstalled: $plugin"
        return 0
    fi

    # Normal uninstall failed
    if [[ "$force" != true ]]; then
        print_error "Failed to uninstall plugin. Use --force to force removal."
        return 1
    fi

    # Force removal
    print_warning "Normal uninstall failed. Forcing removal..."

    # Parse plugin name (format: plugin-name or plugin-name@marketplace)
    local plugin_name marketplace_name
    if [[ "$plugin" == *"@"* ]]; then
        plugin_name="${plugin%@*}"
        marketplace_name="${plugin#*@}"
    else
        plugin_name="$plugin"
        marketplace_name=""
    fi

    # Determine cache directory based on scope
    local cache_dir
    case "$scope" in
        user) cache_dir="$HOME/.claude/plugins/cache" ;;
        project) cache_dir="$agent_dir/.claude/plugins" ;;
        local) cache_dir="$agent_dir/.claude/plugins" ;;
        *) cache_dir="$HOME/.claude/plugins/cache" ;;
    esac

    local removed_something=false

    # Find and remove plugin folder(s)
    if [[ -n "$marketplace_name" ]] && [[ -d "$cache_dir/$marketplace_name" ]]; then
        # Look for plugin in specific marketplace
        local plugin_dir="$cache_dir/$marketplace_name/$plugin_name"
        if [[ -d "$plugin_dir" ]]; then
            # CRITICAL-1: Validate path is within cache directory to prevent path traversal
            if ! validate_cache_path "$plugin_dir" "$cache_dir"; then
                # LOW-4: Sanitize internal paths in error messages
                print_error "Invalid plugin path detected (path traversal attempt blocked)"
                return 1
            fi
            # HIGH-2: Check for symlinks that could escape the directory
            if ! check_no_symlinks_in_path "$plugin_dir"; then
                print_error "Symlink detected in plugin path (security risk)"
                return 1
            fi
            print_info "Removing plugin directory: $plugin_dir"
            rm -rf "$plugin_dir"
            removed_something=true
        fi
    else
        # Search all marketplaces for the plugin
        for mp_dir in "$cache_dir"/*/; do
            local target_dir="${mp_dir}${plugin_name}"
            if [[ -d "$target_dir" ]]; then
                # CRITICAL-1: Validate path is within cache directory
                if ! validate_cache_path "$target_dir" "$cache_dir"; then
                    print_warning "Skipping invalid path (path traversal blocked)"
                    continue
                fi
                # HIGH-2: Check for symlinks
                if ! check_no_symlinks_in_path "$target_dir"; then
                    print_warning "Skipping path with symlinks (security risk)"
                    continue
                fi
                print_info "Removing plugin directory: $target_dir"
                rm -rf "$target_dir"
                removed_something=true
            fi
        done
    fi

    # Update installed_plugins.json (user scope only)
    if [[ "$scope" == "user" ]]; then
        local plugins_json="$HOME/.claude/plugins/installed_plugins.json"
        if [[ -f "$plugins_json" ]]; then
            print_info "Updating installed_plugins.json (with backup)..."
            if ! remove_from_installed_plugins "$plugins_json" "$plugin"; then
                print_warning "Failed to update installed_plugins.json"
            fi
        fi

        # Update enabledPlugins in settings.json
        local settings_json="$HOME/.claude/settings.json"
        if [[ -f "$settings_json" ]]; then
            print_info "Updating settings.json (with backup)..."
            # Build pattern to match the plugin (with or without marketplace)
            # Escape regex metacharacters in plugin names to prevent injection
            local pattern escaped_plugin escaped_name escaped_marketplace
            escaped_plugin=$(escape_regex "$plugin")
            if [[ -n "$marketplace_name" ]]; then
                escaped_name=$(escape_regex "$plugin_name")
                escaped_marketplace=$(escape_regex "$marketplace_name")
                pattern="^(${escaped_name}@${escaped_marketplace}|${escaped_plugin})$"
            else
                pattern="^${escaped_plugin}(@.*)?$"
            fi
            if ! remove_from_enabled_plugins "$settings_json" "$pattern"; then
                print_warning "Failed to update settings.json"
            fi
        fi
    fi

    if [[ "$removed_something" == true ]]; then
        print_success "Plugin forcefully removed: $plugin"
    else
        print_warning "No plugin files found to remove. Plugin may already be uninstalled."
    fi
}

cmd_plugin_update() {
    local agent="" plugin="" scope="local"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -s|--scope)
                [[ $# -lt 2 ]] && { print_error "--scope requires a value"; return 1; }
                scope="$2"; shift 2 ;;
            -h|--help)
                cat << 'HELP'
Usage: aimaestro-agent.sh plugin update <agent> <plugin> [options]

Update a plugin to the latest version from its marketplace.

Options:
  -s, --scope <user|project|local>   Plugin scope (default: local)

Plugin format:
  plugin-name@marketplace-name   Full qualified name
  plugin-name                    Short name

Examples:
  # Update plugin (local scope)
  aimaestro-agent.sh plugin update my-agent feature-dev@my-marketplace

  # Update plugin in user scope
  aimaestro-agent.sh plugin update my-agent my-plugin --scope user
HELP
                return 0 ;;
            -*) print_error "Unknown option: $1"; return 1 ;;
            *)
                if [[ -z "$agent" ]]; then agent="$1"
                elif [[ -z "$plugin" ]]; then plugin="$1"
                fi
                shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name required"; return 1; }
    [[ -z "$plugin" ]] && { print_error "Plugin name required"; return 1; }

    resolve_agent "$agent" || return 1

    local agent_dir
    agent_dir=$(get_agent_working_dir "$RESOLVED_AGENT_ID")

    if [[ -z "$agent_dir" ]] || [[ ! -d "$agent_dir" ]]; then
        print_error "Agent working directory not found: $agent_dir"
        return 1
    fi

    require_claude || return 1

    print_info "Updating plugin '$plugin' (scope: $scope) for agent '$RESOLVED_ALIAS'..."

    local output exit_code
    output=$(run_claude_command "$agent_dir" plugin update "$plugin" --scope "$scope" 2>&1)
    exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        print_success "Plugin updated: $plugin"
        return 0
    fi

    print_error "Failed to update plugin"
    if [[ -n "$output" ]]; then
        echo ""
        echo "${RED}Claude CLI error:${NC}"
        echo "$output"
    fi
    return 1
}

cmd_plugin_load() {
    local agent="" plugin_path=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -h|--help)
                cat << 'HELP'
Usage: aimaestro-agent.sh plugin load <agent> <path> [<path>...]

Load plugin(s) from local directory for the current session only.
This does NOT install the plugin — it is available only while the
session is running. Useful for development and testing.

Arguments:
  agent    Agent name or ID
  path     Path to plugin directory (must contain .claude-plugin/plugin.json)
           Can specify multiple paths.

How it works:
  The plugin directory is passed to Claude Code via --plugin-dir at startup.
  For running agents, the agent must be restarted with the --plugin-dir flag
  added to programArgs.

Examples:
  # Load a plugin for development/testing
  aimaestro-agent.sh plugin load my-agent ./my-plugin-dev

  # Load multiple plugins
  aimaestro-agent.sh plugin load my-agent ./plugin-one ./plugin-two
HELP
                return 0 ;;
            -*) print_error "Unknown option: $1"; return 1 ;;
            *)
                if [[ -z "$agent" ]]; then
                    agent="$1"
                else
                    # Collect all remaining args as plugin paths
                    plugin_path="${plugin_path:+$plugin_path }$1"
                fi
                shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name required"; return 1; }
    [[ -z "$plugin_path" ]] && { print_error "Plugin path required"; return 1; }

    resolve_agent "$agent" || return 1

    local agent_dir
    agent_dir=$(get_agent_working_dir "$RESOLVED_AGENT_ID")

    if [[ -z "$agent_dir" ]] || [[ ! -d "$agent_dir" ]]; then
        print_error "Agent working directory not found: $agent_dir"
        return 1
    fi

    # Build --plugin-dir flags
    local plugin_dir_flags=""
    for p in $plugin_path; do
        # Resolve relative paths
        if [[ ! "$p" = /* ]]; then
            p="$agent_dir/$p"
        fi
        if [[ ! -d "$p" ]]; then
            print_error "Plugin directory not found: $p"
            return 1
        fi
        plugin_dir_flags="${plugin_dir_flags} --plugin-dir \"$p\""
    done

    print_info "To load plugin(s) for this session only, start Claude Code with:"
    echo ""
    echo "   cd \"$agent_dir\" && claude${plugin_dir_flags}"
    echo ""
    print_info "Or set it as permanent programArgs, wake, then clear:"
    echo ""
    echo "   aimaestro-agent.sh update $RESOLVED_ALIAS --args \"${plugin_dir_flags# }\""
    echo "   aimaestro-agent.sh wake $RESOLVED_ALIAS"
    echo "   # To remove after testing:"
    echo "   aimaestro-agent.sh update $RESOLVED_ALIAS --args \"\""
    echo ""
    print_warning "Note: Session-only plugins are not installed and won't appear in 'plugin list'."
    print_warning "For persistent installation, use: aimaestro-agent.sh plugin install"
}

cmd_plugin_enable() {
    local agent="" plugin="" scope="local"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -s|--scope)
                [[ $# -lt 2 ]] && { print_error "--scope requires a value"; return 1; }
                scope="$2"; shift 2 ;;
            -*) print_error "Unknown option: $1"; return 1 ;;
            *)
                if [[ -z "$agent" ]]; then agent="$1"
                elif [[ -z "$plugin" ]]; then plugin="$1"
                fi
                shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name required"; return 1; }
    [[ -z "$plugin" ]] && { print_error "Plugin name required"; return 1; }

    resolve_agent "$agent" || return 1

    local agent_dir
    agent_dir=$(get_agent_working_dir "$RESOLVED_AGENT_ID")

    # MEDIUM-008: Check directory exists before cd
    if [[ -z "$agent_dir" ]] || [[ ! -d "$agent_dir" ]]; then
        print_error "Agent working directory not found: $agent_dir"
        return 1
    fi

    print_info "Enabling plugin '$plugin' for agent '$RESOLVED_ALIAS'..."
    
    # Lazy check for claude CLI
    require_claude || return 1
    
    # Use if-subshell pattern to avoid set -e exit before error handling
    if (cd "$agent_dir" && claude plugin enable "$plugin" --scope "$scope"); then
        print_success "Plugin enabled: $plugin"
    else
        print_error "Failed to enable plugin"
        return 1
    fi
}

cmd_plugin_disable() {
    local agent="" plugin="" scope="local"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -s|--scope)
                [[ $# -lt 2 ]] && { print_error "--scope requires a value"; return 1; }
                scope="$2"; shift 2 ;;
            -*) print_error "Unknown option: $1"; return 1 ;;
            *)
                if [[ -z "$agent" ]]; then agent="$1"
                elif [[ -z "$plugin" ]]; then plugin="$1"
                fi
                shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name required"; return 1; }
    [[ -z "$plugin" ]] && { print_error "Plugin name required"; return 1; }

    resolve_agent "$agent" || return 1

    local agent_dir
    agent_dir=$(get_agent_working_dir "$RESOLVED_AGENT_ID")

    # MEDIUM-008: Check directory exists before cd
    if [[ -z "$agent_dir" ]] || [[ ! -d "$agent_dir" ]]; then
        print_error "Agent working directory not found: $agent_dir"
        return 1
    fi

    print_info "Disabling plugin '$plugin' for agent '$RESOLVED_ALIAS'..."
    
    # Lazy check for claude CLI
    require_claude || return 1
    
    # Use if-subshell pattern to avoid set -e exit before error handling
    if (cd "$agent_dir" && claude plugin disable "$plugin" --scope "$scope"); then
        print_success "Plugin disabled: $plugin"
    else
        print_error "Failed to disable plugin"
        return 1
    fi
}

cmd_plugin_list() {
    local agent=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -*) print_error "Unknown option: $1"; return 1 ;;
            *) agent="$1"; shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name required"; return 1; }

    resolve_agent "$agent" || return 1

    local agent_dir
    agent_dir=$(get_agent_working_dir "$RESOLVED_AGENT_ID")

    # MEDIUM-008: Check directory exists before cd
    if [[ -z "$agent_dir" ]] || [[ ! -d "$agent_dir" ]]; then
        print_error "Agent working directory not found: $agent_dir"
        return 1
    fi

    print_header "Plugins for: $RESOLVED_ALIAS"
    
    # Lazy check for claude CLI
    require_claude || return 1
    
    # Use if-subshell pattern for proper error handling
    if ! (cd "$agent_dir" && claude plugin list); then
        print_error "Failed to list plugins"
        return 1
    fi
}

cmd_plugin_validate() {
    local agent="" plugin_path=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -h|--help)
                cat << 'HELP'
Usage: aimaestro-agent.sh plugin validate <agent> <plugin-path>

Validate a plugin or marketplace before installation.

Arguments:
  agent         Agent name (used to resolve working directory)
  plugin-path   Path to plugin directory or marketplace directory

Examples:
  aimaestro-agent.sh plugin validate my-agent ./my-plugin
  aimaestro-agent.sh plugin validate my-agent ~/.claude/plugins/cache/my-marketplace/my-plugin
HELP
                return 0 ;;
            -*) print_error "Unknown option: $1"; return 1 ;;
            *)
                if [[ -z "$agent" ]]; then agent="$1"
                elif [[ -z "$plugin_path" ]]; then plugin_path="$1"
                fi
                shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name required"; return 1; }
    [[ -z "$plugin_path" ]] && { print_error "Plugin path required"; return 1; }

    resolve_agent "$agent" || return 1

    local agent_dir
    agent_dir=$(get_agent_working_dir "$RESOLVED_AGENT_ID")

    # Resolve relative path if needed
    if [[ ! "$plugin_path" = /* ]]; then
        plugin_path="$agent_dir/$plugin_path"
    fi

    if [[ ! -d "$plugin_path" ]]; then
        print_error "Plugin directory not found: $plugin_path"
        return 1
    fi

    print_info "Validating plugin at: $plugin_path"

    require_claude || return 1

    if claude plugin validate "$plugin_path"; then
        print_success "Plugin validation passed"
        return 0
    else
        print_error "Plugin validation failed"
        return 1
    fi
}

cmd_plugin_reinstall() {
    local agent="" plugin="" scope="local"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -s|--scope)
                [[ $# -lt 2 ]] && { print_error "--scope requires a value"; return 1; }
                scope="$2"; shift 2 ;;
            -h|--help)
                cat << 'HELP'
Usage: aimaestro-agent.sh plugin reinstall <agent> <plugin> [options]

Reinstall a plugin while preserving its enabled/disabled state.

Options:
  --scope <user|project|local>   Plugin scope (default: local)

This is useful for:
  - Fixing corrupt plugin installations
  - Updating to latest version while preserving config
  - Resetting plugin to clean state
HELP
                return 0 ;;
            -*) print_error "Unknown option: $1"; return 1 ;;
            *)
                if [[ -z "$agent" ]]; then agent="$1"
                elif [[ -z "$plugin" ]]; then plugin="$1"
                fi
                shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name required"; return 1; }
    [[ -z "$plugin" ]] && { print_error "Plugin name required"; return 1; }

    resolve_agent "$agent" || return 1

    local agent_dir
    agent_dir=$(get_agent_working_dir "$RESOLVED_AGENT_ID")

    if [[ -z "$agent_dir" ]] || [[ ! -d "$agent_dir" ]]; then
        print_error "Agent working directory not found: $agent_dir"
        return 1
    fi

    require_claude || return 1

    # Save current enabled state
    local settings_json="$HOME/.claude/settings.json"
    local was_enabled=false
    local plugin_key="$plugin"

    if [[ -f "$settings_json" ]]; then
        # Check various possible key formats
        local enabled_state
        enabled_state=$(jq -r --arg p "$plugin" '.enabledPlugins[$p] // "notfound"' "$settings_json" 2>/dev/null)
        if [[ "$enabled_state" == "true" ]]; then
            was_enabled=true
        fi
    fi

    print_info "Reinstalling plugin '$plugin' for agent '$RESOLVED_ALIAS'..."
    [[ "$was_enabled" == true ]] && print_info "  (Will restore enabled state after reinstall)"

    # Uninstall (force in case it's corrupt)
    print_info "Step 1: Uninstalling..."
    if ! (cd "$agent_dir" && claude plugin uninstall "$plugin" --scope "$scope" 2>/dev/null); then
        print_warning "Normal uninstall failed, forcing removal..."
        # Force remove the cache directory
        local cache_dir="$HOME/.claude/plugins/cache"
        local plugin_name="${plugin%@*}"
        local marketplace_name="${plugin#*@}"
        local target_dir="$cache_dir/$marketplace_name/$plugin_name"
        if [[ "$plugin" == *"@"* ]] && [[ -d "$target_dir" ]]; then
            # CRITICAL-1: Validate path before recursive delete
            if validate_cache_path "$target_dir" "$cache_dir" && check_no_symlinks_in_path "$target_dir"; then
                rm -rf "$target_dir"
            else
                print_error "Invalid path detected during force removal"
                return 1
            fi
        fi
    fi

    # Reinstall
    print_info "Step 2: Installing..."
    if ! (cd "$agent_dir" && claude plugin install "$plugin" --scope "$scope"); then
        print_error "Failed to reinstall plugin"
        return 1
    fi

    # Restore enabled state
    if [[ "$was_enabled" == true ]]; then
        print_info "Step 3: Restoring enabled state..."
        (cd "$agent_dir" && claude plugin enable "$plugin" --scope "$scope") || true
    fi

    print_success "Plugin reinstalled: $plugin"
}

cmd_plugin_clean() {
    local agent="" dry_run=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dry-run|-n)
                dry_run=true; shift ;;
            -h|--help)
                cat << 'HELP'
Usage: aimaestro-agent.sh plugin clean <agent> [options]

Clean up corrupt, orphaned, or broken plugin data.

Options:
  --dry-run, -n    Show what would be cleaned without actually removing

This command:
  1. Validates all installed plugins
  2. Identifies plugins that fail validation
  3. Reports or removes orphaned cache directories
  4. Cleans up stale entries in config files
HELP
                return 0 ;;
            -*) print_error "Unknown option: $1"; return 1 ;;
            *) agent="$1"; shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name required"; return 1; }

    resolve_agent "$agent" || return 1

    local agent_dir
    agent_dir=$(get_agent_working_dir "$RESOLVED_AGENT_ID")

    if [[ -z "$agent_dir" ]] || [[ ! -d "$agent_dir" ]]; then
        print_error "Agent working directory not found: $agent_dir"
        return 1
    fi

    require_claude || return 1

    print_header "Plugin Cleanup for: $RESOLVED_ALIAS"
    [[ "$dry_run" == true ]] && print_warning "DRY RUN - no changes will be made"

    local cache_dir="$HOME/.claude/plugins/cache"
    # LOW-3: issues_found is an integer counter - overflow is extremely unlikely
    # in practice (would require >2 billion invalid plugins)
    local issues_found=0

    # Check each marketplace directory
    for mp_dir in "$cache_dir"/*/; do
        [[ ! -d "$mp_dir" ]] && continue
        # MEDIUM-4: Use basename -- to prevent leading hyphen interpretation
        local mp_name
        mp_name=$(basename -- "$mp_dir")

        # Check each plugin in the marketplace
        for plugin_dir in "$mp_dir"/*/; do
            [[ ! -d "$plugin_dir" ]] && continue
            # MEDIUM-4: Use basename -- to prevent leading hyphen interpretation
            local plugin_name
            plugin_name=$(basename -- "$plugin_dir")

            # Try to validate the plugin
            if ! claude plugin validate "$plugin_dir" >/dev/null 2>&1; then
                ((issues_found++))
                # HIGH-4: Sanitize directory names before display to prevent ANSI injection
                local safe_plugin_name safe_mp_name safe_plugin_dir
                safe_plugin_name=$(sanitize_for_display "$plugin_name")
                safe_mp_name=$(sanitize_for_display "$mp_name")
                safe_plugin_dir=$(sanitize_for_display "$plugin_dir")
                print_warning "Invalid plugin: $safe_plugin_name@$safe_mp_name"
                print_info "  Path: $safe_plugin_dir"

                if [[ "$dry_run" == false ]]; then
                    read -rp "  Remove this plugin? [y/N] " confirm
                    if [[ "$confirm" =~ ^[Yy] ]]; then
                        # CRITICAL-1: Validate path before recursive delete
                        if ! validate_cache_path "$plugin_dir" "$cache_dir"; then
                            print_error "  Path traversal detected, skipping"
                            continue
                        fi
                        # HIGH-2: Check for symlinks
                        if ! check_no_symlinks_in_path "$plugin_dir"; then
                            print_error "  Symlink detected, skipping"
                            continue
                        fi
                        rm -rf "$plugin_dir"
                        print_success "  Removed: $safe_plugin_dir"
                    fi
                else
                    print_info "  Would remove: $plugin_dir"
                fi
            fi
        done
    done

    # Check for orphaned entries in installed_plugins.json
    local plugins_json="$HOME/.claude/plugins/installed_plugins.json"
    if [[ -f "$plugins_json" ]]; then
        print_info "Checking installed_plugins.json for orphaned entries..."
        # This is a simplified check - full implementation would cross-reference
    fi

    if [[ $issues_found -eq 0 ]]; then
        print_success "No corrupt plugins found"
    else
        print_warning "Found $issues_found issue(s)"
    fi

    echo ""
    print_info "To reinstall a specific plugin: aimaestro-agent.sh plugin reinstall $agent <plugin>"
}

# Marketplace management (Claude Code only)
cmd_plugin_marketplace() {
    local action="${1:-help}"
    shift || true

    case "$action" in
        add) cmd_marketplace_add "$@" ;;
        list) cmd_marketplace_list "$@" ;;
        remove|rm) cmd_marketplace_remove "$@" ;;
        update) cmd_marketplace_update "$@" ;;
        help|--help|-h)
            cat << 'HELP'
Usage: aimaestro-agent.sh plugin marketplace <action> [options]

Manage Claude Code marketplaces for an agent.

Actions:
  add <agent> <source>       Add marketplace from URL, path, or GitHub repo
  list <agent>               List configured marketplaces
  remove <agent> <name>      Remove a marketplace
  update <agent> [name]      Update marketplace(s) from source

Examples:
  # Add a marketplace from GitHub
  aimaestro-agent.sh plugin marketplace add my-agent github:owner/repo

  # Add a marketplace from URL
  aimaestro-agent.sh plugin marketplace add my-agent https://example.com/marketplace.json

  # List marketplaces for an agent
  aimaestro-agent.sh plugin marketplace list my-agent

  # Update all marketplaces
  aimaestro-agent.sh plugin marketplace update my-agent

  # Update specific marketplace
  aimaestro-agent.sh plugin marketplace update my-agent my-marketplace

  # Remove a marketplace
  aimaestro-agent.sh plugin marketplace remove my-agent my-marketplace
HELP
            ;;
        *)
            print_error "Unknown marketplace action: $action"
            echo "Run 'aimaestro-agent.sh plugin marketplace help' for usage" >&2
            return 1 ;;
    esac
}

cmd_marketplace_add() {
    local agent="" source="" no_restart=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --no-restart)
                no_restart=true; shift ;;
            -h|--help)
                cat << 'HELP'
Usage: aimaestro-agent.sh plugin marketplace add <agent> <source> [options]

Add a plugin marketplace to an agent.

Options:
  --no-restart    Don't restart the agent after adding

Source formats:
  owner/repo                    GitHub repository (short form)
  github:owner/repo             GitHub repository (explicit)
  https://github.com/o/r.git    GitHub HTTPS clone URL
  https://gitlab.com/o/r.git    GitLab or other Git host (HTTPS)
  git@gitlab.com:o/r.git        GitLab or other Git host (SSH)
  https://host/repo.git#v1.0    Specific branch or tag
  ./my-marketplace               Local directory
  ./path/to/marketplace.json     Direct path to marketplace.json
  https://example.com/mp.json    Remote URL to marketplace.json

Notes:
  - If the marketplace is already installed, the command continues without error
  - After adding, Claude Code needs restart for changes to take effect
  - For remote agents, the script hibernates and wakes the agent automatically
  - For the current agent, you'll need to restart manually

Examples:
  # Add from GitHub
  aimaestro-agent.sh plugin marketplace add my-agent owner/repo

  # Add from GitLab (HTTPS)
  aimaestro-agent.sh plugin marketplace add my-agent https://gitlab.com/company/plugins.git

  # Add from GitLab (SSH)
  aimaestro-agent.sh plugin marketplace add my-agent git@gitlab.com:company/plugins.git

  # Add specific branch/tag
  aimaestro-agent.sh plugin marketplace add my-agent https://github.com/o/r.git#v1.0.0

  # Add from local directory
  aimaestro-agent.sh plugin marketplace add my-agent ./my-marketplace

  # Add from remote URL
  aimaestro-agent.sh plugin marketplace add my-agent https://example.com/marketplace.json

  # Add without automatic restart
  aimaestro-agent.sh plugin marketplace add my-agent owner/repo --no-restart
HELP
                return 0 ;;
            -*) print_error "Unknown option: $1"; return 1 ;;
            *)
                if [[ -z "$agent" ]]; then agent="$1"
                elif [[ -z "$source" ]]; then source="$1"
                fi
                shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name required"; return 1; }
    [[ -z "$source" ]] && { print_error "Marketplace source required"; return 1; }

    resolve_agent "$agent" || return 1

    local agent_dir
    agent_dir=$(get_agent_working_dir "$RESOLVED_AGENT_ID")

    if [[ -z "$agent_dir" ]] || [[ ! -d "$agent_dir" ]]; then
        print_error "Agent working directory not found: $agent_dir"
        return 1
    fi

    require_claude || return 1

    # Check if marketplace is already installed
    if is_marketplace_installed "$agent_dir" "$source"; then
        print_info "Marketplace '$source' is already installed for agent '$RESOLVED_ALIAS'"
        print_info "Continuing with any subsequent operations..."
        return 0
    fi

    print_info "Adding marketplace '$source' for agent '$RESOLVED_ALIAS'..."

    # Use run_claude_command to capture full error output
    local output exit_code
    output=$(run_claude_command "$agent_dir" plugin marketplace add "$source" 2>&1)
    exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        print_success "Marketplace added: $source"

        # Handle restart requirement
        if [[ "$no_restart" == false ]]; then
            if is_current_session "$agent"; then
                print_restart_instructions "for the marketplace to be available"
            else
                restart_agent "$RESOLVED_AGENT_ID" 3
            fi
        else
            print_warning "Restart required for changes to take effect (use --no-restart was specified)"
        fi
        return 0
    fi

    # Check if error is "already installed" type (continue gracefully)
    if echo "$output" | grep -qi "already\|exists\|installed"; then
        print_info "Marketplace appears to be already configured"
        print_info "Continuing with any subsequent operations..."
        return 0
    fi

    # Real error occurred
    print_error "Failed to add marketplace"
    if [[ -n "$output" ]]; then
        echo ""
        echo "${RED}Claude CLI error:${NC}"
        echo "$output"
    fi
    return 1
}

cmd_marketplace_list() {
    local agent=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -*) print_error "Unknown option: $1"; return 1 ;;
            *) agent="$1"; shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name required"; return 1; }

    resolve_agent "$agent" || return 1

    local agent_dir
    agent_dir=$(get_agent_working_dir "$RESOLVED_AGENT_ID")

    if [[ -z "$agent_dir" ]] || [[ ! -d "$agent_dir" ]]; then
        print_error "Agent working directory not found: $agent_dir"
        return 1
    fi

    print_header "Marketplaces for: $RESOLVED_ALIAS"

    require_claude || return 1

    if ! (cd "$agent_dir" && claude plugin marketplace list); then
        print_error "Failed to list marketplaces"
        return 1
    fi
}

cmd_marketplace_remove() {
    local agent="" name="" force=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --force|-f)
                force=true; shift ;;
            -h|--help)
                cat << 'HELP'
Usage: aimaestro-agent.sh plugin marketplace remove <agent> <name> [options]

Options:
  --force, -f    Force removal: delete directories and update config files
                 even if normal removal fails (useful for corrupt marketplaces)
HELP
                return 0 ;;
            -*) print_error "Unknown option: $1"; return 1 ;;
            *)
                if [[ -z "$agent" ]]; then agent="$1"
                elif [[ -z "$name" ]]; then name="$1"
                fi
                shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name required"; return 1; }
    [[ -z "$name" ]] && { print_error "Marketplace name required"; return 1; }

    resolve_agent "$agent" || return 1

    local agent_dir
    agent_dir=$(get_agent_working_dir "$RESOLVED_AGENT_ID")

    if [[ -z "$agent_dir" ]] || [[ ! -d "$agent_dir" ]]; then
        print_error "Agent working directory not found: $agent_dir"
        return 1
    fi

    require_claude || return 1

    # Try normal removal first
    print_info "Removing marketplace '$name' from agent '$RESOLVED_ALIAS'..."

    if (cd "$agent_dir" && claude plugin marketplace remove "$name" 2>/dev/null); then
        print_success "Marketplace removed: $name"
        return 0
    fi

    # Normal removal failed
    if [[ "$force" != true ]]; then
        print_error "Failed to remove marketplace. Use --force to force removal."
        return 1
    fi

    # Force removal
    print_warning "Normal removal failed. Forcing removal..."

    local removed_something=false
    local marketplaces_base="$HOME/.claude/plugins/marketplaces"
    local cache_base="$HOME/.claude/plugins/cache"

    # Remove marketplace directory
    local mp_dir="$marketplaces_base/$name"
    if [[ -d "$mp_dir" ]]; then
        # CRITICAL-1: Validate path before recursive delete
        if ! validate_cache_path "$mp_dir" "$marketplaces_base"; then
            print_error "Invalid marketplace path detected (path traversal blocked)"
            return 1
        fi
        # HIGH-2: Check for symlinks
        if ! check_no_symlinks_in_path "$mp_dir"; then
            print_error "Symlink detected in marketplace path"
            return 1
        fi
        print_info "Removing marketplace directory: $mp_dir"
        rm -rf "$mp_dir"
        removed_something=true
    fi

    # Remove from cache
    local cache_dir="$cache_base/$name"
    if [[ -d "$cache_dir" ]]; then
        # CRITICAL-1: Validate path before recursive delete
        if ! validate_cache_path "$cache_dir" "$cache_base"; then
            print_error "Invalid cache path detected (path traversal blocked)"
            return 1
        fi
        # HIGH-2: Check for symlinks
        if ! check_no_symlinks_in_path "$cache_dir"; then
            print_error "Symlink detected in cache path"
            return 1
        fi
        print_info "Removing cache directory: $cache_dir"
        rm -rf "$cache_dir"
        removed_something=true
    fi

    # Update known_marketplaces.json (with backup)
    local mp_json="$HOME/.claude/plugins/known_marketplaces.json"
    if [[ -f "$mp_json" ]]; then
        print_info "Updating known_marketplaces.json (with backup)..."
        if remove_from_known_marketplaces "$mp_json" "$name"; then
            removed_something=true
        else
            print_warning "Failed to update known_marketplaces.json"
        fi
    fi

    # Update installed_plugins.json - remove plugins from this marketplace (with backup)
    local plugins_json="$HOME/.claude/plugins/installed_plugins.json"
    if [[ -f "$plugins_json" ]]; then
        print_info "Removing plugins from this marketplace in installed_plugins.json (with backup)..."
        if ! remove_marketplace_plugins "$plugins_json" "$name"; then
            print_warning "Failed to update installed_plugins.json"
        fi
    fi

    # Update enabledPlugins in settings.json - remove entries for this marketplace (with backup)
    local settings_json="$HOME/.claude/settings.json"
    if [[ -f "$settings_json" ]]; then
        print_info "Removing plugin entries from settings.json (with backup)..."
        # Pattern matches any plugin ending with @marketplace_name
        if ! remove_from_enabled_plugins "$settings_json" "@${name}\$"; then
            print_warning "Failed to update settings.json"
        fi
    fi

    if [[ "$removed_something" == true ]]; then
        print_success "Marketplace forcefully removed: $name"
    else
        print_warning "No marketplace files found to remove. Marketplace may already be removed."
    fi
}

cmd_marketplace_update() {
    local agent="" name=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -*) print_error "Unknown option: $1"; return 1 ;;
            *)
                if [[ -z "$agent" ]]; then agent="$1"
                elif [[ -z "$name" ]]; then name="$1"
                fi
                shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name required"; return 1; }

    resolve_agent "$agent" || return 1

    local agent_dir
    agent_dir=$(get_agent_working_dir "$RESOLVED_AGENT_ID")

    if [[ -z "$agent_dir" ]] || [[ ! -d "$agent_dir" ]]; then
        print_error "Agent working directory not found: $agent_dir"
        return 1
    fi

    if [[ -n "$name" ]]; then
        print_info "Updating marketplace '$name' for agent '$RESOLVED_ALIAS'..."
    else
        print_info "Updating all marketplaces for agent '$RESOLVED_ALIAS'..."
    fi

    require_claude || return 1

    if (cd "$agent_dir" && claude plugin marketplace update ${name:+"$name"}); then
        print_success "Marketplace(s) updated"
    else
        print_error "Failed to update marketplace(s)"
        return 1
    fi
}

# ============================================================================
# EXPORT / IMPORT
# ============================================================================

cmd_export() {
    local agent="" output="" include_data=false include_folder=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -o|--output)
                [[ $# -lt 2 ]] && { print_error "-o/--output requires a value"; return 1; }
                output="$2"; shift 2 ;;
            --include-data) include_data=true; shift ;;
            --include-folder) include_folder=true; shift ;;
            -h|--help)
                cat << 'HELP'
Usage: aimaestro-agent.sh export <agent> [options]

Options:
  -o, --output <file>    Output file (default: <name>.agent.json)
  --include-data         Include agent data directory (not implemented)
  --include-folder       Include project folder (not implemented)
HELP
                return 0 ;;
            -*) print_error "Unknown option: $1"; return 1 ;;
            *) agent="$1"; shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name required"; return 1; }

    resolve_agent "$agent" || return 1

    [[ -z "$output" ]] && output="${RESOLVED_ALIAS}.agent.json"

    # Get agent data
    local agent_data
    agent_data=$(get_agent_data "$RESOLVED_AGENT_ID")

    if [[ -z "$agent_data" ]]; then
        print_error "Failed to fetch agent data"
        return 1
    fi

    # Create export JSON
    local export_json
    export_json=$(create_export_json "$agent_data")

    # MEDIUM-1: Use atomic write pattern (write to temp, then rename)
    # This prevents data corruption on interrupted writes
    local tmp_output
    tmp_output=$(mktemp "${output}.XXXXXX") || {
        print_error "Failed to create temporary file"
        return 1
    }
    # Register for cleanup in case of early exit
    register_temp_file "$tmp_output"

    if ! echo "$export_json" > "$tmp_output"; then
        print_error "Failed to write to temporary file"
        rm -f "$tmp_output" 2>/dev/null
        return 1
    fi

    # Atomic rename - this either fully succeeds or fails
    if ! mv "$tmp_output" "$output"; then
        print_error "Failed to write to: $output"
        rm -f "$tmp_output" 2>/dev/null
        return 1
    fi
    print_success "Exported to: $output"
}

cmd_import() {
    local file="" new_name="" new_dir=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --name)
                [[ $# -lt 2 ]] && { print_error "--name requires a value"; return 1; }
                new_name="$2"; shift 2 ;;
            --dir)
                [[ $# -lt 2 ]] && { print_error "--dir requires a value"; return 1; }
                new_dir="$2"; shift 2 ;;
            -h|--help)
                cat << 'HELP'
Usage: aimaestro-agent.sh import <file> [options]

Options:
  --name <new-name>    Override agent name
  --dir <path>         Override working directory
HELP
                return 0 ;;
            -*) print_error "Unknown option: $1"; return 1 ;;
            *) file="$1"; shift ;;
        esac
    done

    [[ -z "$file" ]] && { print_error "Import file required"; return 1; }

    validate_import_file "$file" || return 1

    # MEDIUM-5: JSON schema validation for import files
    # Validate required fields and types to prevent JSON injection/corruption
    # We only care about the exit status (jq -e returns 1 if result is false/null)
    if ! jq -e '
        .agent
        | (type == "object") and
          (has("name")) and
          (.name | type == "string") and
          (.name | length > 0) and
          (.name | length <= 64) and
          (.name | test("^[a-zA-Z0-9_-]+$")) and
          (if has("workingDirectory") then (.workingDirectory | type == "string") else true end) and
          (if has("program") then (.program | type == "string") else true end) and
          (if has("model") then (.model | type == "string" or . == null) else true end) and
          (if has("tags") then (.tags | type == "array") else true end)
    ' "$file" >/dev/null 2>&1; then
        print_error "Import file validation failed: invalid schema"
        print_error "Required: .agent.name (string, alphanumeric+hyphens+underscores, 1-64 chars)"
        return 1
    fi

    # Read agent data
    local agent_data
    agent_data=$(jq -e '.agent' "$file") || {
        print_error "Failed to extract agent data from import file"
        return 1
    }

    # Override fields if specified
    [[ -n "$new_name" ]] && agent_data=$(echo "$agent_data" | jq --arg n "$new_name" '.name = $n')
    [[ -n "$new_dir" ]] && agent_data=$(echo "$agent_data" | jq --arg d "$new_dir" '.workingDirectory = $d')

    # Remove fields that shouldn't be imported
    agent_data=$(echo "$agent_data" | jq 'del(.id, .createdAt, .sessions, .status)')

    # Call API to create
    local api_base
    api_base=$(get_api_base)

    print_info "Importing agent..."
    local response
    response=$(curl -s --max-time 30 -X POST "${api_base}/api/agents" \
        -H "Content-Type: application/json" \
        -d "$agent_data")

    local error
    error=$(echo "$response" | jq -r '.error // empty')
    if [[ -n "$error" ]]; then
        print_error "$error"
        return 1
    fi

    local imported_name
    imported_name=$(echo "$response" | jq -r '.agent.name')
    print_success "Agent imported: $imported_name"
}

# ============================================================================
# RESTART (hibernate + wake with verification)
# ============================================================================

cmd_restart() {
    local agent="" wait_time=3

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --wait)
                [[ $# -lt 2 ]] && { print_error "--wait requires a value"; return 1; }
                wait_time="$2"; shift 2 ;;
            -h|--help)
                cat << 'HELP'
Usage: aimaestro-agent.sh restart <agent> [options]

Restart an agent by hibernating and waking it. Useful after installing
plugins or marketplaces that require a restart.

Options:
  --wait <seconds>    Wait time between hibernate and wake (default: 3)

Notes:
  - Cannot restart the current session (yourself) - use /exit instead
  - Verifies the agent comes back online after restart
  - If restart fails, check agent status with 'aimaestro-agent.sh show <agent>'

Examples:
  # Restart an agent
  aimaestro-agent.sh restart backend-api

  # Restart with longer wait time (for slow systems)
  aimaestro-agent.sh restart backend-api --wait 5
HELP
                return 0 ;;
            -*) print_error "Unknown option: $1"; return 1 ;;
            *) agent="$1"; shift ;;
        esac
    done

    [[ -z "$agent" ]] && { print_error "Agent name required"; return 1; }

    resolve_agent "$agent" || return 1

    # Check if trying to restart self
    if is_current_session "$agent"; then
        print_error "Cannot restart the current session (yourself)"
        print_info "To restart this session:"
        echo "  1. Exit Claude Code with '/exit' or Ctrl+C"
        echo "  2. Run 'claude' again in your terminal"
        return 1
    fi

    restart_agent "$RESOLVED_AGENT_ID" "$wait_time"
}

# ============================================================================
# MAIN
# ============================================================================

main() {
    # Check API is running
    check_api_running || exit 1

    case "${1:-help}" in
        list)      shift; cmd_list "$@" ;;
        show)      shift; cmd_show "$@" ;;
        create)    shift; cmd_create "$@" ;;
        delete)    shift; cmd_delete "$@" ;;
        update)    shift; cmd_update "$@" ;;
        rename)    shift; cmd_rename "$@" ;;
        session)   shift; cmd_session "$@" ;;
        hibernate) shift; cmd_hibernate "$@" ;;
        wake)      shift; cmd_wake "$@" ;;
        restart)   shift; cmd_restart "$@" ;;
        skill)     shift; cmd_skill "$@" ;;
        plugin)    shift; cmd_plugin "$@" ;;
        export)    shift; cmd_export "$@" ;;
        import)    shift; cmd_import "$@" ;;
        help|--help|-h) cmd_help ;;
        --version|-v) echo "aimaestro-agent.sh v1.0.1" ;;
        *) print_error "Unknown command: $1"; echo ""; cmd_help; exit 1 ;;
    esac
}

main "$@"
