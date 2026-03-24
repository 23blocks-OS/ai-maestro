/**
 * Agent Local Config Service
 *
 * Scans an agent's .claude/ directory to discover all locally installed
 * elements (skills, agents, hooks, rules, commands, MCP, LSP, plugins).
 *
 * Used by:
 *   GET /api/agents/[id]/local-config (Next.js route)
 *   Headless router equivalent
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import semver from 'semver'
import { getAgent } from '@/lib/agent-registry'
import type { ServiceResult } from '@/types/service'
import type {
  AgentLocalConfig,
  LocalSkill,
  LocalAgent,
  LocalHook,
  LocalRule,
  LocalCommand,
  LocalMcpServer,
  LocalLspServer,
  LocalOutputStyle,
  LocalPlugin,
  RolePlugin,
  GlobalDependencies,
} from '@/types/agent-local-config'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function scanAgentLocalConfig(agentId: string): ServiceResult<AgentLocalConfig> {
  try {
    const agent = getAgent(agentId)
    if (!agent) {
      return { error: 'Agent not found', status: 404 }
    }

    const workDir = agent.workingDirectory || agent.sessions?.[0]?.workingDirectory
    if (!workDir) {
      return { error: 'Agent has no working directory configured', status: 422 }
    }

    // Resolve to absolute path and validate it exists as a directory
    const resolvedWorkDir = path.resolve(workDir)
    if (!fs.existsSync(resolvedWorkDir) || !fs.statSync(resolvedWorkDir).isDirectory()) {
      return { error: 'Agent working directory does not exist', status: 422 }
    }

    const claudeDir = path.join(resolvedWorkDir, '.claude')
    if (!fs.existsSync(claudeDir)) {
      return {
        data: {
          workingDirectory: resolvedWorkDir,
          skills: [],
          agents: [],
          hooks: [],
          rules: [],
          commands: [],
          mcpServers: [],
          lspServers: [],
          outputStyles: [],
          plugins: [],
          rolePlugin: null,
          globalDependencies: null,
          settings: {},
          lastScanned: new Date().toISOString(),
        },
        status: 200,
      }
    }

    return { data: scanClaudeDirectory(claudeDir, resolvedWorkDir), status: 200 }
  } catch (error) {
    console.error('[agent-local-config] Scan error:', error)
    return { error: 'Failed to scan agent local config', status: 500 }
  }
}

// ---------------------------------------------------------------------------
// Scanner implementation
// ---------------------------------------------------------------------------

function scanClaudeDirectory(claudeDir: string, workDir: string): AgentLocalConfig {
  const settingsData = readJsonSafe(path.join(claudeDir, 'settings.local.json'))
  const { plugins, pluginEntries, rolePlugin, globalDependencies } = scanPlugins(claudeDir, settingsData, workDir)

  // Scan .claude/ subfolders for directly-installed elements
  const skills = scanSkills(claudeDir)
  const agents = scanAgents(claudeDir)
  const hooks = scanHooks(claudeDir)
  const rules = scanRules(claudeDir)
  const commands = scanCommands(claudeDir)
  const mcpServers = scanMcpServers(workDir)
  // LSP servers only exist inside plugins — no standalone scanning
  const lspServers: LocalLspServer[] = []
  const outputStyles = scanOutputStyles(claudeDir)

  // Also scan inside each non-Role-Plugin for bundled elements, tagging with sourcePlugin
  const seenSkills = new Set(skills.map(s => s.name))
  const seenAgents = new Set(agents.map(a => a.name))
  const seenHooks = new Set(hooks.map(h => `${h.name}:${h.eventType || ''}`))
  const seenRules = new Set(rules.map(r => r.name))
  const seenCommands = new Set(commands.map(c => c.name))
  const seenMcpServers = new Set(mcpServers.map(m => m.name))
  const seenLspServers = new Set(lspServers.map(l => l.name))
  const seenOutputStyles = new Set(outputStyles.map(o => o.name))

  for (const { path: pluginDir, name: pluginName } of pluginEntries) {
    for (const s of scanSkills(pluginDir)) {
      if (!seenSkills.has(s.name)) { skills.push({ ...s, sourcePlugin: pluginName }); seenSkills.add(s.name) }
    }
    for (const a of scanAgents(pluginDir)) {
      if (!seenAgents.has(a.name)) { agents.push({ ...a, sourcePlugin: pluginName }); seenAgents.add(a.name) }
    }
    for (const h of scanHooks(pluginDir)) {
      const key = `${h.name}:${h.eventType || ''}`
      if (!seenHooks.has(key)) { hooks.push({ ...h, sourcePlugin: pluginName }); seenHooks.add(key) }
    }
    for (const r of scanRules(pluginDir)) {
      if (!seenRules.has(r.name)) { rules.push({ ...r, sourcePlugin: pluginName }); seenRules.add(r.name) }
    }
    for (const c of scanCommands(pluginDir)) {
      if (!seenCommands.has(c.name)) { commands.push({ ...c, sourcePlugin: pluginName }); seenCommands.add(c.name) }
    }
    // Plugin MCP servers from .mcp.json at plugin root
    for (const m of scanPluginMcpServers(pluginDir)) {
      if (!seenMcpServers.has(m.name)) { mcpServers.push({ ...m, sourcePlugin: pluginName }); seenMcpServers.add(m.name) }
    }
    // Plugin LSP servers from .lsp.json at plugin root
    for (const l of scanPluginLspServers(pluginDir)) {
      if (!seenLspServers.has(l.name)) { lspServers.push({ ...l, sourcePlugin: pluginName }); seenLspServers.add(l.name) }
    }
    for (const o of scanOutputStyles(pluginDir)) {
      if (!seenOutputStyles.has(o.name)) { outputStyles.push({ ...o, sourcePlugin: pluginName }); seenOutputStyles.add(o.name) }
    }
  }

  return {
    workingDirectory: workDir,
    skills,
    agents,
    hooks,
    rules,
    commands,
    mcpServers,
    lspServers,
    outputStyles,
    plugins,
    rolePlugin,
    globalDependencies,
    settings: settingsData || {},
    lastScanned: new Date().toISOString(),
  }
}

function scanSkills(claudeDir: string): LocalSkill[] {
  const skillsDir = path.join(claudeDir, 'skills')
  if (!fs.existsSync(skillsDir)) return []

  const results: LocalSkill[] = []
  for (const entry of safeReaddir(skillsDir)) {
    const entryPath = path.join(skillsDir, entry)
    if (!fs.statSync(entryPath).isDirectory()) continue

    const skillMd = path.join(entryPath, 'SKILL.md')
    if (!fs.existsSync(skillMd)) continue

    const description = extractFrontmatterField(skillMd, 'description')
    results.push({ name: entry, path: entryPath, description: description || undefined })
  }
  return results
}

function scanAgents(claudeDir: string): LocalAgent[] {
  const agentsDir = path.join(claudeDir, 'agents')
  if (!fs.existsSync(agentsDir)) return []

  const results: LocalAgent[] = []
  for (const entry of safeReaddir(agentsDir)) {
    if (!entry.endsWith('.md')) continue
    const filePath = path.join(agentsDir, entry)
    const name = entry.replace(/\.md$/, '')
    const description = readFirstLine(filePath)
    results.push({ name, path: filePath, description: description || undefined })
  }
  return results
}

function scanHooks(claudeDir: string): LocalHook[] {
  const hooksDir = path.join(claudeDir, 'hooks')
  if (!fs.existsSync(hooksDir)) return []

  const hooksJson = readJsonSafe(path.join(hooksDir, 'hooks.json'))
  if (hooksJson && typeof hooksJson === 'object') {
    const results: LocalHook[] = []
    for (const [eventType, hooks] of Object.entries(hooksJson)) {
      if (!Array.isArray(hooks)) continue
      for (const hook of hooks) {
        const name = typeof hook === 'string' ? hook : (hook?.command || hook?.name || 'unnamed')
        results.push({ name: String(name), path: path.join(hooksDir, 'hooks.json'), eventType })
      }
    }
    return results
  }

  const results: LocalHook[] = []
  for (const entry of safeReaddir(hooksDir)) {
    const filePath = path.join(hooksDir, entry)
    if (fs.statSync(filePath).isDirectory()) continue
    results.push({ name: entry, path: filePath })
  }
  return results
}

function scanRules(claudeDir: string): LocalRule[] {
  const rulesDir = path.join(claudeDir, 'rules')
  if (!fs.existsSync(rulesDir)) return []

  const results: LocalRule[] = []
  for (const entry of safeReaddir(rulesDir)) {
    if (!entry.endsWith('.md')) continue
    const filePath = path.join(rulesDir, entry)
    const name = entry.replace(/\.md$/, '')
    const preview = readFirstLine(filePath)
    results.push({ name, path: filePath, preview: preview || undefined })
  }
  return results
}

function scanCommands(claudeDir: string): LocalCommand[] {
  const commandsDir = path.join(claudeDir, 'commands')
  if (!fs.existsSync(commandsDir)) return []

  const results: LocalCommand[] = []
  for (const entry of safeReaddir(commandsDir)) {
    if (!entry.endsWith('.md')) continue
    const filePath = path.join(commandsDir, entry)
    const name = entry.replace(/\.md$/, '')
    results.push({ name, path: filePath, trigger: `/${name}` })
  }
  return results
}

function scanOutputStyles(claudeDir: string): LocalOutputStyle[] {
  const osDir = path.join(claudeDir, 'output-styles')
  if (!fs.existsSync(osDir)) return []
  const results: LocalOutputStyle[] = []
  for (const entry of safeReaddir(osDir)) {
    if (entry.startsWith('.')) continue
    const filePath = path.join(osDir, entry)
    if (fs.statSync(filePath).isDirectory()) continue
    results.push({ name: entry.replace(/\.[^.]+$/, ''), path: filePath })
  }
  return results
}

function scanMcpServers(workDir: string): LocalMcpServer[] {
  // Local-scoped MCP servers are stored in ~/.claude.json under projects[workDir].mcpServers
  // Read directly for performance (polled every 4s). Modifications use `claude mcp` CLI.
  const claudeJson = readJsonSafe(path.join(os.homedir(), '.claude.json'))
  if (!claudeJson || typeof claudeJson !== 'object') return []

  const projects = (claudeJson as Record<string, unknown>).projects as Record<string, unknown> | undefined
  if (!projects || typeof projects !== 'object') return []

  const projectData = projects[workDir] as Record<string, unknown> | undefined
  if (!projectData || typeof projectData !== 'object') return []

  const servers = projectData.mcpServers as Record<string, unknown> | undefined
  if (!servers || typeof servers !== 'object') return []

  const results: LocalMcpServer[] = []
  for (const [name, config] of Object.entries(servers)) {
    if (!config || typeof config !== 'object') continue
    const cfg = config as Record<string, unknown>
    results.push({
      name,
      command: typeof cfg.command === 'string' ? cfg.command : undefined,
      args: Array.isArray(cfg.args) ? cfg.args.map(String) : undefined,
    })
  }
  return results
}

// No scanLspServers() — LSP servers only exist inside plugins (.lsp.json at plugin root)

/** Scan .mcp.json at plugin root for bundled MCP servers */
function scanPluginMcpServers(pluginDir: string): LocalMcpServer[] {
  const data = readJsonSafe(path.join(pluginDir, '.mcp.json'))
  if (!data || typeof data !== 'object') return []

  const servers = (data as Record<string, unknown>).mcpServers as Record<string, unknown> | undefined
  if (!servers || typeof servers !== 'object') return []

  const results: LocalMcpServer[] = []
  for (const [name, config] of Object.entries(servers)) {
    if (!config || typeof config !== 'object') continue
    const cfg = config as Record<string, unknown>
    results.push({
      name,
      command: typeof cfg.command === 'string' ? cfg.command : undefined,
      args: Array.isArray(cfg.args) ? cfg.args.map(String) : undefined,
    })
  }
  return results
}

