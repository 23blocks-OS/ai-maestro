/**
 * Element Management Service
 *
 * Centralized gateway for ALL plugin install/uninstall/enable/disable operations.
 * Consolidates scattered logic from role-plugin-service.ts into one place.
 *
 * Functions moved here from role-plugin-service.ts:
 *   - installPluginLocally()
 *   - uninstallPluginLocally()
 *   - autoAssignRolePluginForTitle()
 *   - uninstallAllRolePlugins()
 *   - syncRolePlugin() (renamed from syncRolePluginForTitle)
 *
 * New wrapper functions:
 *   - installPlugin()    — general plugin install with role-plugin guard
 *   - uninstallPlugin()  — general plugin uninstall
 *   - enablePlugin()     — enable a disabled plugin
 *   - disablePlugin()    — disable without uninstalling
 *
 * All settings.json writes are serialized via withSettingsLock() to prevent
 * concurrent read-modify-write races.
 */

import type { AgentRole } from '@/types/agent'
import { join } from 'path'
import { homedir } from 'os'
import { mkdir, writeFile, readFile, rm, copyFile, readdir, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import {
  MARKETPLACE_NAME as GITHUB_MARKETPLACE_NAME_IMPORT,
  LOCAL_MARKETPLACE_NAME,
  LOCAL_MARKETPLACE_DIR_NAME,
  PREDEFINED_ROLE_PLUGIN_NAMES,
  ROLE_PLUGIN_MAIN_AGENTS,
  TITLE_PLUGIN_MAP as ECOSYSTEM_TITLE_PLUGIN_MAP,
} from '@/lib/ecosystem-constants'

const execFileAsync = promisify(execFile)

// ── Paths ─────────────────────────────────────────────────────
const HOME = homedir()
const ROLE_PLUGINS_DIR = join(HOME, 'agents', LOCAL_MARKETPLACE_DIR_NAME)
const PLUGINS_DIR = join(ROLE_PLUGINS_DIR, 'plugins')
const CLAUDE_DIR = join(HOME, '.claude')
const SETTINGS_LOCAL = join(CLAUDE_DIR, 'settings.local.json')
const INSTALLED_FILE = join(CLAUDE_DIR, 'plugins', 'installed_plugins.json')

// Local marketplace name — for custom Haephestos-generated role-plugins
const MARKETPLACE_NAME = LOCAL_MARKETPLACE_NAME

// GitHub marketplace for predefined role plugins
export const GITHUB_MARKETPLACE_NAME = GITHUB_MARKETPLACE_NAME_IMPORT

// ── Predefined role plugins (from ecosystem-constants) ────────

/** The 6 predefined AI Maestro role plugins keyed by name */
export const PREDEFINED_ROLE_PLUGINS: Record<string, { marketplace: string; mainAgent: string }> =
  Object.fromEntries(
    PREDEFINED_ROLE_PLUGIN_NAMES.map(name => [
      name,
      { marketplace: GITHUB_MARKETPLACE_NAME, mainAgent: ROLE_PLUGIN_MAIN_AGENTS[name] },
    ])
  )

// ── Title → plugin mapping (lower-case keys for API compat) ──

const TITLE_PLUGIN_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(ECOSYSTEM_TITLE_PLUGIN_MAP).map(([k, v]) => [k.toLowerCase(), v])
)

// ── JSON helpers ──────────────────────────────────────────────

