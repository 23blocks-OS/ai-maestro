#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# AI Maestro Ecosystem Constants — single source of truth for shell scripts
# TypeScript equivalent: lib/ecosystem-constants.ts
#
# Source this file at the top of every shell script that references
# marketplace repos, plugin names, or ecosystem identifiers:
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   source "$SCRIPT_DIR/ecosystem-config.sh"   # or adjust path
# ──────────────────────────────────────────────────────────────

# ── Marketplace ──────────────────────────────────────────────
MARKETPLACE_REPO="Emasoft/ai-maestro-plugins"
MARKETPLACE_NAME="ai-maestro-plugins"
LOCAL_MARKETPLACE_NAME="ai-maestro-local-agents-marketplace"
LOCAL_MARKETPLACE_DIR_NAME="role-plugins"

# ── User-Scope Plugins ──────────────────────────────────────
MAIN_PLUGIN_NAME="ai-maestro"
AMP_PLUGIN_NAME="claude-plugin"
AMP_PLUGIN_REPO="https://github.com/Emasoft/claude-plugin.git"
AID_PLUGIN_NAME="agent-identity"
AID_PLUGIN_REPO="https://github.com/Emasoft/agent-identity.git"

# ── Role Plugins ─────────────────────────────────────────────
ROLE_PLUGIN_MANAGER="ai-maestro-assistant-manager-agent"
ROLE_PLUGIN_COS="ai-maestro-chief-of-staff"
ROLE_PLUGIN_ARCHITECT="ai-maestro-architect-agent"
ROLE_PLUGIN_INTEGRATOR="ai-maestro-integrator-agent"
ROLE_PLUGIN_ORCHESTRATOR="ai-maestro-orchestrator-agent"
ROLE_PLUGIN_PROGRAMMER="ai-maestro-programmer-agent"

# ── Repo URLs ────────────────────────────────────────────────
AI_MAESTRO_REPO="https://github.com/23blocks-OS/ai-maestro"
MARKETPLACE_REPO_URL="https://github.com/${MARKETPLACE_REPO}"
