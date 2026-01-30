/**
 * Marketplace Types
 * Types for browsing skills from Claude Code marketplaces
 */

// ============================================================================
// Skill Types
// ============================================================================

/**
 * A skill that can be added to an agent
 * Skills are individual capabilities defined by SKILL.md files
 */
export interface MarketplaceSkill {
  // Identity
  id: string                      // Unique ID: marketplace:plugin:skill
  name: string                    // Skill name (from SKILL.md frontmatter or folder)
  description: string             // Skill description

  // Source
  marketplace: string             // Marketplace ID (e.g., "claude-plugins-official")
  marketplaceName?: string        // Human-readable marketplace name
  plugin: string                  // Plugin name (e.g., "code-review")
  pluginDescription?: string      // Plugin description

  // Metadata from SKILL.md frontmatter
  version?: string                // Skill version
  author?: string                 // Skill author
  allowedTools?: string[]         // Tools the skill can use
  userInvocable?: boolean         // Can user invoke directly

  // Location
  path: string                    // Absolute path to SKILL.md

  // Content (loaded on demand)
  content?: string                // Full SKILL.md content

  // Categorization
  category?: string               // Category (development, productivity, etc.)
  tags?: string[]                 // Tags for filtering

  // State
  isInstalled?: boolean           // Already installed on target agent
  installedAt?: string            // When installed (ISO timestamp)
}

/**
 * Parsed frontmatter from SKILL.md
 */
export interface SkillFrontmatter {
  name?: string
  description?: string
  'allowed-tools'?: string
  'user-invocable'?: boolean | string
  metadata?: {
    author?: string
    version?: string
  }
}

// ============================================================================
// Plugin Types
// ============================================================================

/**
 * A plugin from a marketplace
 * Plugins contain multiple skills, commands, agents, and hooks
 */
export interface MarketplacePlugin {
  // Identity
  name: string                    // Plugin name
  description?: string            // Plugin description
  version?: string                // Plugin version

  // Source
  marketplace: string             // Parent marketplace ID
  source: string | PluginSource   // Source path or URL

  // Author
  author?: PluginAuthor

  // Contents
  skills: MarketplaceSkill[]      // Skills in this plugin
  commands?: string[]             // Command names
  agents?: string[]               // Agent names
  hooks?: string[]                // Hook names

  // Categorization
  category?: string               // Plugin category
  keywords?: string[]             // Keywords for search
  homepage?: string               // Plugin homepage URL

  // LSP support (for language server plugins)
  lspServers?: Record<string, unknown>
}

export interface PluginSource {
  source: 'github' | 'url' | 'local'
  repo?: string                   // GitHub repo (org/name)
  url?: string                    // Git URL
  path?: string                   // Local path
}

export interface PluginAuthor {
  name: string
  email?: string
}

// ============================================================================
// Marketplace Types
// ============================================================================

/**
 * A marketplace (registry of plugins)
 * Marketplaces are GitHub repos that contain multiple plugins
 */
export interface Marketplace {
  // Identity
  id: string                      // Marketplace ID (e.g., "claude-plugins-official")
  name: string                    // Human-readable name
  description?: string            // Marketplace description

  // Source
  source: MarketplaceSource
  installLocation: string         // Local path where installed

  // Owner
  owner?: MarketplaceOwner

  // Metadata
  version?: string                // Marketplace version
  homepage?: string               // Homepage URL
  repository?: string             // Repository URL

  // Contents
  plugins: MarketplacePlugin[]    // Plugins in this marketplace

  // State
  lastUpdated?: string            // Last sync time (ISO timestamp)
  isLocal?: boolean               // Is this a local-only marketplace
}

export interface MarketplaceSource {
  source: 'github' | 'url' | 'local'
  repo?: string                   // GitHub repo (org/name)
  url?: string                    // Git URL
}

export interface MarketplaceOwner {
  name: string
  email?: string
}

// ============================================================================
// Agent Skills Configuration
// ============================================================================

/**
 * Skills configuration stored on an agent
 */
export interface AgentSkillsConfig {
  // Skills from marketplaces
  marketplace: InstalledMarketplaceSkill[]

  // AI Maestro built-in skills
  aiMaestro: {
    enabled: boolean              // Include AI Maestro skills?
    skills: string[]              // Which ones (all by default)
  }

  // Custom skills specific to this agent
  custom: CustomSkill[]
}

/**
 * A marketplace skill installed on an agent
 */
export interface InstalledMarketplaceSkill {
  id: string                      // Full skill ID (marketplace:plugin:skill)
  marketplace: string             // Source marketplace
  plugin: string                  // Source plugin
  name: string                    // Skill name
  version?: string                // Installed version
  installedAt: string             // When installed (ISO timestamp)
}

/**
 * A custom skill created specifically for an agent
 */
export interface CustomSkill {
  name: string                    // Skill name
  path: string                    // Relative path within agent folder
  content?: string                // Skill content (SKILL.md)
  createdAt: string               // When created
  updatedAt?: string              // When last modified
}

// ============================================================================
// API Types
// ============================================================================

/**
 * Response from GET /api/marketplace/skills
 */
export interface MarketplaceSkillsResponse {
  skills: MarketplaceSkill[]
  marketplaces: MarketplaceSummary[]
  stats: {
    totalSkills: number
    totalMarketplaces: number
    totalPlugins: number
  }
}

/**
 * Summary of a marketplace for listings
 */
export interface MarketplaceSummary {
  id: string
  name: string
  description?: string
  owner?: string
  pluginCount: number
  skillCount: number
  source: MarketplaceSource
}

/**
 * Query parameters for skill search
 */
export interface SkillSearchParams {
  marketplace?: string            // Filter by marketplace ID
  plugin?: string                 // Filter by plugin name
  category?: string               // Filter by category
  search?: string                 // Text search in name/description
  includeContent?: boolean        // Include full SKILL.md content
}

/**
 * Request to add skills to an agent
 */
export interface AddSkillsRequest {
  skillIds: string[]              // Skill IDs to add (marketplace:plugin:skill)
}

/**
 * Request to remove skills from an agent
 */
export interface RemoveSkillsRequest {
  skillIds: string[]              // Skill IDs to remove
}

/**
 * Request to create a custom skill
 */
export interface CreateCustomSkillRequest {
  name: string                    // Skill name
  content: string                 // SKILL.md content
  description?: string            // Optional description
}

// ============================================================================
// Export Package Extensions
// ============================================================================

/**
 * Extended export manifest with skills support
 */
export interface ExportManifestSkills {
  hasSkills: boolean
  skillStats?: {
    marketplace: number           // Count of marketplace skills
    aiMaestro: number             // Count of AI Maestro skills
    custom: number                // Count of custom skills
  }
  hasHooks: boolean
}

/**
 * Extended import options with skills support
 */
export interface ImportOptionsSkills {
  skipSkills?: boolean            // Don't import skills
  skipHooks?: boolean             // Don't import hooks
  skipAiMaestroSkills?: boolean   // Don't include AI Maestro skills
}
