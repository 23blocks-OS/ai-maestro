/**
 * Marketplace Skills Library
 *
 * Reads skills from Claude Code's marketplace system.
 * Location: ~/.claude/plugins/
 *
 * Structure:
 * ~/.claude/plugins/
 * ├── known_marketplaces.json     # Registered marketplaces
 * ├── marketplaces/               # Cloned marketplace repos
 * │   ├── claude-plugins-official/
 * │   │   ├── .claude-plugin/marketplace.json
 * │   │   └── plugins/
 * │   │       └── code-review/
 * │   │           ├── .claude-plugin/plugin.json
 * │   │           └── skills/ or commands/
 * │   └── ai-maestro-marketplace/
 * │       └── plugin/skills/
 */

import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import matter from 'gray-matter'
import type {
  Marketplace,
  MarketplacePlugin,
  MarketplaceSkill,
  MarketplaceSummary,
  MarketplaceSkillsResponse,
  SkillFrontmatter,
  SkillSearchParams,
} from '@/types/marketplace'

// ============================================================================
// Constants
// ============================================================================

const CLAUDE_PLUGINS_DIR = path.join(os.homedir(), '.claude', 'plugins')
const KNOWN_MARKETPLACES_FILE = path.join(CLAUDE_PLUGINS_DIR, 'known_marketplaces.json')
const MARKETPLACES_DIR = path.join(CLAUDE_PLUGINS_DIR, 'marketplaces')

// AI Maestro built-in skills (auto-included with every agent)
export const AI_MAESTRO_SKILLS = [
  'agent-messaging',
  'docs-search',
  'graph-query',
  'memory-search',
  'planning',
]

// ============================================================================
// Marketplace Reading
// ============================================================================

interface KnownMarketplace {
  source: {
    source: 'github' | 'url'
    repo?: string
    url?: string
  }
  installLocation: string
  lastUpdated?: string
}

/**
 * Read known_marketplaces.json to get registered marketplaces
 */
