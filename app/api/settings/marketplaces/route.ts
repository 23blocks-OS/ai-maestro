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

/** Detect plugin errors by checking manifest validity */
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
  return errors
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

          // Read marketplace.json for version/description
          const mpManifest = await readJsonSafe(join(mktPath, 'marketplace.json'))

          // Get source info from extraKnownMarketplaces
          const ekm = extraKnown[mktName] as Record<string, unknown> | undefined
          const srcInfo = ekm?.source as Record<string, string> | undefined
          const sourceType = (srcInfo?.source === 'github' ? 'github' : srcInfo?.source === 'directory' ? 'directory' : 'unknown') as MarketplaceInfo['sourceType']
          const sourceRepo = srcInfo?.repo || null
          const sourceUrl = sourceRepo ? repoToUrl(sourceRepo) : srcInfo?.path || null

          const info: MarketplaceInfo = {
            name: mktName,
            version: (mpManifest?.version as string) || null,
            description: (mpManifest?.description as string) || null,
            sourceType,
            sourceUrl,
            sourceRepo,
            pluginCount: 0,
            enabledCount: 0,
            installedCount: 0,
            plugins: [],
          }

          // Scan ALL plugins in the marketplace clone
          const seenPlugins = new Set<string>()

          // Helper: check if a directory looks like a Claude Code plugin
          // A plugin can have any combination of these elements
          const looksLikePlugin = (dir: string) =>
            existsSync(join(dir, '.claude-plugin', 'plugin.json')) ||
            existsSync(join(dir, 'skills')) ||
            existsSync(join(dir, 'agents')) ||
            existsSync(join(dir, 'commands')) ||
            existsSync(join(dir, 'hooks')) ||
            existsSync(join(dir, 'rules')) ||
            existsSync(join(dir, '.mcp.json')) ||
            existsSync(join(dir, '.lsp.json')) ||
            existsSync(join(dir, 'output-styles'))

          // Case 1: The marketplace root itself IS a single plugin
          if (looksLikePlugin(mktPath)) {
            const plugName = mktName
            seenPlugins.add(plugName)
            const key = `${plugName}@${mktName}`
            const enabled = enabledPlugins[key] === true
            const cacheDir = join(CACHE_DIR, mktName, plugName)
            const installed = existsSync(cacheDir)
            const latestVersion = installed ? await getLatestVersion(cacheDir) : null
            let description: string | null = null
            let elementCounts: PluginStatus['elementCounts'] = null
            let errors: string[] = []
            let sourceUrl: string | null = null
            const metadataDir = latestVersion ? join(cacheDir, latestVersion) : mktPath
            const manifest = await readJsonSafe(join(metadataDir, '.claude-plugin', 'plugin.json'))
            if (manifest) {
              description = (manifest.description as string) || null
              const plugSrc = manifest.source as Record<string, string> | undefined
              if (plugSrc?.repo) sourceUrl = repoToUrl(plugSrc.repo)
              else if (plugSrc?.path) sourceUrl = plugSrc.path
            }
            elementCounts = await countElements(metadataDir)
            if (installed && latestVersion) errors = detectPluginErrors(join(cacheDir, latestVersion), plugName)
            info.plugins.push({ name: plugName, key, installed, enabled: installed && enabled, version: latestVersion, description, sourceUrl, errors, elementCounts })
            if (installed) info.installedCount++
            if (installed && enabled) info.enabledCount++
          }

          // Case 2: The plugins/ directory itself IS a plugin (has skills/agents directly, not nested)
          const pluginsDirPath = join(mktPath, 'plugins')
          if (existsSync(pluginsDirPath) && !seenPlugins.has(mktName) && looksLikePlugin(pluginsDirPath)) {
            // Check if plugins/ contains subdirs that look like plugins — if not, plugins/ IS the plugin
            const pluginsDirEntries = await readdir(pluginsDirPath).catch(() => [] as string[])
            const hasNestedPlugins = pluginsDirEntries.some(e => !e.startsWith('.') && existsSync(join(pluginsDirPath, e, '.claude-plugin', 'plugin.json')))
            if (!hasNestedPlugins) {
              const plugName = mktName
              seenPlugins.add(plugName)
              const key = `${plugName}@${mktName}`
              const enabled = enabledPlugins[key] === true
              const cacheDir = join(CACHE_DIR, mktName, plugName)
              const installed = existsSync(cacheDir)
              const latestVersion = installed ? await getLatestVersion(cacheDir) : null
              const metadataDir = latestVersion ? join(cacheDir, latestVersion) : pluginsDirPath
              const manifest = await readJsonSafe(join(metadataDir, '.claude-plugin', 'plugin.json'))
              let description: string | null = null
              let sourceUrl: string | null = null
              if (manifest) {
                description = (manifest.description as string) || null
                const plugSrc = manifest.source as Record<string, string> | undefined
                if (plugSrc?.repo) sourceUrl = repoToUrl(plugSrc.repo)
                else if (plugSrc?.path) sourceUrl = plugSrc.path
              }
              const elementCounts = await countElements(metadataDir)
              const errors = (installed && latestVersion) ? detectPluginErrors(join(cacheDir, latestVersion), plugName) : []
              info.plugins.push({ name: plugName, key, installed, enabled: installed && enabled, version: latestVersion, description, sourceUrl, errors, elementCounts })
              if (installed) info.installedCount++
              if (installed && enabled) info.enabledCount++
            }
          }

          // Case 3: Scan subdirectories for plugins
          const pluginsDirs = [
            join(mktPath, 'plugins'),
            mktPath, // some marketplaces have plugins at root level
          ]

          for (const pluginsDir of pluginsDirs) {
            if (!existsSync(pluginsDir)) continue
            try {
              const pluginEntries = await readdir(pluginsDir)
              for (const plugName of pluginEntries) {
                if (plugName.startsWith('.') || plugName === 'plugins' || seenPlugins.has(plugName)) continue
                const plugDir = join(pluginsDir, plugName)
                try {
                  const ps = await stat(plugDir)
                  if (!ps.isDirectory()) continue
                } catch { continue }

                if (!looksLikePlugin(plugDir)) continue

                seenPlugins.add(plugName)

                const key = `${plugName}@${mktName}`
                const enabled = enabledPlugins[key] === true

                // Check if installed in user-scope cache
                const cacheDir = join(CACHE_DIR, mktName, plugName)
                const installed = existsSync(cacheDir)
                const latestVersion = installed ? await getLatestVersion(cacheDir) : null

                let description: string | null = null
                let elementCounts: PluginStatus['elementCounts'] = null
                let errors: string[] = []
                let sourceUrl: string | null = null

                // Read metadata from cache (if installed) or from marketplace clone
                const metadataDir = latestVersion ? join(cacheDir, latestVersion) : plugDir
                const manifest = await readJsonSafe(join(metadataDir, '.claude-plugin', 'plugin.json'))
                if (manifest) {
                  description = (manifest.description as string) || null
                  // Plugin-level source
                  const plugSrc = manifest.source as Record<string, string> | undefined
                  if (plugSrc?.repo) sourceUrl = repoToUrl(plugSrc.repo)
                  else if (plugSrc?.path) sourceUrl = plugSrc.path
                }
                elementCounts = await countElements(metadataDir)

                // Detect errors for installed plugins
                if (installed && latestVersion) {
                  errors = detectPluginErrors(join(cacheDir, latestVersion), plugName)
                }

                info.plugins.push({
                  name: plugName,
                  key,
                  installed,
                  enabled: installed && enabled,
                  version: latestVersion,
                  description,
                  sourceUrl,
                  errors,
                  elementCounts,
                })

                if (installed) info.installedCount++
                if (installed && enabled) info.enabledCount++
              }
            } catch { /* ignore dir scan errors */ }
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
        installedPlugins: result.reduce((sum, m) => sum + m.installedCount, 0),
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
    if (action === 'add-marketplace') {
      return await handleAddMarketplace(url)
    }
    if (action === 'security-check') {
      return await handleSecurityCheck(pluginKey)
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
