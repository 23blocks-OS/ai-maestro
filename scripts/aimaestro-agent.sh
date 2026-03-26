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

# Global flags
FORCE=false

# ============================================================================
# SOURCE MODULES
# Sourcing order matters: helper -> core -> commands/session/skill/plugin
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Helper function to source a module from SCRIPT_DIR or fallback to ~/.local/bin
_source_module() {
    local module="$1"
    if [[ -f "${SCRIPT_DIR}/${module}" ]]; then
        if ! source "${SCRIPT_DIR}/${module}"; then
            echo "Error: Failed to source ${module}" >&2
            exit 1
        fi
    elif [[ -f "${HOME}/.local/bin/${module}" ]]; then
        if ! source "${HOME}/.local/bin/${module}"; then
            echo "Error: Failed to source ${module} from ~/.local/bin" >&2
            exit 1
        fi
    else
        echo "Error: ${module} not found in ${SCRIPT_DIR} or ~/.local/bin" >&2
        exit 1
    fi
}

# 1. Helper: colors, print_*, resolve_agent, get_api_base
_source_module "agent-helper.sh"

# 2. Core: shared infra (temp files, security, validation, JSON editing, Claude CLI helpers)
_source_module "agent-core.sh"

# 3. Command modules (depend on helper + core)
_source_module "agent-commands.sh"
_source_module "agent-session.sh"
_source_module "agent-skill.sh"
_source_module "agent-plugin.sh"

# ============================================================================
# SETUP
# ============================================================================

# Check dependencies (defined in agent-core.sh)
check_dependencies

# Set up cleanup trap (cleanup() is defined in agent-core.sh)
trap cleanup EXIT INT TERM

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
