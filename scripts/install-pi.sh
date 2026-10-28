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
set -euo pipefail

VERTEX_PROJECT=""
VERTEX_LOCATION="global"
CHECK_ONLY=false
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
    -h|--help) sed -n 2,16p "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

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
