#!/bin/bash
# Put `safe-psql` on the PATH (~/.local/bin): the SQL gate wrapper of the agentic-sql skill, run in a
# private Python environment (~/.aimaestro/venvs/agentic-sql) so system Python is never touched.
# Safe to run again; the packages are reinstalled only when requirements.txt changes.
# Uninstall: rm ~/.local/bin/safe-psql; rm -rf ~/.aimaestro/venvs/agentic-sql
#
# Some hosts (minimal Debian/Ubuntu) have Python without pip or the venv helper. The environment is then
# created without pip and pip is bootstrapped into it from bootstrap.pypa.io. Nothing outside the one
# private folder is changed. If anything fails the script says why and exits non-zero; the updater only warns.
set -e
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO/plugin/plugins/ai-maestro/skills/agentic-sql"
BIN="${AIM_BIN_DIR:-$HOME/.local/bin}"
VENV="${AIM_SAFE_PSQL_VENV:-$HOME/.aimaestro/venvs/agentic-sql}"

[ -f "$SRC/scripts/safe_psql.py" ] || { echo "safe-psql: skill not found at $SRC (run: git submodule update --init)" >&2; exit 1; }
PY=""
for p in python3.13 python3.12 python3.11 python3.10 python3.9 python3; do
  if command -v "$p" >/dev/null 2>&1 && "$p" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null; then PY="$(command -v "$p")"; break; fi
done
[ -n "$PY" ] || { echo "safe-psql: Python 3.9 or newer is not installed" >&2; exit 1; }

STAMP="$VENV/.requirements.sha"
WANT="$(shasum -a 256 "$SRC/requirements.txt" | cut -d' ' -f1)"
if [ ! -x "$VENV/bin/python" ] || [ "$(cat "$STAMP" 2>/dev/null)" != "$WANT" ]; then
  if [ ! -x "$VENV/bin/python" ]; then
    mkdir -p "$(dirname "$VENV")"
    "$PY" -m venv "$VENV" >/dev/null 2>&1 || { rm -rf "$VENV"; "$PY" -m venv --without-pip "$VENV"; }
  fi
  if ! "$VENV/bin/python" -m pip --version >/dev/null 2>&1; then
    T="$(mktemp)"; curl -fsS -m 60 https://bootstrap.pypa.io/get-pip.py -o "$T"
    "$VENV/bin/python" "$T" -q >/dev/null 2>&1; rm -f "$T"
  fi
  "$VENV/bin/python" -m pip install -q -r "$SRC/requirements.txt" 2>&1 | grep -v -i notice || true
  "$VENV/bin/python" -c 'import sqlglot, psycopg' 2>/dev/null || { echo "safe-psql: could not install sqlglot and psycopg into $VENV" >&2; exit 1; }
  echo "$WANT" > "$STAMP"
fi

mkdir -p "$BIN"
cat > "$BIN/safe-psql" <<WRAP
#!/bin/sh
exec "$VENV/bin/python" "$SRC/scripts/safe_psql.py" "\$@"
WRAP
chmod +x "$BIN/safe-psql"
echo "installed: $BIN/safe-psql (python: $VENV)"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "note: $BIN is not on your PATH yet" ;; esac
