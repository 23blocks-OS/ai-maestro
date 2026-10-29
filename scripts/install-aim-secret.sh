#!/bin/bash
# Put `aim-secret` on the PATH (~/.local/bin) so agents and the lolabot mail tools can call it.
# Safe to run again. Uninstall: rm ~/.local/bin/aim-secret
#
# The launcher records the absolute path of the `node` that runs this installer (the updater's,
# normally nvm's). A non-interactive shell or an agent's tmux session often has no nvm, or only an
# old system node (no built-in fetch), so a bare `node` in the launcher is not reliable. If the
# recorded node has disappeared, the launcher falls back to the first `node` on the PATH.
set -e
# Resolve the checkout the installed file will point at. Run from a linked git worktree (a scratch
# copy under /tmp, an agent's worktree), the script's own folder disappears with the worktree and
# leaves a dead pointer. Use the main checkout instead, and refuse a temp folder.
stable_repo() {
    local dir="$1" common main
    common="$(git -C "$dir" rev-parse --git-common-dir 2>/dev/null || true)"
    if [ -n "$common" ]; then
        main="$(cd "$dir" && cd "$common/.." 2>/dev/null && pwd || true)"
        [ -n "$main" ] && [ -d "$main/scripts" ] && dir="$main"
    fi
    case "$dir" in
        /tmp/*|/private/tmp/*|/var/folders/*|/private/var/folders/*)
            if [ "${AIM_ALLOW_TEMP_REPO:-}" != "1" ]; then
                echo "error: $dir is a temporary folder; run this from the main checkout (or set AIM_ALLOW_TEMP_REPO=1 for a test)" >&2
                exit 1
            fi ;;
    esac
    echo "$dir"
}
REPO="$(stable_repo "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)")"
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
