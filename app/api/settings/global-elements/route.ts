/**
 * Global Elements API
 *
 * GET /api/settings/global-elements — List all elements from ENABLED user-scope plugins
 *
 * Scans ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/
 * for each enabled plugin in settings.json and returns their bundled elements:
 * skills, agents, commands, hooks, MCP servers, LSP servers.
 */

import { NextResponse } from 'next/server'
import { readFile, readdir, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import os from 'os'
import semver from 'semver'

export const dynamic = 'force-dynamic'

const HOME = os.homedir()
const SETTINGS_PATH = join(HOME, '.claude', 'settings.json')
const PLUGINS_CACHE = join(HOME, '.claude', 'plugins', 'cache')

interface ElementInfo {
  name: string
  path: string
  sourcePlugin: string
  sourceMarketplace: string
  description: string | null // from frontmatter or first lines
  type: string // 'skill' | 'agent' | 'command' | 'rule' | 'hook' | 'mcp' | 'lsp' | 'outputStyle'
}

/** Extract description from frontmatter or first content lines of an .md file */
async function extractDescription(filePath: string): Promise<string | null> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const lines = content.split('\n')
    // Check for YAML frontmatter
    if (lines[0]?.trim() === '---') {
      const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
      if (endIdx > 0) {
        const frontmatter = lines.slice(1, endIdx).join('\n')
        const descMatch = frontmatter.match(/description:\s*(?:>-?\s*\n\s*)?(.+?)(?:\n|$)/i)
        if (descMatch) return descMatch[1].trim().substring(0, 200)
      }
    }
    // No frontmatter — return first non-empty, non-heading line
    for (const line of lines.slice(0, 10)) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
        return trimmed.substring(0, 200)
      }
    }
    return null
  } catch { return null }
}

interface PluginElements {
  pluginName: string
  marketplace: string
  enabled: boolean
  version: string | null
  sourceUrl: string | null
  skills: ElementInfo[]
  agents: ElementInfo[]
  commands: ElementInfo[]
  hooks: ElementInfo[]
  rules: ElementInfo[]
  mcpServers: ElementInfo[]
  lspServers: ElementInfo[]
  outputStyles: ElementInfo[]
}

/** Get the latest version directory inside a plugin cache dir */
async function getLatestVersionDir(pluginDir: string): Promise<string | null> {
  try {
    const entries = await readdir(pluginDir)
    const dirs: string[] = []
    for (const entry of entries) {
      const fullPath = join(pluginDir, entry)
      const s = await stat(fullPath)
      if (s.isDirectory() && !entry.startsWith('.')) {
        dirs.push(entry)
      }
    }
    const semverDirs = dirs.filter(d => semver.valid(d))
    if (semverDirs.length === 0) return null
    semverDirs.sort(semver.rcompare)
    return join(pluginDir, semverDirs[0])
  } catch {
    return null
  }
}

/** List .md files in a directory (agents/commands/rules are .md files) */
async function listMdFiles(dir: string, pluginName: string, marketplace: string, type: string): Promise<ElementInfo[]> {
  if (!existsSync(dir)) return []
  try {
    const entries = await readdir(dir)
    const results: ElementInfo[] = []
    for (const entry of entries) {
      const fullPath = join(dir, entry)
      const s = await stat(fullPath)
      if (s.isFile() && entry.endsWith('.md')) {
        results.push({
          name: entry.replace(/\.md$/, ''),
          path: fullPath,
          sourcePlugin: pluginName,
          sourceMarketplace: marketplace,
          description: await extractDescription(fullPath),
          type,
        })
      }
    }
    return results
  } catch {
    return []
  }
}

/** List skill directories (each skill is a dir containing SKILL.md) */
async function listSkillDirs(dir: string, pluginName: string, marketplace: string): Promise<ElementInfo[]> {
  if (!existsSync(dir)) return []
  try {
    const entries = await readdir(dir)
    const results: ElementInfo[] = []
    for (const entry of entries) {
      const fullPath = join(dir, entry)
      const s = await stat(fullPath)
      if (s.isDirectory()) {
        const skillFile = join(fullPath, 'SKILL.md')
        if (existsSync(skillFile)) {
          results.push({
            name: entry,
            path: fullPath,
            sourcePlugin: pluginName,
            sourceMarketplace: marketplace,
            description: await extractDescription(skillFile),
            type: 'skill',
          })
        }
      }
    }
    return results
  } catch {
    return []
  }
}

