#!/bin/bash
# Install AI Maestro Agent Hooks
#
# This script installs hooks for all detected AI coding agents:
#   - Claude Code  (~/.claude/settings.json)
#   - Codex CLI    (~/.codex/hooks.json + config.toml)
#   - Gemini CLI   (~/.gemini/settings.json)
#
# Usage: ./install-hooks.sh [-y]
#
# The same hook script (ai-maestro-hook.cjs) is used for all agents.
# It auto-detects which agent is calling it and returns the correct response format.

set -e

NON_INTERACTIVE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -y|--yes|--non-interactive) NON_INTERACTIVE=true; shift ;;
        *) shift ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_SCRIPT="$SCRIPT_DIR/ai-maestro-hook.cjs"
STATE_DIR="$HOME/.aimaestro/chat-state"
INSTALLED_COUNT=0

echo "Installing AI Maestro Agent Hooks..."
echo ""

# Make hook script executable
chmod +x "$HOOK_SCRIPT"

# Create state directory
mkdir -p "$STATE_DIR"

# --- Helper: merge hooks into a JSON settings file ---
# Usage: merge_hooks_into_settings <settings_file> <hooks_json> [remove_events]
#
# Our entries are the ones whose command mentions ai-maestro-hook. For every event in
# <hooks_json>:
#   - no entry of ours yet: add it;
#   - an entry of ours that differs from the wanted one (an older matcher, another timeout,
#     a moved script, a missing "async"): replace it in place, so an update reaches installs
#     that were set up by an earlier version;
#   - the same entry: nothing.
# Other hooks, in the same group or elsewhere, are never touched. <remove_events> (space
# separated event names) drops our entries for those events (used by the opt-out).
# When anything changes the previous file is kept as <settings_file>.aimaestro-backup-<time>
# (the newest 5 are kept).
merge_hooks_into_settings() {
    local SETTINGS_FILE="$1"
    local HOOKS_JSON="$2"
    local REMOVE_EVENTS="${3:-}"

    local EXISTING_SETTINGS='{}'
    if [ -f "$SETTINGS_FILE" ]; then
        EXISTING_SETTINGS=$(cat "$SETTINGS_FILE")
    fi

    local RESULT
    RESULT=$(node -e "
const existing = JSON.parse(process.argv[1]);
const hooks = JSON.parse(process.argv[2]);
const remove = (process.argv[3] || '').split(/\\s+/).filter(Boolean);
const before = JSON.stringify(existing);

const isOurs = (h) => typeof h?.command === 'string' && h.command.includes('ai-maestro-hook');
const groupHasOurs = (cfg) => Array.isArray(cfg?.hooks) && cfg.hooks.some(isOurs);

// Drop our hooks from one event's groups, keeping every other hook (and group) as it was.
const withoutOurs = (groups) => groups
    .map(cfg => groupHasOurs(cfg) ? { ...cfg, hooks: cfg.hooks.filter(h => !isOurs(h)) } : cfg)
    .filter(cfg => !(Array.isArray(cfg?.hooks) && cfg.hooks.length === 0));

if (!existing.hooks) existing.hooks = {};

for (const [event, configs] of Object.entries(hooks.hooks)) {
    const current = Array.isArray(existing.hooks[event]) ? existing.hooks[event] : [];
    const ours = current.filter(groupHasOurs);
    // Already exactly what we want: leave the file as it is.
    const wanted = JSON.stringify(configs);
    if (ours.length === configs.length && JSON.stringify(ours) === wanted) continue;
    if (ours.length === 0) {
        existing.hooks[event] = [...current, ...configs];
        continue;
    }
    // Replace in place: our entry takes the first of our old groups' position. A group that also
    // holds someone else's hook keeps that hook.
    const firstIdx = current.findIndex(groupHasOurs);
    const rest = current.map((cfg, i) => (groupHasOurs(cfg) ? { ...cfg, hooks: cfg.hooks.filter(h => !isOurs(h)), __ours: true } : cfg));
    const rebuilt = [];
    rest.forEach((cfg, i) => {
        if (i === firstIdx) rebuilt.push(...configs);
        if (cfg.__ours) {
            const { __ours, ...plain } = cfg;
            if (plain.hooks.length > 0) rebuilt.push(plain);
        } else {
            rebuilt.push(cfg);
        }
    });
    existing.hooks[event] = rebuilt;
}

for (const event of remove) {
    if (!Array.isArray(existing.hooks[event])) continue;
    const kept = withoutOurs(existing.hooks[event]);
    if (kept.length > 0) existing.hooks[event] = kept; else delete existing.hooks[event];
}

const after = JSON.stringify(existing);
process.stdout.write((before === after ? 'UNCHANGED' : 'CHANGED') + '\\n' + JSON.stringify(existing, null, 2));
" "$EXISTING_SETTINGS" "$HOOKS_JSON" "$REMOVE_EVENTS") || { echo "  ERROR: Could not merge hooks into $SETTINGS_FILE, keeping original"; return 1; }

    local VERDICT="${RESULT%%$'\n'*}"
    local MERGED_SETTINGS="${RESULT#*$'\n'}"
    # Nothing to change, and the file is already there: leave it byte for byte.
    if [ "$VERDICT" = "UNCHANGED" ] && [ -f "$SETTINGS_FILE" ]; then
        return 0
    fi

    # Keep the previous file before replacing it
    if [ -f "$SETTINGS_FILE" ]; then
        cp -p "$SETTINGS_FILE" "${SETTINGS_FILE}.aimaestro-backup-$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
        # keep the newest 5 backups
        # shellcheck disable=SC2012
        ls -1t "${SETTINGS_FILE}".aimaestro-backup-* 2>/dev/null | tail -n +6 | while read -r old; do rm -f "$old"; done
    fi

    # Write atomically
    local TEMP_SETTINGS
    TEMP_SETTINGS=$(mktemp "${SETTINGS_FILE}.XXXXXX")
    echo "$MERGED_SETTINGS" > "$TEMP_SETTINGS"
    if node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$TEMP_SETTINGS" 2>/dev/null; then
        mv "$TEMP_SETTINGS" "$SETTINGS_FILE"
        [ "$VERDICT" = "CHANGED" ] && echo "  Updated $SETTINGS_FILE (previous copy kept as ${SETTINGS_FILE}.aimaestro-backup-*)"
    else
        rm -f "$TEMP_SETTINGS"
        echo "  ERROR: Merged settings JSON is invalid, keeping original"
        return 1
    fi
}

# --- Helpers for the PermissionRequest hook ---
PERMISSION_REQUEST_MIN_VERSION="2.0.45"

# Is `claude` installed at PERMISSION_REQUEST_MIN_VERSION or later? Sets CLAUDE_VERSION_FOUND.
claude_supports_permission_request() {
    CLAUDE_VERSION_FOUND=""
    command -v claude >/dev/null 2>&1 || return 1
    local out
    out=$(claude --version 2>/dev/null | head -1) || return 1
    CLAUDE_VERSION_FOUND=$(printf '%s' "$out" | sed -n 's/^\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\).*/\1/p')
    [ -n "$CLAUDE_VERSION_FOUND" ] || return 1
    node -e "
const v = process.argv[1].split('.').map(Number), min = process.argv[2].split('.').map(Number);
for (let i = 0; i < 3; i++) { if (v[i] !== min[i]) process.exit(v[i] > min[i] ? 0 : 1); }
process.exit(0);
" "$CLAUDE_VERSION_FOUND" "$PERMISSION_REQUEST_MIN_VERSION"
}

# Print <hooks_json> with our async, observe-only PermissionRequest entry added.
add_permission_request_hook() {
    node -e "
const cfg = JSON.parse(process.argv[1]);
cfg.hooks.PermissionRequest = [{ hooks: [{ type: 'command', command: 'node ' + process.argv[2], timeout: 5, async: true }] }];
process.stdout.write(JSON.stringify(cfg));
" "$1" "$HOOK_SCRIPT"
}

# ============================================================
# Claude Code
# ============================================================
install_claude_hooks() {
    local SETTINGS_DIR="$HOME/.claude"
    local SETTINGS_FILE="$SETTINGS_DIR/settings.json"

    mkdir -p "$SETTINGS_DIR"

    local HOOKS_CONFIG
    HOOKS_CONFIG=$(cat << HOOKEOF
{
  "hooks": {
    "Notification": [
      {
        "matcher": "idle_prompt|permission_prompt|elicitation_dialog",
        "hooks": [
          {
            "type": "command",
            "command": "node $HOOK_SCRIPT",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node $HOOK_SCRIPT",
            "timeout": 5
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node $HOOK_SCRIPT",
            "timeout": 5
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node $HOOK_SCRIPT",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolBatch": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node $HOOK_SCRIPT",
            "timeout": 5,
            "async": true
          }
        ]
      }
    ],
    "StopFailure": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node $HOOK_SCRIPT",
            "timeout": 5,
            "async": true
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node $HOOK_SCRIPT",
            "timeout": 5,
            "async": true
          }
        ]
      }
    ]
  }
}
HOOKEOF
)

    # PermissionRequest: report "a permission or question is pending" the moment Claude Code asks,
    # instead of ~6 s later through the permission_prompt notification (which a keystroke in the
    # pane defers). Async and observe-only: it never answers the dialog and can never delay or
    # block the session. First available in Claude Code 2.0.45; an older Claude Code can reject a
    # settings file that names an event it does not know, so by default it is registered only when
    # `claude --version` says 2.0.45 or later.
    #   AIM_PERMISSION_REQUEST_HOOK=0   do not register it (and remove our entry if present)
    #   AIM_PERMISSION_REQUEST_HOOK=1   register it without checking the Claude Code version
    local REMOVE_EVENTS=""
    case "${AIM_PERMISSION_REQUEST_HOOK:-auto}" in
        0|off|false|no)
            REMOVE_EVENTS="PermissionRequest"
            echo "  PermissionRequest hook: off (AIM_PERMISSION_REQUEST_HOOK=0)"
            ;;
        1|on|true|yes)
            HOOKS_CONFIG=$(add_permission_request_hook "$HOOKS_CONFIG")
            echo "  PermissionRequest hook: on (AIM_PERMISSION_REQUEST_HOOK=1)"
            ;;
        *)
            if claude_supports_permission_request; then
                HOOKS_CONFIG=$(add_permission_request_hook "$HOOKS_CONFIG")
            else
                echo "  PermissionRequest hook: skipped (needs Claude Code 2.0.45 or later; found: ${CLAUDE_VERSION_FOUND:-no claude command})"
            fi
            ;;
    esac

    if merge_hooks_into_settings "$SETTINGS_FILE" "$HOOKS_CONFIG" "$REMOVE_EVENTS"; then
        echo "  Claude Code: $SETTINGS_FILE"
        INSTALLED_COUNT=$((INSTALLED_COUNT + 1))
    fi
}

