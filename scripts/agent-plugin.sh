#!/usr/bin/env bash
# AI Maestro Agent Plugin Commands
# Plugin management: dispatcher + 10 plugin subcommands + marketplace (4 subcommands)
#
# Version: 1.0.0
# Requires: agent-helper.sh, agent-core.sh
#
# Usage: source "$(dirname "$0")/agent-plugin.sh"

# Double-source guard
[[ -n "${_AGENT_PLUGIN_LOADED:-}" ]] && return 0
_AGENT_PLUGIN_LOADED=1

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
        # ToxicSkills: Post-install security scan for plugins that include skills
        # Check common skill locations for the installed plugin
        local plugin_skill_dirs=()
        local plugin_base="${plugin%%@*}"  # strip marketplace suffix
        for check_dir in \
            "$HOME/.claude/skills/$plugin_base" \
            "$agent_dir/.claude/skills/$plugin_base" \
            "$HOME/.claude/plugins/$plugin_base"; do
            [[ -d "$check_dir" ]] && [[ -f "$check_dir/SKILL.md" ]] && plugin_skill_dirs+=("$check_dir")
        done

        for scan_dir in "${plugin_skill_dirs[@]}"; do
            if ! scan_skill_security "$scan_dir" "$plugin"; then
                print_error "Plugin contains a skill with critical security issues."
                print_error "Uninstalling plugin '$plugin'..."
                run_claude_command "$agent_dir" plugin uninstall "$plugin" --scope "$scope" 2>/dev/null || true
                rm -rf "$scan_dir" 2>/dev/null || true
                return 1
            fi
        done

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

# ============================================================================
# MARKETPLACE MANAGEMENT (Claude Code only)
# ============================================================================

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