export async function getKnownMarketplaces(): Promise<Record<string, KnownMarketplace>> {
  try {
    const content = await fs.readFile(KNOWN_MARKETPLACES_FILE, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    console.error('Error reading known_marketplaces.json:', error)
    return {}
  }
}

/**
 * Read marketplace.json from a marketplace directory
 */
async function readMarketplaceJson(marketplaceDir: string): Promise<{
  name: string
  description?: string
  owner?: { name: string; email?: string }
  metadata?: { description?: string; version?: string; homepage?: string; repository?: string }
  plugins?: Array<{
    name: string
    description?: string
    version?: string
    source: string | { source: string; repo?: string; url?: string }
    category?: string
    keywords?: string[]
    homepage?: string
    author?: { name: string; email?: string }
    lspServers?: Record<string, unknown>
  }>
} | null> {
  const marketplaceJsonPath = path.join(marketplaceDir, '.claude-plugin', 'marketplace.json')
  try {
    const content = await fs.readFile(marketplaceJsonPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    // marketplace.json might not exist for all marketplaces
    return null
  }
}

/**
 * Read plugin.json from a plugin directory
 */
async function readPluginJson(pluginDir: string): Promise<{
  name: string
  description?: string
  version?: string
  author?: { name: string; email?: string }
} | null> {
  const pluginJsonPath = path.join(pluginDir, '.claude-plugin', 'plugin.json')
  try {
    const content = await fs.readFile(pluginJsonPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

/**
 * Find all SKILL.md files in a directory (recursive)
 */
async function findSkillFiles(dir: string): Promise<string[]> {
  const skillFiles: string[] = []

  async function scan(currentDir: string, depth: number = 0) {
    // Limit depth to avoid scanning too deep
    if (depth > 5) return

    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name)

        if (entry.isFile() && entry.name === 'SKILL.md') {
          skillFiles.push(fullPath)
        } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await scan(fullPath, depth + 1)
        }
      }
    } catch {
      // Directory not accessible
    }
  }

  await scan(dir)
  return skillFiles
}

/**
 * Parse SKILL.md frontmatter
 */
function parseSkillFrontmatter(content: string): SkillFrontmatter {
  try {
    const parsed = matter(content)
    return parsed.data as SkillFrontmatter
  } catch {
    return {}
  }
}

/**
 * Extract skill info from SKILL.md path and content
 */
function extractSkillInfo(
  skillPath: string,
  marketplaceId: string,
  marketplaceName: string,
  pluginName: string,
  pluginDescription: string | undefined,
  category: string | undefined,
  content?: string
): MarketplaceSkill {
  // Skill name from folder
  const skillFolder = path.basename(path.dirname(skillPath))

  // Parse frontmatter if content provided
  let frontmatter: SkillFrontmatter = {}
  if (content) {
    frontmatter = parseSkillFrontmatter(content)
  }

  // Build skill ID: marketplace:plugin:skill
  const skillId = `${marketplaceId}:${pluginName}:${frontmatter.name || skillFolder}`

  return {
    id: skillId,
    name: frontmatter.name || skillFolder,
    description: frontmatter.description || `Skill from ${pluginName}`,
    marketplace: marketplaceId,
    marketplaceName,
    plugin: pluginName,
    pluginDescription,
    version: frontmatter.metadata?.version,
    author: frontmatter.metadata?.author,
    allowedTools: frontmatter['allowed-tools']?.split(',').map(t => t.trim()),
    userInvocable: frontmatter['user-invocable'] === true || frontmatter['user-invocable'] === 'true',
    path: skillPath,
    category,
    content: content,
  }
}

/**
 * Read skills from a plugin directory
 */
async function readPluginSkills(
  pluginDir: string,
  marketplaceId: string,
  marketplaceName: string,
  pluginInfo: {
    name: string
    description?: string
    category?: string
  },
  includeContent: boolean = false
): Promise<MarketplaceSkill[]> {
  const skills: MarketplaceSkill[] = []

  // Look for skills in common locations
  const skillLocations = [
    path.join(pluginDir, 'skills'),
    path.join(pluginDir, 'plugin', 'skills'),
    path.join(pluginDir, 'commands'),
  ]

  for (const location of skillLocations) {
    try {
      await fs.access(location)
      const skillFiles = await findSkillFiles(location)

      for (const skillPath of skillFiles) {
        let content: string | undefined
        if (includeContent) {
          try {
            content = await fs.readFile(skillPath, 'utf-8')
          } catch {
            // Skip if can't read
          }
        } else {
          // Read just frontmatter for metadata
          try {
            content = await fs.readFile(skillPath, 'utf-8')
          } catch {
            // Skip if can't read
          }
        }

        const skill = extractSkillInfo(
          skillPath,
          marketplaceId,
          marketplaceName,
          pluginInfo.name,
          pluginInfo.description,
          pluginInfo.category,
          content
        )

        // Only include content if requested
        if (!includeContent) {
          delete skill.content
        }

        skills.push(skill)
      }
    } catch {
      // Location doesn't exist
    }
  }

  return skills
}

/**
 * Read all skills from a marketplace
 */
async function readMarketplaceSkills(
  marketplaceId: string,
  marketplaceInfo: KnownMarketplace,
  includeContent: boolean = false
): Promise<Marketplace | null> {
  const marketplaceDir = marketplaceInfo.installLocation

  try {
    await fs.access(marketplaceDir)
  } catch {
    return null
  }

  // Read marketplace.json
  const marketplaceJson = await readMarketplaceJson(marketplaceDir)

  const marketplace: Marketplace = {
    id: marketplaceId,
    name: marketplaceJson?.name || marketplaceId,
    description: marketplaceJson?.metadata?.description,
    source: marketplaceInfo.source,
    installLocation: marketplaceDir,
    owner: marketplaceJson?.owner,
    version: marketplaceJson?.metadata?.version,
    homepage: marketplaceJson?.metadata?.homepage,
    repository: marketplaceJson?.metadata?.repository,
    plugins: [],
    lastUpdated: marketplaceInfo.lastUpdated,
  }

  // If marketplace.json has plugins list, use it
  if (marketplaceJson?.plugins) {
    for (const pluginEntry of marketplaceJson.plugins) {
      // Resolve plugin path
      let pluginDir: string
      if (typeof pluginEntry.source === 'string') {
        // Relative path like "./plugins/code-review"
        pluginDir = path.join(marketplaceDir, pluginEntry.source)
      } else if (pluginEntry.source?.source === 'url') {
        // External plugin - skip for now
        continue
      } else {
        pluginDir = path.join(marketplaceDir, 'plugins', pluginEntry.name)
      }

      const skills = await readPluginSkills(
        pluginDir,
        marketplaceId,
        marketplace.name,
        {
          name: pluginEntry.name,
          description: pluginEntry.description,
          category: pluginEntry.category,
        },
        includeContent
      )

      // Normalize source to string or PluginSource type
      const normalizedSource = typeof pluginEntry.source === 'string'
        ? pluginEntry.source
        : {
            source: (pluginEntry.source?.source || 'local') as 'github' | 'url' | 'local',
            repo: pluginEntry.source?.repo,
            url: pluginEntry.source?.url,
          }

      const plugin: MarketplacePlugin = {
        name: pluginEntry.name,
        description: pluginEntry.description,
        version: pluginEntry.version,
        marketplace: marketplaceId,
        source: normalizedSource,
        author: pluginEntry.author,
        skills,
        category: pluginEntry.category,
        keywords: pluginEntry.keywords,
        homepage: pluginEntry.homepage,
        lspServers: pluginEntry.lspServers,
      }

      marketplace.plugins.push(plugin)
    }
  } else {
    // No marketplace.json - scan plugins directory
    const pluginsDir = path.join(marketplaceDir, 'plugins')
    try {
      const entries = await fs.readdir(pluginsDir, { withFileTypes: true })

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue

        const pluginDir = path.join(pluginsDir, entry.name)
        const pluginJson = await readPluginJson(pluginDir)

        const skills = await readPluginSkills(
          pluginDir,
          marketplaceId,
          marketplace.name,
          {
            name: pluginJson?.name || entry.name,
            description: pluginJson?.description,
          },
          includeContent
        )

        const plugin: MarketplacePlugin = {
          name: pluginJson?.name || entry.name,
          description: pluginJson?.description,
          version: pluginJson?.version,
          marketplace: marketplaceId,
          source: `./${entry.name}`,
          author: pluginJson?.author,
          skills,
        }

        marketplace.plugins.push(plugin)
      }
    } catch {
      // No plugins directory
    }

    // Also check for skills at the root level (like AI Maestro)
    const rootSkillsDir = path.join(marketplaceDir, 'plugin', 'skills')
    try {
      await fs.access(rootSkillsDir)
      const skills = await readPluginSkills(
        marketplaceDir,
        marketplaceId,
        marketplace.name,
        {
          name: marketplaceId,
          description: marketplace.description,
        },
        includeContent
      )

      if (skills.length > 0) {
        const plugin: MarketplacePlugin = {
          name: marketplaceId,
          description: marketplace.description,
          marketplace: marketplaceId,
          source: 'plugin',
          skills,
        }
        marketplace.plugins.push(plugin)
      }
    } catch {
      // No root skills
    }
  }

  return marketplace
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get all skills from all registered marketplaces
 */
export async function getAllMarketplaceSkills(
  params?: SkillSearchParams
): Promise<MarketplaceSkillsResponse> {
  const knownMarketplaces = await getKnownMarketplaces()
  const skills: MarketplaceSkill[] = []
  const marketplaces: MarketplaceSummary[] = []
  let totalPlugins = 0

  for (const [marketplaceId, marketplaceInfo] of Object.entries(knownMarketplaces)) {
    // Filter by marketplace if specified
    if (params?.marketplace && params.marketplace !== marketplaceId) {
      continue
    }

    const marketplace = await readMarketplaceSkills(
      marketplaceId,
      marketplaceInfo,
      params?.includeContent
    )

    if (!marketplace) continue

    let marketplaceSkillCount = 0

    for (const plugin of marketplace.plugins) {
      // Filter by plugin if specified
      if (params?.plugin && params.plugin !== plugin.name) {
        continue
      }

      totalPlugins++

      for (const skill of plugin.skills) {
        // Filter by category if specified
        if (params?.category && skill.category !== params.category) {
          continue
        }

        // Filter by search term if specified
        if (params?.search) {
          const searchLower = params.search.toLowerCase()
          const matches =
            skill.name.toLowerCase().includes(searchLower) ||
            skill.description.toLowerCase().includes(searchLower) ||
            skill.plugin.toLowerCase().includes(searchLower)

          if (!matches) continue
        }

        skills.push(skill)
        marketplaceSkillCount++
      }
    }

    marketplaces.push({
      id: marketplaceId,
      name: marketplace.name,
      description: marketplace.description,
      owner: marketplace.owner?.name,
      pluginCount: marketplace.plugins.length,
      skillCount: marketplaceSkillCount,
      source: marketplace.source,
    })
  }

  return {
    skills,
    marketplaces,
    stats: {
      totalSkills: skills.length,
      totalMarketplaces: marketplaces.length,
      totalPlugins,
    },
  }
}

/**
 * Get a specific skill by its full ID
 */
export async function getSkillById(
  skillId: string,
  includeContent: boolean = true
): Promise<MarketplaceSkill | null> {
  const [marketplaceId, pluginName, skillName] = skillId.split(':')
  if (!marketplaceId || !pluginName || !skillName) return null

  const result = await getAllMarketplaceSkills({
    marketplace: marketplaceId,
    plugin: pluginName,
    includeContent,
  })

  return result.skills.find(s => s.id === skillId) || null
}

/**
 * Get all skills from AI Maestro marketplace
 */
export async function getAiMaestroSkills(
  includeContent: boolean = false
): Promise<MarketplaceSkill[]> {
  const result = await getAllMarketplaceSkills({
    marketplace: 'ai-maestro-marketplace',
    includeContent,
  })

  // Filter to only built-in skills
  return result.skills.filter(s =>
    AI_MAESTRO_SKILLS.includes(s.name)
  )
}

/**
 * Get skill content (full SKILL.md) for a skill
 */
export async function getSkillContent(skillPath: string): Promise<string | null> {
  try {
    return await fs.readFile(skillPath, 'utf-8')
  } catch {
    return null
  }
}

/**
 * Check if Claude plugins directory exists
 */
export async function hasClaudePlugins(): Promise<boolean> {
  try {
    await fs.access(CLAUDE_PLUGINS_DIR)
    return true
  } catch {
    return false
  }
}

/**
 * Get marketplace summaries without loading all skills
 */
export async function getMarketplaceSummaries(): Promise<MarketplaceSummary[]> {
  const knownMarketplaces = await getKnownMarketplaces()
  const summaries: MarketplaceSummary[] = []

  for (const [marketplaceId, marketplaceInfo] of Object.entries(knownMarketplaces)) {
    const marketplace = await readMarketplaceSkills(marketplaceId, marketplaceInfo, false)

    if (!marketplace) continue

    const skillCount = marketplace.plugins.reduce((acc, p) => acc + p.skills.length, 0)

    summaries.push({
      id: marketplaceId,
      name: marketplace.name,
      description: marketplace.description,
      owner: marketplace.owner?.name,
      pluginCount: marketplace.plugins.length,
      skillCount,
      source: marketplace.source,
    })
  }

  return summaries
}