# ============================================================
# Codex CLI
# ============================================================
install_codex_hooks() {
    local SETTINGS_DIR="$HOME/.codex"
    local HOOKS_FILE="$SETTINGS_DIR/hooks.json"
    local CONFIG_FILE="$SETTINGS_DIR/config.toml"

    mkdir -p "$SETTINGS_DIR"

    # Codex uses hooks.json (same format as Claude but different event set)
    local HOOKS_CONFIG
    HOOKS_CONFIG=$(cat << HOOKEOF
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node $HOOK_SCRIPT",
            "timeout": 5
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node $HOOK_SCRIPT",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
HOOKEOF
)

    if merge_hooks_into_settings "$HOOKS_FILE" "$HOOKS_CONFIG"; then
        echo "  Codex CLI:   $HOOKS_FILE"
        INSTALLED_COUNT=$((INSTALLED_COUNT + 1))
    fi

    # Enable hooks feature in config.toml if not already set
    if [ -f "$CONFIG_FILE" ]; then
        if ! grep -q 'codex_hooks' "$CONFIG_FILE" 2>/dev/null; then
            echo "" >> "$CONFIG_FILE"
            echo "[features]" >> "$CONFIG_FILE"
            echo "codex_hooks = true" >> "$CONFIG_FILE"
            echo "  Codex CLI:   enabled codex_hooks in $CONFIG_FILE"
        fi
    else
        cat > "$CONFIG_FILE" << TOMLEOF
[features]
codex_hooks = true
TOMLEOF
        echo "  Codex CLI:   created $CONFIG_FILE with codex_hooks enabled"
    fi
}

