#!/bin/bash
# AI Maestro — Tailscale Serve Configuration
#
# Automatically configures `tailscale serve` so that the AI Maestro dashboard
# is accessible from any device in the same Tailscale VPN (iPad, phone, laptop).
#
# The server stays on 127.0.0.1:23000 (localhost only). Tailscale serves as a
# secure reverse proxy, routing tailnet traffic to localhost.
#
# This script is idempotent — safe to run multiple times.
#
# Usage:
#   ./scripts/setup-tailscale-serve.sh           # Configure tailscale serve
#   ./scripts/setup-tailscale-serve.sh --remove  # Remove tailscale serve config
#   ./scripts/setup-tailscale-serve.sh --status  # Check current status
#
# Called automatically by server.mjs on startup (if Tailscale is available).

set -euo pipefail

PORT="${AIMAESTRO_PORT:-23000}"

# --- Helpers ---

has_tailscale() {
  command -v tailscale &>/dev/null
}

tailscale_running() {
  tailscale status &>/dev/null 2>&1
}

get_hostname() {
  tailscale status --json 2>/dev/null | python3 -c "
import json, sys
d = json.load(sys.stdin)
dns = d.get('Self', {}).get('DNSName', '')
# Remove trailing dot
print(dns.rstrip('.'))
" 2>/dev/null
}

get_tailscale_ip() {
  tailscale ip -4 2>/dev/null
}

current_serve_config() {
  tailscale serve status --json 2>/dev/null
}

has_our_tcp_config() {
  local config
  config=$(current_serve_config)
  echo "$config" | python3 -c "
import json, sys
d = json.load(sys.stdin)
tcp = d.get('TCP', {})
if '${PORT}' in tcp:
    fwd = tcp['${PORT}'].get('TCPForward', '')
    if '127.0.0.1:${PORT}' in fwd:
        print('tcp')
        sys.exit(0)
print('none')
" 2>/dev/null
}

has_our_http_config() {
  local config
  config=$(current_serve_config)
  echo "$config" | python3 -c "
import json, sys
d = json.load(sys.stdin)
web = d.get('Web', {})
for port_key, handlers in web.items():
    for path, handler in handlers.get('Handlers', {}).items():
        proxy = handler.get('Proxy', '')
        if '127.0.0.1:${PORT}' in proxy or 'localhost:${PORT}' in proxy:
            print('http')
            sys.exit(0)
print('none')
" 2>/dev/null
}

can_use_https() {
  # Check if HTTPS certificates are enabled on this Tailscale account
  local hostname output
  hostname=$(get_hostname)
  if [ -z "$hostname" ]; then return 1; fi
  output=$(tailscale cert "$hostname" 2>&1 || true)
  if echo "$output" | grep -q "does not support"; then
    return 1
  fi
  return 0
}

# --- Commands ---

do_status() {
  if ! has_tailscale; then
    echo '{"available":false,"reason":"tailscale not installed"}'
    return
  fi
  if ! tailscale_running; then
    echo '{"available":false,"reason":"tailscale not running"}'
    return
  fi

  local hostname ip serve_mode
  hostname=$(get_hostname)
  ip=$(get_tailscale_ip)

  local tcp_mode http_mode
  tcp_mode=$(has_our_tcp_config)
  http_mode=$(has_our_http_config)

  if [ "$http_mode" = "http" ]; then
    serve_mode="http"
  elif [ "$tcp_mode" = "tcp" ]; then
    serve_mode="tcp"
  else
    serve_mode="none"
  fi

  local https_available="false"
  if can_use_https 2>/dev/null; then
    https_available="true"
  fi

  cat <<EOJSON
{
  "available": true,
  "hostname": "${hostname}",
  "ip": "${ip}",
  "serveMode": "${serve_mode}",
  "httpsAvailable": ${https_available},
  "port": ${PORT},
  "url": "http://${hostname}:${PORT}",
  "httpsUrl": "https://${hostname}"
}
EOJSON
}

do_configure() {
  if ! has_tailscale; then
    echo "ERROR: tailscale is not installed. Install from https://tailscale.com/download" >&2
    exit 1
  fi
  if ! tailscale_running; then
    echo "ERROR: tailscale is not running. Start it first." >&2
    exit 1
  fi

  local hostname ip
  hostname=$(get_hostname)
  ip=$(get_tailscale_ip)

  if [ -z "$hostname" ]; then
    echo "ERROR: cannot determine Tailscale hostname" >&2
    exit 1
  fi

  # Check if we already have the right config
  local http_mode tcp_mode
  http_mode=$(has_our_http_config)
  tcp_mode=$(has_our_tcp_config)

  # Prefer HTTPS mode (port 443) if certs are available
  if can_use_https 2>/dev/null; then
    if [ "$http_mode" = "http" ]; then
      echo "OK: tailscale serve already configured (HTTPS mode)"
      echo "URL: https://${hostname}"
      exit 0
    fi
    # Remove any existing config that conflicts
    if [ "$tcp_mode" = "tcp" ] || [ "$http_mode" != "none" ]; then
      echo "Removing old serve config..."
      tailscale serve reset 2>/dev/null || true
      sleep 1
    fi
    echo "Configuring tailscale serve (HTTPS mode)..."
    tailscale serve --bg "$PORT"
    echo "OK: AI Maestro accessible at https://${hostname}"
    echo "Identity headers enabled (Tailscale-User-Login, Tailscale-User-Name)"
  else
    # Fallback: HTTP mode on the same port (no auto-cert, but still tailnet-only)
    if [ "$http_mode" = "http" ]; then
      echo "OK: tailscale serve already configured (HTTP mode)"
      echo "URL: http://${hostname}:${PORT}"
      exit 0
    fi
    # Remove any existing config that conflicts
    if [ "$tcp_mode" = "tcp" ] || [ "$http_mode" != "none" ]; then
      echo "Removing old serve config..."
      tailscale serve reset 2>/dev/null || true
      sleep 1
    fi
    echo "Configuring tailscale serve (HTTP mode — HTTPS certs not available)..."
    echo "To enable HTTPS: go to https://login.tailscale.com/admin/dns and enable HTTPS Certificates"
    tailscale serve --bg --http "$PORT" "$PORT"
    echo "OK: AI Maestro accessible at http://${hostname}:${PORT}"
    echo "WARNING: HTTP mode — no identity headers, no auto-TLS"
    echo "Enable HTTPS certs in Tailscale admin for full security"
  fi
}

do_remove() {
  if ! has_tailscale; then
    echo "tailscale not installed, nothing to remove"
    exit 0
  fi
  local tcp_mode http_mode
  tcp_mode=$(has_our_tcp_config 2>/dev/null || echo "none")
  http_mode=$(has_our_http_config 2>/dev/null || echo "none")

  if [ "$tcp_mode" = "none" ] && [ "$http_mode" = "none" ]; then
    echo "No AI Maestro serve config found"
    exit 0
  fi

  echo "Removing tailscale serve config for AI Maestro..."
  tailscale serve reset --yes 2>/dev/null || tailscale serve reset 2>/dev/null || true
  echo "OK: tailscale serve config removed"
}

# --- Main ---

case "${1:-}" in
  --status)  do_status ;;
  --remove)  do_remove ;;
  --help|-h)
    echo "Usage: $0 [--status|--remove|--help]"
    echo "  (no args)  Configure tailscale serve for AI Maestro"
    echo "  --status   Check current configuration (JSON output)"
    echo "  --remove   Remove tailscale serve config"
    ;;
  *)         do_configure ;;
esac
