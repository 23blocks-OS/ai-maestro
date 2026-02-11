#!/bin/bash
# AI Maestro - Gateway Management Helper
# Usage: setup-gateway.sh <command> [gateway]
#
# Commands:
#   list                 List installed gateways with status
#   validate <gateway>   Check .env has real values (not placeholders)
#   start <gateway>      Start via pm2 (or nohup fallback)
#   stop <gateway>       Stop the service
#   test <gateway>       curl /health endpoint
#   status               All gateways at a glance
#
# Compatible with bash 3.2+ (macOS default)

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
DIM='\033[2m'
NC='\033[0m'

# Determine install directory (script lives in $INSTALL_DIR/scripts/)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="$(dirname "$SCRIPT_DIR")"
SERVICES_DIR="$INSTALL_DIR/services"

# All known gateways (order used for listing)
ALL_GATEWAYS="slack discord email whatsapp"

# =============================================================================
# GATEWAY REGISTRY (bash 3.2 compatible — no associative arrays)
# =============================================================================

_gateway_port() {
    case "$1" in
        email)    echo 3020 ;;
        whatsapp) echo 3021 ;;
        slack)    echo 3022 ;;
        discord)  echo 3023 ;;
        *)        echo "" ;;
    esac
}

_gateway_display() {
    case "$1" in
        email)    echo "Email" ;;
        whatsapp) echo "WhatsApp" ;;
        slack)    echo "Slack" ;;
        discord)  echo "Discord" ;;
        *)        echo "$1" ;;
    esac
}

# =============================================================================
# HELPERS
# =============================================================================

_err() { printf "${RED}✗${NC} %s\n" "$1" >&2; }
_ok()  { printf "${GREEN}✓${NC} %s\n" "$1"; }
_info(){ printf "${BLUE}→${NC} %s\n" "$1"; }
_warn(){ printf "${YELLOW}!${NC} %s\n" "$1"; }

_gateway_dir() {
    echo "$SERVICES_DIR/${1}-gateway"
}

_validate_gateway_name() {
    local name="$1"
    if [ -z "$name" ]; then
        _err "Gateway name required. Options: slack, discord, email, whatsapp"
        exit 1
    fi
    local port
    port=$(_gateway_port "$name")
    if [ -z "$port" ]; then
        _err "Unknown gateway: $name. Options: slack, discord, email, whatsapp"
        exit 1
    fi
}

_is_installed() {
    local dir
    dir=$(_gateway_dir "$1")
    [ -d "$dir" ] && [ -f "$dir/package.json" ]
}

_is_configured() {
    local dir env_file
    dir=$(_gateway_dir "$1")
    env_file="$dir/.env"
    [ -f "$env_file" ] && ! grep -q 'your-.*-here\|PLACEHOLDER\|CHANGEME\|TODO' "$env_file" 2>/dev/null
}

_is_running() {
    local name="$1"
    local port
    port=$(_gateway_port "$name")

    # Check pm2 first (use jq if available, otherwise grep)
    if command -v pm2 &>/dev/null; then
        local pm2_json
        pm2_json=$(pm2 jlist 2>/dev/null) || true
        if [ -n "$pm2_json" ] && echo "$pm2_json" | grep -q "\"name\":\"${name}-gateway\"" 2>/dev/null; then
            if command -v jq &>/dev/null; then
                local status
                status=$(echo "$pm2_json" | jq -r ".[] | select(.name==\"${name}-gateway\") | .pm2_env.status" 2>/dev/null || echo "unknown")
                [ "$status" = "online" ] && return 0
            else
                # No jq — if pm2 lists it, assume it's running (grep found the name)
                # Double-check with port below
                :
            fi
        fi
    fi

    # Fallback: check if port is in use
    if command -v lsof &>/dev/null; then
        lsof -ti:"$port" &>/dev/null && return 0
    elif command -v ss &>/dev/null; then
        ss -tlnp 2>/dev/null | grep -q ":$port " && return 0
    fi

    return 1
}

_pm2_name() {
    echo "${1}-gateway"
}

# =============================================================================
# COMMANDS
# =============================================================================

