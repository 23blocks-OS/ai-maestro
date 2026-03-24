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
  description: string | null
  type: string // 'skill' | 'agent' | 'command' | 'rule' | 'hook' | 'mcp' | 'lsp' | 'outputStyle'
  // All frontmatter fields as-is (generic key-value pairs)
  frontmatter?: Record<string, string | string[]>
}

/** Extract ALL frontmatter fields from a .md file — no validation, just parse and return */
async function extractFrontmatter(filePath: string): Promise<{ description: string | null; frontmatter: Record<string, string | string[]> }> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const lines = content.split('\n')
    if (lines[0]?.trim() !== '---') {
      // No frontmatter — return first non-empty non-heading line as description
      for (const line of lines.slice(0, 10)) {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
          return { description: trimmed.substring(0, 200), frontmatter: {} }
        }
      }
      return { description: null, frontmatter: {} }
    }
    const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
    if (endIdx <= 0) return { description: null, frontmatter: {} }
    const fmLines = lines.slice(1, endIdx)
    const result: Record<string, string | string[]> = {}
    let currentKey: string | null = null
    let currentList: string[] | null = null
    for (const line of fmLines) {
      // New key: value pair
      const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)/)
      if (kvMatch) {
        // Save previous list if any
        if (currentKey && currentList) result[currentKey] = currentList
        currentKey = kvMatch[1]
        currentList = null
        const val = kvMatch[2].trim()
        if (!val) {
          // Empty value — might be followed by a YAML list
          currentList = []
        } else if (val.startsWith('[') && val.endsWith(']')) {
          // Inline array: [a, b, c]
          result[currentKey] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''))
          currentKey = null
        } else {
          result[currentKey] = val.replace(/^['"]|['"]$/g, '')
          currentKey = null
        }
      } else if (currentList !== null) {
        // List item: - value
        const listItem = line.match(/^\s+-\s+(.+)/)
        if (listItem) {
          currentList.push(listItem[1].trim().replace(/^['"]|['"]$/g, ''))
        } else if (line.trim()) {
          // Not a list item, close the list
          if (currentKey) result[currentKey] = currentList
          currentKey = null
          currentList = null
        }
      }
    }
    // Flush last key
    if (currentKey && currentList) result[currentKey] = currentList
    // Sanitize: strip control chars, limit key/value lengths, reject suspicious keys
    const sanitize = (s: string) => s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').substring(0, 1000)
    const safeResult: Record<string, string | string[]> = {}
    for (const [k, v] of Object.entries(result)) {
      const safeKey = k.replace(/[^a-zA-Z0-9_ -]/g, '').substring(0, 50)
      if (!safeKey) continue
      safeResult[safeKey] = Array.isArray(v) ? v.map(sanitize) : sanitize(String(v))
    }
    const desc = typeof safeResult.description === 'string' ? safeResult.description.substring(0, 200) : null
    return { description: desc, frontmatter: safeResult }
  } catch { return { description: null, frontmatter: {} } }
}

/** Simple description-only extraction (for non-skill elements) */
async function extractDescription(filePath: string): Promise<string | null> {
  const result = await extractFrontmatter(filePath)
  return result.description
}

interface PluginElements {
  pluginName: string
  pluginKey: string
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
    if (semverDirs.length > 0) {
      semverDirs.sort(semver.rcompare)
      return join(pluginDir, semverDirs[0])
    }
    // No semver dirs — use the most recently modified directory (handles git hashes, timestamps, etc.)
    dirs.sort()
    return join(pluginDir, dirs[dirs.length - 1])
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
        const fm = await extractFrontmatter(fullPath)
        results.push({
          name: entry.replace(/\.md$/, ''),
          path: fullPath,
          sourcePlugin: pluginName,
          sourceMarketplace: marketplace,
          description: fm.description,
          type,
          frontmatter: Object.keys(fm.frontmatter).length > 0 ? fm.frontmatter : undefined,
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
          const fm = await extractFrontmatter(skillFile)
          results.push({
            name: entry,
            path: fullPath,
            sourcePlugin: pluginName,
            sourceMarketplace: marketplace,
            description: fm.description,
            type: 'skill',
            frontmatter: Object.keys(fm.frontmatter).length > 0 ? fm.frontmatter : undefined,
          })
        }
      }
    }
    return results
  } catch {
    return []
  }
}

