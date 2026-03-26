#!/usr/bin/env bash
# shellcheck disable=SC2034  # Variables used by sourcing scripts
# AI Maestro Agent Core Functions
# Shared infrastructure: temp files, security scanning, validation,
# Claude CLI helpers, and safe JSON editing.
#
# Version: 1.0.0
# Requires: bash 4.0+, curl, jq, tmux
# Note: Must be sourced after agent-helper.sh
#
# Usage: source "$(dirname "$0")/agent-core.sh"

# Double-source guard
[[ -n "${_AGENT_CORE_LOADED:-}" ]] && return 0
_AGENT_CORE_LOADED=1

# ============================================================================
# TEMP FILE MANAGEMENT
# ============================================================================

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

# Helper to register temp files for cleanup
register_temp_file() {
    _TEMP_FILES+=("$1")
}

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

# Escape regex metacharacters in a string for safe use in patterns
# Usage: escaped=$(escape_regex "$string")
escape_regex() {
    printf '%s' "$1" | sed 's/[][\/.^$*+?{}|()]/\\&/g'
}

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

# Lazy check for claude CLI (only needed for plugin commands)
require_claude() {
    if ! command -v claude >/dev/null 2>&1; then
        print_error "Claude CLI is required for plugin commands but not found"
        print_error "Install with: npm install -g @anthropic-ai/claude-code"
        return 1
    fi
}

# ============================================================================
# TOXICSKILLS SECURITY SCANNER
# Scans SKILL.md files for malicious patterns before installation.
# Built-in pattern checks for common attack vectors.
# Returns 0 (safe or warnings only), 1 (critical - block)
# ============================================================================

scan_skill_security() {
    local skill_path="$1"
    local skill_name="${2:-unknown}"

    # Find SKILL.md in the given path
    local skill_md=""
    if [[ -f "$skill_path/SKILL.md" ]]; then
        skill_md="$skill_path/SKILL.md"
    elif [[ -f "$skill_path" ]] && [[ "$skill_path" == *.md ]]; then
        skill_md="$skill_path"
    fi

    if [[ -z "$skill_md" ]]; then
        print_warning "No SKILL.md found to scan at: $skill_path"
        return 0
    fi

    local content
    content=$(cat "$skill_md" 2>/dev/null) || return 0

    local has_critical=false
    local has_warning=false

    # --- CRITICAL PATTERNS (block installation) ---

    # 1. Base64 decode piped to execution
    if printf '%s\n' "$content" | grep -qiE 'base64\s+(-d|--decode).*\|\s*(bash|sh|eval|source)|echo\s+.*\|\s*base64\s+(-d|--decode)'; then
        print_error "CRITICAL: Obfuscated command execution detected (base64 decode + pipe to shell)"
        has_critical=true
    fi

    # 2. curl/wget piped to shell
    if printf '%s\n' "$content" | grep -qiE '(curl|wget)\s+.*\|\s*(bash|sh|sudo\s+bash|eval|source)'; then
        print_error "CRITICAL: Remote code execution pattern detected (curl/wget piped to shell)"
        has_critical=true
    fi

    # 3. Password-protected archives
    if printf '%s\n' "$content" | grep -qiE 'unzip\s+-P\s|7z\s+x\s+-p|tar.*--passphrase'; then
        print_error "CRITICAL: Password-protected archive extraction detected (AV evasion technique)"
        has_critical=true
    fi

    # 4. DAN-style jailbreak / developer mode injection
    if printf '%s\n' "$content" | grep -qiE 'ignore\s+(previous|all|prior)\s+instructions|developer\s+mode|DAN\s+mode|safety\s+(warnings?|mechanisms?)\s+are\s+(test|fake|artifacts)'; then
        print_error "CRITICAL: Prompt injection / jailbreak pattern detected"
        has_critical=true
    fi

    # 5. Credential exfiltration patterns
    if printf '%s\n' "$content" | grep -qiE 'cat\s+~/?\.(aws|ssh|gnupg|config|netrc)|cat.*credentials.*\|\s*(curl|wget|base64)|env\s*\|\s*(curl|wget)'; then
        print_error "CRITICAL: Credential exfiltration pattern detected"
        has_critical=true
    fi

    # 6. Eval with variable/dynamic content
    if printf '%s\n' "$content" | grep -qiE 'eval\s+\$\(|eval\s+"?\$'; then
        print_error "CRITICAL: Dynamic eval execution detected"
        has_critical=true
    fi

    # 7. systemctl / service manipulation
    if printf '%s\n' "$content" | grep -qiE 'systemctl\s+(enable|start|restart)\s|service\s+.*\s+(start|enable)'; then
        print_error "CRITICAL: System service manipulation detected"
        has_critical=true
    fi

    # --- WARNING PATTERNS (proceed with caution) ---

    # 8. Downloads from unknown GitHub releases
    if printf '%s\n' "$content" | grep -qiE 'github\.com/[^/]+/[^/]+/releases/download'; then
        print_warning "WARNING: Downloads from GitHub releases detected — verify the repository"
        has_warning=true
    fi

    # 9. chmod +x on downloaded files
    if printf '%s\n' "$content" | grep -qiE 'chmod\s+\+x.*\.(sh|py|bin|exe)|chmod\s+755'; then
        print_warning "WARNING: Makes downloaded files executable"
        has_warning=true
    fi

    # 10. Hardcoded API keys / tokens
    if printf '%s\n' "$content" | grep -qiE '(sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36}|AKIA[A-Z0-9]{16}|xox[bprs]-[a-zA-Z0-9-]+)'; then
        print_warning "WARNING: Hardcoded API key or token detected"
        has_warning=true
    fi

    # 11. Sudo usage
    if printf '%s\n' "$content" | grep -qiE 'sudo\s+(rm|chmod|chown|mv|cp|apt|yum|dnf|brew|npm|pip)'; then
        print_warning "WARNING: Sudo command usage detected"
        has_warning=true
    fi

    # Results
    if $has_critical; then
        echo ""
        print_error "BLOCKED: Skill '$skill_name' contains critical security issues."
        print_error "Installation aborted. Review the skill manually before installing."
        print_info "To bypass (NOT recommended): review the skill manually and install the files directly"
        return 1
    elif $has_warning; then
        echo ""
        print_warning "Skill '$skill_name' has warnings but no critical issues."
        print_info "Proceeding with installation..."
        return 0
    else
        print_success "Security scan passed for skill '$skill_name'"
        return 0
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

    # Resolve both paths to absolute, handling missing paths
    # realpath -m is GNU-only; fall back to Python or manual resolution on macOS
    local resolved cache_resolved
    if command -v realpath >/dev/null 2>&1 && realpath -m / >/dev/null 2>&1; then
        resolved=$(realpath -m "$path" 2>/dev/null) || return 1
        cache_resolved=$(realpath -m "$cache_base" 2>/dev/null) || return 1
    elif command -v python3 >/dev/null 2>&1; then
        resolved=$(python3 -c "import os,sys; print(os.path.normpath(os.path.join(os.getcwd(), sys.argv[1])))" "$path") || return 1
        cache_resolved=$(python3 -c "import os,sys; print(os.path.normpath(os.path.join(os.getcwd(), sys.argv[1])))" "$cache_base") || return 1
    else
        resolved=$(cd -P -- "$(dirname "$path")" 2>/dev/null && pwd)/$(basename -- "$path") || return 1
        cache_resolved=$(cd -P -- "$(dirname "$cache_base")" 2>/dev/null && pwd)/$(basename -- "$cache_base") || return 1
    fi

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
    printf '%s' "$input" | tr -cd '[:print:][:space:]' | sed $'s/\x1b\\[[0-9;]*m//g'
}

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
    # Unset CLAUDECODE to bypass nesting detection when invoked from within a Claude Code session.
    # The unset is scoped to the subshell and cannot affect the parent session. (Fix for issue 9.1)
    (cd "$work_dir" && unset CLAUDECODE && claude "${cmd_args[@]}" >"$tmp_stdout" 2>"$tmp_stderr")
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