/** Scan .lsp.json at plugin root for bundled LSP servers */
function scanPluginLspServers(pluginDir: string): LocalLspServer[] {
  const data = readJsonSafe(path.join(pluginDir, '.lsp.json'))
  if (!data || typeof data !== 'object') return []

  const results: LocalLspServer[] = []
  for (const [name, config] of Object.entries(data as Record<string, unknown>)) {
    if (!config || typeof config !== 'object') continue
    const cfg = config as Record<string, unknown>
    const command = typeof cfg.command === 'string' ? cfg.command : ''
    const extToLang = cfg.extensionToLanguage as Record<string, string> | undefined
    const languages = extToLang ? Object.values(extToLang) : []
    results.push({ name, command, languages })
  }
  return results
}

function scanPlugins(
  claudeDir: string,
  settingsData: Record<string, unknown> | null,
  workDir: string,
): { plugins: LocalPlugin[]; pluginEntries: { path: string; name: string }[]; rolePlugin: RolePlugin | null; globalDependencies: GlobalDependencies | null } {
  const plugins: LocalPlugin[] = []
  const pluginEntries: { path: string; name: string }[] = []
  let rolePlugin: RolePlugin | null = null
  let globalDependencies: GlobalDependencies | null = null

  // Build a map of plugin key → enabled state from settings.local.json
  const enabledMap = new Map<string, boolean>()
  if (settingsData) {
    const ep = settingsData.enabledPlugins as Record<string, boolean> | undefined
    if (ep && typeof ep === 'object') {
      for (const [key, enabled] of Object.entries(ep)) {
        enabledMap.set(key, !!enabled)
      }
    }
  }

  const allPluginPaths = collectPluginPaths(claudeDir, settingsData, workDir)
  const seenPluginPaths = new Set<string>()

  for (const pluginPath of allPluginPaths) {
    if (!fs.existsSync(pluginPath)) continue
    seenPluginPaths.add(pluginPath)

    const manifestPath = path.join(pluginPath, '.claude-plugin', 'plugin.json')
    let pluginName = path.basename(pluginPath)
    let description: string | undefined

    const manifest = readJsonSafe(manifestPath)
    if (manifest && typeof manifest === 'object') {
      const m = manifest as Record<string, unknown>
      // IS-1: Sanitize pluginName to prevent path traversal via malicious plugin.json
      if (typeof m.name === 'string') pluginName = path.basename(m.name)
      if (typeof m.description === 'string') description = m.description
    }

    // Find the plugin key from the enabledMap
    const pluginKey = findPluginKey(enabledMap, pluginName) || undefined

    // Role-Plugin: quad-match rule (all 4 must be satisfied)
    //   1. plugin.json name == pluginName
    //   2. <plugin-name>.agent.toml exists at plugin root
    //   3. [agent].name inside TOML == pluginName
    //   4. agents/<plugin-name>-main-agent.md exists with matching frontmatter name
    const agentTomlPath = path.join(pluginPath, `${pluginName}.agent.toml`)
    if (fs.existsSync(agentTomlPath)) {
      const tomlAgentName = extractTomlAgentName(agentTomlPath)
      const mainAgentName = `${pluginName}-main-agent`
      const mainAgentPath = path.join(pluginPath, 'agents', `${mainAgentName}.md`)
      const mainAgentExists = fs.existsSync(mainAgentPath)
      const mainAgentFrontmatterName = mainAgentExists ? extractFrontmatterField(mainAgentPath, 'name') : null

      if (
        tomlAgentName === pluginName &&
        mainAgentExists &&
        mainAgentFrontmatterName === mainAgentName
      ) {
        if (!rolePlugin) {
          // First Role-Plugin found becomes the official one
          rolePlugin = {
            name: pluginName,
            profilePath: agentTomlPath,
            mainAgentName,
            mainAgentPath,
          }
          globalDependencies = extractTomlDependencies(agentTomlPath)
          // Also scan role plugin's bundled elements (skills, agents, hooks, etc.)
          pluginEntries.push({ path: pluginPath, name: pluginName })
        } else {
          // Additional Role-Plugins are conflicts — show in Plugins tab with warning
          plugins.push({ name: pluginName, key: pluginKey, path: pluginPath, description, enabled: true, isConflictingRolePlugin: true })
          pluginEntries.push({ path: pluginPath, name: pluginName })
        }
        continue
      }
    }

    plugins.push({ name: pluginName, key: pluginKey, path: pluginPath, description, enabled: true })
    pluginEntries.push({ path: pluginPath, name: pluginName })
  }

  // Also collect DISABLED plugins from enabledPlugins (enabled: false) so the UI can show toggles
  for (const [key, enabled] of enabledMap.entries()) {
    if (enabled) continue
    const pluginPath = resolvePluginKeyToPath(key)
    if (!pluginPath || seenPluginPaths.has(pluginPath)) continue
    if (!fs.existsSync(pluginPath)) continue

    const manifestPath = path.join(pluginPath, '.claude-plugin', 'plugin.json')
    let pluginName = path.basename(pluginPath)
    let description: string | undefined

    const manifest = readJsonSafe(manifestPath)
    if (manifest && typeof manifest === 'object') {
      const m = manifest as Record<string, unknown>
      if (typeof m.name === 'string') pluginName = path.basename(m.name)
      if (typeof m.description === 'string') description = m.description
    }

    plugins.push({ name: pluginName, key, path: pluginPath, description, enabled: false })
    // Do NOT add to pluginEntries — disabled plugins should not have their elements scanned
  }

  return { plugins, pluginEntries, rolePlugin, globalDependencies }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectPluginPaths(claudeDir: string, settingsData: Record<string, unknown> | null, workDir: string): string[] {
  const paths = new Set<string>()

  if (settingsData) {
    extractPluginPathsFromSettings(settingsData, claudeDir, workDir, paths)
    extractEnabledPluginPaths(settingsData, paths)
  }

  const projectSettings = readJsonSafe(path.join(claudeDir, 'settings.json'))
  if (projectSettings) {
    extractPluginPathsFromSettings(projectSettings as Record<string, unknown>, claudeDir, workDir, paths)
    extractEnabledPluginPaths(projectSettings as Record<string, unknown>, paths)
  }

  return Array.from(paths)
}

/**
 * Handle the `enabledPlugins` format used by Haephestos / role-plugin-service.
 * Keys are `<pluginName>@<marketplaceName>`, values are boolean.
 * Resolves `ai-maestro-local-roles-marketplace` to `~/agents/role-plugins/plugins/<name>/`.
 */
function extractEnabledPluginPaths(settings: Record<string, unknown>, paths: Set<string>) {
  const ep = settings.enabledPlugins as Record<string, boolean> | undefined
  if (!ep || typeof ep !== 'object') return

  const homeDir = os.homedir()
  const localMarketplaceDir = path.join(homeDir, 'agents', 'role-plugins', 'plugins')

  const LOCAL_MARKETPLACE_NAME = 'ai-maestro-local-roles-marketplace'

  for (const [key, enabled] of Object.entries(ep)) {
    if (!enabled) continue
    const atIdx = key.lastIndexOf('@')
    if (atIdx <= 0) continue
    const pluginName = key.substring(0, atIdx)
    const marketplaceName = key.substring(atIdx + 1)

    // Resolve marketplace name to directory path
    if (marketplaceName === LOCAL_MARKETPLACE_NAME) {
      const pluginPath = path.join(localMarketplaceDir, pluginName)
      if (fs.existsSync(pluginPath)) {
        paths.add(pluginPath)
      }
    }
    // Other marketplace types can be added here in the future
  }
}

/** Find the enabledPlugins key matching a plugin name */
function findPluginKey(enabledMap: Map<string, boolean>, pluginName: string): string | null {
  for (const key of enabledMap.keys()) {
    const atIdx = key.lastIndexOf('@')
    const name = atIdx > 0 ? key.substring(0, atIdx) : key
    if (name === pluginName) return key
  }
  return null
}

/** Resolve a plugin key (name@marketplace) to a filesystem path */
function resolvePluginKeyToPath(key: string): string | null {
  const atIdx = key.lastIndexOf('@')
  if (atIdx <= 0) return null
  const pluginName = key.substring(0, atIdx)
  const marketplaceName = key.substring(atIdx + 1)

  const homeDir = os.homedir()
  const LOCAL_MARKETPLACE_NAME = 'ai-maestro-local-roles-marketplace'

  if (marketplaceName === LOCAL_MARKETPLACE_NAME) {
    return path.join(homeDir, 'agents', 'role-plugins', 'plugins', pluginName)
  }

  // Try the global cache directory
  const cachePath = path.join(homeDir, '.claude', 'plugins', 'cache', marketplaceName, pluginName)
  if (fs.existsSync(cachePath)) {
    // Return latest version
    const allVersions = safeReaddir(cachePath).filter(e => !e.startsWith('.'))
    if (allVersions.length > 0) {
      const semverVersions = allVersions.filter(e => semver.valid(e))
      if (semverVersions.length > 0) {
        semverVersions.sort(semver.rcompare)
        return path.join(cachePath, semverVersions[0])
      }
      // Fallback for non-semver version dirs (git hashes, timestamps)
      allVersions.sort()
      return path.join(cachePath, allVersions[allVersions.length - 1])
    }
  }

  return null
}

function extractPluginPathsFromSettings(
  settings: Record<string, unknown>,
  claudeDir: string,
  workDir: string,
  paths: Set<string>,
) {
  const plugins = settings.plugins as Array<{ path?: string }> | undefined
  if (!Array.isArray(plugins)) return

  const homeDir = os.homedir()
  const resolvedWorkDir = path.resolve(workDir)

  for (const plugin of plugins) {
    if (typeof plugin?.path === 'string') {
      // CP-3: Expand tilde to home directory before resolving
      const expanded = plugin.path.startsWith('~/')
        ? path.join(homeDir, plugin.path.slice(2))
        : plugin.path
      const resolved = path.isAbsolute(expanded)
        ? expanded
        : path.resolve(path.dirname(claudeDir), expanded)
      // IS-5: Scope validation — only allow paths within workDir or homedir
      if (!resolved.startsWith(resolvedWorkDir) && !resolved.startsWith(homeDir)) {
        console.warn(`[agent-local-config] Skipping out-of-scope plugin path: ${resolved}`)
        continue
      }
      paths.add(resolved)
    }
  }
}

function extractTomlAgentName(tomlPath: string): string | null {
  try {
    const content = fs.readFileSync(tomlPath, 'utf-8')
    const agentMatch = content.match(/\[agent\]\s*\n([\s\S]*?)(?=\n\[|\n*$)/)
    if (!agentMatch) return null
    const nameMatch = agentMatch[1].match(/^\s*name\s*=\s*"([^"]+)"/m)
    return nameMatch ? nameMatch[1] : null
  } catch {
    return null
  }
}

function extractTomlDependencies(tomlPath: string): GlobalDependencies | null {
  try {
    const content = fs.readFileSync(tomlPath, 'utf-8')
    const depsMatch = content.match(/\[dependencies\]\s*\n([\s\S]*?)(?=\n\[|\n*$)/)
    if (!depsMatch) return null

    const section = depsMatch[1]
    const parseTOMLArray = (key: string): string[] => {
      const match = section.match(new RegExp(`^\\s*${escapeRegex(key)}\\s*=\\s*\\[([^\\]]*)]`, 'm'))
      if (!match) return []
      return match[1]
        .split(',')
        .map(s => s.trim().replace(/^"|"$/g, '').trim())
        .filter(Boolean)
    }

    return {
      plugins: parseTOMLArray('plugins'),
      skills: parseTOMLArray('skills'),
      mcpServers: parseTOMLArray('mcp_servers'),
      scripts: parseTOMLArray('scripts'),
      hooks: parseTOMLArray('hooks'),
      tools: parseTOMLArray('tools'),
      output_styles: parseTOMLArray('output_styles'),
    }
  } catch {
    return null
  }
}

// IS-3/IS-4: Escape special regex characters to prevent ReDoS
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function readJsonSafe(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function safeReaddir(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath).filter(e => !e.startsWith('.'))
  } catch {
    return []
  }
}

function readFirstLine(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      if (trimmed.startsWith('#')) return trimmed.replace(/^#+\s*/, '')
      return trimmed
    }
    return null
  } catch {
    return null
  }
}

function extractFrontmatterField(filePath: string, field: string): string | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    if (!content.startsWith('---')) return null
    const endIdx = content.indexOf('---', 3)
    if (endIdx === -1) return null
    const frontmatter = content.slice(3, endIdx)
    const match = frontmatter.match(new RegExp(`^\\s*${escapeRegex(field)}:\\s*(.+)$`, 'm'))
    return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : null
  } catch {
    return null
  }
}
