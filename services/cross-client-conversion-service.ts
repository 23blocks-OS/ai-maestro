/**
 * Cross-Client Conversion Service
 *
 * Wraps lib/converter/ for use by API routes and UI.
 * Handles: scope resolution, GitHub URL detection, auto-detection,
 * plugin cache scanning, and progress tracking.
 *
 * Replaces the old cross-client-skill-service.ts (simple copy-based).
 */

import path from 'path'
import os from 'os'
import type { ConvertResult, ConvertOptions, ElementType, ProjectIR, ProviderId } from '@/lib/converter/types'
import { convert, scan } from '@/lib/converter/convert'
import { parseGitHubUrl } from '@/lib/converter/detect'
import { parseGitHubSource, downloadGitHubRepo, cleanupTempDir, getTempRoot } from '@/lib/converter/utils/github'
import { resolveHomePath, getProvider, PROVIDER_IDS } from '@/lib/converter/registry'
import { listDirs, fileExists } from '@/lib/converter/utils/fs'

export type { ConvertResult, ElementType, ProviderId }

/**
 * Convert elements from a source to a target client.
 * Handles GitHub URLs, local paths, and plugin cache paths.
 */
export async function convertElements(options: {
  source: string
  targetClient: ProviderId
  elements?: ElementType[]
  scope: 'user' | 'project'
  projectDir?: string
  dryRun?: boolean
  force?: boolean
}): Promise<ConvertResult> {
  const { source, targetClient, elements, scope, projectDir, dryRun, force } = options

  // Check if source is a GitHub URL
  const ghParsed = parseGitHubUrl(source)
  let sourceDir = source
  let tempDir: string | null = null

  if (ghParsed.isGitHub && ghParsed.owner && ghParsed.repo) {
    const ghSource = parseGitHubSource(source)
    sourceDir = await downloadGitHubRepo(ghSource)
    tempDir = getTempRoot(sourceDir)
  } else {
    sourceDir = resolveHomePath(source)
  }

  try {
    const result = await convert({
      dir: sourceDir,
      to: targetClient,
      elements,
      scope,
      projectDir,
      dryRun,
      force,
    })
    return result
  } finally {
    if (tempDir) {
      await cleanupTempDir(tempDir)
    }
  }
}

/**
 * List all elements installed for a given client at a given scope.
 */
export async function listClientElements(
  clientType: ProviderId,
  scope: 'user' | 'project',
  projectDir?: string
): Promise<{ skills: string[]; agents: string[]; instructions: string[] }> {
  const provider = getProvider(clientType)
  if (!provider) return { skills: [], agents: [], instructions: [] }

  let rootDir: string
  if (scope === 'user') {
    // Use HOME directly — userConfigDir varies across clients (e.g., ~/.config/opencode)
    // and the regex strip was wrong for non-dot-prefixed final segments like "opencode"
    rootDir = process.env.HOME || '/root'
  } else {
    rootDir = projectDir || process.cwd()
  }

  const project = await scan(rootDir, clientType)
  if (!project) return { skills: [], agents: [], instructions: [] }

  return {
    skills: project.skills.map(s => s.name),
    agents: project.agents.map(a => a.name),
    instructions: project.instructions.map(i => i.fileName),
  }
}

/**
 * Get conversion capabilities between two clients.
 * Returns which element types can be converted and any warnings.
 */
export async function getConversionCapabilities(
  sourceClient: ProviderId,
  targetClient: ProviderId
): Promise<{ supportedElements: ElementType[]; warnings: string[] }> {
  const source = getProvider(sourceClient)
  const target = getProvider(targetClient)
  if (!source || !target) {
    return { supportedElements: [], warnings: ['Unknown provider'] }
  }

  const supported: ElementType[] = ['skills'] // All providers support skills
  const warnings: string[] = []

  // Agents: all providers support agents (different formats)
  supported.push('agents')

  // Instructions: most have instruction files
  if (source.configFile && target.configFile) supported.push('instructions')

  // MCP: only if both have mcpConfigPath
  if (source.mcpConfigPath && target.mcpConfigPath) {
    supported.push('mcp')
  } else if (source.mcpConfigPath && !target.mcpConfigPath) {
    warnings.push(`MCP servers cannot be converted to ${target.displayName} (no MCP config support)`)
  }

  // Commands: only Claude, OpenCode, Gemini support them
  if (source.commandsPath) {
    if (target.commandsPath) {
      supported.push('commands')
    } else {
      supported.push('commands') // Will be converted to skills with warning
      warnings.push(`Commands will be converted to skills for ${target.displayName} (no native command support)`)
    }
  }

  // Hooks: only if both support hooks
  if (source.hooksPath && target.hooksPath) {
    supported.push('hooks')
  } else if (source.hooksPath && !target.hooksPath) {
    warnings.push(`Hooks cannot be converted to ${target.displayName} (no hook support)`)
  }

  return { supportedElements: supported, warnings }
}

