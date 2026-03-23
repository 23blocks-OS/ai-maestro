/**
 * Marketplaces API
 *
 * GET  /api/settings/marketplaces — List all installed marketplaces with ALL their plugins
 * POST /api/settings/marketplaces — Actions: install, uninstall, update, enable, disable,
 *                                    delete-marketplace, add-marketplace, security-check
 */

import { NextRequest, NextResponse } from 'next/server'
import { readFile, readdir, stat, rm, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import os from 'os'

export const dynamic = 'force-dynamic'

const HOME = os.homedir()
const SETTINGS_PATH = join(HOME, '.claude', 'settings.json')
const SETTINGS_LOCAL_PATH = join(HOME, '.claude', 'settings.local.json')
const CACHE_DIR = join(HOME, '.claude', 'plugins', 'cache')
const MARKETPLACES_DIR = join(HOME, '.claude', 'plugins', 'marketplaces')

// Exclude this fake marketplace from listing
const EXCLUDED_MARKETPLACES = ['ai-maestro-local-roles-marketplace']

interface PluginStatus {
  name: string
  key: string // pluginName@marketplaceName
  installed: boolean // present in user-scope cache
  enabled: boolean // enabledPlugins[key] === true
  version: string | null // installed version (from cache)
  availableVersion: string | null // version available at the source (marketplace.json or clone)
  outdated: boolean // true when installed version < available version
  description: string | null
  sourceUrl: string | null // plugin-level source URL/path
  errors: string[] // validation errors
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
  version: string | null
  description: string | null
  author: string | null
  authorEmail: string | null
  sourceType: 'github' | 'directory' | 'unknown'
  sourceUrl: string | null // full GitHub URL or local path
  sourceRepo: string | null // GitHub owner/repo format
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

  const skillsDir = join(pluginDir, 'skills')
  if (existsSync(skillsDir)) {
    try {
      const entries = await readdir(skillsDir)
      for (const e of entries) {
        if (existsSync(join(skillsDir, e, 'SKILL.md'))) counts.skills++
      }
    } catch { /* ignore */ }
  }

  const agentsDir = join(pluginDir, 'agents')
  if (existsSync(agentsDir)) {
    try {
      const entries = await readdir(agentsDir)
      counts.agents = entries.filter(e => e.endsWith('.md')).length
    } catch { /* ignore */ }
  }

  const commandsDir = join(pluginDir, 'commands')
  if (existsSync(commandsDir)) {
    try {
      const entries = await readdir(commandsDir)
      counts.commands = entries.filter(e => e.endsWith('.md')).length
    } catch { /* ignore */ }
  }

  const rulesDir = join(pluginDir, 'rules')
  if (existsSync(rulesDir)) {
    try {
      const entries = await readdir(rulesDir)
      counts.rules = entries.filter(e => e.endsWith('.md')).length
    } catch { /* ignore */ }
  }

  if (existsSync(join(pluginDir, 'hooks'))) counts.hooks = 1
  if (existsSync(join(pluginDir, '.mcp.json'))) counts.mcp = 1
  if (existsSync(join(pluginDir, '.lsp.json'))) counts.lsp = 1
  if (existsSync(join(pluginDir, 'output-styles'))) counts.outputStyles = 1

  return counts
}

/** Detect plugin errors — manifest, LSP executables, MCP servers, hooks */
function detectPluginErrors(pluginDir: string, pluginName: string): string[] {
  const errors: string[] = []
  const manifestPath = join(pluginDir, '.claude-plugin', 'plugin.json')
  if (!existsSync(manifestPath)) {
    errors.push('Missing .claude-plugin/plugin.json manifest')
    return errors
  }
  try {
    const raw = require('fs').readFileSync(manifestPath, 'utf-8')
    const manifest = JSON.parse(raw)
    if (!manifest.name) errors.push('plugin.json: missing "name" field')
    if (!manifest.description) errors.push('plugin.json: missing "description" field')
    if (manifest.name && manifest.name !== pluginName) {
      errors.push(`plugin.json name "${manifest.name}" does not match directory name "${pluginName}"`)
    }
  } catch (e) {
    errors.push(`plugin.json parse error: ${e instanceof Error ? e.message : String(e)}`)
  }

  // Check LSP server executables
  const lspPath = join(pluginDir, '.lsp.json')
  if (existsSync(lspPath)) {
    try {
      const lsp = JSON.parse(require('fs').readFileSync(lspPath, 'utf-8'))
      for (const [name, config] of Object.entries(lsp as Record<string, { command?: string }>)) {
        if (config?.command) {
          try {
            require('child_process').execSync(`which "${config.command}"`, { stdio: 'pipe' })
          } catch {
            errors.push(`LSP "${name}": executable not found in $PATH: "${config.command}"`)
          }
        }
      }
    } catch { /* ignore parse errors */ }
  }

  // Check MCP server executables
  const mcpPath = join(pluginDir, '.mcp.json')
  if (existsSync(mcpPath)) {
    try {
      const mcp = JSON.parse(require('fs').readFileSync(mcpPath, 'utf-8'))
      for (const [name, config] of Object.entries(mcp as Record<string, { command?: string }>)) {
        if (config?.command) {
          try {
            require('child_process').execSync(`which "${config.command}"`, { stdio: 'pipe' })
          } catch {
            errors.push(`MCP "${name}": executable not found in $PATH: "${config.command}"`)
          }
        }
      }
    } catch { /* ignore parse errors */ }
  }

  // Check hook scripts exist
  const hooksPath = join(pluginDir, 'hooks', 'hooks.json')
  if (existsSync(hooksPath)) {
    try {
      const hooks = JSON.parse(require('fs').readFileSync(hooksPath, 'utf-8'))
      for (const [eventType, hookList] of Object.entries(hooks as Record<string, { command?: string }[]>)) {
        if (!Array.isArray(hookList)) continue
        for (const hook of hookList) {
          if (hook.command) {
            // Resolve command — could be absolute or relative to plugin root
            const cmd = hook.command.split(' ')[0].replace('${CLAUDE_PLUGIN_ROOT}', pluginDir)
            if (cmd.startsWith('/') && !existsSync(cmd)) {
              errors.push(`Hook "${eventType}": script not found: "${cmd}"`)
            }
          }
        }
      }
    } catch { /* ignore parse errors */ }
  }

  return errors
}

/** Detect orphan plugins — enabled but not found in any marketplace or cache */
function detectOrphanPlugins(enabledPlugins: Record<string, boolean>, knownPluginKeys: Set<string>): { name: string; key: string; errors: string[] }[] {
  const orphans: { name: string; key: string; errors: string[] }[] = []
  for (const key of Object.keys(enabledPlugins)) {
    // Include both enabled and disabled — stale references are errors regardless
    if (knownPluginKeys.has(key)) continue // found in a marketplace
    const atIdx = key.lastIndexOf('@')
    const pluginName = atIdx > 0 ? key.substring(0, atIdx) : key
    const marketplace = atIdx > 0 ? key.substring(atIdx + 1) : 'unknown'
    orphans.push({
      name: pluginName,
      key,
      errors: [`Plugin "${pluginName}" not found in marketplace "${marketplace}"`],
    })
  }
  return orphans
}

/** Build GitHub URL from repo string */
function repoToUrl(repo: string): string {
  return `https://github.com/${repo}`
}

export async function GET() {
  try {
    const settings = await readJsonSafe(SETTINGS_PATH) || {}
    const settingsLocal = await readJsonSafe(SETTINGS_LOCAL_PATH) || {}

    // enabledPlugins from settings (user-scope)
    const enabledPlugins = {
      ...(settingsLocal as Record<string, unknown>).enabledPlugins as Record<string, boolean> | undefined || {},
      ...(settings as Record<string, unknown>).enabledPlugins as Record<string, boolean> | undefined || {},
    }

    const extraKnown = (settings?.extraKnownMarketplaces as Record<string, unknown> | undefined) || {}

    const marketplaces = new Map<string, MarketplaceInfo>()

    // Scan marketplace clone directories (these ARE the installed marketplaces)
    if (existsSync(MARKETPLACES_DIR)) {
      try {
        const mpDirs = await readdir(MARKETPLACES_DIR)
        for (const mktName of mpDirs) {
          if (mktName.startsWith('.')) continue
          if (EXCLUDED_MARKETPLACES.includes(mktName)) continue

          const mktPath = join(MARKETPLACES_DIR, mktName)
          const s = await stat(mktPath)
          if (!s.isDirectory()) continue

          // Read version/description from marketplace.json or plugin.json (check multiple locations)
          const mpManifest = await readJsonSafe(join(mktPath, '.claude-plugin', 'marketplace.json'))
            || await readJsonSafe(join(mktPath, 'marketplace.json'))
            || await readJsonSafe(join(mktPath, '.claude-plugin', 'plugin.json'))
            || await readJsonSafe(join(mktPath, 'package.json'))

          // Get source info from extraKnownMarketplaces
          const ekm = extraKnown[mktName] as Record<string, unknown> | undefined
          const srcInfo = ekm?.source as Record<string, string> | undefined
          const sourceType = (srcInfo?.source === 'github' ? 'github' : srcInfo?.source === 'directory' ? 'directory' : 'unknown') as MarketplaceInfo['sourceType']
          const sourceRepo = srcInfo?.repo || null
          const sourceUrl = sourceRepo ? repoToUrl(sourceRepo) : srcInfo?.path || null

          // Extract description from top-level or metadata sub-object
          const mktDescription = (mpManifest?.description as string)
            || ((mpManifest?.metadata as Record<string, unknown>)?.description as string)
            || null
          // Extract owner name
          const ownerObj = mpManifest?.owner as Record<string, string> | undefined
          const mktAuthor = ownerObj?.name || (mpManifest?.author as string) || null
          const mktAuthorEmail = ownerObj?.email || null

          const info: MarketplaceInfo = {
            name: mktName,
            version: (mpManifest?.version as string)
              || ((mpManifest?.metadata as Record<string, unknown>)?.version as string)
              || null,
            description: mktDescription,
            author: mktAuthor,
            authorEmail: mktAuthorEmail,
            sourceType,
            sourceUrl,
            sourceRepo,
            pluginCount: 0,
            enabledCount: 0,
            installedCount: 0,
            plugins: [],
          }

          // ---- Discover ALL plugins from 3 sources ----
          const seenPlugins = new Set<string>()

          // Helper: check if a directory looks like a Claude Code plugin
          const looksLikePlugin = (dir: string) =>
            existsSync(join(dir, '.claude-plugin', 'plugin.json')) ||
            existsSync(join(dir, 'skills')) || existsSync(join(dir, 'agents')) ||
            existsSync(join(dir, 'commands')) || existsSync(join(dir, 'hooks')) ||
            existsSync(join(dir, 'rules')) || existsSync(join(dir, '.mcp.json')) ||
            existsSync(join(dir, '.lsp.json')) || existsSync(join(dir, 'output-styles'))

          // Helper: build a PluginStatus entry
          const buildPluginEntry = async (plugName: string, availVer: string | null, mktDesc: string | null, mktSourceUrl: string | null): Promise<void> => {
            if (seenPlugins.has(plugName)) return
            seenPlugins.add(plugName)

            const key = `${plugName}@${mktName}`
            const enabled = enabledPlugins[key] === true
            const plugCacheDir = join(CACHE_DIR, mktName, plugName)
            const installed = existsSync(plugCacheDir)
            const installedVersion = installed ? await getLatestVersion(plugCacheDir) : null

            // Read metadata from best available source: cache (installed) > clone > marketplace.json
            let description = mktDesc
            let elementCounts: PluginStatus['elementCounts'] = null
            let errors: string[] = []
            let sourceUrl = mktSourceUrl

            // Try cache first (installed version), then clone dir
            const metadataCandidates = [
              installedVersion ? join(plugCacheDir, installedVersion) : null,
              existsSync(join(mktPath, 'plugins', plugName)) ? join(mktPath, 'plugins', plugName) : null,
              existsSync(join(mktPath, plugName)) ? join(mktPath, plugName) : null,
              looksLikePlugin(mktPath) && plugName === mktName ? mktPath : null,
            ].filter(Boolean) as string[]

            for (const metaDir of metadataCandidates) {
              const manifest = await readJsonSafe(join(metaDir, '.claude-plugin', 'plugin.json'))
              if (manifest) {
                if (!description) description = (manifest.description as string) || null
                if (!sourceUrl) {
                  const plugSrc = manifest.source as Record<string, string> | undefined
                  if (plugSrc?.repo) sourceUrl = repoToUrl(plugSrc.repo)
                  else if (plugSrc?.path) sourceUrl = plugSrc.path
                }
              }
              if (!elementCounts) elementCounts = await countElements(metaDir)
              if (elementCounts) break // got what we need
            }

            if (installed && installedVersion) {
              errors = detectPluginErrors(join(plugCacheDir, installedVersion), plugName)
            }

            // Version comparison: outdated when installed version < available version
            const outdated = !!(installed && installedVersion && availVer && installedVersion !== availVer && availVer > installedVersion)

            info.plugins.push({
              name: plugName, key, installed, enabled: installed && enabled,
              version: installedVersion, availableVersion: availVer, outdated,
              description, sourceUrl, errors, elementCounts,
            })
            if (installed) info.installedCount++
            if (installed && enabled) info.enabledCount++
          }

          // Source 1: marketplace.json — authoritative plugin list with versions
          const mktManifestPaths = [
            join(mktPath, '.claude-plugin', 'marketplace.json'),
            join(mktPath, 'marketplace.json'),
          ]
          for (const manifestPath of mktManifestPaths) {
            const mktManifest = await readJsonSafe(manifestPath)
            if (mktManifest?.plugins && Array.isArray(mktManifest.plugins)) {
              for (const entry of mktManifest.plugins as Record<string, unknown>[]) {
                const plugName = entry.name as string
                if (!plugName) continue
                const availVer = (entry.version as string) || null
                const desc = (entry.description as string) || null
                const src = entry.source as Record<string, string> | undefined
                const repo = (entry.repository as string) || (src?.repo ? repoToUrl(src.repo) : null)
                await buildPluginEntry(plugName, availVer, desc, repo)
              }
              break // only use the first marketplace.json found
            }
          }

          // Source 2: Scan clone directories for plugins not in marketplace.json
          // The marketplace root itself, plugins/ subdir, and root-level subdirs
          if (looksLikePlugin(mktPath) && !seenPlugins.has(mktName)) {
            await buildPluginEntry(mktName, null, null, null)
          }
          const scanDirs = [join(mktPath, 'plugins'), mktPath]
          for (const scanDir of scanDirs) {
            if (!existsSync(scanDir)) continue
            try {
              const entries = await readdir(scanDir)
              for (const entry of entries) {
                if (entry.startsWith('.') || entry === 'plugins' || seenPlugins.has(entry)) continue
                const entryPath = join(scanDir, entry)
                try { if (!(await stat(entryPath)).isDirectory()) continue } catch { continue }
                if (!looksLikePlugin(entryPath)) continue
                // Read available version from clone's plugin.json
                const cloneManifest = await readJsonSafe(join(entryPath, '.claude-plugin', 'plugin.json'))
                const cloneVer = (cloneManifest?.version as string) || null
                await buildPluginEntry(entry, cloneVer, null, null)
              }
            } catch { /* ignore */ }
          }

          // Source 3: Scan cache for installed plugins not found in sources 1-2
          const mktCacheDir = join(CACHE_DIR, mktName)
          if (existsSync(mktCacheDir)) {
            try {
              const entries = await readdir(mktCacheDir)
              for (const entry of entries) {
                if (entry.startsWith('.') || seenPlugins.has(entry)) continue
                try { if (!(await stat(join(mktCacheDir, entry))).isDirectory()) continue } catch { continue }
                await buildPluginEntry(entry, null, null, null)
              }
            } catch { /* ignore */ }
          }

          info.pluginCount = info.plugins.length
          info.plugins.sort((a, b) => {
            // Installed first, then alphabetically
            if (a.installed && !b.installed) return -1
            if (!a.installed && b.installed) return 1
            return a.name.localeCompare(b.name)
          })
          marketplaces.set(mktName, info)
        }
      } catch { /* ignore */ }
    }

    // Detect orphan plugins — enabled but not found in any marketplace
    const knownPluginKeys = new Set<string>()
    for (const mkt of marketplaces.values()) {
      for (const p of mkt.plugins) knownPluginKeys.add(p.key)
    }
    const orphans = detectOrphanPlugins(enabledPlugins, knownPluginKeys)

    // Sort marketplaces: those with installed plugins first, then alphabetically
    const result = Array.from(marketplaces.values()).sort((a, b) => {
      if (a.installedCount > 0 && b.installedCount === 0) return -1
      if (a.installedCount === 0 && b.installedCount > 0) return 1
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json({
      marketplaces: result,
      orphanPlugins: orphans,
      totals: {
        marketplaces: result.length,
        withPlugins: result.filter(m => m.installedCount > 0).length,
        totalPlugins: result.reduce((sum, m) => sum + m.pluginCount, 0),
        installedPlugins: result.reduce((sum, m) => sum + m.installedCount, 0),
        enabledPlugins: result.reduce((sum, m) => sum + m.enabledCount, 0),
        orphanCount: orphans.length,
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
 *   install          — Copy plugin from marketplace clone to cache + enable
 *   uninstall        — Remove plugin from cache + disable
 *   update           — Re-copy from marketplace clone (reinstall)
 *   enable           — Set enabledPlugins[key] = true
 *   disable          — Set enabledPlugins[key] = false
 *   delete-marketplace — Remove marketplace clone + settings entry + cached plugins
 *   add-marketplace  — Clone GitHub repo into marketplaces dir + add to settings
 *   security-check   — Placeholder for security scan
 *
 * Body: { action: string, pluginKey?: string, url?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, pluginKey, url } = body as { action?: string; pluginKey?: string; url?: string }

    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 })
    }

    // Marketplace-level actions
    if (action === 'delete-marketplace') {
      return await handleDeleteMarketplace(body.marketplaceName)
    }
    if (action === 'update-marketplace') {
      return await handleUpdateMarketplace(body.marketplaceName)
    }
    if (action === 'add-marketplace') {
      return await handleAddMarketplace(url)
    }
    if (action === 'security-check') {
      return await handleSecurityCheck(pluginKey)
    }
    if (action === 'check-updates') {
      return await handleCheckUpdates(body.marketplaceName, body.force === true)
    }

    // Plugin-level actions require pluginKey
    if (!pluginKey) {
      return NextResponse.json({ error: 'pluginKey is required for plugin actions' }, { status: 400 })
    }

    const atIdx = pluginKey.lastIndexOf('@')
    if (atIdx <= 0) {
      return NextResponse.json({ error: 'Invalid pluginKey format — expected name@marketplace' }, { status: 400 })
    }

    const pluginName = pluginKey.substring(0, atIdx)
    const marketplaceName = pluginKey.substring(atIdx + 1)

    switch (action) {
      case 'install':
        return await handleInstall(pluginName, marketplaceName, pluginKey)
      case 'uninstall':
        return await handleUninstall(pluginName, marketplaceName, pluginKey)
      case 'update':
        return await handleInstall(pluginName, marketplaceName, pluginKey) // same as install (overwrites)
      case 'enable':
        await setPluginEnabled(pluginKey, true)
        return NextResponse.json({ success: true, action: 'enable', pluginKey })
      case 'disable':
        await setPluginEnabled(pluginKey, false)
        return NextResponse.json({ success: true, action: 'disable', pluginKey })
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error) {
    console.error('[marketplaces] POST failed:', error)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}

/** Copy plugin from marketplace clone to cache + enable */
async function handleInstall(pluginName: string, marketplaceName: string, pluginKey: string) {
  const marketplaceCloneDir = join(MARKETPLACES_DIR, marketplaceName)
  if (!existsSync(marketplaceCloneDir)) {
    return NextResponse.json({ error: `Marketplace clone not found` }, { status: 404 })
  }

  // Find plugin source in marketplace clone
  let sourceDir: string | null = null
  for (const p of [join(marketplaceCloneDir, 'plugins', pluginName), join(marketplaceCloneDir, pluginName)]) {
    if (existsSync(p)) { sourceDir = p; break }
  }
  if (!sourceDir) {
    return NextResponse.json({ error: `Plugin "${pluginName}" not found in marketplace clone` }, { status: 404 })
  }

  // Copy to cache
  const { execSync } = await import('child_process')
  const pluginCacheDir = join(CACHE_DIR, marketplaceName, pluginName)
  const version = '0.0.0'
  const destDir = join(pluginCacheDir, version)

  try {
    execSync(`mkdir -p "${destDir}" && cp -R "${sourceDir}/." "${destDir}/"`, { timeout: 30000 })
  } catch (err) {
    return NextResponse.json({ error: `Failed to copy plugin: ${err}` }, { status: 500 })
  }

  await setPluginEnabled(pluginKey, true)
  return NextResponse.json({ success: true, action: 'install', pluginKey })
}

/** Remove plugin from cache and disable in settings */
async function handleUninstall(pluginName: string, marketplaceName: string, pluginKey: string) {
  const pluginCacheDir = join(CACHE_DIR, marketplaceName, pluginName)
  if (existsSync(pluginCacheDir)) {
    await rm(pluginCacheDir, { recursive: true, force: true })
  }
  await setPluginEnabled(pluginKey, false)
  return NextResponse.json({ success: true, action: 'uninstall', pluginKey })
}

/** Remove marketplace: delete clone dir + remove from settings + clean cached plugins */
async function handleDeleteMarketplace(marketplaceName?: string) {
  if (!marketplaceName) {
    return NextResponse.json({ error: 'marketplaceName is required' }, { status: 400 })
  }

  // Remove clone dir
  const cloneDir = join(MARKETPLACES_DIR, marketplaceName)
  if (existsSync(cloneDir)) {
    await rm(cloneDir, { recursive: true, force: true })
  }

  // Remove cached plugins for this marketplace
  const cacheDir = join(CACHE_DIR, marketplaceName)
  if (existsSync(cacheDir)) {
    await rm(cacheDir, { recursive: true, force: true })
  }

  // Remove from extraKnownMarketplaces in settings
  const settings = await readJsonSafe(SETTINGS_PATH) || {}
  const ekm = (settings.extraKnownMarketplaces || {}) as Record<string, unknown>
  delete ekm[marketplaceName]
  settings.extraKnownMarketplaces = ekm

  // Remove any enabledPlugins entries for this marketplace
  const ep = (settings.enabledPlugins || {}) as Record<string, boolean>
  for (const key of Object.keys(ep)) {
    if (key.endsWith(`@${marketplaceName}`)) {
      delete ep[key]
    }
  }
  settings.enabledPlugins = ep
  await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n')

  return NextResponse.json({ success: true, action: 'delete-marketplace', marketplaceName })
}

/** Update marketplace by pulling latest from git remote */
async function handleUpdateMarketplace(marketplaceName?: string) {
  if (!marketplaceName) {
    return NextResponse.json({ error: 'marketplaceName is required' }, { status: 400 })
  }
  const cloneDir = join(MARKETPLACES_DIR, marketplaceName)
  if (!existsSync(cloneDir)) {
    return NextResponse.json({ error: `Marketplace "${marketplaceName}" not found` }, { status: 404 })
  }
  const { execSync } = await import('child_process')
  try {
    execSync('git pull --ff-only', { cwd: cloneDir, timeout: 60000, stdio: 'pipe' })
  } catch (err) {
    return NextResponse.json({ error: `Failed to update: ${err}` }, { status: 500 })
  }
  // Invalidate version check cache after update
  UPDATE_CHECK_CACHE.delete(marketplaceName!)
  return NextResponse.json({ success: true, action: 'update-marketplace', marketplaceName })
}

// 5-minute cache for remote version checks to avoid GitHub rate limits
const UPDATE_CHECK_CACHE = new Map<string, { data: unknown; timestamp: number }>()
const UPDATE_CHECK_TTL = 5 * 60 * 1000 // 5 minutes

/** Check for updates by fetching marketplace.json from GitHub via raw.githubusercontent.com */
async function handleCheckUpdates(marketplaceName?: string, force?: boolean) {
  if (!marketplaceName) {
    return NextResponse.json({ error: 'marketplaceName is required' }, { status: 400 })
  }

  // Return cached result if within TTL — unless force (marketplace actively expanded by user)
  const cached = UPDATE_CHECK_CACHE.get(marketplaceName)
  if (cached && Date.now() - cached.timestamp < UPDATE_CHECK_TTL && !force) {
    return NextResponse.json(cached.data)
  }

  // Get the source repo for this marketplace
  const settings = await readJsonSafe(SETTINGS_PATH) || {}
  const ekm = (settings.extraKnownMarketplaces || {}) as Record<string, unknown>
  const ekmEntry = ekm[marketplaceName] as Record<string, unknown> | undefined
  const srcInfo = ekmEntry?.source as Record<string, string> | undefined
  const repo = srcInfo?.repo

  if (!repo) {
    return NextResponse.json({ error: 'No source repo configured for this marketplace' }, { status: 404 })
  }

  // Fetch remote marketplace.json via raw.githubusercontent.com (avoids API rate limits)
  const branches = ['main', 'master']
  const paths = ['.claude-plugin/marketplace.json', 'marketplace.json', '.claude-plugin/plugin.json']

  let remoteData: Record<string, unknown> | null = null
  for (const branch of branches) {
    for (const path of paths) {
      try {
        const url = `https://raw.githubusercontent.com/${repo}/${branch}/${path}`
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
        if (res.ok) {
          remoteData = await res.json() as Record<string, unknown>
          break
        }
      } catch { /* try next */ }
    }
    if (remoteData) break
  }

  if (!remoteData) {
    return NextResponse.json({ error: 'Could not fetch remote version info' }, { status: 502 })
  }

  // Extract marketplace version
  const remoteVersion = (remoteData.version as string) || null

  // Extract plugin versions from remote marketplace.json
  const remotePlugins: Record<string, string> = {}
  if (Array.isArray(remoteData.plugins)) {
    for (const p of remoteData.plugins as Record<string, unknown>[]) {
      const name = p.name as string
      const ver = p.version as string
      if (name && ver) remotePlugins[name] = ver
    }
  }

  // Compare with local: installed versions from cache
  const mktCacheDir = join(CACHE_DIR, marketplaceName)
  const localPlugins: Record<string, string> = {}
  if (existsSync(mktCacheDir)) {
    try {
      const entries = await readdir(mktCacheDir)
      for (const plugName of entries) {
        if (plugName.startsWith('.')) continue
        const ver = await getLatestVersion(join(mktCacheDir, plugName))
        if (ver) localPlugins[plugName] = ver
      }
    } catch { /* ignore */ }
  }

  // Build comparison results
  const pluginUpdates: { name: string; installed: string | null; remote: string; outdated: boolean }[] = []
  for (const [name, remoteVer] of Object.entries(remotePlugins)) {
    const localVer = localPlugins[name] || null
    pluginUpdates.push({
      name,
      installed: localVer,
      remote: remoteVer,
      outdated: !!(localVer && localVer < remoteVer),
    })
  }

  // Local marketplace version
  const mktPath = join(MARKETPLACES_DIR, marketplaceName)
  const localMktJson = await readJsonSafe(join(mktPath, '.claude-plugin', 'marketplace.json'))
    || await readJsonSafe(join(mktPath, 'marketplace.json'))
  const localVersion = (localMktJson?.version as string) || null
  const marketplaceOutdated = !!(localVersion && remoteVersion && localVersion < remoteVersion)

  const result = {
    success: true,
    action: 'check-updates',
    marketplaceName,
    localVersion,
    remoteVersion,
    marketplaceOutdated,
    pluginUpdates,
  }

  // Cache successful result for 5 minutes
  UPDATE_CHECK_CACHE.set(marketplaceName, { data: result, timestamp: Date.now() })

  return NextResponse.json(result)
}

/** Clone a GitHub marketplace repo */
async function handleAddMarketplace(url?: string) {
  if (!url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }

  // Extract owner/repo from GitHub URL
  const match = url.match(/github\.com\/([^/]+\/[^/]+)/i)
  if (!match) {
    return NextResponse.json({ error: 'Invalid GitHub URL' }, { status: 400 })
  }
  const repo = match[1].replace(/\.git$/, '')
  const marketplaceName = repo.split('/')[1] // Use repo name as marketplace name

  if (existsSync(join(MARKETPLACES_DIR, marketplaceName))) {
    return NextResponse.json({ error: `Marketplace "${marketplaceName}" already exists` }, { status: 409 })
  }

  // Clone the repo
  const { execSync } = await import('child_process')
  try {
    await mkdir(MARKETPLACES_DIR, { recursive: true })
    execSync(`git clone --depth 1 "${url}" "${join(MARKETPLACES_DIR, marketplaceName)}"`, {
      timeout: 60000,
      stdio: 'pipe',
    })
  } catch (err) {
    return NextResponse.json({ error: `Failed to clone: ${err}` }, { status: 500 })
  }

  // Add to extraKnownMarketplaces
  const settings = await readJsonSafe(SETTINGS_PATH) || {}
  const ekm = (settings.extraKnownMarketplaces || {}) as Record<string, unknown>
  ekm[marketplaceName] = { source: { source: 'github', repo } }
  settings.extraKnownMarketplaces = ekm
  await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n')

  return NextResponse.json({ success: true, action: 'add-marketplace', marketplaceName, repo })
}

/** Run CPV security check on a plugin */
async function handleSecurityCheck(pluginKey?: string) {
  if (!pluginKey) {
    return NextResponse.json({ error: 'pluginKey is required for security-check' }, { status: 400 })
  }

  const atIdx = pluginKey.lastIndexOf('@')
  if (atIdx <= 0) {
    return NextResponse.json({ error: 'Invalid pluginKey format' }, { status: 400 })
  }

  const pluginName = pluginKey.substring(0, atIdx)
  const marketplaceName = pluginKey.substring(atIdx + 1)

  // Find plugin directory — check cache first, then marketplace clone
  let pluginDir: string | null = null
  const cacheDir = join(CACHE_DIR, marketplaceName, pluginName)
  if (existsSync(cacheDir)) {
    const version = await getLatestVersion(cacheDir)
    if (version) pluginDir = join(cacheDir, version)
  }
  if (!pluginDir) {
    // Fall back to marketplace clone
    for (const p of [join(MARKETPLACES_DIR, marketplaceName, 'plugins', pluginName), join(MARKETPLACES_DIR, marketplaceName, pluginName)]) {
      if (existsSync(p)) { pluginDir = p; break }
    }
  }
  if (!pluginDir) {
    return NextResponse.json({ error: `Plugin "${pluginName}" not found` }, { status: 404 })
  }

  // Find the CPV security script in the plugin cache
  const cpvCacheBase = join(HOME, '.claude', 'plugins', 'cache', 'emasoft-plugins', 'claude-plugins-validation')
  let scriptPath: string | null = null
  if (existsSync(cpvCacheBase)) {
    try {
      const versions = await readdir(cpvCacheBase)
      versions.sort()
      const latestVer = versions.filter(v => !v.startsWith('.'))[versions.length - 1]
      if (latestVer) {
        const candidate = join(cpvCacheBase, latestVer, 'scripts', 'validate_security.py')
        if (existsSync(candidate)) scriptPath = candidate
      }
    } catch { /* ignore */ }
  }

  if (!scriptPath) {
    return NextResponse.json({ error: 'CPV security scanner not found. Install claude-plugins-validation plugin.' }, { status: 503 })
  }

  // Run the security check — report goes to a temp file, terminal gets severity counts
  const { execSync } = await import('child_process')
  const reportPath = join(os.tmpdir(), `security-report-${pluginName}-${Date.now()}.md`)

  try {
    const output = execSync(
      `uv run "${scriptPath}" "${pluginDir}" --report "${reportPath}"`,
      { timeout: 60000, stdio: 'pipe', cwd: join(cpvCacheBase, '..', '..', '..') }
    ).toString('utf8')

    // Read the full report
    let report = ''
    if (existsSync(reportPath)) {
      report = await readFile(reportPath, 'utf-8')
    }

    return NextResponse.json({
      success: true,
      action: 'security-check',
      pluginKey,
      summary: output.trim(),
      report,
    })
  } catch (err: unknown) {
    const execErr = err as { stdout?: Buffer; stderr?: Buffer; message?: string }
    const stdout = execErr.stdout?.toString('utf8') || ''
    const stderr = execErr.stderr?.toString('utf8') || ''
    // Script may exit non-zero when findings exist — still return the report
    let report = ''
    if (existsSync(reportPath)) {
      report = await readFile(reportPath, 'utf-8')
    }
    if (report || stdout) {
      return NextResponse.json({
        success: true,
        action: 'security-check',
        pluginKey,
        summary: stdout.trim() || stderr.trim(),
        report,
      })
    }
    return NextResponse.json({ error: `Security check failed: ${execErr.message || stderr}` }, { status: 500 })
  }
}

/** Update enabledPlugins[key] in settings.json */
async function setPluginEnabled(key: string, enabled: boolean) {
  const settings = await readJsonSafe(SETTINGS_PATH) || {}
  const ep = (settings.enabledPlugins || {}) as Record<string, boolean>
  if (enabled) {
    ep[key] = true
  } else {
    delete ep[key]
  }
  settings.enabledPlugins = ep
  await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n')
}
