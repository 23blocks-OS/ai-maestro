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
import semver from 'semver'

export const dynamic = 'force-dynamic'

/**
 * Sanitize a string for safe use in shell commands.
 * Rejects anything with shell metacharacters that could enable command injection.
 * Only allows: alphanumeric, hyphens, underscores, dots, slashes, @, and colons.
 */
function shellSafe(input: string): string {
  const sanitized = input.replace(/[^a-zA-Z0-9._/@:+-]/g, '')
  if (sanitized !== input) {
    throw new Error(`Unsafe shell input rejected: "${input.substring(0, 50)}"`)
  }
  return sanitized
}

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
  author: string | null
  authorEmail: string | null
  license: string | null
  homepage: string | null
  repository: string | null
  keywords: string[] | null
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
    const allDirs = entries.filter(e => !e.startsWith('.'))
    if (allDirs.length === 0) return null
    const semverDirs = allDirs.filter(e => semver.valid(e))
    if (semverDirs.length > 0) {
      semverDirs.sort(semver.rcompare)
      return semverDirs[0]
    }
    // No semver dirs — fallback to last alphabetically (handles git hashes, timestamps)
    allDirs.sort()
    return allDirs[allDirs.length - 1]
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

          // Get source info from extraKnownMarketplaces, then fallback to git remote
          const ekm = extraKnown[mktName] as Record<string, unknown> | undefined
          const srcInfo = ekm?.source as Record<string, string> | undefined
          const sourceType = (srcInfo?.source === 'github' ? 'github' : srcInfo?.source === 'directory' ? 'directory' : 'unknown') as MarketplaceInfo['sourceType']
          const sourceRepo = srcInfo?.repo || null
          let sourceUrl = sourceRepo ? repoToUrl(sourceRepo) : srcInfo?.path || null
          // Fallback: read git remote origin URL from the clone directory
          if (!sourceUrl) {
            try {
              const { execSync } = await import('child_process')
              const gitUrl = execSync(`git -C "${mktPath}" remote get-url origin 2>/dev/null`, { timeout: 3000 }).toString().trim()
              if (gitUrl) sourceUrl = gitUrl.replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/')
            } catch { /* no git remote — leave null */ }
          }

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
            let author: string | null = null
            let authorEmail: string | null = null
            let license: string | null = null
            let homepage: string | null = null
            let repository: string | null = null
            let keywords: string[] | null = null
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
                // Author can be string or {name, email} object
                if (!author) {
                  const a = manifest.author
                  if (typeof a === 'string') author = a
                  else if (a && typeof a === 'object') {
                    author = (a as Record<string, string>).name || null
                    authorEmail = (a as Record<string, string>).email || null
                  }
                }
                if (!license) license = (manifest.license as string) || null
                if (!homepage) homepage = (manifest.homepage as string) || null
                if (!repository) repository = (manifest.repository as string) || null
                if (!keywords && Array.isArray(manifest.keywords)) keywords = manifest.keywords as string[]
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

            const outdated = !!(installed && installedVersion && availVer && installedVersion !== availVer && availVer > installedVersion)

            info.plugins.push({
              name: plugName, key, installed, enabled: installed && enabled,
              version: installedVersion, availableVersion: availVer, outdated,
              description, author, authorEmail, license, homepage, repository, keywords,
              sourceUrl, errors, elementCounts,
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
    // Standalone element removal (MCP, LSP, skills, rules, agents, hooks)
    if (action === 'remove-element') {
      const { elementName, elementType, elementPath } = body as { elementName?: string; elementType?: string; elementPath?: string }
      if (!elementName || !elementType) {
        return NextResponse.json({ error: 'elementName and elementType are required' }, { status: 400 })
      }
      const safeName = shellSafe(elementName)
      const { execSync } = await import('child_process')

      try {
        switch (elementType) {
          case 'mcp': {
            // claude mcp remove <name>
            try {
              execSync(`claude mcp remove "${safeName}" --scope user 2>&1`, { timeout: 15000 })
            } catch {
              execSync(`claude mcp remove "${safeName}" 2>&1`, { timeout: 15000 })
            }
            break
          }
          case 'lsp': {
            // LSP servers are in settings — remove from .lsp.json or settings
            // No CLI command, remove the entry from the config file
            if (elementPath && existsSync(elementPath)) {
              const content = JSON.parse(await readFile(elementPath, 'utf-8'))
              const servers = content.lspServers || content
              delete servers[elementName]
              if (content.lspServers) content.lspServers = servers
              await writeFile(elementPath, JSON.stringify(content, null, 2) + '\n')
            }
            break
          }
          case 'skill': {
            // Skills at user level are folders in ~/.claude/skills/<name>/
            const skillDir = join(HOME, '.claude', 'skills', elementName)
            if (existsSync(skillDir)) {
              await rm(skillDir, { recursive: true, force: true })
            }
            break
          }
          case 'rule': {
            // Rules at user level are files in ~/.claude/rules/<name>.md
            const rulePath = elementPath || join(HOME, '.claude', 'rules', `${elementName}.md`)
            if (existsSync(rulePath)) {
              await rm(rulePath)
            }
            break
          }
          case 'agent': {
            // Agents at user level are files in ~/.claude/agents/<name>.md
            const agentPath = elementPath || join(HOME, '.claude', 'agents', `${elementName}.md`)
            if (existsSync(agentPath)) {
              await rm(agentPath)
            }
            break
          }
          default:
            return NextResponse.json({ error: `Unsupported element type for removal: ${elementType}` }, { status: 400 })
        }
        return NextResponse.json({ success: true, action: 'remove-element', elementName, elementType })
      } catch (err) {
        return NextResponse.json({ error: `Remove failed: ${String(err).substring(0, 500)}` }, { status: 500 })
      }
    }

    // New CLI-backed actions that don't require pluginKey
    if (action === 'disable-all') {
      return await handleDisableAll()
    }
    if (action === 'list-plugins') {
      return await handleListPlugins(body.available === true)
    }
    if (action === 'validate') {
      return await handleValidate(body.path)
    }
    if (action === 'update-all-marketplaces') {
      return await handleUpdateAllMarketplaces()
    }
    if (action === 'list-marketplaces') {
      return await handleListMarketplacesCli()
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
        return await handleUpdate(pluginName, marketplaceName, pluginKey)
      case 'enable':
        return await handleEnable(pluginName, marketplaceName, pluginKey)
      case 'disable':
        return await handleDisable(pluginName, marketplaceName, pluginKey)
      // No legacy fallbacks — all actions go through Claude CLI
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error) {
    console.error('[marketplaces] POST failed:', error)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}

/**
 * Resolve the Claude CLI marketplace name for a given directory name.
 * Claude CLI registers marketplaces by the name in marketplace.json, which may differ from the directory name.
 * E.g. directory "kriscard-claude-plugins" → CLI name "kriscard"
 */
async function resolveCliMarketplaceName(dirName: string): Promise<string> {
  const mktDir = join(MARKETPLACES_DIR, dirName)
  // Try reading the declared name from marketplace.json
  for (const p of [join(mktDir, '.claude-plugin', 'marketplace.json'), join(mktDir, 'marketplace.json')]) {
    if (existsSync(p)) {
      try {
        const manifest = JSON.parse(await readFile(p, 'utf-8'))
        if (manifest.name) return String(manifest.name)
      } catch { /* continue */ }
    }
  }
  // Fallback: ask Claude CLI
  try {
    const { execSync } = await import('child_process')
    const output = execSync('claude plugin marketplace list 2>&1', { timeout: 10000 }).toString()
    // Look for a line referencing our directory path
    const lines = output.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(dirName)) {
        // The marketplace name is on the previous "❯" line
        for (let j = i; j >= 0; j--) {
          const m = lines[j].match(/❯\s+(.+)/)
          if (m) return m[1].trim()
        }
      }
    }
  } catch { /* fallback */ }
  return dirName // last resort: use directory name as-is
}

