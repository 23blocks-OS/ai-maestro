#!/usr/bin/env bash
# AI Maestro Agent Commands
# CRUD commands: help, list, show, create, delete, update, rename, export, import
#
# Version: 1.0.0
# Requires: agent-helper.sh, agent-core.sh
#
# Usage: source "$(dirname "$0")/agent-commands.sh"

# Double-source guard
[[ -n "${_AGENT_COMMANDS_LOADED:-}" ]] && return 0
_AGENT_COMMANDS_LOADED=1

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
    resolve_agent "$agent" || return 1
    local agent_id="$RESOLVED_AGENT_ID"

    # Fetch full agent data by resolved ID
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
    local allowed_programs="claude-code claude codex aider cursor gemini opencode none terminal"
    local program_lower="${program,,}"  # lowercase
    if [[ ! " $allowed_programs " =~ [[:space:]]"${program_lower}"[[:space:]] ]]; then
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
