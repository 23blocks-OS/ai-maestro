#!/bin/bash
# Put `aim-secret` on the PATH (~/.local/bin) so agents and the lolabot mail tools can call it.
# Safe to run again. Uninstall: rm ~/.local/bin/aim-secret
set -e
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${AIM_BIN_DIR:-$HOME/.local/bin}"
mkdir -p "$BIN"
cat > "$BIN/aim-secret" <<WRAP
#!/bin/bash
exec node "$REPO/scripts/aim-secret.mjs" "\$@"
WRAP
chmod +x "$BIN/aim-secret"
echo "installed: $BIN/aim-secret"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "note: $BIN is not on your PATH yet" ;; esac