# ============================================================
# Gemini CLI
# ============================================================
install_gemini_hooks() {
    local SETTINGS_DIR="$HOME/.gemini"
    local SETTINGS_FILE="$SETTINGS_DIR/settings.json"

    mkdir -p "$SETTINGS_DIR"

    # Gemini uses AfterAgent (equivalent to Stop) and Notification
    local HOOKS_CONFIG
    HOOKS_CONFIG=$(cat << HOOKEOF
{
  "hooks": {
    "AfterAgent": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node $HOOK_SCRIPT",
            "timeout": 5
          }
        ]
      }
    ],
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node $HOOK_SCRIPT",
            "timeout": 5
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node $HOOK_SCRIPT",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
HOOKEOF
)

    if merge_hooks_into_settings "$SETTINGS_FILE" "$HOOKS_CONFIG"; then
        echo "  Gemini CLI:  $SETTINGS_FILE"
        INSTALLED_COUNT=$((INSTALLED_COUNT + 1))
    fi
}

# ============================================================
# Detect and install
# ============================================================

# Always install Claude Code (it's the primary agent)
echo "Claude Code:"
install_claude_hooks

# Detect and install Codex CLI
if command -v codex &>/dev/null || [ -d "$HOME/.codex" ]; then
    echo ""
    echo "Codex CLI (detected):"
    install_codex_hooks
fi

# Detect and install Gemini CLI
if command -v gemini &>/dev/null || [ -d "$HOME/.gemini" ]; then
    echo ""
    echo "Gemini CLI (detected):"
    install_gemini_hooks
fi

echo ""
echo "Hooks installed for $INSTALLED_COUNT agent(s)."
echo ""
echo "Configuration:"
echo "  Hook script:    $HOOK_SCRIPT"
echo "  State directory: $STATE_DIR"
echo ""
echo "Agents will now receive AMP inbox notifications between turns"
echo "and the Chat interface will show agent status."
echo ""
echo "Note: Existing agent sessions need to be restarted for"
echo "the hooks to take effect."
