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

export const dynamic = 'force-dynamic'

const HOME = os.homedir()
const SETTINGS_PATH = join(HOME, '.claude', 'settings.json')
const PLUGINS_CACHE = join(HOME, '.claude', 'plugins', 'cache')

interface ElementInfo {
  name: string
  path: string
  sourcePlugin: string
  sourceMarketplace: string
}

interface PluginElements {
  pluginName: string
  marketplace: string
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
    if (dirs.length === 0) return null
    // Sort by semver-like order (simple lexicographic works for most cases)
    dirs.sort()
    return join(pluginDir, dirs[dirs.length - 1])
  } catch {
    return null
  }
}

/** List .md files in a directory (skills are dirs with SKILL.md, agents/commands are .md files) */
async function listMdFiles(dir: string, pluginName: string, marketplace: string): Promise<ElementInfo[]> {
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
        // Check if it has a SKILL.md inside
        const skillFile = join(fullPath, 'SKILL.md')
        if (existsSync(skillFile)) {
          results.push({
            name: entry,
            path: fullPath,
            sourcePlugin: pluginName,
            sourceMarketplace: marketplace,
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
    // Hook events: PreToolUse, PostToolUse, SessionStart, StopFailure, etc.
    for (const event of Object.keys(hooksObj)) {
      const eventHooks = hooksObj[event]
      if (Array.isArray(eventHooks)) {
        for (const hookGroup of eventHooks) {
          const matcher = hookGroup.matcher || '*'
          results.push({
            name: `${event}:${matcher}`,
            path: hooksJsonPath,
            sourcePlugin: pluginName,
            sourceMarketplace: marketplace,
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
    return Object.keys(servers).map(name => ({
      name,
      path: mcpPath,
      sourcePlugin: pluginName,
      sourceMarketplace: marketplace,
    }))
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
    return Object.keys(servers).map(name => ({
      name,
      path: lspPath,
      sourcePlugin: pluginName,
      sourceMarketplace: marketplace,
    }))
  } catch {
    return []
  }
}

export async function GET() {
  try {
    // Read settings to get enabled plugins
    if (!existsSync(SETTINGS_PATH)) {
      return NextResponse.json({ plugins: [], totals: { skills: 0, agents: 0, commands: 0, hooks: 0, rules: 0, mcpServers: 0, lspServers: 0, outputStyles: 0 } })
    }
    const settingsContent = await readFile(SETTINGS_PATH, 'utf-8')
    const settings = JSON.parse(settingsContent)
    const enabledPlugins = (settings.enabledPlugins || {}) as Record<string, boolean>

    // Filter to only enabled plugins
    const enabledKeys = Object.entries(enabledPlugins)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key)

    const results: PluginElements[] = []

    for (const key of enabledKeys) {
      // Parse key: "pluginName@marketplace"
      const atIdx = key.lastIndexOf('@')
      const pluginName = atIdx > 0 ? key.substring(0, atIdx) : key
      const marketplace = atIdx > 0 ? key.substring(atIdx + 1) : 'unknown'

      // Find the plugin in the cache
      const pluginCacheDir = join(PLUGINS_CACHE, marketplace, pluginName)
      if (!existsSync(pluginCacheDir)) continue

      const versionDir = await getLatestVersionDir(pluginCacheDir)
      if (!versionDir) continue

      // Scan for elements
      const [skills, agents, commands, hooks, rules, mcpServers, lspServers, outputStyles] = await Promise.all([
        listSkillDirs(join(versionDir, 'skills'), pluginName, marketplace),
        listMdFiles(join(versionDir, 'agents'), pluginName, marketplace),
        listMdFiles(join(versionDir, 'commands'), pluginName, marketplace),
        listHooks(versionDir, pluginName, marketplace),
        listMdFiles(join(versionDir, 'rules'), pluginName, marketplace),
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
        results.push({ pluginName, marketplace, version: versionName, sourceUrl, skills, agents, commands, hooks, rules, mcpServers, lspServers, outputStyles })
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

    return NextResponse.json({ plugins: results, totals })
  } catch (error) {
    console.error('[global-elements] GET failed:', error)
    return NextResponse.json({ error: 'Failed to scan plugin elements' }, { status: 500 })
  }
}
