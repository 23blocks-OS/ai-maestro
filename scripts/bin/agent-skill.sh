#!/usr/bin/env bash
# AI Maestro Agent Skill Commands
# Skill management: dispatcher + list/add/remove/install/uninstall
#
# Version: 1.0.0
# Requires: agent-helper.sh, agent-core.sh
#
# Usage: source "$(dirname "$0")/agent-skill.sh"

# Double-source guard
[[ -n "${_AGENT_SKILL_LOADED:-}" ]] && return 0
_AGENT_SKILL_LOADED=1

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

    # ToxicSkills security scan before finalizing installation
    if ! scan_skill_security "$target_dir" "$skill_name"; then
        print_error "Removing skill due to critical security issues..."
        rm -rf "$target_dir"
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
