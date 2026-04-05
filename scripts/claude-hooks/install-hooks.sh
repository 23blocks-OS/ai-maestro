#!/bin/bash
# Install AI Maestro Claude Code Hooks
#
# DEPRECATED: Hooks are now provided by the ai-maestro-plugin (v2.4.0+).
# The plugin's hooks/hooks.json registers all 10 hook events using the
# portable ${CLAUDE_PLUGIN_ROOT} variable, which works on any machine.
#
# This script previously wrote hardcoded absolute paths into
# ~/.claude/settings.json, which broke on other machines and duplicated
# the plugin's own hook registrations.
#
# To get the hooks:
#   claude plugin update ai-maestro-plugin@ai-maestro-plugins
#
# The plugin handles: SessionStart, Notification, Stop, StopFailure,
# SessionEnd, SubagentStart, SubagentStop, PreCompact, PostCompact,
# PermissionRequest — all via ${CLAUDE_PLUGIN_ROOT}/scripts/ai-maestro-hook.cjs

echo "DEPRECATED: AI Maestro hooks are now provided by the ai-maestro-plugin."
echo "No hooks were written to settings.json."
echo ""
echo "To ensure you have the latest hooks, run:"
echo "  claude plugin update ai-maestro-plugin@ai-maestro-plugins"
echo ""
echo "The plugin's hooks.json handles all 10 hook events automatically."
