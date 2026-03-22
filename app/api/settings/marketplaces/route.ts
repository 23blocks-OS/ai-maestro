/**
 * Marketplaces API
 *
 * GET  /api/settings/marketplaces — List all registered marketplaces with their plugins and status
 * POST /api/settings/marketplaces — Plugin actions: uninstall, reinstall
 */

import { NextRequest, NextResponse } from 'next/server'
import { readFile, readdir, stat, rm, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import os from 'os'

export const dynamic = 'force-dynamic'

const HOME = os.homedir()
const SETTINGS_PATH = join(HOME, '.claude', 'settings.json')
const SETTINGS_LOCAL_PATH = join(HOME, '.claude', 'settings.local.json')
const CACHE_DIR = join(HOME, '.claude', 'plugins', 'cache')
const MARKETPLACES_DIR = join(HOME, '.claude', 'plugins', 'marketplaces')

interface PluginStatus {
  name: string
  key: string
  installed: boolean
  enabled: boolean
  version: string | null
  description: string | null
  elementCounts: {
    skills: number
    agents: number
    commands: number
    hooks: number
    rules: number
    mcp: number
    lsp: number
    outputStyles: number
  } | null
}

interface MarketplaceInfo {
  name: string
  sourceType: 'cache' | 'directory' | 'github' | 'unknown'
  sourcePath: string | null
  pluginCount: number
  enabledCount: number
  installedCount: number
  plugins: PluginStatus[]
}

async function readJsonSafe(filePath: string): Promise<Record<string, unknown> | null> {
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(await readFile(filePath, 'utf-8'))
  } catch {
    return null
  }
}

/** Get latest version dir inside a plugin cache folder */
async function getLatestVersion(pluginCacheDir: string): Promise<string | null> {
  try {
    const entries = await readdir(pluginCacheDir)
    const dirs = entries.filter(e => !e.startsWith('.'))
    if (dirs.length === 0) return null
    dirs.sort()
    return dirs[dirs.length - 1]
  } catch {
    return null
  }
}

/** Count elements inside a plugin directory */
async function countElements(pluginDir: string): Promise<PluginStatus['elementCounts']> {
  const counts = { skills: 0, agents: 0, commands: 0, hooks: 0, rules: 0, mcp: 0, lsp: 0, outputStyles: 0 }

  // Skills: dirs with SKILL.md
  const skillsDir = join(pluginDir, 'skills')
  if (existsSync(skillsDir)) {
    try {
      const entries = await readdir(skillsDir)
      for (const e of entries) {
        if (existsSync(join(skillsDir, e, 'SKILL.md'))) counts.skills++
      }
    } catch { /* ignore */ }
  }

  // Agents: .md files
  const agentsDir = join(pluginDir, 'agents')
  if (existsSync(agentsDir)) {
    try {
      const entries = await readdir(agentsDir)
      counts.agents = entries.filter(e => e.endsWith('.md')).length
    } catch { /* ignore */ }
  }

  // Commands: .md files
  const commandsDir = join(pluginDir, 'commands')
  if (existsSync(commandsDir)) {
    try {
      const entries = await readdir(commandsDir)
      counts.commands = entries.filter(e => e.endsWith('.md')).length
    } catch { /* ignore */ }
  }

  // Rules: .md files
  const rulesDir = join(pluginDir, 'rules')
  if (existsSync(rulesDir)) {
    try {
      const entries = await readdir(rulesDir)
      counts.rules = entries.filter(e => e.endsWith('.md')).length
    } catch { /* ignore */ }
  }

  // Hooks: directory exists
  if (existsSync(join(pluginDir, 'hooks'))) counts.hooks = 1

  // MCP: .mcp.json exists
  if (existsSync(join(pluginDir, '.mcp.json'))) counts.mcp = 1

  // LSP: .lsp.json exists
  if (existsSync(join(pluginDir, '.lsp.json'))) counts.lsp = 1

  // Output styles: directory exists
  if (existsSync(join(pluginDir, 'output-styles'))) counts.outputStyles = 1

  return counts
}