/**
 * Get all available target clients for conversion (excluding source).
 */
export function getAvailableTargets(sourceClient: ProviderId): ProviderId[] {
  return PROVIDER_IDS.filter(id => id !== sourceClient)
}

// ═══════════════════════════════════════════════════════════════
// Role-Plugin Conversion (.agent.toml aware)
// ═══════════════════════════════════════════════════════════════

/**
 * Convert a role-plugin for a target client, respecting .agent.toml metadata.
 *
 * Key behaviors:
 * 1. If the plugin's .agent.toml already lists targetClient in compatible-clients → return original (no conversion)
 * 2. If conversion needed → convert and update compatible-clients in the output .agent.toml
 * 3. Role-plugins are identified by having a .agent.toml file (easier than content analysis)
 *
 * @returns The path/URL to the (possibly converted) plugin, or null if conversion failed
 */
export async function convertRolePluginForClient(options: {
  pluginPath: string        // Local path to the role-plugin directory
  targetClient: ProviderId  // Target client (e.g., 'codex', 'gemini')
  outputDir?: string        // Where to write converted plugin (defaults to temp dir)
}): Promise<{ path: string; converted: boolean; compatibleClients: string[] } | null> {
  const { pluginPath, targetClient, outputDir } = options
  const fs = await import('fs')
  const { readFile, writeFile, mkdir } = fs.promises

  // Find <plugin-name>.agent.toml in the plugin directory
  let tomlPath: string | null = null
  try {
    const entries = fs.readdirSync(pluginPath)
    const match = entries.find((e: string) => e.endsWith('.agent.toml'))
    if (match) tomlPath = path.join(pluginPath, match)
  } catch { /* ignore */ }

  if (!tomlPath) {
    // Not a role-plugin (no .agent.toml) — use generic conversion
    return null
  }

  // Read compatible-clients from .agent.toml
  try {
    const tomlContent = await readFile(tomlPath, 'utf-8')
    // Simple extraction of compatible-clients (avoid full TOML parser dependency)
    const clientMatch = tomlContent.match(/compatible-clients\s*=\s*\[([^\]]*)\]/)
    const existingClients: string[] = clientMatch
      ? clientMatch[1].split(',').map(s => s.trim().replace(/["']/g, '').toLowerCase()).filter(Boolean)
      : ['claude-code'] // default if not specified

    const normalizedTarget = targetClient.toLowerCase()

    // If target client is already compatible → return original, no conversion needed
    if (existingClients.includes(normalizedTarget)) {
      return { path: pluginPath, converted: false, compatibleClients: existingClients }
    }

    // Conversion needed: convert plugin and update compatible-clients
    const outDir = outputDir || path.join(os.tmpdir(), `aimaestro-converted-${Date.now()}`)
    await mkdir(outDir, { recursive: true })

    // Convert using the converter library
    const result = await convert({
      dir: pluginPath,
      to: targetClient,
      scope: 'project',
      projectDir: outDir,
    })

    if (!result.ok) {
      return null
    }

    // Update compatible-clients in the converted .agent.toml
    const convertedTomlPath = path.join(outDir, path.basename(tomlPath))
    if (fs.existsSync(convertedTomlPath)) {
      let convertedToml = await readFile(convertedTomlPath, 'utf-8')
      // Replace or add compatible-clients
      if (convertedToml.includes('compatible-clients')) {
        convertedToml = convertedToml.replace(
          /compatible-clients\s*=\s*\[[^\]]*\]/,
          `compatible-clients = ["${normalizedTarget}"]`
        )
      } else {
        // Add after compatible-titles line
        convertedToml = convertedToml.replace(
          /(compatible-titles\s*=\s*\[[^\]]*\])/,
          `$1\ncompatible-clients = ["${normalizedTarget}"]`
        )
      }
      await writeFile(convertedTomlPath, convertedToml, 'utf-8')
    }

    return { path: outDir, converted: true, compatibleClients: [normalizedTarget] }
  } catch {
    return null
  }
}

/**
 * Check if a role-plugin is compatible with a target client by reading its .agent.toml.
 * Returns true if no conversion is needed.
 */
