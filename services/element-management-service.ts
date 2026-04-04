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
 * Get the required role-plugin name for a governance title, or null if any is allowed.
 */
export function getRequiredPluginForTitle(title: string): string | null {
  return TITLE_PLUGIN_MAP[title] || null
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
    const effectiveTitle = newTitle === 'autonomous' || newTitle === 'member' ? null : newTitle
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

    // ── GATE 3: Check agent client type ──────────────────────
    // Some titles (those with required role-plugins) only work with Claude
    const titleRequiresPlugin = newTitle ? !!getRequiredPluginForTitle(newTitle) : false
    if (titleRequiresPlugin) {
      try {
        const { detectClientType } = await import('@/lib/client-capabilities')
        const clientType = detectClientType(agent.program || '')
        if (clientType !== 'claude') {
          result.error = `Cannot assign ${(newTitle || '').toUpperCase()} to ${clientType} agent "${agent.name}". Title requires a role-plugin (Claude-only).`
          return result
        }
        ops.push(`G03: Client type is Claude — compatible with title`)
      } catch {
        ops.push(`G03: Client type check skipped (detectClientType unavailable)`)
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
    if (oldTitle === effectiveTitle) {
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
    if (newTitle && TEAM_TITLES.has(newTitle)) {
      // Team-based titles: agent should be in a team (enforced by caller)
      ops.push(`G09: ${newTitle.toUpperCase()} requires team membership — caller must ensure`)
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
    } else {
      ops.push(`G10: Old title not MANAGER — governance.json unchanged`)
    }

    // ── GATE 11: Clear old COS — reject pending requests ─────
    if (oldTitle === 'chief-of-staff' && newTitle !== 'chief-of-staff') {
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
      ops.push(`G11: Old title not COS — pending request check skipped`)
    }

    // ── GATE 12: Clear old ORCHESTRATOR from team ────────────
    if (oldTitle === 'orchestrator' && newTitle !== 'orchestrator') {
      ops.push(`G12: Old ORCHESTRATOR — caller must clear team.orchestratorId`)
    } else {
      ops.push(`G12: Old title not ORCHESTRATOR — team.orchestratorId unchanged`)
    }

    // ── GATE 13: Set new MANAGER in governance.json ──────────
    if (newTitle === 'manager') {
      const { setManager } = await import('@/lib/governance')
      await setManager(agentId)
      ops.push(`G13: Set manager in governance.json + broadcast to mesh`)
    } else {
      ops.push(`G13: New title not MANAGER — governance.json unchanged`)
    }

    // ── GATE 14: Write governanceTitle to agent registry ─────
    await updateAgent(agentId, { governanceTitle: effectiveTitle as any })
    ops.push(`G14: Set governanceTitle="${effectiveTitle || 'null'}" in agent registry`)

    // ── GATE 15: Uninstall old role-plugin ───────────────────
    const oldPlugin = oldTitle ? getRequiredPluginForTitle(oldTitle) : null
    const newPlugin = effectiveTitle ? getRequiredPluginForTitle(effectiveTitle) : null

    if (!options?.skipPluginSync) {
      if (oldPlugin && oldPlugin !== newPlugin && agentDir) {
        // Uninstall ALL role-plugins (safeguard: cleans stale extras)
        await uninstallAllRolePlugins(agentDir)
        result.uninstalledPlugin = oldPlugin
        ops.push(`G15: Uninstalled all role-plugins (was: ${oldPlugin})`)
      } else if (!oldPlugin) {
        // No old plugin to remove, but clean stale ones just in case
        if (agentDir) {
          await uninstallAllRolePlugins(agentDir).catch(() => {})
        }
        ops.push(`G15: Cleaned stale role-plugins (no old plugin to remove)`)
      } else {
        ops.push(`G15: Old plugin same as new — skip uninstall`)
      }
    } else {
      ops.push(`G15: Plugin sync skipped (skipPluginSync=true)`)
    }

    // ── GATE 16: Install new role-plugin ─────────────────────
    if (!options?.skipPluginSync && newPlugin && agentDir) {
      try {
        await installPluginLocally(newPlugin, agentDir, GITHUB_MARKETPLACE_NAME)
        result.installedPlugin = newPlugin
        ops.push(`G16: Installed role-plugin ${newPlugin}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        ops.push(`G16: WARN — Failed to install ${newPlugin}: ${msg}`)
        // Non-blocking: title change succeeds even if plugin install fails
      }
    } else if (options?.skipPluginSync) {
      ops.push(`G16: Plugin install skipped (skipPluginSync=true)`)
    } else {
      ops.push(`G16: No plugin required for ${newTitle || 'none'}`)
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
            if (newPlugin) {
              await installPluginLocally(newPlugin, agentDir, GITHUB_MARKETPLACE_NAME).catch(() => {})
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
    if (oldPlugin !== newPlugin) {
      result.restartNeeded = true
      ops.push(`G19: Restart needed (plugin changed: ${oldPlugin || 'none'} → ${newPlugin || 'none'})`)
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
    if (PREDEFINED_ROLE_PLUGINS[desired.name]) {
      result.error = `Role-plugins must be managed via ChangeTitle(), not ChangePlugin(). Use PATCH /api/agents/{id} with governanceTitle instead.`
      return result
    }
    ops.push(`G02: Not a role-plugin — proceed`)

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

    // ── G02: Validate team exists (if adding) ─────────────────
    const { getTeam, updateTeam, loadTeams } = await import('@/lib/team-registry')
    const { getManagerId, isManager } = await import('@/lib/governance')

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