/** Enable plugin via Claude CLI — tries multiple key formats */
async function handleEnable(pluginName: string, marketplaceName: string, pluginKey: string) {
  const { execSync } = await import('child_process')
  const cliMkt = await resolveCliMarketplaceName(marketplaceName)
  for (const key of new Set([`${pluginName}@${cliMkt}`, `${pluginName}@${marketplaceName}`, pluginKey])) {
    try {
      execSync(`claude plugin enable "${shellSafe(key)}" --scope user 2>&1`, { timeout: 15000 })
      return NextResponse.json({ success: true, action: 'enable', pluginKey })
    } catch { /* try next */ }
  }
  return NextResponse.json({ error: `Enable failed: plugin not found with any key format` }, { status: 500 })
}

/** Disable plugin via Claude CLI — tries multiple key formats */
async function handleDisable(pluginName: string, marketplaceName: string, pluginKey: string) {
  const { execSync } = await import('child_process')
  const cliMkt = await resolveCliMarketplaceName(marketplaceName)
  for (const key of new Set([`${pluginName}@${cliMkt}`, `${pluginName}@${marketplaceName}`, pluginKey])) {
    try {
      execSync(`claude plugin disable "${shellSafe(key)}" --scope user 2>&1`, { timeout: 15000 })
      return NextResponse.json({ success: true, action: 'disable', pluginKey })
    } catch { /* try next */ }
  }
  return NextResponse.json({ error: `Disable failed: plugin not found with any key format` }, { status: 500 })
}

