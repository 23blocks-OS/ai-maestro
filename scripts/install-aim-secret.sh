#!/bin/bash
# Put `aim-secret` on the PATH (~/.local/bin) so agents and the lolabot mail tools can call it.
# Safe to run again. Uninstall: rm ~/.local/bin/aim-secret
#
# The launcher records the absolute path of the `node` that runs this installer (the updater's,
# normally nvm's). A non-interactive shell or an agent's tmux session often has no nvm, or only an
# old system node (no built-in fetch), so a bare `node` in the launcher is not reliable. If the
# recorded node has disappeared, the launcher falls back to the first `node` on the PATH.
set -e
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${AIM_BIN_DIR:-$HOME/.local/bin}"
NODE_BIN="$(command -v node || true)"
mkdir -p "$BIN"
cat > "$BIN/aim-secret" <<WRAP
#!/bin/bash
NODE="$NODE_BIN"
[ -x "\$NODE" ] || NODE="\$(command -v node || true)"
[ -n "\$NODE" ] || { echo "aim-secret: node is not installed or not on the PATH" >&2; exit 127; }
exec "\$NODE" "$REPO/scripts/aim-secret.mjs" "\$@"
WRAP
chmod +x "$BIN/aim-secret"
echo "installed: $BIN/aim-secret (node: ${NODE_BIN:-none found})"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "note: $BIN is not on your PATH yet" ;; esac
