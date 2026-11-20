#!/bin/bash
# Launch an agent's program with its credential profile (#65). AI Maestro puts this in front of the launch command:
#
#   aim-launch.sh oauth-token <vault name> -- <command...>
#   aim-launch.sh api-key     <vault name> -- <command...>
#   aim-launch.sh gateway     <vault name> <base url> [model] -- <command...>
#   aim-launch.sh config-dir  <folder> -- <command...>
#
# The secret is read from the vault at launch by `aim-secret exec`; it is never in a file, never typed into the pane
# and never logged. Notes from the incident that made this:
# - Claude Code ignores CLAUDE_CODE_OAUTH_TOKEN and CLAUDE_CONFIG_DIR in a project's settings env; it must come from
#   the process environment, which is what this does.
# - Variables that outrank the profile (ANTHROPIC_AUTH_TOKEN, ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL) are cleared.
# - aim-secret exec pipes the child's output through its scrubber, so the program reattaches to the pane's terminal
#   by its real device path; /dev/tty makes Claude Code (Bun) crash with "EINVAL ... kqueue" on macOS.
# - A pasted token can carry spaces or line breaks (a 108-character token stored as 110): they are removed.
set -u
kind="${1:-}"; shift || true
case "$kind" in
  oauth-token|api-key) secret="${1:-}"; shift ;;
  gateway) secret="${1:-}"; base="${2:-}"; shift 2; model=""; [ "${1:-}" != "--" ] && { model="${1:-}"; shift; } ;;
  config-dir) dir="${1:-}"; shift ;;
  *) echo "aim-launch: unknown credential kind '$kind'" >&2; exit 2 ;;
esac
[ "${1:-}" = "--" ] && shift
[ $# -gt 0 ] || { echo "aim-launch: no command after --" >&2; exit 2; }
command="$*"

unset ANTHROPIC_AUTH_TOKEN ANTHROPIC_API_KEY ANTHROPIC_BASE_URL CLAUDE_CODE_OAUTH_TOKEN
export AIM_CREDENTIAL_VIA="$kind" # the Claude Code hook reports this mark back: the live check on the agent card
# Which profile, by vault name or folder (never a value): a switch to another token of the same kind shows until a restart
export AIM_CREDENTIAL_REF="${secret:-${dir:-}}"
case "$kind" in
  config-dir)
    [ -d "$dir" ] || { echo "aim-launch: no folder $dir" >&2; exit 2; }
    export CLAUDE_CONFIG_DIR="$dir"
    # Claude Code reads this folder's settings.json, not ~/.claude: put the AI Maestro hook there too (writes only on a change)
    bash "$(dirname "${BASH_SOURCE[0]}")/claude-hooks/install-hooks.sh" -y --claude-config-dir "$dir" >/dev/null 2>&1 \
      || echo "aim-launch: could not add the AI Maestro hook to $dir/settings.json (messages and status may not reach this agent)" >&2
    exec /bin/bash -c "$command" ;;
  oauth-token) var=CLAUDE_CODE_OAUTH_TOKEN ;;
  api-key) var=ANTHROPIC_API_KEY ;;
  gateway) var=ANTHROPIC_AUTH_TOKEN; export ANTHROPIC_BASE_URL="$base"; [ -n "$model" ] && export ANTHROPIC_MODEL="$model" ;;
esac
command -v aim-secret >/dev/null 2>&1 || { echo "aim-launch: aim-secret is not installed on this computer" >&2; exit 2; }
AIM_TTY=$(tty 2>/dev/null) || { echo "aim-launch: not on a terminal" >&2; exit 2; }
export AIM_TTY AIM_VAR="$var" AIM_COMMAND="$command"
exec aim-secret exec --use "$var=$secret" -- /bin/bash -c '
  v="${!AIM_VAR}"; v="${v//[[:space:]]/}"
  [ -n "$v" ] || { echo "aim-launch: the vault entry for $AIM_VAR is empty" >"$AIM_TTY"; exit 2; }
  export "$AIM_VAR=$v"; unset AIM_VAR
  exec /bin/bash -c "$AIM_COMMAND" <"$AIM_TTY" >"$AIM_TTY" 2>&1'
