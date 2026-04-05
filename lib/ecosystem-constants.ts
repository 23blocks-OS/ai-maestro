/**
 * AI Maestro Ecosystem Constants
 *
 * Single source of truth for all marketplace URLs, plugin names, repo URLs,
 * and ecosystem identifiers. If the project owner changes repos or orgs,
 * only this file needs updating.
 */

// ── Marketplace ──────────────────────────────────────────────

/** GitHub org/repo for the AI Maestro plugins marketplace */
export const MARKETPLACE_REPO = 'Emasoft/ai-maestro-plugins'

/** Marketplace name as resolved by Claude CLI (directory basename) */
export const MARKETPLACE_NAME = 'ai-maestro-plugins'

/** Local marketplace for custom Haephestos-generated role-plugins */
export const LOCAL_MARKETPLACE_NAME = 'ai-maestro-local-roles-marketplace'

/** Local marketplace directory name (under ~/agents/) */
export const LOCAL_MARKETPLACE_DIR_NAME = 'role-plugins'

/**
 * Resolve the local marketplace root path: ~/agents/role-plugins/
 * Plugins live directly at ~/agents/role-plugins/<plugin-name>/
 * Marketplace metadata at ~/agents/role-plugins/.claude-plugin/
 */
export function getLocalMarketplacePath(): string {
  const { homedir } = require('os') as typeof import('os')
  const { join } = require('path') as typeof import('path')
  return join(homedir(), 'agents', LOCAL_MARKETPLACE_DIR_NAME)
}

// ── User-Scope Plugins (from ai-maestro marketplace) ────────

/** Main AI Maestro plugin (skills, hooks, commands) */
export const MAIN_PLUGIN_NAME = 'ai-maestro-plugin'

/** AMP messaging plugin */
export const AMP_PLUGIN_NAME = 'claude-plugin'
export const AMP_PLUGIN_REPO = 'https://github.com/Emasoft/claude-plugin.git'

/** Cross-client skill repo (for non-Claude agents like Codex, Gemini, Aider) */
export const SKILL_PLUGIN_REPO = 'https://github.com/Emasoft/ai-maestro-plugin.git'

/** Agent Identity plugin */
export const AID_PLUGIN_NAME = 'agent-identity'
export const AID_PLUGIN_REPO = 'https://github.com/Emasoft/agent-identity.git'

// ── Role Plugins (local scope) ──────────────────────────────

export const ROLE_PLUGIN_MANAGER = 'ai-maestro-assistant-manager-agent'
export const ROLE_PLUGIN_COS = 'ai-maestro-chief-of-staff'
export const ROLE_PLUGIN_ARCHITECT = 'ai-maestro-architect-agent'
export const ROLE_PLUGIN_INTEGRATOR = 'ai-maestro-integrator-agent'
export const ROLE_PLUGIN_ORCHESTRATOR = 'ai-maestro-orchestrator-agent'
export const ROLE_PLUGIN_PROGRAMMER = 'ai-maestro-programmer-agent'

/** All predefined role-plugin names */
export const PREDEFINED_ROLE_PLUGIN_NAMES = [
  ROLE_PLUGIN_PROGRAMMER,
  ROLE_PLUGIN_ORCHESTRATOR,
  ROLE_PLUGIN_INTEGRATOR,
  ROLE_PLUGIN_ARCHITECT,
  ROLE_PLUGIN_COS,
  ROLE_PLUGIN_MANAGER,
] as const

/** Map from role-plugin name to its main agent filename */
export const ROLE_PLUGIN_MAIN_AGENTS: Record<string, string> = {
  [ROLE_PLUGIN_MANAGER]: 'amama-assistant-manager-main-agent',
  [ROLE_PLUGIN_COS]: 'ai-maestro-chief-of-staff-main-agent',
  [ROLE_PLUGIN_ARCHITECT]: 'ai-maestro-architect-agent-main-agent',
  [ROLE_PLUGIN_INTEGRATOR]: 'ai-maestro-integrator-agent-main-agent',
  [ROLE_PLUGIN_ORCHESTRATOR]: 'ai-maestro-orchestrator-agent-main-agent',
  [ROLE_PLUGIN_PROGRAMMER]: 'ai-maestro-programmer-agent-main-agent',
}

/** Map from governance title to its required role-plugin */
export const TITLE_PLUGIN_MAP: Record<string, string> = {
  'MANAGER': ROLE_PLUGIN_MANAGER,
  'CHIEF-OF-STAFF': ROLE_PLUGIN_COS,
  'ARCHITECT': ROLE_PLUGIN_ARCHITECT,
  'INTEGRATOR': ROLE_PLUGIN_INTEGRATOR,
  'ORCHESTRATOR': ROLE_PLUGIN_ORCHESTRATOR,
}

/** Map from role-plugin name to compatible governance titles */
export const PLUGIN_COMPATIBLE_TITLES: Record<string, string[]> = {
  [ROLE_PLUGIN_MANAGER]: ['MANAGER'],
  [ROLE_PLUGIN_COS]: ['CHIEF-OF-STAFF'],
  [ROLE_PLUGIN_ARCHITECT]: ['ARCHITECT'],
  [ROLE_PLUGIN_ORCHESTRATOR]: ['ORCHESTRATOR'],
  [ROLE_PLUGIN_INTEGRATOR]: ['INTEGRATOR'],
  [ROLE_PLUGIN_PROGRAMMER]: ['MEMBER'],
}

// ── Repo URLs ───────────────────────────────────────────────

/** Official AI Maestro repo */
export const AI_MAESTRO_REPO = 'https://github.com/23blocks-OS/ai-maestro'

/** Marketplace repo (fork — temporary) */
export const MARKETPLACE_REPO_URL = `https://github.com/${MARKETPLACE_REPO}`

/** Role-plugin repo URL pattern (all under Emasoft org) */
export function rolePluginRepoUrl(pluginName: string): string {
  return `https://github.com/Emasoft/${pluginName}.git`
}