export async function isRolePluginCompatibleWithClient(
  pluginPath: string,
  targetClient: string
): Promise<boolean> {
  const fs = await import('fs')
  try {
    const entries = fs.readdirSync(pluginPath)
    const tomlFile = entries.find((e: string) => e.endsWith('.agent.toml'))
    if (!tomlFile) return true // Not a role-plugin — assume compatible
    const tomlContent = fs.readFileSync(path.join(pluginPath, tomlFile), 'utf-8')
    const clientMatch = tomlContent.match(/compatible-clients\s*=\s*\[([^\]]*)\]/)
    if (!clientMatch) return targetClient.toLowerCase() === 'claude-code' // default is Claude-only
    const clients = clientMatch[1].split(',').map(s => s.trim().replace(/["']/g, '').toLowerCase()).filter(Boolean)
    return clients.includes(targetClient.toLowerCase())
  } catch {
    return true // If we can't read, assume compatible
  }
}

// ═══════════════════════════════════════════════════════════════
// Backward compatibility wrappers (for existing API routes)
// These delegate to the new converter library.
// ═══════════════════════════════════════════════════════════════

/**
 * Find a skill on disk (backward compat with old service).
 */
export async function findSkillSource(
  skillName: string,
  sourceClient: 'claude' | 'codex' | 'gemini'
): Promise<{ skillName: string; skillPath: string; scope: string; client: string } | null> {
  const providerMap: Record<string, ProviderId> = { claude: 'claude-code', codex: 'codex', gemini: 'gemini' }
  const providerId = providerMap[sourceClient]
  if (!providerId) return null

  const provider = getProvider(providerId)
  if (!provider) return null

  const userDir = resolveHomePath(provider.userSkillsPath)
  const skillDir = path.join(userDir, skillName)

  if (await fileExists(path.join(skillDir, 'SKILL.md'))) {
    return { skillName, skillPath: skillDir, scope: 'user', client: sourceClient }
  }

  // Check plugin cache for Claude
  if (sourceClient === 'claude') {
    const cacheDir = path.join(os.homedir(), '.claude', 'plugins', 'cache')
    try {
      const { scanPluginCache } = await import('@/lib/converter/utils/plugin')
      const plugins = await scanPluginCache()
      for (const plugin of plugins) {
        const pluginSkillDir = path.join(plugin.pluginDir, 'skills', skillName)
        if (await fileExists(path.join(pluginSkillDir, 'SKILL.md'))) {
          return { skillName, skillPath: pluginSkillDir, scope: 'plugin', client: sourceClient }
        }
      }
    } catch { /* */ }
  }

  return null
}

/**
 * List skills for a client (backward compat).
 * For Claude: also scans plugin cache (most skills live there, not in ~/.claude/skills/).
 */
export async function listClientSkills(clientType: 'claude' | 'codex' | 'gemini'): Promise<string[]> {
  const providerMap: Record<string, ProviderId> = { claude: 'claude-code', codex: 'codex', gemini: 'gemini' }
  const result = await listClientElements(providerMap[clientType] || 'claude-code', 'user')
  const skills = new Set(result.skills)

  // For Claude: also enumerate skills from plugin cache
  if (clientType === 'claude') {
    try {
      const { scanPluginCache } = await import('@/lib/converter/utils/plugin')
      const plugins = await scanPluginCache()
      for (const plugin of plugins) {
        const skillsDirPath = path.join(plugin.pluginDir, 'skills')
        const dirs = await listDirs(skillsDirPath)
        for (const dir of dirs) {
          if (await fileExists(path.join(skillsDirPath, dir, 'SKILL.md'))) {
            skills.add(dir)
          }
        }
      }
    } catch { /* plugin cache not accessible */ }
  }

  return [...skills].sort()
}

/**
 * Get conversion targets for a skill (backward compat).
 */
export async function getConversionTargets(
  skillName: string,
  sourceClient: 'claude' | 'codex' | 'gemini'
): Promise<string[]> {
  const providerMap: Record<string, ProviderId> = { claude: 'claude-code', codex: 'codex', gemini: 'gemini' }
  const reverseMap: Record<ProviderId, string> = { 'claude-code': 'claude', 'codex': 'codex', 'gemini': 'gemini', 'opencode': 'opencode', 'kiro': 'kiro' }
  const targets = getAvailableTargets(providerMap[sourceClient] || 'claude-code')
  return targets.map(t => reverseMap[t] || t)
}
