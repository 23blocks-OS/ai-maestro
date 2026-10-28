#!/bin/bash
# Install Pi (https://pi.dev) for AI Maestro agents, without changing the host's default Node.
#
# Pi 1.x needs zlib.createZstdDecompress: Node 22.15+ (Pi declares >=22.19), or 23.8+, or 24+.
# AI Maestro and its native modules run on Node 20, so Pi gets its own Node and a small wrapper
# at ~/.local/bin/pi that pins it. A tmux pane then finds `pi` on PATH whatever Node the shell uses.
#
# Usage:
#   scripts/install-pi.sh                      install Pi
#   scripts/install-pi.sh --vertex PROJECT [LOCATION]
#                                              also use Gemini on Google Vertex AI with the machine's
#                                              own Google login (no API key). LOCATION defaults to "global";
#                                              Gemini 3 models are only served there.
#   scripts/install-pi.sh --check              report what is installed, change nothing
#   scripts/install-pi.sh --no-amp             skip the message tools and rules (below)
#   scripts/install-pi.sh --amp-only           only the message tools and rules, no Pi install
#
# By default it also (--amp) lets Pi agents answer AMP messages: it copies the extension
# scripts/pi/ai-maestro-amp into <pi agent dir>/extensions/ (tools amp_inbox, amp_read, amp_reply, amp_send)
# and keeps a managed block in <pi agent dir>/AGENTS.md between <!-- ai-maestro:begin --> and
# <!-- ai-maestro:end -->. Running it again replaces only that block; your own text stays.
# The agent dir is $PI_CODING_AGENT_DIR, else ~/.pi/agent. The AMP scripts come from the AI Maestro plugin.
set -euo pipefail

VERTEX_PROJECT=""
VERTEX_LOCATION="global"
CHECK_ONLY=false
DO_AMP=true
AMP_ONLY=false
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PI_AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
BLOCK_BEGIN='<!-- ai-maestro:begin -->'
BLOCK_END='<!-- ai-maestro:end -->'
PI_PKG="@earendil-works/pi-coding-agent"
WRAPPER_DIR="$HOME/.local/bin"

while [ $# -gt 0 ]; do
  case "$1" in
    --vertex)
      VERTEX_PROJECT="${2:-}"
      [ -n "$VERTEX_PROJECT" ] || { echo "--vertex needs a project id" >&2; exit 2; }
      shift 2
      if [ $# -gt 0 ] && [[ "$1" != --* ]]; then VERTEX_LOCATION="$1"; shift; fi
      ;;
    --check) CHECK_ONLY=true; shift ;;
    --amp) DO_AMP=true; shift ;;
    --no-amp) DO_AMP=false; shift ;;
    --amp-only) AMP_ONLY=true; DO_AMP=true; shift ;;
    -h|--help) sed -n 2,24p "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

# Install the AI Maestro message tools for Pi: the extension and the managed block in AGENTS.md.
# Replaces only what it owns: the ai-maestro-amp extension directory and the text between the markers.
install_amp() {
  local ext_src="$SRC_DIR/pi/ai-maestro-amp" block_src="$SRC_DIR/pi/agents-block.md"
  local ext_dst="$PI_AGENT_DIR/extensions/ai-maestro-amp" agents="$PI_AGENT_DIR/AGENTS.md"
  [ -f "$ext_src/index.js" ] && [ -f "$block_src" ] || { echo "Missing $ext_src or $block_src" >&2; return 1; }

  mkdir -p "$PI_AGENT_DIR/extensions"
  rm -rf "$ext_dst"
  mkdir -p "$ext_dst"
  cp "$ext_src/index.js" "$ext_src/core.mjs" "$ext_dst/"

  if [ ! -e "$agents" ]; then
    cp "$block_src" "$agents"
  else
    local nb ne
    nb="$(grep -cxF "$BLOCK_BEGIN" "$agents" || true)"
    ne="$(grep -cxF "$BLOCK_END" "$agents" || true)"
    if [ "$nb" = 0 ] && [ "$ne" = 0 ]; then
      # No block yet: append one, with a blank line between your text and ours.
      { cat "$agents"; [ -z "$(tail -c1 "$agents")" ] || echo; echo; cat "$block_src"; } > "$agents.tmp.$$"
      mv "$agents.tmp.$$" "$agents"
    elif [ "$nb" = 1 ] && [ "$ne" = 1 ]; then
      awk -v b="$BLOCK_BEGIN" -v e="$BLOCK_END" -v f="$block_src" '
        $0 == b { while ((getline l < f) > 0) print l; skip = 1; next }
        $0 == e { skip = 0; next }
        !skip { print }
      ' "$agents" > "$agents.tmp.$$"
      mv "$agents.tmp.$$" "$agents"
    else
      echo "Not touching $agents: it has $nb begin and $ne end marker lines (expected one of each). Fix it by hand." >&2
      return 1
    fi
  fi
  echo "Pi message tools: extension in $ext_dst, rules in $agents"
  if ! command -v amp-reply.sh >/dev/null 2>&1 && [ ! -x "$HOME/.local/bin/amp-reply.sh" ]; then
    echo "Note: amp-reply.sh is not installed on this host; the tools need the AI Maestro plugin (scripts/install-plugin.sh)." >&2
  fi
}