/** Update plugin via Claude CLI */
async function handleUpdate(pluginName: string, marketplaceName: string, pluginKey: string) {
  try {
    const { execSync } = await import('child_process')
    const cliMkt = await resolveCliMarketplaceName(marketplaceName)
    execSync(`claude plugin update "${shellSafe(pluginName)}@${shellSafe(cliMkt)}" --scope user 2>&1`, { timeout: 60000 })
  } catch (err) {
    return NextResponse.json({ error: `Update failed: ${err}` }, { status: 500 })
  }
  return NextResponse.json({ success: true, action: 'update', pluginKey })
}

/** Install plugin via Claude CLI — cleans up stale state before retrying on failure */
async function handleInstall(pluginName: string, marketplaceName: string, pluginKey: string) {
  const { execSync } = await import('child_process')
  const cliMkt = await resolveCliMarketplaceName(marketplaceName)
  const installKey = `${shellSafe(pluginName)}@${shellSafe(cliMkt)}`

  try {
    execSync(`claude plugin install --scope user "${installKey}" 2>&1`, { timeout: 60000 })
    return NextResponse.json({ success: true, action: 'install', pluginKey })
  } catch (firstErr) {
    const errStr = String(firstErr)

    // Distinguish remote errors (marketplace/plugin not found on GitHub) from local stale state
    const isRemoteError = errStr.includes('not found in marketplace') ||
      errStr.includes('404') ||
      errStr.includes('Could not resolve') ||
      errStr.includes('fatal: repository') ||
      errStr.includes('network') ||
      errStr.includes('timeout')

    if (isRemoteError) {
      // Remote error — nothing to clean up locally, the marketplace or plugin doesn't exist upstream
      return NextResponse.json({ error: `Install failed (remote): plugin "${pluginName}" not found in marketplace "${cliMkt}". Check the marketplace URL and plugin name.`, errorType: 'remote' }, { status: 404 })
    }

    // Local error — likely stale state from a previous file-copy install. Clean up and retry.
    const staleKeys = [`${pluginName}@${cliMkt}`, `${pluginName}@${marketplaceName}`, pluginKey]
    const settings = await readJsonSafe(SETTINGS_PATH) || {}
    const ep = (settings.enabledPlugins || {}) as Record<string, boolean>
    let cleaned = false
    for (const key of new Set(staleKeys)) {
      if (ep[key] !== undefined) { delete ep[key]; cleaned = true }
    }
    for (const mktName of [marketplaceName, cliMkt]) {
      const cacheDir = join(CACHE_DIR, mktName, pluginName)
      if (existsSync(cacheDir)) {
        await rm(cacheDir, { recursive: true, force: true })
        cleaned = true
      }
    }
    if (cleaned) {
      settings.enabledPlugins = ep
      await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n')
      // Retry after cleanup
      try {
        execSync(`claude plugin install --scope user "${installKey}" 2>&1`, { timeout: 60000 })
        return NextResponse.json({ success: true, action: 'install', pluginKey, staleCleanup: true })
      } catch (retryErr) {
        return NextResponse.json({ error: `Install failed after stale cleanup: ${String(retryErr).substring(0, 500)}`, errorType: 'local' }, { status: 500 })
      }
    }
    return NextResponse.json({ error: `Install failed: ${errStr.substring(0, 500)}`, errorType: 'unknown' }, { status: 500 })
  }
}