/** Parse hooks from hooks/hooks.json */
async function listHooks(versionDir: string, pluginName: string, marketplace: string): Promise<ElementInfo[]> {
  const hooksJsonPath = join(versionDir, 'hooks', 'hooks.json')
  if (!existsSync(hooksJsonPath)) return []
  try {
    const content = await readFile(hooksJsonPath, 'utf-8')
    const parsed = JSON.parse(content)
    const hooksObj = parsed.hooks || parsed
    const results: ElementInfo[] = []
    for (const event of Object.keys(hooksObj)) {
      const eventHooks = hooksObj[event]
      if (Array.isArray(eventHooks)) {
        for (const hookGroup of eventHooks) {
          const matcher = hookGroup.matcher || '*'
          const cmd = hookGroup.command || ''
          results.push({
            name: `${event}:${matcher}`,
            path: hooksJsonPath,
            sourcePlugin: pluginName,
            sourceMarketplace: marketplace,
            description: cmd ? `Command: ${cmd.substring(0, 100)}` : null,
            type: 'hook',
          })
        }
      }
    }
    return results
  } catch {
    return []
  }
}

/** Parse MCP servers from .mcp.json */
async function listMcpServers(versionDir: string, pluginName: string, marketplace: string): Promise<ElementInfo[]> {
  const mcpPath = join(versionDir, '.mcp.json')
  if (!existsSync(mcpPath)) return []
  try {
    const content = await readFile(mcpPath, 'utf-8')
    const parsed = JSON.parse(content)
    const servers = parsed.mcpServers || {}
    return Object.keys(servers).map(name => {
      const srv = servers[name]
      return {
        name,
        path: mcpPath,
        sourcePlugin: pluginName,
        sourceMarketplace: marketplace,
        description: srv?.command ? `${srv.command} ${(srv.args || []).join(' ')}`.substring(0, 100) : null,
        type: 'mcp',
      }
    })
  } catch {
    return []
  }
}

/** List output-style files from output-styles/ directory */
async function listOutputStyles(versionDir: string, pluginName: string, marketplace: string): Promise<ElementInfo[]> {
  const osDir = join(versionDir, 'output-styles')
  if (!existsSync(osDir)) return []
  try {
    const s = await stat(osDir)
    if (!s.isDirectory()) return []
    const entries = await readdir(osDir)
    const results: ElementInfo[] = []
    for (const entry of entries) {
      if (entry.startsWith('.')) continue
      const entryPath = join(osDir, entry)
      const entryStat = await stat(entryPath)
      if (!entryStat.isFile()) continue
      results.push({
        name: entry.replace(/\.[^.]+$/, ''),
        path: entryPath,
        sourcePlugin: pluginName,
        sourceMarketplace: marketplace,
        description: null,
        type: 'outputStyle',
      })
    }
    return results
  } catch {
    return []
  }
}

/** Parse LSP servers from .lsp.json */
async function listLspServers(versionDir: string, pluginName: string, marketplace: string): Promise<ElementInfo[]> {
  const lspPath = join(versionDir, '.lsp.json')
  if (!existsSync(lspPath)) return []
  try {
    const content = await readFile(lspPath, 'utf-8')
    const parsed = JSON.parse(content)
    const servers = parsed.lspServers || {}
    return Object.keys(servers).map(name => {
      const srv = servers[name]
      return {
        name,
        path: lspPath,
        sourcePlugin: pluginName,
        sourceMarketplace: marketplace,
        description: srv?.command ? `${srv.command}` : null,
        type: 'lsp',
      }
    })
  } catch {
    return []
  }
}