/** Parse hooks from hooks/hooks.json — generates descriptive names */
async function listHooks(versionDir: string, pluginName: string, marketplace: string): Promise<ElementInfo[]> {
  const hooksJsonPath = join(versionDir, 'hooks', 'hooks.json')
  if (!existsSync(hooksJsonPath)) return []
  try {
    const content = await readFile(hooksJsonPath, 'utf-8')
    const parsed = JSON.parse(content)
    const hooksObj = parsed.hooks || parsed
    const results: ElementInfo[] = []
    let hookIdx = 0
    for (const event of Object.keys(hooksObj)) {
      const eventHooks = hooksObj[event]
      if (Array.isArray(eventHooks)) {
        for (const hookGroup of eventHooks) {
          hookIdx++
          const matcher = hookGroup.matcher || ''
          const cmd = hookGroup.command || ''
          const isSync = hookGroup.sync === true
          const isPrompt = hookGroup.type === 'prompt'
          // Build descriptive name: Event_type_matcher_sync_plugin_hook_N
          const parts: string[] = [event]
          if (isPrompt) {
            parts.push('prompt')
          } else if (cmd) {
            // Extract script/binary name from command path
            const cmdName = cmd.split('/').pop()?.replace(/\.[^.]+$/, '') || cmd.split(' ')[0]
            parts.push('command', cmdName)
          }
          if (matcher && matcher !== '*') parts.push(matcher)
          if (isSync) parts.push('sync')
          else parts.push('async')
          parts.push(pluginName, `hook_${hookIdx}`)
          const name = parts.join('_')
          // Store the full hook entry as JSON in description for element-specific preview
          const hookJson = JSON.stringify(hookGroup, null, 2)
          results.push({
            name,
            path: hooksJsonPath,
            sourcePlugin: pluginName,
            sourceMarketplace: marketplace,
            description: hookJson,
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
    // Some plugins use { mcpServers: { ... } }, others put servers at root level
    const servers = parsed.mcpServers || (Object.values(parsed).some((v: unknown) => v && typeof v === 'object' && 'command' in (v as Record<string, unknown>)) ? parsed : {})
    return Object.keys(servers).map(name => {
      const srv = servers[name]
      // Store the individual server entry as JSON for element-specific preview
      const srvJson = JSON.stringify({ [name]: srv }, null, 2)
      return {
        name,
        path: mcpPath,
        sourcePlugin: pluginName,
        sourceMarketplace: marketplace,
        description: srvJson,
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
      const srvJson = JSON.stringify({ [name]: srv }, null, 2)
      return {
        name,
        path: lspPath,
        sourcePlugin: pluginName,
        sourceMarketplace: marketplace,
        description: srvJson,
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
        results.push({ pluginName, pluginKey: key, marketplace, enabled, version: versionName, sourceUrl, skills, agents, commands, hooks, rules, mcpServers, lspServers, outputStyles })
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

    // Scan standalone MCP/LSP servers from user-level configs (not from plugins)
    const standaloneMcp: ElementInfo[] = []
    const standaloneLsp: ElementInfo[] = []
    // Claude Code standalone MCP/LSP configs (NOT ~/.claude.json which is Claude Desktop)
    const configFiles = [
      join(HOME, '.claude', '.mcp.json'),
      join(HOME, '.claude', 'settings.json'),
      join(HOME, '.claude', 'settings.local.json'),
    ]
    const pluginMcpNames = new Set(results.flatMap(p => p.mcpServers.map(m => m.name)))
    const pluginLspNames = new Set(results.flatMap(p => p.lspServers.map(l => l.name)))
    for (const cfgPath of configFiles) {
      if (!existsSync(cfgPath)) continue
      try {
        const cfg = JSON.parse(await readFile(cfgPath, 'utf-8'))
        // MCP servers
        const mcpServers = cfg.mcpServers || {}
        for (const [name, srv] of Object.entries(mcpServers)) {
          if (pluginMcpNames.has(name)) continue // already from a plugin
          pluginMcpNames.add(name) // deduplicate across config files
          const srvJson = JSON.stringify({ [name]: srv }, null, 2)
          standaloneMcp.push({
            name,
            path: cfgPath,
            sourcePlugin: '(standalone)',
            sourceMarketplace: '(user config)',
            description: srvJson,
            type: 'mcp',
          })
        }
        // LSP servers
        const lspServers = cfg.lspServers || {}
        for (const [name, srv] of Object.entries(lspServers)) {
          if (pluginLspNames.has(name)) continue
          pluginLspNames.add(name)
          const srvJson = JSON.stringify({ [name]: srv }, null, 2)
          standaloneLsp.push({
            name,
            path: cfgPath,
            sourcePlugin: '(standalone)',
            sourceMarketplace: '(user config)',
            description: srvJson,
            type: 'lsp',
          })
        }
      } catch { /* ignore parse errors */ }
    }
    // Scan standalone user-level skills (~/.claude/skills/), rules (~/.claude/rules/), agents (~/.claude/agents/)
    const standaloneSkills: ElementInfo[] = []
    const standaloneRules: ElementInfo[] = []
    const standaloneAgents: ElementInfo[] = []
    const pluginSkillNames = new Set(results.flatMap(p => p.skills.map(s => s.name)))
    const pluginRuleNames = new Set(results.flatMap(p => p.rules.map(r => r.name)))
    const pluginAgentNames = new Set(results.flatMap(p => p.agents.map(a => a.name)))

    // Standalone skills
    const userSkillsDir = join(HOME, '.claude', 'skills')
    if (existsSync(userSkillsDir)) {
      try {
        for (const entry of await readdir(userSkillsDir)) {
          if (entry.startsWith('.') || pluginSkillNames.has(entry)) continue
          const skillDir = join(userSkillsDir, entry)
          const s = await stat(skillDir)
          if (!s.isDirectory()) continue
          const skillFile = join(skillDir, 'SKILL.md')
          if (!existsSync(skillFile)) continue
          const fm = await extractFrontmatter(skillFile)
          standaloneSkills.push({
            name: entry, path: skillDir, sourcePlugin: '(standalone)', sourceMarketplace: '(user config)',
            description: fm.description, type: 'skill',
            frontmatter: Object.keys(fm.frontmatter).length > 0 ? fm.frontmatter : undefined,
          })
        }
      } catch { /* ignore */ }
    }

    // Standalone rules
    const userRulesDir = join(HOME, '.claude', 'rules')
    if (existsSync(userRulesDir)) {
      try {
        for (const entry of await readdir(userRulesDir)) {
          if (entry.startsWith('.') || !entry.endsWith('.md')) continue
          const ruleName = entry.replace(/\.md$/, '')
          if (pluginRuleNames.has(ruleName)) continue
          const rulePath = join(userRulesDir, entry)
          const fm = await extractFrontmatter(rulePath)
          standaloneRules.push({
            name: ruleName, path: rulePath, sourcePlugin: '(standalone)', sourceMarketplace: '(user config)',
            description: fm.description, type: 'rule',
            frontmatter: Object.keys(fm.frontmatter).length > 0 ? fm.frontmatter : undefined,
          })
        }
      } catch { /* ignore */ }
    }

    // Standalone agents
    const userAgentsDir = join(HOME, '.claude', 'agents')
    if (existsSync(userAgentsDir)) {
      try {
        for (const entry of await readdir(userAgentsDir)) {
          if (entry.startsWith('.') || !entry.endsWith('.md')) continue
          const agentName = entry.replace(/\.md$/, '')
          if (pluginAgentNames.has(agentName)) continue
          const agentPath = join(userAgentsDir, entry)
          const fm = await extractFrontmatter(agentPath)
          standaloneAgents.push({
            name: agentName, path: agentPath, sourcePlugin: '(standalone)', sourceMarketplace: '(user config)',
            description: fm.description, type: 'agent',
            frontmatter: Object.keys(fm.frontmatter).length > 0 ? fm.frontmatter : undefined,
          })
        }
      } catch { /* ignore */ }
    }

    // Standalone hooks from settings.json (not from plugins)
    const standaloneHooks: ElementInfo[] = []
    const pluginHookNames = new Set(results.flatMap(p => p.hooks.map(h => h.name)))
    let settingsForHooks: Record<string, unknown> = {}
    try { settingsForHooks = JSON.parse(await readFile(SETTINGS_PATH, 'utf-8')) } catch { /* ignore */ }
    const hooksObj = (settingsForHooks as Record<string, unknown>).hooks as Record<string, unknown[]> | undefined
    if (hooksObj) {
      let hookIdx = 0
      for (const event of Object.keys(hooksObj)) {
        const eventHooks = hooksObj[event]
        if (!Array.isArray(eventHooks)) continue
        for (const hookGroup of eventHooks) {
          hookIdx++
          const hg = hookGroup as Record<string, unknown>
          const matcher = (hg.matcher as string) || ''
          const cmd = (hg.command as string) || ''
          const isSync = hg.sync === true
          const isPrompt = hg.type === 'prompt'
          // Build name same as plugin hooks
          const parts: string[] = [event]
          if (isPrompt) { parts.push('prompt') }
          else if (cmd) { parts.push('command', (cmd.split('/').pop()?.replace(/\.[^.]+$/, '') || cmd.split(' ')[0])) }
          if (matcher && matcher !== '*') parts.push(matcher)
          parts.push(isSync ? 'sync' : 'async')
          parts.push('standalone', `hook_${hookIdx}`)
          const name = parts.join('_')
          if (pluginHookNames.has(name)) continue
          const hookJson = JSON.stringify(hookGroup, null, 2)
          standaloneHooks.push({
            name, path: SETTINGS_PATH,
            sourcePlugin: '(standalone)', sourceMarketplace: '(user config)',
            description: hookJson, type: 'hook',
          })
        }
      }
    }

    // Update totals with all standalone elements
    totals.mcpServers += standaloneMcp.length
    totals.hooks += standaloneHooks.length
    totals.lspServers += standaloneLsp.length
    totals.skills += standaloneSkills.length
    totals.rules += standaloneRules.length
    totals.agents += standaloneAgents.length

    // Build flat elements array for the Elements tab card view
    const flatElements: (ElementInfo & { pluginEnabled: boolean; pluginVersion: string | null; pluginSourceUrl: string | null })[] = []
    for (const plugin of results) {
      const extra = { pluginEnabled: plugin.enabled, pluginVersion: plugin.version, pluginSourceUrl: plugin.sourceUrl }
      for (const el of [...plugin.skills, ...plugin.agents, ...plugin.commands, ...plugin.hooks, ...plugin.rules, ...plugin.mcpServers, ...plugin.lspServers, ...plugin.outputStyles]) {
        flatElements.push({ ...el, ...extra })
      }
    }
    // Add all standalone elements (always enabled, no plugin version)
    for (const el of [...standaloneMcp, ...standaloneLsp, ...standaloneSkills, ...standaloneRules, ...standaloneAgents, ...standaloneHooks]) {
      flatElements.push({ ...el, pluginEnabled: true, pluginVersion: null, pluginSourceUrl: null })
    }
    flatElements.sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ plugins: results, elements: flatElements, totals })
  } catch (error) {
    console.error('[global-elements] GET failed:', error)
    return NextResponse.json({ error: 'Failed to scan plugin elements' }, { status: 500 })
  }
}