export async function GET() {
  try {
    // Load settings to get enabledPlugins and extraKnownMarketplaces
    const settings = await readJsonSafe(SETTINGS_PATH) || {}
    const settingsLocal = await readJsonSafe(SETTINGS_LOCAL_PATH) || {}

    const enabledPlugins = {
      ...(settingsLocal as Record<string, unknown>).enabledPlugins as Record<string, boolean> | undefined || {},
      ...(settings as Record<string, unknown>).enabledPlugins as Record<string, boolean> | undefined || {},
    }

    const extraKnown = (settings as Record<string, unknown>).extraKnownMarketplaces as Record<string, unknown> || {}

    // Build map: marketplace name → MarketplaceInfo
    const marketplaces = new Map<string, MarketplaceInfo>()

    // 1. Scan cache dir for installed marketplaces + their plugins
    if (existsSync(CACHE_DIR)) {
      try {
        const cacheEntries = await readdir(CACHE_DIR)
        for (const mktName of cacheEntries) {
          if (mktName.startsWith('.')) continue
          const mktPath = join(CACHE_DIR, mktName)
          const s = await stat(mktPath)
          if (!s.isDirectory()) continue

          const info: MarketplaceInfo = marketplaces.get(mktName) || {
            name: mktName,
            sourceType: 'cache',
            sourcePath: mktPath,
            pluginCount: 0,
            enabledCount: 0,
            installedCount: 0,
            plugins: [],
          }

          // Scan plugins inside this marketplace cache
          const pluginEntries = await readdir(mktPath)
          for (const plugName of pluginEntries) {
            if (plugName.startsWith('.')) continue
            const plugDir = join(mktPath, plugName)
            const ps = await stat(plugDir)
            if (!ps.isDirectory()) continue

            const key = `${plugName}@${mktName}`
            const enabled = enabledPlugins[key] === true
            const latestVersion = await getLatestVersion(plugDir)
            let description: string | null = null
            let elementCounts: PluginStatus['elementCounts'] = null

            if (latestVersion) {
              const versionDir = join(plugDir, latestVersion)
              // Read plugin.json for description
              const manifest = await readJsonSafe(join(versionDir, '.claude-plugin', 'plugin.json'))
              if (manifest) {
                description = (manifest.description as string) || null
              }
              // Count elements
              elementCounts = await countElements(versionDir)
            }

            info.plugins.push({
              name: plugName,
              key,
              installed: true,
              enabled,
              version: latestVersion,
              description,
              elementCounts,
            })
            info.installedCount++
            if (enabled) info.enabledCount++
          }

          info.pluginCount = info.plugins.length
          info.plugins.sort((a, b) => a.name.localeCompare(b.name))
          marketplaces.set(mktName, info)
        }
      } catch { /* ignore cache scan errors */ }
    }

    // 2. Add marketplaces from extraKnownMarketplaces that aren't in cache
    for (const [mktName, mktInfo] of Object.entries(extraKnown)) {
      if (marketplaces.has(mktName)) {
        // Update source info if we have it
        const existing = marketplaces.get(mktName)!
        const src = (mktInfo as Record<string, unknown>)?.source as Record<string, string> | undefined
        if (src) {
          existing.sourceType = (src.source === 'directory' ? 'directory' : src.source === 'github' ? 'github' : 'unknown') as MarketplaceInfo['sourceType']
          existing.sourcePath = src.path || src.url || null
        }
        continue
      }

      const src = (mktInfo as Record<string, unknown>)?.source as Record<string, string> | undefined
      marketplaces.set(mktName, {
        name: mktName,
        sourceType: (src?.source === 'directory' ? 'directory' : src?.source === 'github' ? 'github' : 'unknown') as MarketplaceInfo['sourceType'],
        sourcePath: src?.path || src?.url || null,
        pluginCount: 0,
        enabledCount: 0,
        installedCount: 0,
        plugins: [],
      })
    }

    // 3. Check enabledPlugins for marketplaces not yet seen (plugins enabled but marketplace not in cache)
    for (const key of Object.keys(enabledPlugins)) {
      const atIdx = key.lastIndexOf('@')
      if (atIdx <= 0) continue
      const mktName = key.substring(atIdx + 1)
      if (!marketplaces.has(mktName)) {
        marketplaces.set(mktName, {
          name: mktName,
          sourceType: 'unknown',
          sourcePath: null,
          pluginCount: 0,
          enabledCount: 0,
          installedCount: 0,
          plugins: [],
        })
      }
    }

    // Sort marketplaces: those with installed plugins first, then alphabetically
    const result = Array.from(marketplaces.values()).sort((a, b) => {
      if (a.installedCount > 0 && b.installedCount === 0) return -1
      if (a.installedCount === 0 && b.installedCount > 0) return 1
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json({
      marketplaces: result,
      totals: {
        marketplaces: result.length,
        withPlugins: result.filter(m => m.installedCount > 0).length,
        totalPlugins: result.reduce((sum, m) => sum + m.pluginCount, 0),
        enabledPlugins: result.reduce((sum, m) => sum + m.enabledCount, 0),
      },
    })
  } catch (error) {
    console.error('[marketplaces] GET failed:', error)
    return NextResponse.json({ error: 'Failed to scan marketplaces' }, { status: 500 })
  }
}

/**
 * POST /api/settings/marketplaces
 *
 * Actions:
 *   uninstall  — Remove plugin from cache + set enabledPlugins[key]=false
 *   reinstall  — Remove from cache, then re-install from marketplace clone
 *
 * Body: { action: string, pluginKey: string }
 * pluginKey format: "pluginName@marketplaceName"
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, pluginKey } = body as { action?: string; pluginKey?: string }

    if (!action || !pluginKey) {
      return NextResponse.json({ error: 'action and pluginKey are required' }, { status: 400 })
    }

    const atIdx = pluginKey.lastIndexOf('@')
    if (atIdx <= 0) {
      return NextResponse.json({ error: 'Invalid pluginKey format — expected name@marketplace' }, { status: 400 })
    }

    const pluginName = pluginKey.substring(0, atIdx)
    const marketplaceName = pluginKey.substring(atIdx + 1)

    switch (action) {
      case 'uninstall':
        return await handleUninstall(pluginName, marketplaceName, pluginKey)
      case 'reinstall':
        return await handleReinstall(pluginName, marketplaceName, pluginKey)
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error) {
    console.error('[marketplaces] POST failed:', error)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}

/** Remove plugin from cache and disable in settings */
async function handleUninstall(pluginName: string, marketplaceName: string, pluginKey: string) {
  // 1. Remove from cache
  const pluginCacheDir = join(CACHE_DIR, marketplaceName, pluginName)
  if (existsSync(pluginCacheDir)) {
    await rm(pluginCacheDir, { recursive: true, force: true })
  }

  // 2. Disable in settings
  await setPluginEnabled(pluginKey, false)

  return NextResponse.json({ success: true, action: 'uninstall', pluginKey })
}

/** Remove from cache, then re-install from the marketplace's local clone */
async function handleReinstall(pluginName: string, marketplaceName: string, pluginKey: string) {
  // 1. Remove existing cache
  const pluginCacheDir = join(CACHE_DIR, marketplaceName, pluginName)
  if (existsSync(pluginCacheDir)) {
    await rm(pluginCacheDir, { recursive: true, force: true })
  }

  // 2. Find the plugin source in the marketplace clone
  const marketplaceCloneDir = join(MARKETPLACES_DIR, marketplaceName)
  if (!existsSync(marketplaceCloneDir)) {
    return NextResponse.json({
      error: `Marketplace clone not found at ${marketplaceCloneDir}. Cannot reinstall.`,
    }, { status: 404 })
  }

  // The marketplace clone typically has plugins/<pluginName>/ or just <pluginName>/
  let sourceDir: string | null = null
  const candidatePaths = [
    join(marketplaceCloneDir, 'plugins', pluginName),
    join(marketplaceCloneDir, pluginName),
  ]
  for (const p of candidatePaths) {
    if (existsSync(p)) {
      sourceDir = p
      break
    }
  }

  if (!sourceDir) {
    return NextResponse.json({
      error: `Plugin "${pluginName}" not found in marketplace clone. Looked in: ${candidatePaths.join(', ')}`,
    }, { status: 404 })
  }

  // 3. Copy source to cache using cp -r (preserving structure)
  const { execSync } = await import('child_process')
  const version = '0.0.0' // Default version for local installs
  const destDir = join(pluginCacheDir, version)

  try {
    execSync(`mkdir -p "${destDir}" && cp -R "${sourceDir}/." "${destDir}/"`, { timeout: 30000 })
  } catch (err) {
    return NextResponse.json({ error: `Failed to copy plugin: ${err}` }, { status: 500 })
  }

  // 4. Ensure plugin is enabled
  await setPluginEnabled(pluginKey, true)

  return NextResponse.json({ success: true, action: 'reinstall', pluginKey })
}

/** Update enabledPlugins[key] in settings.json */
async function setPluginEnabled(key: string, enabled: boolean) {
  const settings = await readJsonSafe(SETTINGS_PATH) || {}
  const ep = (settings.enabledPlugins || {}) as Record<string, boolean>
  if (enabled) {
    ep[key] = true
  } else {
    // Remove the key entirely when disabling (Claude CLI convention)
    delete ep[key]
  }
  settings.enabledPlugins = ep
  await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n')
}
