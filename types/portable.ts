/**
 * Portable Agent Types
 * Types for exporting and importing agents between AI Maestro instances
 */

import type { Agent } from './agent'

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
    alias: string              // Agent alias
    displayName?: string       // Display name
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
  checksum?: string            // Optional SHA-256 checksum of contents
}

/**
 * Import options when importing an agent
 */
export interface AgentImportOptions {
  newAlias?: string            // Override the agent alias
  newId?: boolean              // Generate a new ID instead of keeping original
  skipMessages?: boolean       // Don't import messages
  overwrite?: boolean          // Overwrite existing agent with same alias
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
  }
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