if $AMP_ONLY; then install_amp; exit $?; fi

# True when the given node binary has zstd support.
node_ok() {
  "$1" -e 'process.exit(typeof require("zlib").createZstdDecompress === "function" ? 0 : 1)' 2>/dev/null
}

# Find a usable Node: PATH first, then every nvm version, newest first.
find_node() {
  local n
  n="$(command -v node 2>/dev/null || true)"
  if [ -n "$n" ] && node_ok "$n"; then echo "$n"; return 0; fi
  if [ -d "$HOME/.nvm/versions/node" ]; then
    for n in $(ls -1d "$HOME"/.nvm/versions/node/v* 2>/dev/null | sort -V -r); do
      if [ -x "$n/bin/node" ] && node_ok "$n/bin/node"; then echo "$n/bin/node"; return 0; fi
    done
  fi
  return 1
}

NODE_BIN="$(find_node || true)"

if $CHECK_ONLY; then
  if [ -n "$NODE_BIN" ]; then echo "Node with zstd: $NODE_BIN ($("$NODE_BIN" -v))"; else echo "Node with zstd: none found"; fi
  if [ -x "$WRAPPER_DIR/pi" ]; then echo "pi wrapper: $WRAPPER_DIR/pi"; "$WRAPPER_DIR/pi" --version 2>&1 | head -1 || true; else echo "pi wrapper: not installed"; fi
  if [ -f "$PI_AGENT_DIR/extensions/ai-maestro-amp/index.js" ]; then echo "AMP extension: installed"; else echo "AMP extension: not installed"; fi
  if grep -qxF "$BLOCK_BEGIN" "$PI_AGENT_DIR/AGENTS.md" 2>/dev/null; then echo "AGENTS.md block: present"; else echo "AGENTS.md block: absent"; fi
  exit 0
fi

if [ -z "$NODE_BIN" ]; then
  echo "No Node with zstd support found. Installing Node 22 beside the others with nvm (default Node unchanged)."
  if [ ! -s "$HOME/.nvm/nvm.sh" ]; then
    echo "nvm is not installed. Install it first (https://github.com/nvm-sh/nvm) or use Pi's own installer: curl -fsSL https://pi.dev/install.sh | sh" >&2
    exit 1
  fi
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
  nvm install 22 >/dev/null
  NODE_BIN="$(find_node || true)"
  [ -n "$NODE_BIN" ] || { echo "Node 22 installed but without zstd support; need 22.15 or newer." >&2; exit 1; }
fi

NODE_DIR="$(dirname "$NODE_BIN")"
echo "Using Node $("$NODE_BIN" -v) at $NODE_DIR"

PATH="$NODE_DIR:$PATH" npm install -g --ignore-scripts "$PI_PKG" >/dev/null
PI_BIN="$NODE_DIR/pi"
[ -x "$PI_BIN" ] || { echo "Pi did not install at $PI_BIN" >&2; exit 1; }

mkdir -p "$WRAPPER_DIR"
{
  echo '#!/bin/sh'
  echo "# Written by AI Maestro scripts/install-pi.sh: runs Pi with a Node that has zstd."
  echo "export PATH=\"$NODE_DIR:\$PATH\""
  if [ -n "$VERTEX_PROJECT" ]; then
    echo "export GOOGLE_CLOUD_PROJECT=\"\${GOOGLE_CLOUD_PROJECT:-$VERTEX_PROJECT}\""
    echo "export GOOGLE_CLOUD_LOCATION=\"\${GOOGLE_CLOUD_LOCATION:-$VERTEX_LOCATION}\""
  fi
  echo "exec \"$PI_BIN\" \"\$@\""
} > "$WRAPPER_DIR/pi"
chmod 755 "$WRAPPER_DIR/pi"

if [ -n "$VERTEX_PROJECT" ]; then
  # Pi's own readiness check looks for a gcloud login file, which a Google VM does not have.
  # The placeholder below makes Pi use the machine's identity through Google's auth library instead.
  mkdir -p "$HOME/.pi/agent"
  MODELS="$HOME/.pi/agent/models.json"
  if [ -e "$MODELS" ]; then
    echo "Keeping your existing $MODELS. Add this provider by hand:" >&2
    echo '  "google-vertex": { "apiKey": "gcp-vertex-credentials" }' >&2
  else
    cat > "$MODELS" <<'EOF'
{
  "$schema": "https://pi.dev/schemas/models.schema.json",
  "providers": {
    "google-vertex": { "apiKey": "gcp-vertex-credentials" }
  }
}
EOF
    chmod 600 "$MODELS"
  fi
fi

if $DO_AMP; then install_amp; fi

case ":$PATH:" in
  *":$WRAPPER_DIR:"*) ;;
  *) echo "Note: $WRAPPER_DIR is not on PATH in this shell; add it to ~/.bashrc (tmux panes start a non-login shell)." ;;
esac

echo "Pi installed: $("$WRAPPER_DIR/pi" --version 2>&1 | head -1)"
if [ -n "$VERTEX_PROJECT" ]; then
  echo "Vertex AI: project $VERTEX_PROJECT, location $VERTEX_LOCATION. Try: pi --provider google-vertex --model gemini-3.5-flash -p 'say OK'"
else
  echo "Next: run pi once and /login (Pi has no model of its own)."
fi