cmd_list() {
    echo ""
    printf "  %-12s %-12s %-14s %-10s %s\n" "Gateway" "Installed" "Configured" "Running" "Port"
    printf "  %-12s %-12s %-14s %-10s %s\n" "-------" "---------" "----------" "-------" "----"

    for gw in $ALL_GATEWAYS; do
        local installed configured running display port
        display=$(_gateway_display "$gw")
        port=$(_gateway_port "$gw")
        if _is_installed "$gw"; then installed="${GREEN}yes${NC}"; else installed="${DIM}no${NC}"; fi
        if _is_configured "$gw"; then configured="${GREEN}yes${NC}"; else configured="${DIM}no${NC}"; fi
        if _is_running "$gw"; then running="${GREEN}yes${NC}"; else running="${DIM}no${NC}"; fi

        printf "  %-12s %-24b %-26b %-22b %s\n" \
            "$display" "$installed" "$configured" "$running" "$port"
    done
    echo ""
}

cmd_validate() {
    local name="$1"
    _validate_gateway_name "$name"

    local dir env_file example_file display
    dir=$(_gateway_dir "$name")
    env_file="$dir/.env"
    example_file="$dir/.env.example"
    display=$(_gateway_display "$name")

    if [ ! -d "$dir" ]; then
        _err "$display gateway is not installed"
        return 1
    fi

    if [ ! -f "$env_file" ]; then
        _err "No .env file found at $env_file"
        _info "Copy the example: cp $example_file $env_file"
        return 1
    fi

    local issues=0

    # Check for placeholder values
    while IFS='=' read -r key value; do
        # Skip comments and empty lines
        case "$key" in
            \#*|"") continue ;;
        esac
        # Strip inline comments and whitespace
        value=$(echo "$value" | sed 's/#.*//' | xargs)
        # Check for common placeholder patterns
        if echo "$value" | grep -qiE 'your-.*-here|PLACEHOLDER|CHANGEME|TODO|xxx|replace-me'; then
            _warn "  $key = $value  (placeholder)"
            issues=$((issues + 1))
        elif [ -z "$value" ] && echo "$key" | grep -qiE 'TOKEN|SECRET|KEY|PASSWORD'; then
            _warn "  $key is empty (required credential)"
            issues=$((issues + 1))
        fi
    done < "$env_file"

    if [ $issues -eq 0 ]; then
        _ok "$display gateway configuration looks valid"
        return 0
    else
        _err "$display gateway has $issues placeholder/empty value(s)"
        return 1
    fi
}

cmd_start() {
    local name="$1"
    _validate_gateway_name "$name"

    local dir port pm2name display
    dir=$(_gateway_dir "$name")
    port=$(_gateway_port "$name")
    pm2name=$(_pm2_name "$name")
    display=$(_gateway_display "$name")

    if [ ! -d "$dir" ]; then
        _err "$display gateway is not installed"
        return 1
    fi

    if _is_running "$name"; then
        _warn "$display gateway is already running on port $port"
        return 0
    fi

    # Validate config first
    if ! cmd_validate "$name" 2>/dev/null; then
        _err "Fix configuration issues before starting. Run: $0 validate $name"
        return 1
    fi

    _info "Starting $display gateway on port $port..."

    if command -v pm2 &>/dev/null; then
        # Prefer pm2
        cd "$dir"
        if [ -f "ecosystem.config.cjs" ]; then
            pm2 start ecosystem.config.cjs --name "$pm2name" 2>/dev/null || \
                pm2 start npm --name "$pm2name" -- start
        elif [ -f "ecosystem.config.js" ]; then
            pm2 start ecosystem.config.js --name "$pm2name" 2>/dev/null || \
                pm2 start npm --name "$pm2name" -- start
        else
            pm2 start npm --name "$pm2name" -- start
        fi
        pm2 save 2>/dev/null || true
    else
        # Fallback: nohup
        cd "$dir"
        mkdir -p "$dir/logs"
        nohup npm start > "$dir/logs/gateway.log" 2>&1 &
        echo $! > "$dir/logs/gateway.pid"
    fi

    # Wait for health
    local attempts=0
    while [ $attempts -lt 15 ]; do
        if curl -s "http://127.0.0.1:$port/health" >/dev/null 2>&1; then
            _ok "$display gateway started on port $port"
            return 0
        fi
        sleep 1
        attempts=$((attempts + 1))
    done

    _warn "$display gateway may still be starting (no health response yet)"
    _info "Check logs: pm2 logs $pm2name"
}