/** Uninstall plugin via Claude CLI — with auto-cleanup of stale installations */
async function handleUninstall(pluginName: string, marketplaceName: string, pluginKey: string) {
  const { execSync } = await import('child_process')
  let cliSucceeded = false

  // Try CLI uninstall with all possible key formats
  const cliMkt = await resolveCliMarketplaceName(marketplaceName)
  const keysToTry = [
    `${pluginName}@${cliMkt}`,
    `${pluginName}@${marketplaceName}`,
    pluginKey,
  ]
  // Deduplicate
  const uniqueKeys = [...new Set(keysToTry)]
  for (const key of uniqueKeys) {
    try {
      execSync(`claude plugin uninstall "${shellSafe(key)}" --scope user 2>&1`, { timeout: 15000 })
      cliSucceeded = true
      break
    } catch { /* try next key format */ }
  }

  // If CLI couldn't uninstall, this is a stale installation (installed via file copy, not CLI).
  // Clean up manually: remove cache, remove from settings.
  if (!cliSucceeded) {
    // Remove all cache entries for this plugin across all marketplace name variants
    for (const mktName of [marketplaceName, cliMkt]) {
      const cacheDir = join(CACHE_DIR, mktName, pluginName)
      if (existsSync(cacheDir)) {
        await rm(cacheDir, { recursive: true, force: true })
      }
    }
    // Remove all settings entries for this plugin (both key formats)
    const settings = await readJsonSafe(SETTINGS_PATH) || {}
    const ep = (settings.enabledPlugins || {}) as Record<string, boolean>
    for (const key of uniqueKeys) {
      delete ep[key]
    }
    settings.enabledPlugins = ep
    await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n')
  }

  return NextResponse.json({ success: true, action: 'uninstall', pluginKey, staleCleanup: !cliSucceeded })
}