async function loadJsonSafe(path: string): Promise<Record<string, unknown>> {
  if (!existsSync(path)) return {}
  try {
    const raw = await readFile(path, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function saveJsonSafe(path: string, data: Record<string, unknown>): Promise<void> {
  const dir = join(path, '..')
  await mkdir(dir, { recursive: true })
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

// ── Settings mutex ────────────────────────────────────────────

const settingsLocks = new Map<string, Promise<void>>()

async function withSettingsLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const key = filePath
  const prev = settingsLocks.get(key) ?? Promise.resolve()
  let resolve: () => void
  const next = new Promise<void>(r => { resolve = r })
  settingsLocks.set(key, next)
  try {
    await prev
    return await fn()
  } finally {
    resolve!()
    if (settingsLocks.get(key) === next) settingsLocks.delete(key)
  }
}

// ── Core install/uninstall (moved from role-plugin-service) ───

/**
 * Install a role-plugin into an agent's working directory.
 *
 * For predefined marketplace plugins: uses `claude plugin install <name> <marketplace> --scope local`.
 * For local/custom plugins: writes settings.local.json directly.
 */
export async function installPluginLocally(
  pluginName: string,
  agentDir: string,
  marketplaceName: string = MARKETPLACE_NAME,
): Promise<void> {
  // Validate plugin name
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(pluginName)) {
    throw new Error(`Invalid plugin name "${pluginName}"`)
  }

  // SAFEGUARD: Role-plugins MUST be local-scope only. This function enforces it
  // by requiring agentDir (no user-scope path). Fail-fast if agentDir is missing.
  if (!agentDir || agentDir.trim() === '') {
    throw new Error(`installPluginLocally requires agentDir — role-plugins MUST be local scope`)
  }

  // Resolve ~ in agentDir
  const resolvedDir = agentDir.startsWith('~')
    ? agentDir.replace('~', HOME)
    : agentDir

  // Reject path traversal in agentDir
  if (resolvedDir.includes('..')) {
    throw new Error('agentDir must not contain ".."')
  }

  // For predefined marketplace role-plugins: use `claude plugin install` CLI.
  if (marketplaceName === GITHUB_MARKETPLACE_NAME && PREDEFINED_ROLE_PLUGINS[pluginName]) {
    try {
      await execFileAsync('claude', [
        'plugin', 'install', pluginName, GITHUB_MARKETPLACE_NAME, '--scope', 'local',
      ], { timeout: 120000, cwd: resolvedDir })
      console.log(`[element-mgmt] Installed ${pluginName} from ${GITHUB_MARKETPLACE_NAME} via Claude CLI (scope: local, cwd: ${resolvedDir})`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to install role-plugin "${pluginName}" from ${GITHUB_MARKETPLACE_NAME}: ${msg}`)
    }
    return
  }

  // For local/custom plugins, write settings.local.json directly
  const pluginKey = `${pluginName}@${marketplaceName}`
  const claudeDir = join(resolvedDir, '.claude')
  const localSettings = join(claudeDir, 'settings.local.json')

  await withSettingsLock(localSettings, async () => {
    // Create .claude directory in agent's project
    await mkdir(claudeDir, { recursive: true })

    // Read or create settings.local.json
    const settings = await loadJsonSafe(localSettings) as Record<string, Record<string, unknown>>
    const ep = (settings.enabledPlugins || {}) as Record<string, boolean>
    ep[pluginKey] = true
    settings.enabledPlugins = ep
    await saveJsonSafe(localSettings, settings)
  })

  // Track in global installed_plugins.json
  await withSettingsLock(INSTALLED_FILE, async () => {
    await mkdir(join(CLAUDE_DIR, 'plugins'), { recursive: true })
    const installed = await loadJsonSafe(INSTALLED_FILE) as Record<string, unknown>
    const pluginsMap = (installed.plugins || {}) as Record<string, unknown>
    const now = new Date().toISOString().replace('+00:00', 'Z')
    pluginsMap[pluginKey] = [{
      scope: 'local',
      version: '1.0.0',
      installedAt: now,
      lastUpdated: now,
      installPath: join(PLUGINS_DIR, pluginName),
      projectPath: resolvedDir,
    }]
    installed.plugins = pluginsMap
    await saveJsonSafe(INSTALLED_FILE, installed)
  })
}

/**
 * Uninstall a role-plugin from an agent's working directory.
 */
export async function uninstallPluginLocally(
  pluginName: string,
  agentDir: string,
  marketplaceName: string = MARKETPLACE_NAME,
): Promise<void> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(pluginName)) {
    throw new Error(`Invalid plugin name "${pluginName}"`)
  }

  const resolvedDir = agentDir.startsWith('~')
    ? agentDir.replace('~', HOME)
    : agentDir

  if (resolvedDir.includes('..')) {
    throw new Error('agentDir must not contain ".."')
  }

  const pluginKey = `${pluginName}@${marketplaceName}`

  // For predefined marketplace plugins: use `claude plugin uninstall` CLI + settings cleanup
  if (marketplaceName === GITHUB_MARKETPLACE_NAME && PREDEFINED_ROLE_PLUGINS[pluginName]) {
    try {
      await execFileAsync('claude', [
        'plugin', 'uninstall', pluginName, GITHUB_MARKETPLACE_NAME, '--scope', 'local',
      ], { timeout: 30000, cwd: resolvedDir })
      console.log(`[element-mgmt] Uninstalled ${pluginName} from ${GITHUB_MARKETPLACE_NAME} via Claude CLI (scope: local, cwd: ${resolvedDir})`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('not found') && !msg.includes('not installed')) {
        console.warn(`[element-mgmt] CLI uninstall failed for ${pluginName}: ${msg}`)
      }
    }
    // SAFEGUARD: Also remove from settings.local.json directly
    const localSettings = join(resolvedDir, '.claude', 'settings.local.json')
    if (existsSync(localSettings)) {
      await withSettingsLock(localSettings, async () => {
        const settings = await loadJsonSafe(localSettings) as Record<string, Record<string, unknown>>
        const ep = (settings.enabledPlugins || {}) as Record<string, boolean>
        if (ep[pluginKey]) {
          delete ep[pluginKey]
          settings.enabledPlugins = ep
          await saveJsonSafe(localSettings, settings)
          console.log(`[element-mgmt] Removed ${pluginKey} from settings.local.json (safeguard cleanup)`)
        }
      })
    }
    return
  }

  // For local/custom plugins: manipulate settings.local.json directly
  const localSettings = join(resolvedDir, '.claude', 'settings.local.json')

  if (existsSync(localSettings)) {
    await withSettingsLock(localSettings, async () => {
      const settings = await loadJsonSafe(localSettings) as Record<string, Record<string, unknown>>
      const ep = (settings.enabledPlugins || {}) as Record<string, boolean>
      delete ep[pluginKey]
      settings.enabledPlugins = ep
      await saveJsonSafe(localSettings, settings)
    })
  }

  // Remove from installed_plugins.json
  if (existsSync(INSTALLED_FILE)) {
    await withSettingsLock(INSTALLED_FILE, async () => {
      const installed = await loadJsonSafe(INSTALLED_FILE) as Record<string, unknown>
      const pluginsMap = (installed.plugins || {}) as Record<string, unknown>
      delete pluginsMap[pluginKey]
      installed.plugins = pluginsMap
      await saveJsonSafe(INSTALLED_FILE, installed)
    })
  }
}

// ── Governance title → role-plugin lifecycle ──────────────────

/**
 * Get the DEFAULT role-plugin name for a governance title (hardcoded fallback).
 * For dynamic N:1 compatibility, use getCompatiblePluginsForTitle() instead.
 */
export function getRequiredPluginForTitle(title: string): string | null {
  return TITLE_PLUGIN_MAP[title] || null
}

/**
 * Get compatible role-plugins for a title + client combo (N:1 model).
 * Scans all installed role-plugins for .agent.toml compatible-titles and compatible-clients.
 * Falls back to TITLE_PLUGIN_MAP default if no dynamic plugins found.
 */
export async function getCompatiblePluginsForTitle(
  title: string,
  clientType?: string
): Promise<{ name: string; marketplace?: string; source?: string; compatibleClients?: string[] }[]> {
  try {
    const { getPluginsForTitle } = await import('@/services/role-plugin-service')
    const plugins = await getPluginsForTitle(title, clientType)
    if (plugins.length > 0) {
      return plugins.map(p => ({
        name: p.name,
        marketplace: p.marketplace,
        source: p.source,
        compatibleClients: p.compatibleClients,
      }))
    }
  } catch {
    // Fallback to hardcoded map if role-plugin-service unavailable
  }
  // Fallback: return the hardcoded default plugin (if any)
  const defaultPlugin = TITLE_PLUGIN_MAP[title?.toLowerCase()]
  if (defaultPlugin) {
    return [{ name: defaultPlugin, marketplace: GITHUB_MARKETPLACE_NAME, source: 'marketplace' }]
  }
  return []
}

/**
 * Auto-assign the required role-plugin when a governance title is set.
 * Returns the installed plugin name, or null if no auto-assignment needed (MEMBER).
 */
export async function autoAssignRolePluginForTitle(
  title: AgentRole,
  agentId: string
): Promise<string | null> {
  const requiredPlugin = TITLE_PLUGIN_MAP[title]
  if (!requiredPlugin) return null // MEMBER -- no forced plugin

  // Look up the agent from the registry
  const { getAgent } = await import('@/lib/agent-registry')
  const agent = getAgent(agentId)
  if (!agent) throw new Error(`Agent ${agentId} not found`)

  // All title-locked roles require role-plugins which are Claude-only.
  const { detectClientType } = await import('@/lib/client-capabilities')
  const clientType = detectClientType(agent.program || '')
  if (clientType !== 'claude') {
    throw new Error(
      `Cannot assign ${title.toUpperCase()} title to ${clientType} agent "${agent.name || agentId}". ` +
      `Governance titles with auto-assigned role-plugins require Claude Code (role-plugins are Claude-only).`
    )
  }

  const agentDir = agent.workingDirectory || agent.sessions?.[0]?.workingDirectory
  if (!agentDir) throw new Error(`Agent ${agentId} has no working directory`)

  // SAFEGUARD: Uninstall ALL other role-plugins before installing the new one.
  const marketplace = GITHUB_MARKETPLACE_NAME
  for (const [, otherPlugin] of Object.entries(TITLE_PLUGIN_MAP)) {
    if (otherPlugin !== requiredPlugin) {
      await uninstallPluginLocally(otherPlugin, agentDir, marketplace).catch(() => {})
    }
  }

  // Install the required role-plugin from the GitHub marketplace (--scope local)
  await installPluginLocally(requiredPlugin, agentDir, marketplace)

  console.log(`[element-mgmt] Auto-assigned role-plugin ${requiredPlugin} to agent ${agentId} (title: ${title})`)
  return requiredPlugin
}

/**
 * Uninstall ALL role-plugins from an agent's working directory.
 * Used when switching to AUTONOMOUS or MEMBER (no required plugin).
 */
export async function uninstallAllRolePlugins(agentDir: string): Promise<void> {
  for (const [, pluginName] of Object.entries(TITLE_PLUGIN_MAP)) {
    await uninstallPluginLocally(pluginName, agentDir, GITHUB_MARKETPLACE_NAME).catch(() => {})
  }
}

/**
 * CENTRALIZED role-plugin lifecycle for governance title changes.
 *
 * This is the SINGLE entry point that ALL title-change paths MUST call.
 * It handles the full lifecycle:
 *   1. Uninstalls ALL existing role-plugins (safeguard: only one can exist)
 *   2. Installs the correct role-plugin for the new title (if any)
 *   3. AUTONOMOUS / MEMBER / null -> no plugin installed (clean state)
 *
 * @param agentId - The agent UUID
 * @param newTitle - The new governance title (null = cleared/AUTONOMOUS)
 * @returns The installed plugin name, or null if no plugin needed
 */
export async function syncRolePlugin(
  agentId: string,
  newTitle: string | null | undefined,
): Promise<string | null> {
  const { getAgent } = await import('@/lib/agent-registry')
  const agent = getAgent(agentId)
  if (!agent) {
    console.warn(`[element-mgmt] syncRolePlugin: agent ${agentId} not found, skipping`)
    return null
  }

  const agentDir = agent.workingDirectory || agent.sessions?.[0]?.workingDirectory
  if (!agentDir) {
    console.warn(`[element-mgmt] syncRolePlugin: agent ${agentId} has no working directory, skipping`)
    return null
  }

  const requiredPlugin = newTitle ? getRequiredPluginForTitle(newTitle) : null

  if (requiredPlugin) {
    // New title requires a plugin -- autoAssignRolePluginForTitle handles
    // uninstalling ALL others first, then installing the new one
    return autoAssignRolePluginForTitle(newTitle as AgentRole, agentId)
  } else {
    // No plugin required (AUTONOMOUS/MEMBER/null) -- uninstall ALL role-plugins
    await uninstallAllRolePlugins(agentDir)
    console.log(`[element-mgmt] Cleared all role-plugins for agent ${agentId} (title: ${newTitle || 'none'})`)
    return null
  }
}

// Backward-compatible alias
export const syncRolePluginForTitle = syncRolePlugin

// ── New wrapper functions ─────────────────────────────────────

// @deprecated Use ChangePlugin() instead
/**
 * Install a plugin at the specified scope.
 * REJECTS role-plugin names -- those MUST go through syncRolePlugin().
 */
export async function installPlugin(
  pluginName: string,
  marketplace: string,
  options: { scope: 'user' | 'local'; agentDir?: string; force?: boolean },
): Promise<void> {
  // Guard: role-plugins must use syncRolePlugin()
  if (PREDEFINED_ROLE_PLUGINS[pluginName]) {
    throw new Error(
      `Role-plugins must be installed via syncRolePlugin(), not installPlugin() directly. ` +
      `Plugin "${pluginName}" is a predefined role-plugin.`
    )
  }

  // SAFEGUARD: Even if the role-plugin check above is somehow bypassed,
  // NEVER allow a role-plugin name at user scope. Belt + suspenders.
  if (options.scope === 'user' && (PREDEFINED_ROLE_PLUGIN_NAMES as readonly string[]).includes(pluginName)) {
    throw new Error(
      `SECURITY: Role-plugin "${pluginName}" cannot be installed at user scope. ` +
      `Role-plugins MUST use --scope local to avoid affecting all sessions.`
    )
  }

  if (options.scope === 'user') {
    const args = ['plugin', 'install', pluginName, marketplace, '--scope', 'user']
    if (options.force) args.push('--force')
    await execFileAsync('claude', args, { timeout: 120000 })
    console.log(`[element-mgmt] Installed ${pluginName} from ${marketplace} (scope: user)`)
    return
  }

  // Local scope
  if (!options.agentDir) {
    throw new Error('agentDir is required for local scope installations')
  }

  const resolvedDir = options.agentDir.startsWith('~')
    ? options.agentDir.replace('~', HOME)
    : options.agentDir

  const pluginKey = `${pluginName}@${marketplace}`
  const claudeDir = join(resolvedDir, '.claude')
  const localSettings = join(claudeDir, 'settings.local.json')

  await withSettingsLock(localSettings, async () => {
    await mkdir(claudeDir, { recursive: true })
    const settings = await loadJsonSafe(localSettings) as Record<string, Record<string, unknown>>
    const ep = (settings.enabledPlugins || {}) as Record<string, boolean>
    ep[pluginKey] = true
    settings.enabledPlugins = ep
    await saveJsonSafe(localSettings, settings)
  })

  console.log(`[element-mgmt] Installed ${pluginName} from ${marketplace} (scope: local, dir: ${resolvedDir})`)
}

// @deprecated Use ChangePlugin() instead
/**
 * Uninstall a plugin at the specified scope.
 */
export async function uninstallPlugin(
  pluginName: string,
  marketplace: string,
  options: { scope: 'user' | 'local'; agentDir?: string },
): Promise<void> {
  // SAFEGUARD: Role-plugins at user scope should not exist. Block uninstall from
  // masking the problem — fail-fast so the root cause is investigated.
  if (options.scope === 'user' && PREDEFINED_ROLE_PLUGINS[pluginName]) {
    throw new Error(
      `SECURITY: Role-plugin "${pluginName}" should never exist at user scope. ` +
      `Investigate how it was installed. Role-plugins MUST be --scope local.`
    )
  }

  if (options.scope === 'user') {
    await execFileAsync('claude', [
      'plugin', 'uninstall', pluginName, marketplace, '--scope', 'user',
    ], { timeout: 30000 })
    console.log(`[element-mgmt] Uninstalled ${pluginName} from ${marketplace} (scope: user)`)
    return
  }

  // Local scope
  if (!options.agentDir) {
    throw new Error('agentDir is required for local scope uninstallation')
  }

  const resolvedDir = options.agentDir.startsWith('~')
    ? options.agentDir.replace('~', HOME)
    : options.agentDir

  const pluginKey = `${pluginName}@${marketplace}`
  const localSettings = join(resolvedDir, '.claude', 'settings.local.json')

  if (existsSync(localSettings)) {
    await withSettingsLock(localSettings, async () => {
      const settings = await loadJsonSafe(localSettings) as Record<string, Record<string, unknown>>
      const ep = (settings.enabledPlugins || {}) as Record<string, boolean>
      delete ep[pluginKey]
      settings.enabledPlugins = ep
      await saveJsonSafe(localSettings, settings)
    })
  }

  console.log(`[element-mgmt] Uninstalled ${pluginName} from ${marketplace} (scope: local, dir: ${resolvedDir})`)
}

// @deprecated Use ChangePlugin() instead
/**
 * Enable a disabled plugin.
 */
export async function enablePlugin(
  pluginKey: string,
  options: { scope: 'user' | 'local'; agentDir?: string },
): Promise<void> {
  if (options.scope === 'user') {
    await execFileAsync('claude', [
      'plugin', 'enable', pluginKey, '--scope', 'user',
    ], { timeout: 30000 })
    console.log(`[element-mgmt] Enabled ${pluginKey} (scope: user)`)
    return
  }

  // Local scope
  if (!options.agentDir) {
    throw new Error('agentDir is required for local scope enable')
  }

  const resolvedDir = options.agentDir.startsWith('~')
    ? options.agentDir.replace('~', HOME)
    : options.agentDir

  const localSettings = join(resolvedDir, '.claude', 'settings.local.json')

  await withSettingsLock(localSettings, async () => {
    await mkdir(join(resolvedDir, '.claude'), { recursive: true })
    const settings = await loadJsonSafe(localSettings) as Record<string, Record<string, unknown>>
    const ep = (settings.enabledPlugins || {}) as Record<string, boolean>
    ep[pluginKey] = true
    settings.enabledPlugins = ep
    await saveJsonSafe(localSettings, settings)
  })

  console.log(`[element-mgmt] Enabled ${pluginKey} (scope: local, dir: ${resolvedDir})`)
}

// @deprecated Use ChangePlugin() instead
/**
 * Disable a plugin without uninstalling.
 */
export async function disablePlugin(
  pluginKey: string,
  options: { scope: 'user' | 'local'; agentDir?: string },
): Promise<void> {
  if (options.scope === 'user') {
    await execFileAsync('claude', [
      'plugin', 'disable', pluginKey, '--scope', 'user',
    ], { timeout: 30000 })
    console.log(`[element-mgmt] Disabled ${pluginKey} (scope: user)`)
    return
  }

  // Local scope
  if (!options.agentDir) {
    throw new Error('agentDir is required for local scope disable')
  }

  const resolvedDir = options.agentDir.startsWith('~')
    ? options.agentDir.replace('~', HOME)
    : options.agentDir

  const localSettings = join(resolvedDir, '.claude', 'settings.local.json')

  await withSettingsLock(localSettings, async () => {
    await mkdir(join(resolvedDir, '.claude'), { recursive: true })
    const settings = await loadJsonSafe(localSettings) as Record<string, Record<string, unknown>>
    const ep = (settings.enabledPlugins || {}) as Record<string, boolean>
    ep[pluginKey] = false
    settings.enabledPlugins = ep
    await saveJsonSafe(localSettings, settings)
  })

  console.log(`[element-mgmt] Disabled ${pluginKey} (scope: local, dir: ${resolvedDir})`)
}

// ══════════════════════════════════════════════════════════════
// ChangeTitle — Full desired-state reconciliation pipeline
// ══════════════════════════════════════════════════════════════

export interface ChangeTitleResult {
  success: boolean
  agentId: string
  oldTitle: string | null
  newTitle: string | null
  operations: string[]
  installedPlugin: string | null
  uninstalledPlugin: string | null
  restartNeeded: boolean
  error?: string
}

const VALID_TITLES: ReadonlySet<string> = new Set([
  'manager', 'chief-of-staff', 'orchestrator', 'architect', 'integrator', 'member', 'autonomous',
])

// Titles that require team membership
const TEAM_TITLES: ReadonlySet<string> = new Set([
  'chief-of-staff', 'orchestrator', 'architect', 'integrator', 'member',
])

// Titles that are standalone (no team required)
const STANDALONE_TITLES: ReadonlySet<string> = new Set([
  'manager', 'autonomous',
])

// Singleton titles (only one agent can hold this on the host/team)
const SINGLETON_TEAM_TITLES: ReadonlySet<string> = new Set(['chief-of-staff', 'orchestrator'])

export async function ChangeTitle(
  agentId: string,
  newTitle: string | null,
  options?: {
    teamIds?: string[]
    skipPluginSync?: boolean
    skipRestart?: boolean
  },
): Promise<ChangeTitleResult> {
  const ops: string[] = []
  const result: ChangeTitleResult = {
    success: false,
    agentId,
    oldTitle: null,
    newTitle: newTitle || null,
    operations: ops,
    installedPlugin: null,
    uninstalledPlugin: null,
    restartNeeded: false,
  }

  try {
    // ── GATE 1: Validate title value ─────────────────────────
    const effectiveTitle = newTitle === 'autonomous' ? null : newTitle
    if (newTitle && !VALID_TITLES.has(newTitle)) {
      result.error = `Invalid title "${newTitle}". Valid: ${[...VALID_TITLES].join(', ')}`
      return result
    }
    ops.push(`G01: Title "${newTitle || 'none'}" is valid`)

    // ── GATE 2: Validate agent exists ────────────────────────
    const { getAgent, updateAgent } = await import('@/lib/agent-registry')
    const agent = getAgent(agentId)
    if (!agent) {
      result.error = `Agent ${agentId} not found`
      return result
    }
    ops.push(`G02: Agent "${agent.name}" found`)

    // ── GATE 3: Check agent client + compatible plugins ────────
    // N:1 model: multiple plugins can serve one title. Check if ANY compatible
    // plugin exists for this title + agent's client combo.
    // If no native match exists, mark for auto-conversion at Gate 16.
    const titleRequiresPlugin = newTitle ? !!getRequiredPluginForTitle(newTitle) : false
    let agentClientType = 'claude' // default
    let needsPluginConversion = false
    if (titleRequiresPlugin) {
      try {
        const { detectClientType } = await import('@/lib/client-capabilities')
        agentClientType = detectClientType(agent.program || '')

        // Self-healing: if program is empty/unknown, infer from agent state
        if (agentClientType === 'unknown') {
          let inferredClient: string | null = null
          const evidence: string[] = []
          const clientField = (agent as unknown as Record<string, unknown>).client as string | undefined
          if (clientField) { evidence.push(`client='${clientField}'`); inferredClient = clientField.toLowerCase() }
          const args = agent.programArgs || ''
          if (!inferredClient && (args.includes('--agent') || args.includes('--chrome'))) { evidence.push('Claude-only flags'); inferredClient = 'claude' }
          const wDir = agent.workingDirectory || agent.sessions?.[0]?.workingDirectory
          if (!inferredClient && wDir && existsSync(join(wDir, '.claude'))) { evidence.push('.claude/ dir'); inferredClient = 'claude' }
          if (inferredClient) {
            await updateAgent(agentId, { program: inferredClient } as Record<string, unknown>)
            agentClientType = inferredClient
            ops.push(`G03: program was empty — auto-fixed to '${inferredClient}' (evidence: ${evidence.join(', ')})`)
          }
        }

        // Check if compatible plugins exist for this title + client
        const compatiblePlugins = await getCompatiblePluginsForTitle(newTitle!, agentClientType)
        if (compatiblePlugins.length > 0) {
          ops.push(`G03: ${compatiblePlugins.length} compatible plugin(s) for ${newTitle?.toUpperCase()}+${agentClientType}`)
        } else {
          // No plugins for this client — check if plugins exist for OTHER clients (auto-convert)
          const anyPlugins = await getCompatiblePluginsForTitle(newTitle!)
          if (anyPlugins.length > 0) {
            needsPluginConversion = true
            ops.push(`G03: No native ${agentClientType} plugin for ${newTitle?.toUpperCase()} — will auto-convert from ${anyPlugins[0].name}`)
          } else {
            ops.push(`G03: No compatible plugins found for ${newTitle?.toUpperCase()} at all — proceeding without plugin`)
          }
        }
      } catch {
        ops.push(`G03: Client/plugin compatibility check skipped (service unavailable)`)
      }
    } else {
      ops.push(`G03: No plugin required — client check skipped`)
    }

    // ── GATE 4: Check agent has working directory ────────────
    const agentDir = agent.workingDirectory || agent.sessions?.[0]?.workingDirectory
    if (titleRequiresPlugin && !agentDir) {
      result.error = `Agent "${agent.name}" has no working directory — cannot install role-plugin`
      return result
    }
    ops.push(`G04: Working directory ${agentDir ? 'available' : 'N/A (no plugin needed)'}`)

    // ── GATE 5: Detect current title from ALL sources ────────
    const { isManager, getManagerId, isChiefOfStaffAnywhere } = await import('@/lib/governance')
    let oldTitle: string | null = agent.governanceTitle || null
    if (!oldTitle && isManager(agentId)) oldTitle = 'manager'
    if (!oldTitle && isChiefOfStaffAnywhere(agentId)) oldTitle = 'chief-of-staff'
    result.oldTitle = oldTitle
    ops.push(`G05: Old title detected as "${oldTitle || 'none'}"`)

    // ── GATE 6: No-op check ─────────────────────────────────
    // Compare against REGISTRY value, not inferred oldTitle. If the team says COS
    // but the registry doesn't have governanceTitle stored, we still need to write
    // the registry and install the plugin.
    const registryTitle = agent.governanceTitle || null
    if (oldTitle === effectiveTitle && registryTitle === effectiveTitle) {
      result.success = true
      ops.push(`G06: Title already "${effectiveTitle || 'none'}" — no change`)
      return result
    }
    ops.push(`G06: Title change needed: "${oldTitle || 'none'}" → "${effectiveTitle || 'none'}"`)

    // ── GATE 7: Singleton check — MANAGER ────────────────────
    if (newTitle === 'manager') {
      const currentManagerId = getManagerId()
      if (currentManagerId && currentManagerId !== agentId) {
        const currentManager = getAgent(currentManagerId)
        result.error = `Only one MANAGER allowed. "${currentManager?.name || currentManagerId}" already holds this title.`
        return result
      }
      ops.push(`G07: MANAGER singleton check passed`)
    } else {
      ops.push(`G07: Not MANAGER — singleton check skipped`)
    }

    // ── GATE 8: Singleton check — COS/ORCHESTRATOR per team ──
    if (newTitle && SINGLETON_TEAM_TITLES.has(newTitle)) {
      // These are checked by the caller (team route) — ChangeTitle logs it
      ops.push(`G08: ${newTitle.toUpperCase()} is per-team singleton — caller must validate team slot`)
    } else {
      ops.push(`G08: Not a per-team singleton title`)
    }

    // ── GATE 9: Team membership validation ───────────────────
    // Team titles (member, chief-of-staff, orchestrator, architect, integrator)
    // can ONLY be assigned to agents that belong to a team. If the agent has no
    // team, the title is rejected. Only MANAGER and AUTONOMOUS are standalone.
    if (newTitle && TEAM_TITLES.has(newTitle)) {
      const { loadTeams: loadTeamsG9 } = await import('@/lib/team-registry')
      const allTeamsG9 = loadTeamsG9()
      const agentInTeam = allTeamsG9.some(t => t.agentIds.includes(agentId))
      if (!agentInTeam) {
        result.error = `Title "${newTitle.toUpperCase()}" requires team membership. Assign the agent to a team first.`
        return result
      }
      ops.push(`G09: ${newTitle.toUpperCase()} requires team — agent is in a team ✓`)
    } else if (newTitle && STANDALONE_TITLES.has(newTitle)) {
      ops.push(`G09: ${newTitle.toUpperCase()} is standalone — no team required`)
    } else {
      ops.push(`G09: Title being cleared — team check N/A`)
    }

    // ── GATE 10: Clear old MANAGER from governance.json ──────
    if (oldTitle === 'manager') {
      const { removeManager } = await import('@/lib/governance')
      await removeManager()
      ops.push(`G10: Removed manager from governance.json`)
      // MANAGER removed → block all teams + hibernate team agents
      try {
        const { blockAllTeams } = await import('@/lib/team-registry')
        const hibernated = await blockAllTeams()
        ops.push(`G10: Blocked all teams, hibernated ${hibernated.length} team agent(s)`)
      } catch (err) {
        ops.push(`G10: WARN — blockAllTeams failed: ${err instanceof Error ? err.message : err}`)
      }
    } else {
      ops.push(`G10: Old title not MANAGER — governance.json unchanged`)
    }

    // ── GATE 11: Clear old COS — clear team + reject pending requests ─
    if (oldTitle === 'chief-of-staff' && newTitle !== 'chief-of-staff') {
      // Clear chiefOfStaffId from all teams where this agent is COS
      try {
        const { loadTeams, updateTeam } = await import('@/lib/team-registry')
        const teams = loadTeams()
        for (const team of teams) {
          if (team.chiefOfStaffId === agentId) {
            const managerId = getManagerId()
            await updateTeam(team.id, { chiefOfStaffId: null }, managerId)
            ops.push(`G11: Cleared chiefOfStaffId on team "${team.name}"`)
          }
        }
      } catch (err) {
        ops.push(`G11: WARN — Failed to clear chiefOfStaffId: ${err instanceof Error ? err.message : err}`)
      }
      // Auto-reject pending configure-agent requests from this COS
      try {
        const { loadGovernanceRequests, rejectGovernanceRequest } = await import('@/lib/governance-request-registry')
        const file = loadGovernanceRequests()
        const pendingFromCOS = file.requests.filter((r: { type: string; status: string; requestedBy: string }) =>
          r.type === 'configure-agent' && r.status === 'pending' && r.requestedBy === agentId
        )
        for (const req of pendingFromCOS) {
          const managerId = getManagerId()
          await rejectGovernanceRequest(req.id, managerId || 'system', `COS role revoked`)
        }
        if (pendingFromCOS.length > 0) {
          ops.push(`G11: Auto-rejected ${pendingFromCOS.length} pending config request(s) from old COS`)
        } else {
          ops.push(`G11: No pending requests to reject`)
        }
      } catch {
        ops.push(`G11: Pending request rejection skipped (registry unavailable)`)
      }
    } else {
      ops.push(`G11: Old title not COS — skipped`)
    }

    // ── GATE 12: Clear old ORCHESTRATOR from team ────────────
    if (oldTitle === 'orchestrator' && newTitle !== 'orchestrator') {
      try {
        const { loadTeams, updateTeam } = await import('@/lib/team-registry')
        const teams = loadTeams()
        for (const team of teams) {
          if (team.orchestratorId === agentId) {
            const managerId = getManagerId()
            await updateTeam(team.id, { orchestratorId: null }, managerId)
            ops.push(`G12: Cleared orchestratorId on team "${team.name}"`)
          }
        }
        if (!teams.some(t => t.orchestratorId === agentId)) {
          ops.push(`G12: No team had this agent as orchestrator`)
        }
      } catch (err) {
        ops.push(`G12: WARN — Failed to clear orchestratorId: ${err instanceof Error ? err.message : err}`)
      }
    } else {
      ops.push(`G12: Old title not ORCHESTRATOR — team.orchestratorId unchanged`)
    }

    // ── GATE 13: Set new MANAGER in governance.json ──────────
    if (newTitle === 'manager') {
      const { setManager } = await import('@/lib/governance')
      await setManager(agentId)
      ops.push(`G13: Set manager in governance.json + broadcast to mesh`)
      // MANAGER assigned → unblock all teams (agents stay hibernated, manual wake required)
      try {
        const { unblockAllTeams } = await import('@/lib/team-registry')
        unblockAllTeams()
        ops.push(`G13: Unblocked all teams — agents remain hibernated until manually woken`)
      } catch (err) {
        ops.push(`G13: WARN — unblockAllTeams failed: ${err instanceof Error ? err.message : err}`)
      }
    } else {
      ops.push(`G13: New title not MANAGER — governance.json unchanged`)
    }

    // ── GATE 14: Write governanceTitle to agent registry ─────
    await updateAgent(agentId, { governanceTitle: effectiveTitle as any })
    ops.push(`G14: Set governanceTitle="${effectiveTitle || 'null'}" in agent registry`)

    // ── GATE 15: Determine plugin swap (N:1 compatible-plugins model) ──
    // Find what plugin the agent currently has installed, and what plugin
    // is compatible with the NEW title + client combo.
    let currentPluginName: string | null = null
    let targetPluginName: string | null = null
    let targetMarketplace: string = GITHUB_MARKETPLACE_NAME

    if (!options?.skipPluginSync && agentDir) {
      // Detect currently installed role-plugin from settings.local.json
      try {
        const localSettingsPath = join(agentDir.startsWith('~') ? agentDir.replace('~', HOME) : agentDir, '.claude', 'settings.local.json')
        if (existsSync(localSettingsPath)) {
          const settings = await loadJsonSafe(localSettingsPath) as Record<string, Record<string, unknown>>
          const ep = (settings.enabledPlugins || {}) as Record<string, boolean>
          // Find the first enabled role-plugin
          for (const key of Object.keys(ep)) {
            if (ep[key]) {
              const plugName = key.split('@')[0]
              // Check if this is a role-plugin (has .agent.toml or is in predefined list)
              if (Object.values(TITLE_PLUGIN_MAP).includes(plugName) || (PREDEFINED_ROLE_PLUGIN_NAMES as readonly string[]).includes(plugName)) {
                currentPluginName = plugName
                break
              }
            }
          }
        }
      } catch { /* best effort */ }

      if (effectiveTitle) {
        // Find compatible plugins for new title + agent client
        const compatibles = await getCompatiblePluginsForTitle(effectiveTitle, agentClientType)
        if (compatibles.length > 0) {
          // If current plugin is already compatible with new title → keep it
          if (currentPluginName && compatibles.some(p => p.name === currentPluginName)) {
            targetPluginName = currentPluginName
            ops.push(`G15: Current plugin "${currentPluginName}" is compatible with ${effectiveTitle.toUpperCase()} — keeping`)
          } else {
            // Pick the first compatible plugin
            targetPluginName = compatibles[0].name
            targetMarketplace = compatibles[0].marketplace || GITHUB_MARKETPLACE_NAME
            ops.push(`G15: Selected compatible plugin "${targetPluginName}" for ${effectiveTitle.toUpperCase()}+${agentClientType}`)
          }
        } else if (needsPluginConversion) {
          // No native plugin for this client — use default and mark for conversion
          const defaultPlugin = getRequiredPluginForTitle(effectiveTitle)
          if (defaultPlugin) {
            targetPluginName = defaultPlugin
            ops.push(`G15: No native ${agentClientType} plugin — will install "${defaultPlugin}" (needs conversion)`)
          }
        } else {
          ops.push(`G15: No compatible plugins found for ${effectiveTitle.toUpperCase()}`)
        }
      }

      // Uninstall old if swapping
      if (currentPluginName && currentPluginName !== targetPluginName) {
        await uninstallAllRolePlugins(agentDir)
        result.uninstalledPlugin = currentPluginName
        ops.push(`G15: Uninstalled old role-plugin "${currentPluginName}"`)
      } else if (!currentPluginName && agentDir) {
        // Clean stale role-plugins just in case
        await uninstallAllRolePlugins(agentDir).catch(() => {})
        ops.push(`G15: Cleaned stale role-plugins`)
      }
    } else {
      ops.push(`G15: Plugin sync skipped`)
    }

    // ── GATE 16: Install new role-plugin ─────────────────────
    if (!options?.skipPluginSync && targetPluginName && agentDir && targetPluginName !== currentPluginName) {
      try {
        // TODO: If needsPluginConversion, call cross-client converter first
        // For now, install the plugin directly (works for Claude and native-compatible clients)
        await installPluginLocally(targetPluginName, agentDir, targetMarketplace)
        result.installedPlugin = targetPluginName
        ops.push(`G16: Installed role-plugin "${targetPluginName}"`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        ops.push(`G16: WARN — Failed to install "${targetPluginName}": ${msg}`)
      }
    } else if (options?.skipPluginSync) {
      ops.push(`G16: Plugin install skipped (skipPluginSync=true)`)
    } else if (!targetPluginName) {
      ops.push(`G16: No plugin to install for ${newTitle || 'none'}`)
    } else {
      ops.push(`G16: Plugin "${targetPluginName}" already installed — no change`)
    }

    // ── GATE 17: Verify plugin state consistency ─────────────
    if (!options?.skipPluginSync && agentDir) {
      try {
        const localSettings = join(agentDir.startsWith('~') ? agentDir.replace('~', HOME) : agentDir, '.claude', 'settings.local.json')
        if (existsSync(localSettings)) {
          const settings = await loadJsonSafe(localSettings) as Record<string, Record<string, unknown>>
          const ep = (settings.enabledPlugins || {}) as Record<string, boolean>
          const activeRolePlugins = Object.keys(ep).filter(k => {
            const name = k.split('@')[0]
            return Object.values(TITLE_PLUGIN_MAP).includes(name)
          })
          if (activeRolePlugins.length > 1) {
            ops.push(`G17: WARN — ${activeRolePlugins.length} role-plugins active (expected 0 or 1). Cleaning.`)
            await uninstallAllRolePlugins(agentDir)
            if (targetPluginName) {
              await installPluginLocally(targetPluginName, agentDir, targetMarketplace).catch(() => {})
            }
          } else {
            ops.push(`G17: Plugin state consistent (${activeRolePlugins.length} role-plugin(s))`)
          }
        } else {
          ops.push(`G17: No settings.local.json — plugin state clean`)
        }
      } catch {
        ops.push(`G17: Plugin verification skipped (read error)`)
      }
    } else {
      ops.push(`G17: Plugin verification skipped`)
    }

    // ── GATE 18: Broadcast governance sync to mesh ───────────
    // setManager/removeManager already broadcast for MANAGER changes.
    // For other titles, broadcast a team-updated event.
    if (newTitle !== 'manager' && oldTitle !== 'manager') {
      try {
        const { broadcastGovernanceSync } = await import('@/lib/governance-sync')
        await broadcastGovernanceSync('team-updated', {
          agentId,
          oldTitle,
          newTitle: effectiveTitle,
          timestamp: new Date().toISOString(),
        }).catch(() => {})
        ops.push(`G18: Broadcast governance sync to mesh peers`)
      } catch {
        ops.push(`G18: Governance sync broadcast skipped (module unavailable)`)
      }
    } else {
      ops.push(`G18: MANAGER change — broadcast already sent by governance.ts`)
    }

    // ── GATE 19: Determine if restart needed ─────────────────
    // Restart is needed if the role-plugin changed (agent needs to reload)
    if (currentPluginName !== targetPluginName) {
      result.restartNeeded = true
      ops.push(`G19: Restart needed (plugin changed: ${currentPluginName || 'none'} → ${targetPluginName || 'none'})`)
    } else {
      ops.push(`G19: No restart needed (plugin unchanged)`)
    }

    // ── GATE 20: Queue restart if session is active ──────────
    if (result.restartNeeded && !options?.skipRestart) {
      // Check if agent has an active session
      const sessions = agent.sessions || []
      const hasActiveSession = sessions.length > 0
      if (hasActiveSession) {
        ops.push(`G20: Agent has active session(s) — restart queued for caller`)
        // Note: actual restart is triggered by the UI via useRestartQueue hook
        // The API returns restartNeeded=true, the UI handles the rest
      } else {
        ops.push(`G20: No active session — restart not applicable`)
      }
    } else {
      ops.push(`G20: Restart ${options?.skipRestart ? 'skipped (skipRestart)' : 'not needed'}`)
    }

    // ── GATE 21: Auto-title transition protection ────────────
    // Protect against team PUT route overwriting title with 'member'
    // when adding MANAGER to a team. MANAGER/COS/ORCHESTRATOR/ARCHITECT/INTEGRATOR
    // take precedence over 'member'.
    // This gate is informational — the protection is in the team PUT handler.
    if (newTitle === 'manager' || newTitle === 'chief-of-staff') {
      ops.push(`G21: ${(newTitle || '').toUpperCase()} takes precedence over team auto-title`)
    } else {
      ops.push(`G21: Auto-title protection N/A`)
    }

    // ── GATE 22: Verify final state in registry ──────────────
    const verifyAgent = getAgent(agentId)
    const finalTitle = verifyAgent?.governanceTitle || null
    if (finalTitle !== effectiveTitle) {
      ops.push(`G22: WARN — Final registry title "${finalTitle}" != expected "${effectiveTitle}"`)
    } else {
      ops.push(`G22: Final registry title verified: "${finalTitle || 'null'}"`)
    }

    // ── GATE 23: Verify governance.json consistency ──────────
    if (newTitle === 'manager') {
      const storedManagerId = getManagerId()
      if (storedManagerId !== agentId) {
        ops.push(`G23: WARN — governance.json managerId "${storedManagerId}" != "${agentId}"`)
      } else {
        ops.push(`G23: governance.json managerId verified`)
      }
    } else if (oldTitle === 'manager') {
      const storedManagerId = getManagerId()
      if (storedManagerId === agentId) {
        ops.push(`G23: WARN — governance.json still has old managerId`)
      } else {
        ops.push(`G23: governance.json managerId cleared`)
      }
    } else {
      ops.push(`G23: governance.json check N/A`)
    }

    result.success = true
    console.log(`[ChangeTitle] Agent ${agentId} "${agent.name}": ${oldTitle || 'none'} → ${newTitle || 'none'} (${ops.length} gates, restart=${result.restartNeeded})`)

    // ISSUE-001: Broadcast governance update so UI refreshes instantly
    try {
      const { broadcastGovernanceUpdate } = await import('@/services/shared-state')
      broadcastGovernanceUpdate(agentId, newTitle)
    } catch { /* non-fatal — UI will still catch up via 10s poll */ }

    return result
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
    console.error(`[ChangeTitle] FAILED for agent ${agentId}:`, result.error)
    return result
  }
}

// ══════════════════════════════════════════════════════════════
// ChangePlugin — Desired-state reconciliation for plugins
// ══════════════════════════════════════════════════════════════

export interface ChangePluginResult {
  success: boolean
  pluginKey: string
  action: string
  operations: string[]
  restartNeeded: boolean
  error?: string
}

const SETTINGS_JSON = join(HOME, '.claude', 'settings.json')

export async function ChangePlugin(
  agentId: string | null,
  desired: {
    name: string
    marketplace: string
    action: 'install' | 'uninstall' | 'enable' | 'disable' | 'update'
    scope: 'user' | 'local'
    /** Agent working directory (required for local scope, auto-resolved from agentId if not provided) */
    agentDir?: string
    /** N:1 model: bypass role-plugin guard for compatible plugin swaps from RoleTab dropdown */
    rolePluginSwap?: boolean
  },
): Promise<ChangePluginResult> {
  const ops: string[] = []
  const pluginKey = `${desired.name}@${desired.marketplace}`
  const result: ChangePluginResult = {
    success: false,
    pluginKey,
    action: desired.action,
    operations: ops,
    restartNeeded: false,
  }

  try {
    // ── G01: Validate plugin name format ──────────────────────
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(desired.name)) {
      result.error = `Invalid plugin name "${desired.name}". Must match /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/`
      return result
    }
    ops.push(`G01: Plugin name "${desired.name}" is valid`)

    // ── G02: Role-plugin guard ────────────────────────────────
    // Predefined role-plugins can only be installed via ChangeTitle pipeline,
    // UNLESS the caller explicitly passes rolePluginSwap=true (from RoleTab N:1 dropdown).
    const isRolePlugin = !!PREDEFINED_ROLE_PLUGINS[desired.name]
      || (PREDEFINED_ROLE_PLUGIN_NAMES as readonly string[]).includes(desired.name)
    if (isRolePlugin && !desired.rolePluginSwap) {
      result.error = `Role-plugins must be managed via ChangeTitle(), not ChangePlugin(). Use PATCH /api/agents/{id} with governanceTitle instead.`
      return result
    }
    ops.push(isRolePlugin ? `G02: Role-plugin swap (N:1 model) — allowed` : `G02: Not a role-plugin — proceed`)

    // ── G03: Resolve agent context ────────────────────────────
    let agentDir = desired.agentDir || null
    if (agentId) {
      const { getAgent } = await import('@/lib/agent-registry')
      const agent = getAgent(agentId)
      if (!agent) {
        result.error = `Agent ${agentId} not found`
        return result
      }
      if (!agentDir) {
        agentDir = agent.workingDirectory || agent.sessions?.[0]?.workingDirectory || null
      }
      ops.push(`G03: Agent "${agent.name}" found, workDir=${agentDir || 'none'}`)
    } else {
      ops.push(`G03: No agentId — using explicit agentDir=${agentDir || 'none'}`)
    }

    // ── G04: Check scope validity ─────────────────────────────
    if (desired.scope === 'local' && !agentDir) {
      result.error = `agentDir is required for local scope`
      return result
    }
    ops.push(`G04: Scope "${desired.scope}" valid`)

    // ── G05: Build plugin key ─────────────────────────────────
    ops.push(`G05: Plugin key = "${pluginKey}"`)

    // ── G06: Detect current state ─────────────────────────────
    let currentState: boolean | undefined = undefined
    if (desired.scope === 'user') {
      const settingsData = await withSettingsLock(SETTINGS_JSON, async () => {
        return await loadJsonSafe(SETTINGS_JSON) as Record<string, Record<string, unknown>>
      })
      const ep = (settingsData.enabledPlugins || {}) as Record<string, boolean>
      currentState = ep[pluginKey] !== undefined ? ep[pluginKey] : undefined
    } else {
      // Local scope
      const resolvedDir = agentDir!.startsWith('~') ? agentDir!.replace('~', HOME) : agentDir!
      const localSettings = join(resolvedDir, '.claude', 'settings.local.json')
      const settingsData = await withSettingsLock(localSettings, async () => {
        return await loadJsonSafe(localSettings) as Record<string, Record<string, unknown>>
      })
      const ep = (settingsData.enabledPlugins || {}) as Record<string, boolean>
      currentState = ep[pluginKey] !== undefined ? ep[pluginKey] : undefined
    }
    ops.push(`G06: Current state = ${currentState === undefined ? 'not installed' : currentState ? 'enabled' : 'disabled'}`)

    // ── G07: No-op check ──────────────────────────────────────
    if (
      (desired.action === 'install' && currentState === true) ||
      (desired.action === 'uninstall' && currentState === undefined) ||
      (desired.action === 'enable' && currentState === true) ||
      (desired.action === 'disable' && currentState === false)
    ) {
      result.success = true
      result.action = 'no-op'
      ops.push(`G07: No-op — already in desired state`)
      return result
    }
    ops.push(`G07: Action needed — "${desired.action}"`)

    // ── G08: Title dependency check on uninstall ──────────────
    if (desired.action === 'uninstall' && agentId) {
      const { getAgent } = await import('@/lib/agent-registry')
      const agent = getAgent(agentId)
      if (agent?.governanceTitle) {
        const requiredPlugin = getRequiredPluginForTitle(agent.governanceTitle)
        if (requiredPlugin === desired.name) {
          result.error = `Cannot uninstall ${desired.name} — it's required by the agent's ${agent.governanceTitle} title. Change the title first.`
          return result
        }
      }
      ops.push(`G08: Title dependency check passed`)
    } else {
      ops.push(`G08: Title dependency check ${desired.action !== 'uninstall' ? 'N/A (not uninstall)' : 'N/A (no agentId)'}`)
    }

    // ── G09: Execute action ───────────────────────────────────
    if (desired.action === 'install') {
      if (desired.scope === 'user') {
        await execFileAsync('claude', ['plugin', 'install', desired.name, desired.marketplace, '--scope', 'user'], { timeout: 120000 })
      } else {
        await installPluginLocally(desired.name, agentDir!, desired.marketplace)
      }
      ops.push(`G09: Installed ${pluginKey} (scope: ${desired.scope})`)

    } else if (desired.action === 'uninstall') {
      if (desired.scope === 'user') {
        await execFileAsync('claude', ['plugin', 'uninstall', desired.name, desired.marketplace, '--scope', 'user'], { timeout: 30000 })
      } else {
        await uninstallPluginLocally(desired.name, agentDir!, desired.marketplace)
      }
      ops.push(`G09: Uninstalled ${pluginKey} (scope: ${desired.scope})`)

    } else if (desired.action === 'enable') {
      if (desired.scope === 'user') {
        await execFileAsync('claude', ['plugin', 'enable', pluginKey, '--scope', 'user'], { timeout: 30000 })
      } else {
        const resolvedDir = agentDir!.startsWith('~') ? agentDir!.replace('~', HOME) : agentDir!
        const localSettings = join(resolvedDir, '.claude', 'settings.local.json')
        await withSettingsLock(localSettings, async () => {
          await mkdir(join(resolvedDir, '.claude'), { recursive: true })
          const settings = await loadJsonSafe(localSettings) as Record<string, Record<string, unknown>>
          const ep = (settings.enabledPlugins || {}) as Record<string, boolean>
          ep[pluginKey] = true
          settings.enabledPlugins = ep
          await saveJsonSafe(localSettings, settings)
        })
      }
      ops.push(`G09: Enabled ${pluginKey} (scope: ${desired.scope})`)

    } else if (desired.action === 'disable') {
      if (desired.scope === 'user') {
        await execFileAsync('claude', ['plugin', 'disable', pluginKey, '--scope', 'user'], { timeout: 30000 })
      } else {
        const resolvedDir = agentDir!.startsWith('~') ? agentDir!.replace('~', HOME) : agentDir!
        const localSettings = join(resolvedDir, '.claude', 'settings.local.json')
        await withSettingsLock(localSettings, async () => {
          await mkdir(join(resolvedDir, '.claude'), { recursive: true })
          const settings = await loadJsonSafe(localSettings) as Record<string, Record<string, unknown>>
          const ep = (settings.enabledPlugins || {}) as Record<string, boolean>
          ep[pluginKey] = false
          settings.enabledPlugins = ep
          await saveJsonSafe(localSettings, settings)
        })
      }
      ops.push(`G09: Disabled ${pluginKey} (scope: ${desired.scope})`)

    } else if (desired.action === 'update') {
      if (desired.scope === 'user') {
        await execFileAsync('claude', ['plugin', 'update', desired.name, desired.marketplace, '--scope', 'user'], { timeout: 120000 })
      } else {
        // Local: uninstall then reinstall
        await uninstallPluginLocally(desired.name, agentDir!, desired.marketplace)
        await installPluginLocally(desired.name, agentDir!, desired.marketplace)
      }
      ops.push(`G09: Updated ${pluginKey} (scope: ${desired.scope})`)
    }

    // ── G10: Settings safeguard ───────────────────────────────
    if (desired.scope === 'local' && (desired.action === 'install' || desired.action === 'uninstall')) {
      const resolvedDir = agentDir!.startsWith('~') ? agentDir!.replace('~', HOME) : agentDir!
      const localSettings = join(resolvedDir, '.claude', 'settings.local.json')
      if (existsSync(localSettings)) {
        const settings = await loadJsonSafe(localSettings) as Record<string, Record<string, unknown>>
        const ep = (settings.enabledPlugins || {}) as Record<string, boolean>
        if (desired.action === 'install' && !ep[pluginKey]) {
          ops.push(`G10: WARN — settings.local.json missing plugin after install, writing safeguard`)
          await withSettingsLock(localSettings, async () => {
            const s = await loadJsonSafe(localSettings) as Record<string, Record<string, unknown>>
            const e = (s.enabledPlugins || {}) as Record<string, boolean>
            e[pluginKey] = true
            s.enabledPlugins = e
            await saveJsonSafe(localSettings, s)
          })
        } else if (desired.action === 'uninstall' && ep[pluginKey] !== undefined) {
          ops.push(`G10: WARN — settings.local.json still has plugin after uninstall, cleaning safeguard`)
          await withSettingsLock(localSettings, async () => {
            const s = await loadJsonSafe(localSettings) as Record<string, Record<string, unknown>>
            const e = (s.enabledPlugins || {}) as Record<string, boolean>
            delete e[pluginKey]
            s.enabledPlugins = e
            await saveJsonSafe(localSettings, s)
          })
        } else {
          ops.push(`G10: Settings safeguard passed`)
        }
      } else {
        ops.push(`G10: No settings.local.json to verify`)
      }
    } else {
      ops.push(`G10: Settings safeguard N/A (scope=${desired.scope}, action=${desired.action})`)
    }

    // ── G11: Verify final state ───────────────────────────────
    let finalState: boolean | undefined = undefined
    if (desired.scope === 'user') {
      const settingsData = await withSettingsLock(SETTINGS_JSON, async () => {
        return await loadJsonSafe(SETTINGS_JSON) as Record<string, Record<string, unknown>>
      })
      const ep = (settingsData.enabledPlugins || {}) as Record<string, boolean>
      finalState = ep[pluginKey] !== undefined ? ep[pluginKey] : undefined
    } else {
      const resolvedDir = agentDir!.startsWith('~') ? agentDir!.replace('~', HOME) : agentDir!
      const localSettings = join(resolvedDir, '.claude', 'settings.local.json')
      const settingsData = await withSettingsLock(localSettings, async () => {
        return await loadJsonSafe(localSettings) as Record<string, Record<string, unknown>>
      })
      const ep = (settingsData.enabledPlugins || {}) as Record<string, boolean>
      finalState = ep[pluginKey] !== undefined ? ep[pluginKey] : undefined
    }

    const expectedState = desired.action === 'uninstall' ? undefined
      : desired.action === 'disable' ? false
      : true
    if (finalState !== expectedState) {
      ops.push(`G11: WARN — Final state ${finalState} != expected ${expectedState}`)
    } else {
      ops.push(`G11: Final state verified`)
    }

    // ── G12: Determine restart needed ─────────────────────────
    // All plugin state mutations require restart
    result.restartNeeded = true
    ops.push(`G12: Restart needed (action=${desired.action})`)

    // ── G13: Return result ────────────────────────────────────
    result.success = true
    ops.push(`G13: Success`)

    console.log(`[ChangePlugin] ${pluginKey}: ${desired.action} (${ops.length} gates)`)
    return result
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
    console.error(`[ChangePlugin] FAILED for ${pluginKey}:`, result.error)
    return result
  }
}

// ══════════════════════════════════════════════════════════════
// ChangeResult — Shared result type for all Change* functions
// ══════════════════════════════════════════════════════════════

export interface ChangeResult {
  success: boolean
  operations: string[]
  restartNeeded: boolean
  error?: string
}

// ── Path safety helper ───────────────────────────────────────

/** Reject names containing path traversal or slash characters */
function isSafePathComponent(name: string): boolean {
  return !/\.\./.test(name) && !/[/\\]/.test(name) && name.length > 0
}

/** Resolve agent working directory from agentId or explicit agentDir */
async function resolveAgentDir(agentId: string | null, agentDir?: string): Promise<string | null> {
  if (agentDir) {
    return agentDir.startsWith('~') ? agentDir.replace('~', HOME) : agentDir
  }
  if (agentId) {
    const { getAgent } = await import('@/lib/agent-registry')
    const agent = getAgent(agentId)
    if (!agent) return null
    const dir = agent.workingDirectory || agent.sessions?.[0]?.workingDirectory
    return dir ? (dir.startsWith('~') ? dir.replace('~', HOME) : dir) : null
  }
  return null
}

// ── copyDirRecursive helper ──────────────────────────────────

async function copyDirRecursive(src: string, dest: string, depth = 0): Promise<void> {
  if (depth > 10) throw new Error('copyDir: max depth exceeded')
  await mkdir(dest, { recursive: true })
  const entries = await readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue // skip symlinks
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath, depth + 1)
    } else {
      await copyFile(srcPath, destPath)
    }
  }
}

// ══════════════════════════════════════════════════════════════
// Step 2: ChangeMarketplace
// ══════════════════════════════════════════════════════════════

export async function ChangeMarketplace(desired: {
  action: 'add' | 'remove' | 'update'
  name: string
  source?: { repo: string } | { path: string }
}): Promise<ChangeResult> {
  const ops: string[] = []
  const result: ChangeResult = { success: false, operations: ops, restartNeeded: false }

  try {
    // ── G01: Validate marketplace name format ─────────────────
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(desired.name)) {
      result.error = `Invalid marketplace name "${desired.name}". Must match /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/`
      return result
    }
    ops.push(`G01: Marketplace name "${desired.name}" is valid`)

    // ── G02: Validate source for add ──────────────────────────
    if (desired.action === 'add' && !desired.source) {
      result.error = `Source is required for add action`
      return result
    }
    ops.push(`G02: Source validated`)

    // ── G03: Execute action ───────────────────────────────────
    if (desired.action === 'add') {
      const source = desired.source!
      const sourceArg = 'repo' in source ? source.repo : source.path
      await execFileAsync('claude', ['plugin', 'marketplace', 'add', sourceArg], { timeout: 120000 })
      ops.push(`G03: Added marketplace "${desired.name}" from ${sourceArg}`)
    } else if (desired.action === 'remove') {
      await execFileAsync('claude', ['plugin', 'marketplace', 'remove', desired.name], { timeout: 120000 })
      ops.push(`G03: Removed marketplace "${desired.name}"`)

      // Clean up cached plugins
      const cacheDir = join(HOME, '.claude', 'plugins', 'marketplaces', desired.name)
      if (existsSync(cacheDir)) {
        await rm(cacheDir, { recursive: true, force: true })
        ops.push(`G04: Cleaned up cached plugins at ${cacheDir}`)
      }

      // Remove from extraKnownMarketplaces in settings.json
      await withSettingsLock(SETTINGS_JSON, async () => {
        const settings = await loadJsonSafe(SETTINGS_JSON) as Record<string, Record<string, unknown>>
        const ekm = settings.extraKnownMarketplaces as Record<string, unknown> | undefined
        if (ekm && ekm[desired.name] !== undefined) {
          delete ekm[desired.name]
          settings.extraKnownMarketplaces = ekm
          await saveJsonSafe(SETTINGS_JSON, settings)
          ops.push(`G05: Removed from extraKnownMarketplaces`)
        }
      })
    } else if (desired.action === 'update') {
      await execFileAsync('claude', ['plugin', 'marketplace', 'update', desired.name], { timeout: 120000 })
      ops.push(`G03: Updated marketplace "${desired.name}"`)
    }

    // ── Final ─────────────────────────────────────────────────
    result.success = true
    result.restartNeeded = desired.action !== 'update'
    ops.push(`G06: Success`)
    console.log(`[ChangeMarketplace] ${desired.name}: ${desired.action} (${ops.length} gates)`)
    return result
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
    console.error(`[ChangeMarketplace] FAILED for ${desired.name}:`, result.error)
    return result
  }
}

// ══════════════════════════════════════════════════════════════
// Step 3: ChangeSkill
// ══════════════════════════════════════════════════════════════

export async function ChangeSkill(agentId: string | null, desired: {
  name: string
  action: 'install' | 'remove' | 'convert'
  scope: 'user' | 'local'
  sourcePath?: string
  targetClient?: string
  agentDir?: string
}): Promise<ChangeResult> {
  const ops: string[] = []
  const result: ChangeResult = { success: false, operations: ops, restartNeeded: false }

  try {
    // ── G01: Validate skill name ──────────────────────────────
    if (!isSafePathComponent(desired.name)) {
      result.error = `Invalid skill name "${desired.name}". Must not contain ".." or "/" characters`
      return result
    }
    ops.push(`G01: Skill name "${desired.name}" is valid`)

    // ── G02: Resolve agent context ────────────────────────────
    const resolvedDir = await resolveAgentDir(agentId, desired.agentDir)
    if (desired.scope === 'local' && !resolvedDir) {
      result.error = `agentDir is required for local scope`
      return result
    }
    ops.push(`G02: Agent context resolved (dir=${resolvedDir || 'user-scope'})`)

    // ── G03: Resolve target directory ─────────────────────────
    const baseDir = desired.scope === 'user'
      ? join(HOME, '.claude', 'skills')
      : join(resolvedDir!, '.claude', 'skills')
    const targetDir = join(baseDir, desired.name)
    ops.push(`G03: Target = ${targetDir}`)

    // ── G04-G09: Execute action ───────────────────────────────
    if (desired.action === 'install') {
      if (!desired.sourcePath) {
        result.error = `sourcePath is required for install action`
        return result
      }
      if (!existsSync(desired.sourcePath)) {
        result.error = `Source path "${desired.sourcePath}" not found`
        return result
      }
      if (existsSync(targetDir)) {
        result.error = `Skill "${desired.name}" already exists at ${targetDir}`
        return result
      }
      await mkdir(baseDir, { recursive: true })
      await copyDirRecursive(desired.sourcePath, targetDir)
      ops.push(`G04: Installed skill from ${desired.sourcePath}`)
    } else if (desired.action === 'remove') {
      if (!existsSync(targetDir)) {
        result.error = `Skill "${desired.name}" not found at ${targetDir}`
        return result
      }
      await rm(targetDir, { recursive: true, force: true })
      ops.push(`G04: Removed skill directory`)
    } else if (desired.action === 'convert') {
      if (!desired.targetClient) {
        result.error = `targetClient is required for convert action`
        return result
      }
      const { convertElements } = await import('@/services/cross-client-conversion-service')
      type ProviderId = Parameters<typeof convertElements>[0]['targetClient']
      const convertResult = await convertElements({
        source: desired.sourcePath || targetDir,
        targetClient: desired.targetClient as ProviderId,
        elements: ['skills'],
        scope: desired.scope === 'user' ? 'user' : 'project',
      })
      if (!convertResult.ok) {
        result.error = convertResult.error || 'Conversion failed'
        return result
      }
      ops.push(`G04: Converted skill to ${desired.targetClient}`)
    }

    // ── Verify final state ────────────────────────────────────
    if (desired.action === 'install' && !existsSync(targetDir)) {
      ops.push(`G05: WARN — target dir missing after install`)
    } else if (desired.action === 'remove' && existsSync(targetDir)) {
      ops.push(`G05: WARN — target dir still exists after remove`)
    } else {
      ops.push(`G05: Final state verified`)
    }

    result.success = true
    result.restartNeeded = true
    ops.push(`G06: Success`)
    console.log(`[ChangeSkill] ${desired.name}: ${desired.action} (${ops.length} gates)`)
    return result
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
    console.error(`[ChangeSkill] FAILED for ${desired.name}:`, result.error)
    return result
  }
}

// ══════════════════════════════════════════════════════════════
// Step 4: ChangeAgentDef, ChangeCommand, ChangeRule, ChangeOutputStyle
// ══════════════════════════════════════════════════════════════

/** Internal helper for single-file elements (.md files in .claude/ subdirectories) */
async function changeSimpleElement(
  elementType: string,
  subDir: string,
  extension: string,
  agentId: string | null,
  desired: {
    name: string
    action: 'install' | 'remove'
    scope: 'user' | 'local'
    sourcePath?: string
    content?: string
    agentDir?: string
  },
): Promise<ChangeResult> {
  const ops: string[] = []
  const result: ChangeResult = { success: false, operations: ops, restartNeeded: false }

  try {
    // ── G01: Validate name ────────────────────────────────────
    if (!isSafePathComponent(desired.name)) {
      result.error = `Invalid ${elementType} name "${desired.name}". Must not contain ".." or "/" characters`
      return result
    }
    ops.push(`G01: Name "${desired.name}" is valid`)

    // ── G02: Resolve agent context ────────────────────────────
    const resolvedDir = await resolveAgentDir(agentId, desired.agentDir)
    if (desired.scope === 'local' && !resolvedDir) {
      result.error = `agentDir is required for local scope`
      return result
    }
    ops.push(`G02: Agent context resolved`)

    // ── G03: Resolve target path ──────────────────────────────
    const baseDir = desired.scope === 'user'
      ? join(HOME, '.claude', subDir)
      : join(resolvedDir!, '.claude', subDir)
    const targetPath = join(baseDir, `${desired.name}${extension}`)
    ops.push(`G03: Target = ${targetPath}`)

    // ── G04-G07: Execute action ───────────────────────────────
    if (desired.action === 'install') {
      if (!desired.sourcePath && !desired.content) {
        result.error = `sourcePath or content is required for install action`
        return result
      }
      if (existsSync(targetPath)) {
        result.error = `${elementType} "${desired.name}" already exists at ${targetPath}`
        return result
      }
      await mkdir(baseDir, { recursive: true })
      if (desired.sourcePath) {
        await copyFile(desired.sourcePath, targetPath)
        ops.push(`G04: Installed from ${desired.sourcePath}`)
      } else {
        await writeFile(targetPath, desired.content!, 'utf-8')
        ops.push(`G04: Installed from content`)
      }
    } else if (desired.action === 'remove') {
      if (!existsSync(targetPath)) {
        result.error = `${elementType} "${desired.name}" not found at ${targetPath}`
        return result
      }
      await rm(targetPath, { recursive: true, force: true })
      ops.push(`G04: Removed ${elementType}`)
    }

    // ── Verify final state ────────────────────────────────────
    if (desired.action === 'install' && !existsSync(targetPath)) {
      ops.push(`G05: WARN — target missing after install`)
    } else if (desired.action === 'remove' && existsSync(targetPath)) {
      ops.push(`G05: WARN — target still exists after remove`)
    } else {
      ops.push(`G05: Final state verified`)
    }

    result.success = true
    result.restartNeeded = true
    ops.push(`G06: Success`)
    console.log(`[Change${elementType}] ${desired.name}: ${desired.action} (${ops.length} gates)`)
    return result
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
    console.error(`[Change${elementType}] FAILED for ${desired.name}:`, result.error)
    return result
  }
}

export async function ChangeAgentDef(
  agentId: string | null,
  desired: { name: string; action: 'install' | 'remove'; scope: 'user' | 'local'; sourcePath?: string; content?: string; agentDir?: string },
): Promise<ChangeResult> {
  return changeSimpleElement('agent definition', 'agents', '.md', agentId, desired)
}

export async function ChangeCommand(
  agentId: string | null,
  desired: { name: string; action: 'install' | 'remove'; scope: 'user' | 'local'; sourcePath?: string; content?: string; agentDir?: string },
): Promise<ChangeResult> {
  return changeSimpleElement('command', 'commands', '.md', agentId, desired)
}

export async function ChangeRule(
  agentId: string | null,
  desired: { name: string; action: 'install' | 'remove'; scope: 'user' | 'local'; sourcePath?: string; content?: string; agentDir?: string },
): Promise<ChangeResult> {
  return changeSimpleElement('rule', 'rules', '.md', agentId, desired)
}

export async function ChangeOutputStyle(
  agentId: string | null,
  desired: { name: string; action: 'install' | 'remove'; scope: 'user' | 'local'; sourcePath?: string; content?: string; agentDir?: string },
): Promise<ChangeResult> {
  return changeSimpleElement('output style', 'output-styles', '.md', agentId, desired)
}

// ══════════════════════════════════════════════════════════════
// Step 5: ChangeMCP
// ══════════════════════════════════════════════════════════════

export async function ChangeMCP(agentId: string | null, desired: {
  name: string
  action: 'add' | 'remove'
  scope: 'user' | 'local' | 'project'
  config?: Record<string, unknown>
  agentDir?: string
}): Promise<ChangeResult> {
  const ops: string[] = []
  const result: ChangeResult = { success: false, operations: ops, restartNeeded: false }

  try {
    // ── G01: Validate server name ─────────────────────────────
    if (!isSafePathComponent(desired.name)) {
      result.error = `Invalid MCP server name "${desired.name}". Must not contain ".." or "/" characters`
      return result
    }
    ops.push(`G01: Server name "${desired.name}" is valid`)

    // ── G02: Resolve agent context ────────────────────────────
    const resolvedDir = await resolveAgentDir(agentId, desired.agentDir)
    ops.push(`G02: Agent context resolved (dir=${resolvedDir || 'none'})`)

    // ── G03: Validate config for add ──────────────────────────
    if (desired.action === 'add' && !desired.config) {
      result.error = `config is required for add action`
      return result
    }
    ops.push(`G03: Config validated`)

    // ── G04: Execute action ───────────────────────────────────
    const scopeArgs = ['--scope', desired.scope]
    const cwd = resolvedDir || undefined

    if (desired.action === 'add') {
      const configJson = JSON.stringify(desired.config)
      await execFileAsync('claude', ['mcp', 'add-json', desired.name, configJson, ...scopeArgs], { timeout: 120000, cwd })
      ops.push(`G04: Added MCP server "${desired.name}" (scope: ${desired.scope})`)
    } else if (desired.action === 'remove') {
      await execFileAsync('claude', ['mcp', 'remove', desired.name, ...scopeArgs], { timeout: 120000, cwd })
      ops.push(`G04: Removed MCP server "${desired.name}" (scope: ${desired.scope})`)
    }

    result.success = true
    result.restartNeeded = true
    ops.push(`G05: Success`)
    console.log(`[ChangeMCP] ${desired.name}: ${desired.action} (${ops.length} gates)`)
    return result
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
    console.error(`[ChangeMCP] FAILED for ${desired.name}:`, result.error)
    return result
  }
}

// ══════════════════════════════════════════════════════════════
// Step 6: ChangeLSP
// ══════════════════════════════════════════════════════════════

export async function ChangeLSP(agentId: string | null, desired: {
  name: string
  action: 'add' | 'remove'
  config?: Record<string, unknown>
  agentDir?: string
}): Promise<ChangeResult> {
  const ops: string[] = []
  const result: ChangeResult = { success: false, operations: ops, restartNeeded: false }

  try {
    // ── G01: Validate name ────────────────────────────────────
    if (!isSafePathComponent(desired.name)) {
      result.error = `Invalid LSP server name "${desired.name}". Must not contain ".." or "/" characters`
      return result
    }
    ops.push(`G01: LSP name "${desired.name}" is valid`)

    // ── G02: Validate config for add ──────────────────────────
    if (desired.action === 'add' && !desired.config) {
      result.error = `config is required for add action`
      return result
    }
    ops.push(`G02: Config validated`)

    // ── G03: Resolve target .lsp.json ─────────────────────────
    const resolvedDir = await resolveAgentDir(agentId, desired.agentDir)
    const lspJsonPath = resolvedDir
      ? join(resolvedDir, '.lsp.json')
      : join(HOME, '.lsp.json')
    ops.push(`G03: LSP config path = ${lspJsonPath}`)

    // ── G04: Read/Write .lsp.json ─────────────────────────────
    let lspConfig: Record<string, unknown> = {}
    if (existsSync(lspJsonPath)) {
      try {
        const raw = await readFile(lspJsonPath, 'utf-8')
        lspConfig = JSON.parse(raw) as Record<string, unknown>
      } catch {
        lspConfig = {}
      }
    }

    if (desired.action === 'add') {
      lspConfig[desired.name] = desired.config
      await writeFile(lspJsonPath, JSON.stringify(lspConfig, null, 2), 'utf-8')
      ops.push(`G04: Added LSP "${desired.name}" to ${lspJsonPath}`)
    } else if (desired.action === 'remove') {
      if (lspConfig[desired.name] === undefined) {
        result.error = `LSP "${desired.name}" not found in ${lspJsonPath}`
        return result
      }
      delete lspConfig[desired.name]
      await writeFile(lspJsonPath, JSON.stringify(lspConfig, null, 2), 'utf-8')
      ops.push(`G04: Removed LSP "${desired.name}" from ${lspJsonPath}`)
    }

    result.success = true
    result.restartNeeded = true
    ops.push(`G05: Success`)
    console.log(`[ChangeLSP] ${desired.name}: ${desired.action} (${ops.length} gates)`)
    return result
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
    console.error(`[ChangeLSP] FAILED for ${desired.name}:`, result.error)
    return result
  }
}

// ══════════════════════════════════════════════════════════════
// Step 6: ChangeHook
// ══════════════════════════════════════════════════════════════

const VALID_HOOK_EVENTS = new Set([
  'PreToolUse', 'PostToolUse', 'Stop', 'Notification',
  'SubagentStop', 'SubagentStart',
])

export async function ChangeHook(agentId: string | null, desired: {
  event: string
  action: 'add' | 'remove'
  hookConfig?: { command: string; matcher?: string; timeout?: number }
  scope: 'user' | 'local'
  agentDir?: string
}): Promise<ChangeResult> {
  const ops: string[] = []
  const result: ChangeResult = { success: false, operations: ops, restartNeeded: false }

  try {
    // ── G01: Validate event name ──────────────────────────────
    if (!isSafePathComponent(desired.event) || !VALID_HOOK_EVENTS.has(desired.event)) {
      result.error = `Invalid hook event "${desired.event}". Must be one of: ${[...VALID_HOOK_EVENTS].join(', ')}`
      return result
    }
    ops.push(`G01: Event "${desired.event}" is valid`)

    // ── G02: Validate hookConfig for add ──────────────────────
    if (desired.action === 'add' && !desired.hookConfig) {
      result.error = `hookConfig is required for add action`
      return result
    }
    ops.push(`G02: Config validated`)

    // ── G03: Resolve settings file path ───────────────────────
    let settingsPath: string
    if (desired.scope === 'user') {
      settingsPath = SETTINGS_JSON
    } else {
      const resolvedDir = await resolveAgentDir(agentId, desired.agentDir)
      if (!resolvedDir) {
        result.error = `agentDir is required for local scope`
        return result
      }
      settingsPath = join(resolvedDir, '.claude', 'settings.local.json')
    }
    ops.push(`G03: Settings path = ${settingsPath}`)

    // ── G04: Read/Write hooks in settings ─────────────────────
    await withSettingsLock(settingsPath, async () => {
      const settings = await loadJsonSafe(settingsPath) as Record<string, unknown>
      const hooks = (settings.hooks || {}) as Record<string, Array<Record<string, unknown>>>
      const eventHooks = hooks[desired.event] || []

      if (desired.action === 'add') {
        const hookEntry: Record<string, unknown> = { command: desired.hookConfig!.command }
        if (desired.hookConfig!.matcher) hookEntry.matcher = desired.hookConfig!.matcher
        if (desired.hookConfig!.timeout) hookEntry.timeout = desired.hookConfig!.timeout
        eventHooks.push(hookEntry)
        hooks[desired.event] = eventHooks
        settings.hooks = hooks
        await saveJsonSafe(settingsPath, settings as Record<string, unknown>)
        ops.push(`G04: Added hook for ${desired.event}`)
      } else if (desired.action === 'remove') {
        if (!desired.hookConfig) {
          result.error = `hookConfig is required for remove action (to identify which hook to remove)`
          return
        }
        const idx = eventHooks.findIndex(h => h.command === desired.hookConfig!.command)
        if (idx === -1) {
          result.error = `Hook with command "${desired.hookConfig.command}" not found for event ${desired.event}`
          return
        }
        eventHooks.splice(idx, 1)
        if (eventHooks.length === 0) {
          delete hooks[desired.event]
        } else {
          hooks[desired.event] = eventHooks
        }
        settings.hooks = hooks
        await saveJsonSafe(settingsPath, settings as Record<string, unknown>)
        ops.push(`G04: Removed hook for ${desired.event}`)
      }
    })

    // If an error was set inside withSettingsLock, return it
    if (result.error) return result

    result.success = true
    result.restartNeeded = true
    ops.push(`G05: Success`)
    console.log(`[ChangeHook] ${desired.event}: ${desired.action} (${ops.length} gates)`)
    return result
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
    console.error(`[ChangeHook] FAILED for ${desired.event}:`, result.error)
    return result
  }
}

// ══════════════════════════════════════════════════════════════
// Step 7: ChangeTeam
// ══════════════════════════════════════════════════════════════

export async function ChangeTeam(
  agentId: string,
  desired: {
    teamId: string | null  // null = remove from all teams
    role?: string           // 'member' | 'chief-of-staff' | 'orchestrator' | 'architect' | 'integrator'
  },
): Promise<ChangeResult> {
  const ops: string[] = []
  const result: ChangeResult = { success: false, operations: ops, restartNeeded: false }

  try {
    // ── G01: Validate agent exists ────────────────────────────
    const { getAgent } = await import('@/lib/agent-registry')
    const agent = getAgent(agentId)
    if (!agent) {
      result.error = `Agent ${agentId} not found`
      return result
    }
    ops.push(`G01: Agent "${agent.name}" found`)

    // ── G01b: Manager gate — no team mutations without a MANAGER ──
    const { getTeam, updateTeam, loadTeams } = await import('@/lib/team-registry')
    const { getManagerId, isManager } = await import('@/lib/governance')
    if (!getManagerId()) {
      result.error = 'Team operations are blocked: no MANAGER exists on this host. Assign a MANAGER first.'
      return result
    }

    if (desired.teamId) {
      const team = getTeam(desired.teamId)
      if (!team) {
        result.error = `Team ${desired.teamId} not found`
        return result
      }
      ops.push(`G02: Team "${team.name}" found`)
    } else {
      ops.push(`G02: Removing from team — no team ID to validate`)
    }

    // ── G03: Detect current team membership ───────────────────
    const allTeams = loadTeams()
    const currentTeams = allTeams.filter(t => t.agentIds.includes(agentId))
    const currentTeam = currentTeams.length > 0 ? currentTeams[0] : null
    ops.push(`G03: Agent is in ${currentTeams.length} team(s)${currentTeam ? ` (current: "${currentTeam.name}")` : ''}`)

    const managerId = getManagerId()

    // ── REMOVE from team (teamId=null) ────────────────────────
    if (desired.teamId === null) {
      if (!currentTeam) {
        result.success = true
        ops.push(`G04: Agent not in any team — no-op`)
        return result
      }

      // G04a: Check if agent is COS
      if (currentTeam.chiefOfStaffId === agentId) {
        console.warn(`[ChangeTeam] Agent ${agentId} "${agent.name}" is COS of team "${currentTeam.name}" — caller should remove COS first`)
        ops.push(`G04a: WARN — Agent is COS of "${currentTeam.name}" — caller should clear COS slot`)
      }

      // G04b: Check if agent is orchestrator
      if (currentTeam.orchestratorId === agentId) {
        ops.push(`G04b: Agent is orchestrator of "${currentTeam.name}" — clearing orchestratorId`)
        await updateTeam(currentTeam.id, { orchestratorId: null }, managerId)
      } else {
        ops.push(`G04b: Agent is not orchestrator — skip`)
      }

      // G04c: Remove agent from team.agentIds
      const newAgentIds = currentTeam.agentIds.filter(id => id !== agentId)
      await updateTeam(currentTeam.id, { agentIds: newAgentIds }, managerId)
      ops.push(`G04c: Removed agent from team "${currentTeam.name}" agentIds`)

      // G04d: Revert title to AUTONOMOUS
      const titleResult = await ChangeTitle(agentId, 'autonomous')
      if (!titleResult.success) {
        ops.push(`G04d: WARN — ChangeTitle to AUTONOMOUS failed: ${titleResult.error}`)
      } else {
        ops.push(`G04d: Title reverted to AUTONOMOUS`)
      }

      result.restartNeeded = titleResult.restartNeeded
      result.success = true
      console.log(`[ChangeTeam] Agent ${agentId} "${agent.name}": removed from team "${currentTeam.name}" (${ops.length} gates)`)
      return result
    }

    // ── ADD to team (teamId provided) ─────────────────────────
    const targetTeam = getTeam(desired.teamId)!

    // G05: Check single-team membership (unless MANAGER)
    if (currentTeam && currentTeam.id !== desired.teamId && !isManager(agentId)) {
      result.error = `Agent "${agent.name}" is already in team "${currentTeam.name}". Remove from current team first (closed teams enforce single membership).`
      return result
    }
    ops.push(`G05: Single-team membership check passed`)

    // G06: Check if already in target team
    if (targetTeam.agentIds.includes(agentId)) {
      ops.push(`G06: Agent already in target team — skip add`)
    } else {
      // G06: Add agentId to team.agentIds
      const newAgentIds = [...targetTeam.agentIds, agentId]
      await updateTeam(desired.teamId, { agentIds: newAgentIds }, managerId)
      ops.push(`G06: Added agent to team "${targetTeam.name}" agentIds`)
    }

    // G07: Set title
    const effectiveRole = desired.role || 'member'
    const titleResult = await ChangeTitle(agentId, effectiveRole)
    if (!titleResult.success) {
      ops.push(`G07: WARN — ChangeTitle to ${effectiveRole} failed: ${titleResult.error}`)
    } else {
      ops.push(`G07: Title set to ${effectiveRole.toUpperCase()}`)
    }

    result.restartNeeded = titleResult.restartNeeded
    result.success = true
    console.log(`[ChangeTeam] Agent ${agentId} "${agent.name}": added to team "${targetTeam.name}" as ${effectiveRole.toUpperCase()} (${ops.length} gates)`)
    return result
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
    console.error(`[ChangeTeam] FAILED for agent ${agentId}:`, result.error)
    return result
  }
}

// ══════════════════════════════════════════════════════════════
// Step 8: ChangeName, ChangeFolder, ChangeAvatar, ChangeCLIArgs
// ══════════════════════════════════════════════════════════════

export async function ChangeName(
  agentId: string,
  newName: string,
): Promise<ChangeResult> {
  const ops: string[] = []
  const result: ChangeResult = { success: false, operations: ops, restartNeeded: false }

  try {
    // ── G01: Validate name format ─────────────────────────────
    const normalized = newName.toLowerCase()
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(normalized)) {
      result.error = `Invalid agent name "${newName}". Must match /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/ and be lowercase`
      return result
    }
    ops.push(`G01: Name "${normalized}" is valid`)

    // ── G02: Get agent from registry ──────────────────────────
    const { getAgent, updateAgent } = await import('@/lib/agent-registry')
    const agent = getAgent(agentId)
    if (!agent) {
      result.error = `Agent ${agentId} not found`
      return result
    }
    ops.push(`G02: Agent "${agent.name}" found`)

    // ── G03: No-op check ──────────────────────────────────────
    if (agent.name === normalized) {
      result.success = true
      ops.push(`G03: Name already "${normalized}" — no-op`)
      return result
    }
    ops.push(`G03: Name change needed: "${agent.name}" → "${normalized}"`)

    // ── G04: Write to registry (uniqueness + tmux rename handled by updateAgent) ──
    const updated = await updateAgent(agentId, { name: normalized })
    if (!updated) {
      result.error = `Failed to update agent name in registry`
      return result
    }
    ops.push(`G04: Updated name in registry`)

    // ── G05: Determine restart needed ─────────────────────────
    const sessions = agent.sessions || []
    if (sessions.length > 0) {
      result.restartNeeded = true
      ops.push(`G05: Restart needed (${sessions.length} active session(s))`)
    } else {
      ops.push(`G05: No active sessions — no restart needed`)
    }

    // ── G06: Verify final state ───────────────────────────────
    const verified = getAgent(agentId)
    if (verified?.name !== normalized) {
      ops.push(`G06: WARN — Final name "${verified?.name}" != expected "${normalized}"`)
    } else {
      ops.push(`G06: Final name verified: "${normalized}"`)
    }

    result.success = true
    console.log(`[ChangeName] Agent ${agentId}: "${agent.name}" → "${normalized}" (${ops.length} gates, restart=${result.restartNeeded})`)
    return result
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
    console.error(`[ChangeName] FAILED for agent ${agentId}:`, result.error)
    return result
  }
}

export async function ChangeFolder(
  agentId: string,
  newFolder: string,
): Promise<ChangeResult> {
  const ops: string[] = []
  const result: ChangeResult = { success: false, operations: ops, restartNeeded: false }

  try {
    // ── G01: Validate path ────────────────────────────────────
    if (/\.\./.test(newFolder)) {
      result.error = `Path traversal ("..") not allowed in working directory`
      return result
    }
    const resolved = newFolder.startsWith('~') ? newFolder.replace('~', HOME) : newFolder
    ops.push(`G01: Path "${resolved}" validated (no traversal)`)

    // ── G02: Check path exists and is directory ───────────────
    if (!existsSync(resolved)) {
      result.error = `Path "${resolved}" does not exist`
      return result
    }
    const stats = await stat(resolved)
    if (!stats.isDirectory()) {
      result.error = `Path "${resolved}" is not a directory`
      return result
    }
    ops.push(`G02: Path exists and is a directory`)

    // ── G03: Get agent from registry ──────────────────────────
    const { getAgent, updateAgent } = await import('@/lib/agent-registry')
    const agent = getAgent(agentId)
    if (!agent) {
      result.error = `Agent ${agentId} not found`
      return result
    }
    ops.push(`G03: Agent "${agent.name}" found`)

    // ── G04: No-op check ──────────────────────────────────────
    const currentDir = agent.workingDirectory || ''
    const currentResolved = currentDir.startsWith('~') ? currentDir.replace('~', HOME) : currentDir
    if (currentResolved === resolved) {
      result.success = true
      ops.push(`G04: Folder already "${resolved}" — no-op`)
      return result
    }
    ops.push(`G04: Folder change needed: "${currentResolved}" → "${resolved}"`)

    // ── G05: Write to registry ────────────────────────────────
    const updated = await updateAgent(agentId, { workingDirectory: resolved })
    if (!updated) {
      result.error = `Failed to update working directory in registry`
      return result
    }
    ops.push(`G05: Updated workingDirectory in registry`)

    // ── G06: Note about local-scope plugins ───────────────────
    console.log(`[ChangeFolder] Agent ${agentId} "${agent.name}": local-scope plugins may need re-linking after folder change`)
    ops.push(`G06: NOTE — Local-scope plugins may need re-linking`)

    // ── G07: Restart needed ───────────────────────────────────
    result.restartNeeded = true
    ops.push(`G07: Restart needed (working directory changed)`)

    result.success = true
    console.log(`[ChangeFolder] Agent ${agentId} "${agent.name}": "${currentResolved}" → "${resolved}" (${ops.length} gates)`)
    return result
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
    console.error(`[ChangeFolder] FAILED for agent ${agentId}:`, result.error)
    return result
  }
}

export async function ChangeAvatar(
  agentId: string,
  avatarPath: string,
): Promise<ChangeResult> {
  const ops: string[] = []
  const result: ChangeResult = { success: false, operations: ops, restartNeeded: false }

  try {
    // ── G01: Validate file exists ─────────────────────────────
    const resolved = avatarPath.startsWith('~') ? avatarPath.replace('~', HOME) : avatarPath
    if (!existsSync(resolved)) {
      result.error = `Avatar file "${resolved}" not found`
      return result
    }
    ops.push(`G01: Avatar file exists at "${resolved}"`)

    // ── G02: Get agent from registry ──────────────────────────
    const { getAgent, updateAgent } = await import('@/lib/agent-registry')
    const agent = getAgent(agentId)
    if (!agent) {
      result.error = `Agent ${agentId} not found`
      return result
    }
    ops.push(`G02: Agent "${agent.name}" found`)

    // ── G03: Write to registry ────────────────────────────────
    const updated = await updateAgent(agentId, { avatar: avatarPath })
    if (!updated) {
      result.error = `Failed to update avatar in registry`
      return result
    }
    ops.push(`G03: Updated avatar in registry`)

    result.success = true
    console.log(`[ChangeAvatar] Agent ${agentId} "${agent.name}": avatar → "${avatarPath}" (${ops.length} gates)`)
    return result
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
    console.error(`[ChangeAvatar] FAILED for agent ${agentId}:`, result.error)
    return result
  }
}

export async function ChangeCLIArgs(
  agentId: string,
  newArgs: string,
): Promise<ChangeResult> {
  const ops: string[] = []
  const result: ChangeResult = { success: false, operations: ops, restartNeeded: false }

  try {
    // ── G01: Validate args (basic sanitization) ───────────────
    // Allow: a-z A-Z 0-9 space - _ . = / : @ (covers paths, flags, persona names)
    if (/[^a-zA-Z0-9 \-_\.=\/:@]/.test(newArgs)) {
      result.error = `CLI args contain unsafe characters. Allowed: a-z A-Z 0-9 space - _ . = / : @`
      return result
    }
    ops.push(`G01: CLI args validated`)

    // ── G02: Get agent from registry ──────────────────────────
    const { getAgent, updateAgent } = await import('@/lib/agent-registry')
    const agent = getAgent(agentId)
    if (!agent) {
      result.error = `Agent ${agentId} not found`
      return result
    }
    ops.push(`G02: Agent "${agent.name}" found`)

    // ── G03: No-op check ──────────────────────────────────────
    if (agent.programArgs === newArgs) {
      result.success = true
      ops.push(`G03: CLI args already "${newArgs}" — no-op`)
      return result
    }
    ops.push(`G03: CLI args change needed: "${agent.programArgs || ''}" → "${newArgs}"`)

    // ── G04: Write to registry ────────────────────────────────
    const updated = await updateAgent(agentId, { programArgs: newArgs })
    if (!updated) {
      result.error = `Failed to update programArgs in registry`
      return result
    }
    ops.push(`G04: Updated programArgs in registry`)

    // ── G05: Restart needed ───────────────────────────────────
    result.restartNeeded = true
    ops.push(`G05: Restart needed (CLI args changed)`)

    result.success = true
    console.log(`[ChangeCLIArgs] Agent ${agentId} "${agent.name}": args → "${newArgs}" (${ops.length} gates)`)
    return result
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
    console.error(`[ChangeCLIArgs] FAILED for agent ${agentId}:`, result.error)
    return result
  }
}

// ══════════════════════════════════════════════════════════════
// CreateAgent — All-in-one agent creation with full gate pipeline
// ══════════════════════════════════════════════════════════════

export interface CreateAgentResult {
  success: boolean
  agentId: string | null
  operations: string[]
  restartNeeded: boolean
  error?: string
}

/**
 * All-in-one agent creation. Validates, infers, creates, and configures
 * the agent in a single pipeline. Replaces the old createNewAgent() thin wrapper.
 *
 * Gates:
 *   G01: Validate name format
 *   G02: Infer and set client/program (from client field, program field, or default)
 *   G03: Validate working directory (create ~/agents/<name>/ if needed)
 *   G04: Create agent in registry
 *   G05: Set governance title if requested (delegates to ChangeTitle)
 *   G06: Add to team if requested (delegates to ChangeTeam)
 *   G07: Install role-plugin if title requires one (handled by ChangeTitle)
 *   G08: Create tmux session directory structure
 */
export async function CreateAgent(
  desired: {
    name: string
    label?: string
    client?: string           // 'claude' | 'codex' | 'gemini' | 'aider' | 'opencode'
    program?: string           // Explicit program path (overrides client inference)
    workingDirectory?: string
    governanceTitle?: string   // If set, ChangeTitle is called after creation
    teamId?: string            // If set, ChangeTeam is called after creation
    avatar?: string
    programArgs?: string
    pluginName?: string          // Role-plugin to install (auto-converts for non-Claude clients)
    createSession?: boolean       // If true, creates tmux session after registration
    owner?: string
    tags?: string[]
    model?: string
    taskDescription?: string
  },
): Promise<CreateAgentResult> {
  const ops: string[] = []
  const result: CreateAgentResult = { success: false, agentId: null, operations: ops, restartNeeded: false }

  try {
    // ── G01: Validate name format ────────────────────────────
    const name = desired.name?.toLowerCase().trim()
    if (!name || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)) {
      result.error = `Invalid agent name "${desired.name}". Must match /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/`
      return result
    }
    ops.push(`G01: Name "${name}" is valid`)

    // ── G02: Infer client/program (smart, with deprecated client handling) ──
    // Supported clients ranked by capability (tiebreaker when counts are equal)
    // Order: plugin support, tool use, context window, ecosystem maturity
    // Power rank: plugin support, tool use, context window, ecosystem maturity
    const CLIENT_POWER_RANK: string[] = ['claude', 'codex', 'gemini', 'kiro', 'opencode']
    // Maps client type → CLI binary name (what gets stored as agent.program and launched in tmux)
    const SUPPORTED_CLIENTS: Record<string, string> = {
      claude: 'claude',
      codex: 'codex',
      gemini: 'gemini',
      kiro: 'kiro-cli',     // binary is 'kiro-cli' on all platforms (macOS, Linux, Windows)
      opencode: 'opencode',
    }
    const DEPRECATED_CLIENTS = new Set(['aider'])

    // Check if a CLI binary is installed on the system
    const { execFileSync } = await import('child_process')
    const isInstalled = (bin: string): boolean => {
      try {
        execFileSync('which', [bin], { timeout: 3000, stdio: 'pipe' })
        return true
      } catch {
        return false
      }
    }

    // Find the best installed client by power rank
    const bestInstalledClient = (): string => {
      for (const client of CLIENT_POWER_RANK) {
        if (isInstalled(SUPPORTED_CLIENTS[client])) return client
      }
      return 'claude' // absolute fallback even if not installed — let it fail at session start
    }

    let program = desired.program || ''
    const requestedClient = (desired.client || '').toLowerCase()

    if (!program && requestedClient) {
      if (DEPRECATED_CLIENTS.has(requestedClient)) {
        // Deprecated client: fallback to most-used installed client on this host
        const { loadAgents } = await import('@/lib/agent-registry')
        const { detectClientType } = await import('@/lib/client-capabilities')
        const agents = loadAgents()
        const clientCounts: Record<string, number> = {}
        for (const a of agents) {
          const ct = detectClientType(a.program || '')
          if (ct !== 'unknown' && !DEPRECATED_CLIENTS.has(ct) && isInstalled(SUPPORTED_CLIENTS[ct] || ct)) {
            clientCounts[ct] = (clientCounts[ct] || 0) + 1
          }
        }
        // Pick most popular installed client; tiebreak by power rank
        const sorted = Object.entries(clientCounts).sort((a, b) => {
          if (b[1] !== a[1]) return b[1] - a[1]
          return CLIENT_POWER_RANK.indexOf(a[0]) - CLIENT_POWER_RANK.indexOf(b[0])
        })
        const fallback = sorted.length > 0 ? sorted[0][0] : bestInstalledClient()
        program = SUPPORTED_CLIENTS[fallback] || fallback
        ops.push(`G02: Client "${requestedClient}" is deprecated — fallback to '${program}' (most used installed: ${sorted.map(([k, v]) => `${k}=${v}`).join(', ') || 'none'})`)
      } else if (SUPPORTED_CLIENTS[requestedClient]) {
        program = SUPPORTED_CLIENTS[requestedClient]
        // Verify the requested client is actually installed
        if (!isInstalled(program)) {
          program = bestInstalledClient()
          ops.push(`G02: Client "${requestedClient}" not installed — fallback to '${program}'`)
        } else {
          ops.push(`G02: Program set to '${program}' (from client field, verified installed)`)
        }
      } else {
        program = requestedClient
        ops.push(`G02: Unknown client "${requestedClient}" — using as direct program name`)
      }
    } else if (program) {
      const { detectClientType } = await import('@/lib/client-capabilities')
      const ct = detectClientType(program)
      if (DEPRECATED_CLIENTS.has(ct)) {
        const oldProgram = program
        program = bestInstalledClient()
        ops.push(`G02: Program "${oldProgram}" maps to deprecated client "${ct}" — fallback to '${program}'`)
      } else if (!isInstalled(program)) {
        const oldProgram = program
        program = bestInstalledClient()
        ops.push(`G02: Program "${oldProgram}" not installed — fallback to '${program}'`)
      } else {
        ops.push(`G02: Program set to '${program}' (explicit, verified installed)`)
      }
    } else {
      program = bestInstalledClient()
      ops.push(`G02: No client/program specified — defaulting to '${program}' (best installed)`)
    }

    // ── G03: Resolve working directory ───────────────────────
    // RULE: Non-AUTONOMOUS agents ALWAYS get ~/agents/<name>/ (no override allowed).
    // AUTONOMOUS agents may specify an existing project folder; otherwise ~/agents/<name>/.
    const { mkdir, stat } = await import('fs/promises')
    // Team titles (member, cos, orchestrator, etc.) are forced to ~/agents/<name>/
    // Non-team titles (autonomous, manager) can choose their own folder
    const NON_TEAM_TITLES = new Set(['autonomous', 'manager', ''])
    const isTeamTitle = desired.governanceTitle && !NON_TEAM_TITLES.has(desired.governanceTitle)
    let workDir: string

    if (isTeamTitle) {
      // Non-AUTONOMOUS: always ~/agents/<name>/, ignore any override
      workDir = join(HOME, 'agents', name)
      if (desired.workingDirectory && desired.workingDirectory !== workDir) {
        ops.push(`G03: OVERRIDE — non-AUTONOMOUS agent forced to ~/agents/${name}/ (requested: ${desired.workingDirectory})`)
      }
    } else if (desired.workingDirectory) {
      // AUTONOMOUS with explicit folder (user chose an existing project)
      workDir = desired.workingDirectory.startsWith('~')
        ? desired.workingDirectory.replace(/^~/, HOME)
        : desired.workingDirectory
    } else {
      // AUTONOMOUS with no folder specified: auto-create ~/agents/<name>/
      workDir = join(HOME, 'agents', name)
    }

    // Name collision check: if workDir is ~/agents/<name>/ and it already exists
    // AND belongs to a different agent, reject
    const autoDir = join(HOME, 'agents', name)
    if (workDir === autoDir) {
      try {
        const dirStat = await stat(autoDir)
        if (dirStat.isDirectory()) {
          // Check if an agent with this name already exists in registry
          const { loadAgents } = await import('@/lib/agent-registry')
          const existing = loadAgents().find(a => a.name === name)
          if (existing) {
            result.error = `Agent folder ~/agents/${name}/ already exists and belongs to agent "${existing.label || existing.name}" (${existing.id}). Choose a different name.`
            return result
          }
          // Folder exists but no agent claims it — reuse (orphaned folder)
          ops.push(`G03: Reusing orphaned folder ~/agents/${name}/`)
        }
      } catch {
        // Folder doesn't exist — will be created below
      }
    }

    // G03-SAFETY: Resolve path and reject forbidden directories + their children.
    // Uses path.resolve to neutralize traversal tricks (../../etc).
    const { resolve, sep } = await import('path')
    workDir = resolve(workDir)  // canonical absolute path, no .. or symlink tricks

    const FORBIDDEN_DIRS = [
      process.cwd(),                          // AI Maestro source folder (where server runs)
      HOME,                                    // $HOME root
      join(HOME, 'Desktop'),
      join(HOME, 'Documents'),
      join(HOME, 'Downloads'),
      '/',
      '/tmp',
    ].map(d => resolve(d))

    const normalizedWorkDir = workDir.replace(/[/\\]+$/, '')
    for (const forbidden of FORBIDDEN_DIRS) {
      const normalizedForbidden = forbidden.replace(/[/\\]+$/, '')
      // Exact match OR workDir is a child of forbidden OR workDir is a parent of forbidden
      if (
        normalizedWorkDir === normalizedForbidden ||
        normalizedWorkDir.startsWith(normalizedForbidden + sep) ||
        normalizedForbidden.startsWith(normalizedWorkDir + sep)
      ) {
        result.error = `Working directory "${workDir}" is forbidden (overlaps with "${normalizedForbidden}"). Agents must use ~/agents/<name>/ or a dedicated project folder outside system/source directories.`
        return result
      }
    }

    // G03-OVERLAP: No two agents may share the same directory, or be parent/child of each other.
    // E.g. if agent A uses ~/agents/foo/, agent B cannot use ~/agents/foo/ OR ~/agents/foo/bar/
    // OR ~/agents/ (parent). This prevents agents from interfering with each other's files.
    {
      const { loadAgents: loadAllAgents } = await import('@/lib/agent-registry')
      const allAgents = loadAllAgents()
      const candidatePath = normalizedWorkDir + sep
      for (const existingAgent of allAgents) {
        const rawExisting = existingAgent.workingDirectory || ''
        if (!rawExisting) continue
        const existingDir = resolve(rawExisting).replace(/[/\\]+$/, '')
        const existingPath = existingDir + sep
        // Check: exact match, candidate is child of existing, or candidate is parent of existing
        if (
          normalizedWorkDir === existingDir ||
          candidatePath.startsWith(existingPath) ||
          existingPath.startsWith(candidatePath)
        ) {
          result.error = `Working directory "${workDir}" overlaps with agent "${existingAgent.label || existingAgent.name}" (${existingAgent.id}) which uses "${existingDir}". Each agent must have its own isolated directory — no sharing, no parent/child nesting.`
          return result
        }
      }
      ops.push(`G03-OVERLAP: No directory overlap with ${allAgents.length} existing agents`)
    }

    await mkdir(workDir, { recursive: true })
    ops.push(`G03: Working directory: ${workDir}`)

    // ── G04: Create agent in registry ────────────────────────
    const { createAgent } = await import('@/lib/agent-registry')
    const agent = await createAgent({
      name,
      label: desired.label || undefined,
      program,
      workingDirectory: workDir,
      avatar: desired.avatar || undefined,
      programArgs: desired.programArgs || (program.includes('claude') ? '--dangerously-skip-permissions' : ''),
      owner: desired.owner || undefined,
      tags: desired.tags || undefined,
      model: desired.model || undefined,
      taskDescription: desired.taskDescription || '',
      role: 'autonomous',
    })
    result.agentId = agent.id
    ops.push(`G04: Agent created: id=${agent.id}, name=${agent.name}`)

    // ── G05: Create .claude directory for Claude agents ──────
    if (program.includes('claude')) {
      const claudeDir = join(workDir, '.claude')
      await mkdir(claudeDir, { recursive: true })
      ops.push(`G05: .claude/ directory ensured in working dir`)
    } else {
      ops.push(`G05: Non-Claude agent — skip .claude/ creation`)
    }

    // ── G06: Set governance title if requested ───────────────
    if (desired.governanceTitle && desired.governanceTitle !== 'autonomous') {
      const titleResult = await ChangeTitle(agent.id, desired.governanceTitle)
      if (!titleResult.success) {
        ops.push(`G06: WARN — ChangeTitle to ${desired.governanceTitle} failed: ${titleResult.error}`)
      } else {
        ops.push(`G06: Title set to ${desired.governanceTitle.toUpperCase()} (${titleResult.operations.length} sub-gates)`)
        result.restartNeeded = result.restartNeeded || titleResult.restartNeeded
      }
    } else {
      ops.push(`G06: No title requested (AUTONOMOUS)`)
    }

    // ── G07: Add to team if requested ────────────────────────
    if (desired.teamId) {
      const teamResult = await ChangeTeam(agent.id, { teamId: desired.teamId })
      if (!teamResult.success) {
        ops.push(`G07: WARN — ChangeTeam failed: ${teamResult.error}`)
      } else {
        ops.push(`G07: Added to team (${teamResult.operations.length} sub-gates)`)
        result.restartNeeded = result.restartNeeded || teamResult.restartNeeded
      }
    } else {
      ops.push(`G07: No team requested`)
    }

    // ── G08: Install role-plugin if specified ─────────────────
    // This handles the case where a specific plugin was chosen in the wizard
    // (independent of title — title auto-installs via ChangeTitle G17)
    if (desired.pluginName) {
      try {
        const { detectClientType } = await import('@/lib/client-capabilities')
        const clientType = detectClientType(program)

        if (clientType === 'claude') {
          // Direct install for Claude clients
          const { createPersona } = await import('@/services/role-plugin-service')
          await createPersona({
            personaName: desired.label || name,
            pluginName: desired.pluginName,
          })
          ops.push(`G08: Role-plugin "${desired.pluginName}" installed (Claude)`)
        } else {
          // Non-Claude client: convert the plugin using the cross-client converter
          try {
            const { convertElements } = await import('@/services/cross-client-conversion-service')
            const providerMap: Record<string, string> = { codex: 'codex', gemini: 'gemini', opencode: 'opencode', kiro: 'kiro' }
            const targetProvider = providerMap[clientType]
            if (targetProvider) {
              // Find the plugin in the cache to get its path
              const { scanPluginCache } = await import('@/lib/converter/utils/plugin')
              const plugins = await scanPluginCache()
              const sourcePlugin = plugins.find(p => p.meta?.name === desired.pluginName)
              if (sourcePlugin) {
                const convResult = await convertElements({
                  source: sourcePlugin.pluginDir,
                  targetClient: targetProvider as import('@/lib/converter/types').ProviderId,
                  elements: ['skills', 'agents', 'commands'],
                  scope: 'user',
                  dryRun: false,
                  force: false,
                })
                ops.push(`G08: Role-plugin "${desired.pluginName}" converted to ${clientType} format (${convResult.ok ? 'ok' : 'failed'})`)
              } else {
                ops.push(`G08: WARN — Plugin "${desired.pluginName}" not found in cache for conversion`)
              }
            } else {
              ops.push(`G08: WARN — No converter for client type "${clientType}"`)
            }
          } catch (convErr) {
            ops.push(`G08: WARN — Cross-client conversion failed: ${convErr instanceof Error ? convErr.message : convErr}`)
          }
        }
      } catch (err) {
        ops.push(`G08: WARN — Plugin install failed: ${err instanceof Error ? err.message : err}`)
      }
    } else {
      ops.push(`G08: No explicit plugin requested`)
    }

    // ── G09: Create tmux session if requested ────────────────
    if (desired.createSession) {
      try {
        const { createSession } = await import('@/services/sessions-service')
        const sessResult = await createSession({
          name,
          workingDirectory: workDir,
          agentId: agent.id,
          label: desired.label || undefined,
          avatar: desired.avatar || undefined,
          program,
          programArgs: desired.programArgs || (program.includes('claude') ? '--dangerously-skip-permissions' : ''),
        })
        if (sessResult.error) {
          ops.push(`G09: WARN — Session creation failed: ${sessResult.error}`)
        } else {
          ops.push(`G09: tmux session created`)
        }
      } catch (err) {
        ops.push(`G09: WARN — Session creation failed: ${err instanceof Error ? err.message : err}`)
      }
    } else {
      ops.push(`G09: No session requested (agent created hibernated)`)
    }

    result.success = true
    console.log(`[CreateAgent] "${name}" created (id=${agent.id}, program=${program}, ${ops.length} gates)`)
    return result
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
    console.error(`[CreateAgent] FAILED for "${desired.name}":`, result.error)
    return result
  }
}
