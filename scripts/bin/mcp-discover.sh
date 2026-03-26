#!/usr/bin/env bash
# mcp-discover.sh — Discover tools, resources, and prompts from MCP servers
#
# Usage:
#   mcp-discover.sh <config-path> <server-name> [options]
#   mcp-discover.sh --plugin <plugin-name> <server-name> [options]
#   mcp-discover.sh --help
#
# Options:
#   --plugin <name>     Look up .mcp.json from an installed plugin by name
#   --format <fmt>      Output format: json (default), text, llm
#   --raw               Return raw unprocessed server response
#   --method <method>   JSON-RPC method (e.g. tools/call, resources/list)
#   --tool-name <name>  Tool name for tools/call method
#   --tool-arg K=V      Argument for tools/call (repeatable)
#   --timeout <secs>    Max seconds to wait (default: 25)
#   --api               Use AI Maestro API instead of local script
#   --help              Show this help
#
# Examples:
#   # Discover tools from a plugin's MCP server
#   mcp-discover.sh --plugin chromedev-tools cdt
#
#   # Discover from a config file directly
#   mcp-discover.sh ~/.claude/plugins/cache/kriscard/chromedev-tools/0.1.0/.mcp.json cdt
#
#   # Get text output
#   mcp-discover.sh --plugin grepika grepika --format text
#
#   # Call a specific tool
#   mcp-discover.sh --plugin chromedev-tools cdt --method tools/call --tool-name list_pages
#
#   # Use the API (for remote agents)
#   mcp-discover.sh --plugin chromedev-tools cdt --api

set -uo pipefail

AIMAESTRO_API="${AIMAESTRO_API:-http://localhost:23000}"
PLUGINS_CACHE="$HOME/.claude/plugins/cache"

show_help() {
  sed -n '2,/^$/p' "$0" | sed 's/^# \?//'
  exit 0
}

# Parse arguments
CONFIG_PATH=""
SERVER_NAME=""
PLUGIN_NAME=""
FORMAT="json"
RAW=false
USE_API=false
METHOD=""
TOOL_NAME=""
TOOL_ARGS=()
TIMEOUT=25

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h) show_help ;;
    --plugin) PLUGIN_NAME="$2"; shift 2 ;;
    --format) FORMAT="$2"; shift 2 ;;
    --raw) RAW=true; shift ;;
    --api) USE_API=true; shift ;;
    --method) METHOD="$2"; shift 2 ;;
    --tool-name) TOOL_NAME="$2"; shift 2 ;;
    --tool-arg) TOOL_ARGS+=("$2"); shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    *)
      if [[ -z "$CONFIG_PATH" && -z "$PLUGIN_NAME" ]]; then
        CONFIG_PATH="$1"
      elif [[ -z "$SERVER_NAME" ]]; then
        SERVER_NAME="$1"
      else
        echo "Error: unexpected argument: $1" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

# Resolve config path from plugin name
if [[ -n "$PLUGIN_NAME" && -z "$CONFIG_PATH" ]]; then
  # Search cache for the plugin's .mcp.json
  for mkt_dir in "$PLUGINS_CACHE"/*/; do
    for plugin_dir in "$mkt_dir""$PLUGIN_NAME"/*/; do
      if [[ -f "$plugin_dir/.mcp.json" ]]; then
        CONFIG_PATH="$plugin_dir/.mcp.json"
        break 2
      fi
    done
  done
  if [[ -z "$CONFIG_PATH" ]]; then
    echo "Error: no .mcp.json found for plugin '$PLUGIN_NAME'" >&2
    exit 1
  fi
fi

if [[ -z "$CONFIG_PATH" ]]; then
  echo "Error: config path or --plugin required" >&2
  echo "Run with --help for usage" >&2
  exit 1
fi

if [[ -z "$SERVER_NAME" ]]; then
  echo "Error: server name required" >&2
  exit 1
fi

if [[ ! -f "$CONFIG_PATH" ]]; then
  echo "Error: config file not found: $CONFIG_PATH" >&2
  exit 1
fi

# Use API or local script
if $USE_API; then
  # Build JSON payload
  PAYLOAD=$(jq -n \
    --arg configPath "$CONFIG_PATH" \
    --arg serverName "$SERVER_NAME" \
    --arg format "$FORMAT" \
    --argjson raw "$RAW" \
    --arg method "$METHOD" \
    --arg toolName "$TOOL_NAME" \
    --argjson timeout "$TIMEOUT" \
    '{configPath: $configPath, serverName: $serverName, format: $format, raw: $raw, timeout: $timeout}
     | if $method != "" then . + {method: $method} else . end
     | if $toolName != "" then . + {toolName: $toolName} else . end')

  curl -s -X POST "$AIMAESTRO_API/api/settings/mcp-discover" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD"
else
  # Run discovery script directly (local mode)
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  # Try project scripts_dev first, then fall back to bundled
  DISCOVER_SCRIPT=""
  for candidate in \
    "$SCRIPT_DIR/../../../../scripts_dev/mcp_discovery.py" \
    "$SCRIPT_DIR/../scripts_dev/mcp_discovery.py" \
    "$(pwd)/scripts_dev/mcp_discovery.py"; do
    if [[ -f "$candidate" ]]; then
      DISCOVER_SCRIPT="$candidate"
      break
    fi
  done

  if [[ -z "$DISCOVER_SCRIPT" ]]; then
    echo "Error: mcp_discovery.py not found. Use --api to use the AI Maestro API instead." >&2
    exit 1
  fi

  # Resolve ${CLAUDE_PLUGIN_ROOT} in the config
  PLUGIN_ROOT="$(dirname "$CONFIG_PATH")"
  TMP_CONFIG=$(mktemp /tmp/mcp-discover-XXXXXX.json)
  sed "s|\${CLAUDE_PLUGIN_ROOT}|$PLUGIN_ROOT|g" "$CONFIG_PATH" > "$TMP_CONFIG"
  trap 'rm -f "$TMP_CONFIG"' EXIT

  # Build args
  ARGS=("$TMP_CONFIG" "$SERVER_NAME" "--format" "$FORMAT" "--timeout" "$TIMEOUT" "--no-prompt-key")
  if $RAW; then ARGS+=("--dangerously-output-the-raw-response"); fi
  if [[ -n "$METHOD" ]]; then ARGS+=("--method" "$METHOD"); fi
  if [[ -n "$TOOL_NAME" ]]; then ARGS+=("--tool-name" "$TOOL_NAME"); fi
  for arg in "${TOOL_ARGS[@]}"; do ARGS+=("--tool-arg" "$arg"); done

  CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" uv run "$DISCOVER_SCRIPT" "${ARGS[@]}"
fi