/** Remove marketplace: delete clone dir + remove from settings + clean cached plugins */
async function handleDeleteMarketplace(marketplaceName?: string) {
  if (!marketplaceName) {
    return NextResponse.json({ error: 'marketplaceName is required' }, { status: 400 })
  }

  // Remove via Claude CLI first
  try {
    const { execSync } = await import('child_process')
    const cliName = await resolveCliMarketplaceName(marketplaceName)
    execSync(`claude plugin marketplace remove "${shellSafe(cliName)}" 2>&1`, { timeout: 15000 })
  } catch {
    // CLI removal may fail if not registered — continue with file cleanup
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
  const { execSync } = await import('child_process')
  try {
    const cliName = await resolveCliMarketplaceName(marketplaceName)
    execSync(`claude plugin marketplace update "${shellSafe(cliName)}" 2>&1`, { timeout: 60000, stdio: 'pipe' })
  } catch (err) {
    return NextResponse.json({ error: `Failed to update marketplace: ${String(err).substring(0, 500)}` }, { status: 500 })
  }
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

  // Extract plugin versions and source repos from remote marketplace.json
  const remotePlugins: Record<string, string> = {}
  const pluginRepos: Record<string, string> = {} // name -> owner/repo
  const pluginMktMeta: Record<string, { description?: string; repository?: string }> = {}
  if (Array.isArray(remoteData.plugins)) {
    for (const p of remoteData.plugins as Record<string, unknown>[]) {
      const name = p.name as string
      if (!name) continue
      const ver = p.version as string
      if (ver) remotePlugins[name] = ver
      // Capture source repo for lazy metadata fetching
      const src = p.source as Record<string, string> | undefined
      if (src?.repo) pluginRepos[name] = src.repo
      // Also store description/repository from marketplace.json itself
      pluginMktMeta[name] = {
        description: (p.description as string) || undefined,
        repository: (p.repository as string) || (src?.repo ? `https://github.com/${src.repo}` : undefined),
      }
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

  // Lazy-fetch metadata for uninstalled plugins from their individual repos
  // Only fetch for plugins that are NOT installed (installed ones already have metadata from cache)
  const pluginMetadata: Record<string, {
    description: string | null; author: string | null; authorEmail: string | null
    license: string | null; homepage: string | null; repository: string | null; keywords: string[] | null
  }> = {}

  // Fetch up to 5 plugin metadata in parallel (avoid hammering GitHub)
  const uninstalledWithRepo = Object.entries(pluginRepos)
    .filter(([name]) => !localPlugins[name])
    .slice(0, 5)

  await Promise.all(uninstalledWithRepo.map(async ([name, plugRepo]) => {
    // Try fetching plugin.json from the plugin's own repo
    for (const branch of ['main', 'master']) {
      try {
        const url = `https://raw.githubusercontent.com/${plugRepo}/${branch}/.claude-plugin/plugin.json`
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
        if (res.ok) {
          const pj = await res.json() as Record<string, unknown>
          const authorObj = pj.author
          let author: string | null = null
          let authorEmail: string | null = null
          if (typeof authorObj === 'string') author = authorObj
          else if (authorObj && typeof authorObj === 'object') {
            author = (authorObj as Record<string, string>).name || null
            authorEmail = (authorObj as Record<string, string>).email || null
          }
          pluginMetadata[name] = {
            description: (pj.description as string) || pluginMktMeta[name]?.description || null,
            author, authorEmail,
            license: (pj.license as string) || null,
            homepage: (pj.homepage as string) || null,
            repository: (pj.repository as string) || pluginMktMeta[name]?.repository || null,
            keywords: Array.isArray(pj.keywords) ? pj.keywords as string[] : null,
          }
          return
        }
      } catch { /* try next branch */ }
    }
    // Fallback: use whatever marketplace.json had
    if (pluginMktMeta[name]) {
      pluginMetadata[name] = {
        description: pluginMktMeta[name].description || null,
        author: null, authorEmail: null, license: null, homepage: null,
        repository: pluginMktMeta[name].repository || null, keywords: null,
      }
    }
  }))

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
    pluginMetadata,
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

  // Let Claude CLI handle the cloning and registration — it manages its own clone directory
  const { execSync } = await import('child_process')
  try {
    const output = execSync(`claude plugin marketplace add "${shellSafe(repo)}" --scope user 2>&1`, {
      timeout: 120000,
      stdio: 'pipe',
    }).toString()
    // CLI outputs the registered name, e.g. "Successfully added marketplace: kriscard"
    console.log(`Marketplace add output: ${output}`)
  } catch (err) {
    const errStr = String(err)
    // If the marketplace already exists, that's fine
    if (errStr.includes('already') || errStr.includes('exists')) {
      return NextResponse.json({ error: `Marketplace "${marketplaceName}" already exists` }, { status: 409 })
    }
    return NextResponse.json({ error: `Failed to add marketplace: ${errStr.substring(0, 500)}` }, { status: 500 })
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
/** Disable all plugins via Claude CLI */
async function handleDisableAll() {
  try {
    const { execSync } = await import('child_process')
    execSync('claude plugin disable --all --scope user 2>&1', { timeout: 30000 })
    return NextResponse.json({ success: true, action: 'disable-all' })
  } catch (err) {
    return NextResponse.json({ error: `Disable all failed: ${err}` }, { status: 500 })
  }
}

/** List plugins via Claude CLI (JSON output) */
async function handleListPlugins(available: boolean) {
  try {
    const { execSync } = await import('child_process')
    const flags = available ? '--json --available' : '--json'
    const output = execSync(`claude plugin list ${flags} 2>&1`, { timeout: 30000 }).toString()
    const data = JSON.parse(output)
    return NextResponse.json({ success: true, action: 'list-plugins', data })
  } catch (err) {
    return NextResponse.json({ error: `List plugins failed: ${err}` }, { status: 500 })
  }
}

/** Validate a plugin or marketplace manifest via Claude CLI */
async function handleValidate(path?: string) {
  if (!path) {
    return NextResponse.json({ error: 'path is required for validate action' }, { status: 400 })
  }
  // Security: only allow paths under ~/.claude/plugins/
  if (!path.startsWith(join(HOME, '.claude', 'plugins'))) {
    return NextResponse.json({ error: 'Path must be under ~/.claude/plugins/' }, { status: 403 })
  }
  try {
    const { execSync } = await import('child_process')
    const output = execSync(`claude plugin validate "${shellSafe(path)}" 2>&1`, { timeout: 30000 }).toString()
    return NextResponse.json({ success: true, action: 'validate', output })
  } catch (err) {
    const errMsg = err instanceof Error ? (err as { stdout?: Buffer }).stdout?.toString() || err.message : String(err)
    return NextResponse.json({ success: false, action: 'validate', output: errMsg })
  }
}

/** Update all marketplaces via Claude CLI */
async function handleUpdateAllMarketplaces() {
  try {
    const { execSync } = await import('child_process')
    execSync('claude plugin marketplace update 2>&1', { timeout: 120000 })
    // Invalidate all version caches
    UPDATE_CHECK_CACHE.clear()
    return NextResponse.json({ success: true, action: 'update-all-marketplaces' })
  } catch (err) {
    return NextResponse.json({ error: `Update all marketplaces failed: ${err}` }, { status: 500 })
  }
}

/** List marketplaces via Claude CLI (JSON output) */
async function handleListMarketplacesCli() {
  try {
    const { execSync } = await import('child_process')
    const output = execSync('claude plugin marketplace list --json 2>&1', { timeout: 15000 }).toString()
    const data = JSON.parse(output)
    return NextResponse.json({ success: true, action: 'list-marketplaces', data })
  } catch (err) {
    return NextResponse.json({ error: `List marketplaces failed: ${err}` }, { status: 500 })
  }
}

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
      const versions = (await readdir(cpvCacheBase)).filter(v => !v.startsWith('.') && semver.valid(v))
      versions.sort(semver.rcompare)
      const latestVer = versions[0]
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