# Gracefully restart Claude Code inside the SAME tmux session.
# Sends /exit, waits, then starts claude again with the agent's stored programArgs.
# This PRESERVES the tmux session, scrollback history, and chat history.
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

    print_info "Restarting Claude Code (preserving tmux session and history)..."

    # Get the agent's session name and programArgs from registry
    local agent_json
    agent_json=$(curl -s --max-time 10 "${api_base}/api/agents/${agent_id}")
    local session_name
    session_name=$(echo "$agent_json" | jq -r '.agent.session.tmuxSessionName // .agent.name // .agent.alias // empty' 2>/dev/null)
    local program_args
    program_args=$(echo "$agent_json" | jq -r '.agent.programArgs // empty' 2>/dev/null)

    if [[ -z "$session_name" ]]; then
        print_warning "No active tmux session found — agent may be offline"
        return 0
    fi

    # 1. Send /exit to Claude Code (graceful shutdown — keeps tmux alive)
    local payload
    payload=$(jq -n --arg cmd "/exit" '{"command": $cmd, "requireIdle": false}')
    curl -s --max-time 10 -X POST "${api_base}/api/sessions/${session_name}/command" \
        -H "Content-Type: application/json" \
        -d "$payload" >/dev/null 2>&1

    # 2. Wait for Claude Code to exit
    sleep "$wait_secs"

    # 3. Start Claude Code again in the same tmux session
    local start_cmd="claude"
    if [[ -n "$program_args" ]]; then
        start_cmd="claude $program_args"
    fi
    payload=$(jq -n --arg cmd "$start_cmd" '{"command": $cmd, "requireIdle": false}')
    curl -s --max-time 10 -X POST "${api_base}/api/sessions/${session_name}/command" \
        -H "Content-Type: application/json" \
        -d "$payload" >/dev/null 2>&1

    # 4. Verify agent comes back online
    sleep 3
    local response
    response=$(curl -s --max-time 10 "${api_base}/api/agents/${agent_id}")
    local status
    status=$(echo "$response" | jq -r '.agent.session.status // "unknown"' 2>/dev/null)

    if [[ "$status" == "online" ]]; then
        print_success "Agent restarted successfully (session preserved)"
        return 0
    else
        print_warning "Agent status: $status (may need a moment to reconnect)"
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