export async function GET() {
  try {
    // Read settings
    let settings: Record<string, unknown> = {}
    if (existsSync(SETTINGS_PATH)) {
      try { settings = JSON.parse(await readFile(SETTINGS_PATH, 'utf-8')) } catch { /* ignore */ }
    }
    const enabledPlugins = (settings.enabledPlugins || {}) as Record<string, boolean>

    // Scan ALL installed plugins from cache (not just enabled)
    const results: PluginElements[] = []
    const allPluginKeys = new Set<string>()

    // Collect keys from enabledPlugins + scan cache dirs
    for (const key of Object.keys(enabledPlugins)) allPluginKeys.add(key)
    if (existsSync(PLUGINS_CACHE)) {
      try {
        for (const mkt of await readdir(PLUGINS_CACHE)) {
          if (mkt.startsWith('.')) continue
          const mktDir = join(PLUGINS_CACHE, mkt)
          try {
            if (!(await stat(mktDir)).isDirectory()) continue
            for (const plug of await readdir(mktDir)) {
              if (plug.startsWith('.')) continue
              allPluginKeys.add(`${plug}@${mkt}`)
            }
          } catch { continue }
        }
      } catch { /* ignore */ }
    }

    for (const key of allPluginKeys) {
      const atIdx = key.lastIndexOf('@')
      const pluginName = atIdx > 0 ? key.substring(0, atIdx) : key
      const marketplace = atIdx > 0 ? key.substring(atIdx + 1) : 'unknown'
      const enabled = enabledPlugins[key] === true

      const pluginCacheDir = join(PLUGINS_CACHE, marketplace, pluginName)
      if (!existsSync(pluginCacheDir)) continue

      const versionDir = await getLatestVersionDir(pluginCacheDir)
      if (!versionDir) continue

      // Scan for elements
      const [skills, agents, commands, hooks, rules, mcpServers, lspServers, outputStyles] = await Promise.all([
        listSkillDirs(join(versionDir, 'skills'), pluginName, marketplace),
        listMdFiles(join(versionDir, 'agents'), pluginName, marketplace, 'agent'),
        listMdFiles(join(versionDir, 'commands'), pluginName, marketplace, 'command'),
        listHooks(versionDir, pluginName, marketplace),
        listMdFiles(join(versionDir, 'rules'), pluginName, marketplace, 'rule'),
        listMcpServers(versionDir, pluginName, marketplace),
        listLspServers(versionDir, pluginName, marketplace),
        listOutputStyles(versionDir, pluginName, marketplace),
      ])

      // Read version and source URL from plugin.json
      const versionName = versionDir.split('/').pop() || null
      let sourceUrl: string | null = null
      const manifestPath = join(versionDir, '.claude-plugin', 'plugin.json')
      if (existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))
          const src = manifest.source as Record<string, string> | undefined
          if (src?.repo) sourceUrl = `https://github.com/${src.repo}`
          else if (manifest.repository) sourceUrl = manifest.repository as string
          else if (manifest.homepage) sourceUrl = manifest.homepage as string
        } catch { /* ignore */ }
      }
      // Fallback: marketplace source from extraKnownMarketplaces
      if (!sourceUrl) {
        const ekm = (settings.extraKnownMarketplaces || {}) as Record<string, unknown>
        const ekmEntry = ekm[marketplace] as Record<string, unknown> | undefined
        const srcInfo = ekmEntry?.source as Record<string, string> | undefined
        if (srcInfo?.repo) sourceUrl = `https://github.com/${srcInfo.repo}`
      }

      // Only include plugins that actually have elements
      const total = skills.length + agents.length + commands.length + hooks.length +
        rules.length + mcpServers.length + lspServers.length + outputStyles.length
      if (total > 0) {
        results.push({ pluginName, marketplace, enabled, version: versionName, sourceUrl, skills, agents, commands, hooks, rules, mcpServers, lspServers, outputStyles })
      }
    }

    // Sort plugins alphabetically
    results.sort((a, b) => a.pluginName.localeCompare(b.pluginName))

    // Compute totals
    const totals = {
      skills: results.reduce((sum, p) => sum + p.skills.length, 0),
      agents: results.reduce((sum, p) => sum + p.agents.length, 0),
      commands: results.reduce((sum, p) => sum + p.commands.length, 0),
      hooks: results.reduce((sum, p) => sum + p.hooks.length, 0),
      rules: results.reduce((sum, p) => sum + p.rules.length, 0),
      mcpServers: results.reduce((sum, p) => sum + p.mcpServers.length, 0),
      lspServers: results.reduce((sum, p) => sum + p.lspServers.length, 0),
      outputStyles: results.reduce((sum, p) => sum + p.outputStyles.length, 0),
    }

    // Build flat elements array for the Elements tab card view
    const flatElements: (ElementInfo & { pluginEnabled: boolean; pluginVersion: string | null; pluginSourceUrl: string | null })[] = []
    for (const plugin of results) {
      const extra = { pluginEnabled: plugin.enabled, pluginVersion: plugin.version, pluginSourceUrl: plugin.sourceUrl }
      for (const el of [...plugin.skills, ...plugin.agents, ...plugin.commands, ...plugin.hooks, ...plugin.rules, ...plugin.mcpServers, ...plugin.lspServers, ...plugin.outputStyles]) {
        flatElements.push({ ...el, ...extra })
      }
    }
    flatElements.sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ plugins: results, elements: flatElements, totals })
  } catch (error) {
    console.error('[global-elements] GET failed:', error)
    return NextResponse.json({ error: 'Failed to scan plugin elements' }, { status: 500 })
  }
}
