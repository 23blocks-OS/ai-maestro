/**
 * Portable Agent Types
 * Types for exporting and importing agents between AI Maestro instances
 */

import type { Agent, Repository } from './agent'

/**
 * Export manifest that describes the exported agent package
 */
export interface AgentExportManifest {
  version: string              // Export format version (e.g., "1.0.0")
  exportedAt: string           // ISO timestamp
  exportedFrom: {
    hostname: string           // Source machine hostname
    platform: string           // Source OS platform
    aiMaestroVersion: string   // AI Maestro version
  }
  agent: {
    id: string                 // Original agent ID
    name: string               // Agent name (primary identifier)
    label?: string             // Optional display label
    // Deprecated fields for backwards compatibility
    alias?: string             // DEPRECATED: Use name instead
    displayName?: string       // DEPRECATED: Use label instead
  }
  contents: {
    hasRegistry: boolean       // Has registry.json (agent metadata)
    hasDatabase: boolean       // Has agent.db (CozoDB database)
    hasMessages: boolean       // Has messages directory
    messageStats?: {
      inbox: number            // Number of inbox messages
      sent: number             // Number of sent messages
      archived: number         // Number of archived messages
    }
  }
  // Git repositories the agent works with (for cloning on import)
  repositories?: PortableRepository[]
  checksum?: string            // Optional SHA-256 checksum of contents
}

/**
 * Repository info for portable export (excludes local paths)
 */
export interface PortableRepository {
  name: string                 // Friendly name
  remoteUrl: string            // Git remote URL (required for cloning)
  defaultBranch?: string       // Default branch
  isPrimary?: boolean          // Is this the primary repo
  originalPath?: string        // Original local path (for reference only)
}

/**
 * Import options when importing an agent
 */
export interface AgentImportOptions {
  newName?: string             // Override the agent name
  newAlias?: string            // DEPRECATED: Use newName instead
  newId?: boolean              // Generate a new ID instead of keeping original
  skipMessages?: boolean       // Don't import messages
  overwrite?: boolean          // Overwrite existing agent with same name

  // Repository handling
  cloneRepositories?: boolean  // Whether to clone repos on import
  repositoryMappings?: RepositoryMapping[]  // Custom path mappings for repos
}

/**
 * Mapping of repository to local path on target machine
 */
export interface RepositoryMapping {
  remoteUrl: string            // The git remote URL to identify the repo
  localPath: string            // Where to clone or find the repo on target
  skip?: boolean               // Skip this repo (don't clone)
}

/**
 * Import result after importing an agent
 */
export interface AgentImportResult {
  success: boolean
  agent?: Agent
  warnings: string[]           // Non-fatal issues encountered
  errors: string[]             // Fatal errors
  stats: {
    registryImported: boolean
    databaseImported: boolean
    messagesImported: {
      inbox: number
      sent: number
      archived: number
    }
    repositoriesCloned?: number  // Number of repos cloned
    repositoriesSkipped?: number // Number of repos skipped
  }
  // Details about repository handling
  repositoryResults?: RepositoryImportResult[]
}

/**
 * Result of importing/cloning a single repository
 */
export interface RepositoryImportResult {
  name: string
  remoteUrl: string
  status: 'cloned' | 'skipped' | 'exists' | 'failed'
  localPath?: string           // Where the repo now exists
  error?: string               // Error message if failed
}

/**
 * Export result returned by the export API
 */
export interface AgentExportResult {
  success: boolean
  filename?: string
  size?: number
  manifest?: AgentExportManifest
  error?: string
}