cmd_stop() {
    local name="$1"
    _validate_gateway_name "$name"

    local pm2name display port
    pm2name=$(_pm2_name "$name")
    display=$(_gateway_display "$name")
    port=$(_gateway_port "$name")

    if command -v pm2 &>/dev/null; then
        pm2 stop "$pm2name" 2>/dev/null && pm2 delete "$pm2name" 2>/dev/null || true
        pm2 save 2>/dev/null || true
    fi

    # Also kill by PID file if exists
    local dir pidfile
    dir=$(_gateway_dir "$name")
    pidfile="$dir/logs/gateway.pid"
    if [ -f "$pidfile" ]; then
        local pid
        pid=$(cat "$pidfile")
        kill "$pid" 2>/dev/null || true
        rm -f "$pidfile"
    fi

    # Kill by port as last resort
    if command -v lsof &>/dev/null; then
        local pids
        pids=$(lsof -ti:"$port" 2>/dev/null || true)
        if [ -n "$pids" ]; then
            echo "$pids" | xargs kill 2>/dev/null || true
        fi
    fi

    _ok "$display gateway stopped"
}

cmd_test() {
    local name="$1"
    _validate_gateway_name "$name"

    local port display
    port=$(_gateway_port "$name")
    display=$(_gateway_display "$name")
    local url="http://127.0.0.1:$port/health"

    _info "Testing $display gateway at $url..."

    local response
    response=$(curl -s -w "\n%{http_code}" "$url" 2>/dev/null) || {
        _err "$display gateway is not responding on port $port"
        return 1
    }

    local http_code body
    http_code=$(echo "$response" | tail -1)
    # Get everything except the last line (portable — works on macOS BSD)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ]; then
        _ok "$display gateway is healthy (HTTP $http_code)"
        if [ -n "$body" ]; then
            echo "  $body"
        fi
        return 0
    else
        _err "$display gateway returned HTTP $http_code"
        if [ -n "$body" ]; then
            echo "  $body"
        fi
        return 1
    fi
}

cmd_status() {
    echo ""
    echo "  AI Maestro Gateway Status"
    echo "  ========================="
    cmd_list

    # Check AI Maestro core
    if curl -s http://localhost:23000/api/sessions >/dev/null 2>&1; then
        _ok "AI Maestro core is running (port 23000)"
    else
        _warn "AI Maestro core is NOT running"
    fi

    # Check mailman
    if tmux has-session -t mailman 2>/dev/null; then
        _ok "Mailman agent is running (tmux session: mailman)"
    else
        _warn "Mailman agent is not running"
        _info "Start with: tmux new-session -d -s mailman -c ~/mailman-agent 'claude'"
    fi
    echo ""
}

# =============================================================================
# USAGE
# =============================================================================

show_help() {
    echo "AI Maestro - Gateway Management"
    echo ""
    echo "Usage: $(basename "$0") <command> [gateway]"
    echo ""
    echo "Commands:"
    echo "  list                 List installed gateways with status"
    echo "  validate <gateway>   Check .env has real values (not placeholders)"
    echo "  start <gateway>      Start via pm2 (or nohup fallback)"
    echo "  stop <gateway>       Stop the service"
    echo "  test <gateway>       curl /health endpoint"
    echo "  status               All gateways at a glance"
    echo ""
    echo "Gateways: slack, discord, email, whatsapp"
    echo ""
    echo "Examples:"
    echo "  $(basename "$0") status"
    echo "  $(basename "$0") validate discord"
    echo "  $(basename "$0") start slack"
    echo "  $(basename "$0") test slack"
}

# =============================================================================
# MAIN
# =============================================================================

CMD="${1:-}"
GW="${2:-}"

case "$CMD" in
    list)       cmd_list ;;
    validate)   cmd_validate "$GW" ;;
    start)      cmd_start "$GW" ;;
    stop)       cmd_stop "$GW" ;;
    test)       cmd_test "$GW" ;;
    status)     cmd_status ;;
    -h|--help)  show_help ;;
    "")         show_help ;;
    *)          _err "Unknown command: $CMD"; show_help; exit 1 ;;
esac
