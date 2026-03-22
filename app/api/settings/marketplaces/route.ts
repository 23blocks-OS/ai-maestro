/**
 * Marketplaces API
 *
 * GET /api/settings/marketplaces — List all registered marketplaces with their plugins and status
 */

import { NextResponse } from 'next/server'
import { readFile, readdir, stat } from 'fs/promises'
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

    // Use optional chaining to safely access properties — readJsonSafe can return null
    // before the || {} fallback is applied, so we guard property access explicitly
    const enabledPlugins: Record<string, boolean> = {
      ...(settingsLocal?.enabledPlugins as Record<string, boolean> | undefined || {}),
      ...(settings?.enabledPlugins as Record<string, boolean> | undefined || {}),
    }

    const extraKnown = (settings?.extraKnownMarketplaces as Record<string, unknown> | undefined) || {}

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
        // Update source info if we have it — use get() without ! and guard with if-check
        const existing = marketplaces.get(mktName)
        const src = (mktInfo as Record<string, unknown>)?.source as Record<string, string> | undefined
        if (existing && src) {
          existing.sourceType = (src.source === 'directory' ? 'directory' : src.source === 'github' ? 'github' : src.source === 'cache' ? 'cache' : 'unknown') as MarketplaceInfo['sourceType']
          existing.sourcePath = src.path || src.url || null
        }
        continue
      }

      const src = (mktInfo as Record<string, unknown>)?.source as Record<string, string> | undefined
      marketplaces.set(mktName, {
        name: mktName,
        // Map all known sourceType values; fallback to 'unknown' for unrecognised strings
        sourceType: (src?.source === 'directory' ? 'directory' : src?.source === 'github' ? 'github' : src?.source === 'cache' ? 'cache' : 'unknown') as MarketplaceInfo['sourceType'],
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
      const plugName = key.substring(0, atIdx)
      const mktName = key.substring(atIdx + 1)

      let marketplace = marketplaces.get(mktName)
      if (!marketplace) {
        marketplace = {
          name: mktName,
          sourceType: 'unknown',
          sourcePath: null,
          pluginCount: 0,
          enabledCount: 0,
          installedCount: 0,
          plugins: [],
        }
        marketplaces.set(mktName, marketplace)
      }

      // Add the enabled plugin if it is not already tracked (e.g. not found in cache)
      const alreadyTracked = marketplace.plugins.some(p => p.key === key)
      if (!alreadyTracked) {
        marketplace.plugins.push({
          name: plugName,
          key,
          installed: false,
          enabled: true,
          version: null,
          description: null,
          elementCounts: null,
        })
        marketplace.enabledCount++
        marketplace.pluginCount++
      } else {
        // Plugin found in cache but not yet marked enabled — fix up counts
        // alreadyTracked is true so find() will return a value, but we guard explicitly to avoid !
        const existing = marketplace.plugins.find(p => p.key === key)
        if (existing && !existing.enabled) {
          existing.enabled = true
          marketplace.enabledCount++
        }
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
