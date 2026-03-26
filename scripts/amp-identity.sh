#!/bin/bash
# =============================================================================
# AMP Identity - Check and Display Agent Identity
# =============================================================================
#
# Quick identity check for agents recovering context.
# This is the FIRST command an agent should run when using AMP.
#
# Usage:
#   amp-identity              # Human-readable output
#   amp-identity --json       # JSON output for parsing
#   amp-identity --brief      # One-line summary
#
# =============================================================================

set -e

# Pre-source: extract --id to set agent identity before helper resolves it
_amp_prev=""
for _amp_arg in "$@"; do
    if [ "$_amp_prev" = "--id" ]; then
        export CLAUDE_AGENT_ID="$_amp_arg"
        break
    fi
    _amp_prev="$_amp_arg"
done
unset _amp_prev _amp_arg

# Source helper functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/amp-helper.sh"

# Parse arguments
FORMAT="text"

while [[ $# -gt 0 ]]; do
    case $1 in
        --json|-j)
            FORMAT="json"
            shift
            ;;
        --brief|-b)
            FORMAT="brief"
            shift
            ;;
        --id)
            shift 2  # Already handled in pre-source parsing
            ;;
        --help|-h)
            echo "Usage: amp-identity [--id UUID] [options]"
            echo ""
            echo "Check and display your AMP identity."
            echo "Run this FIRST to recover your identity after context reset."
            echo ""
            echo "Options:"
            echo "  --id UUID      Operate as this agent (UUID from config.json)"
            echo "  --json, -j     Output as JSON"
            echo "  --brief, -b    One-line summary"
            echo "  --help, -h     Show this help"
            echo ""
            echo "Files:"
            echo "  Identity: ~/.agent-messaging/IDENTITY.md"
            echo "  Config:   ~/.agent-messaging/config.json"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Run 'amp-identity --help' for usage."
            exit 1
            ;;
    esac
done

# Check identity based on format
case "$FORMAT" in
    json)
        check_identity json
        ;;
    brief)
        if is_initialized; then
            load_config
            echo "AMP: ${AMP_ADDRESS} (${AMP_FINGERPRINT})"
        else
            echo "AMP: Not initialized (run: amp-init --auto)"
            exit 1
        fi
        ;;
    *)
        check_identity text
        ;;
esac
