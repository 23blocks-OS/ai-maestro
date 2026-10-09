/**
 * CozoDB Database Manager for AI Maestro Agents
 *
 * Each agent gets its own embedded CozoDB database for:
 * - Conversations (relational)
 * - Vector embeddings (semantic search)
 * - Knowledge graph (entities & relationships)
 * - Full-text search
 */

import { CozoDb } from 'cozo-node'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { escapeForCozo } from './cozo-utils'
import { schemaDebug } from './schema-log'

/**
 * Database files whose schema this process has already initialised, keyed by
 * path and mapped to the file identity (inode + birth time) at that moment.
 * A recreated file has a new identity, so it is initialised again.
 */
const initialisedSchemas = new Map<string, string>()

function fileIdentity(p: string): string | null {
  try {
    const st = fs.statSync(p)
    return `${st.ino}:${st.birthtimeMs}`
  } catch {
    return null
  }
}

/** Test hook: forget which databases this process has initialised. */
export function _resetSchemaInitCache(): void {
  initialisedSchemas.clear()
}

export interface AgentDatabaseConfig {
  agentId: string
  workingDirectory?: string
  /**
   * Open for reads only: no metadata write, no schema migrations. For short
   * side connections (per-prompt memory recall) that must never take the
   * write lock from the agent's own connection.
   */
  readOnly?: boolean
}

export class AgentDatabase {
  private db: CozoDb | null = null
  private dbPath: string
  private agentId: string

  private readOnly: boolean
  private schemaFailed = false

  constructor(config: AgentDatabaseConfig) {
    this.agentId = config.agentId
    this.readOnly = Boolean(config.readOnly)

    // Database location: ~/.aimaestro/agents/{agentId}/agent.db
    const aiMaestroDir = path.join(os.homedir(), '.aimaestro', 'agents', config.agentId)
    this.dbPath = path.join(aiMaestroDir, 'agent.db')

    // Ensure directory exists
    if (!fs.existsSync(aiMaestroDir)) {
      fs.mkdirSync(aiMaestroDir, { recursive: true })
    }
  }

  /**
   * Initialize the database connection
   * Creates the database file if it doesn't exist
   */
  async initialize(): Promise<void> {
    try {
      // Create CozoDB instance with SQLite storage backend
      this.db = new CozoDb('sqlite', this.dbPath)

      // Test connection with a simple query (cozo-node returns a Promise)
      const result = await this.db.run('::relations')
      const identity = fileIdentity(this.dbPath)

      if (this.readOnly) return

      // Schema already initialised for this exact file in this process: skip the
      // ~45-table check. Short-lived opens per request would otherwise repeat it.
      if (identity && initialisedSchemas.get(this.dbPath) === identity) {
        schemaDebug(`[CozoDB] Schema already initialised for agent ${this.agentId}, skipping`)
        return
      }

      console.log(`[CozoDB] Initializing schema for agent ${this.agentId} (${this.dbPath}, ${result?.rows?.length ?? 0} existing relations)`)

      // Store agent metadata
      await this.initializeAgentMetadata()

      // Auto-migrate: Initialize RAG schema if not present
      await this.ensureRagSchema()

      // Auto-migrate: Initialize Memory schema if not present
      await this.ensureMemorySchema()

      // Auto-migrate: Initialize Phase 5 schema if not present
      await this.ensurePhase5Schema()

      // A failed migration is retried on the next open instead of being cached.
      if (!this.schemaFailed) {
        const after = fileIdentity(this.dbPath)
        if (after) initialisedSchemas.set(this.dbPath, after)
        console.log(`[CozoDB] Schema initialised for agent ${this.agentId}`)
      }
    } catch (error) {
      console.error(`[CozoDB] Failed to initialize database:`, error)
      throw error
    }
  }

  /**
   * Ensure RAG schema tables exist (auto-migration)
   */
  private async ensureRagSchema(): Promise<void> {
    try {
      const { initializeRagSchema } = await import('./cozo-schema-rag')
      await initializeRagSchema(this)
      schemaDebug(`[CozoDB] RAG schema migration complete`)
    } catch (error) {
      this.schemaFailed = true
      console.error(`[CozoDB] Failed to ensure RAG schema:`, error)
      // Don't throw - allow database to work without RAG features
    }
  }

  /**
   * Ensure Long-Term Memory schema tables exist (auto-migration)
   */
  private async ensureMemorySchema(): Promise<void> {
    try {
      const { initializeMemorySchema } = await import('./cozo-schema-memory')
      await initializeMemorySchema(this)
      schemaDebug(`[CozoDB] Memory schema migration complete`)
    } catch (error) {
      this.schemaFailed = true
      console.error(`[CozoDB] Failed to ensure Memory schema:`, error)
      // Don't throw - allow database to work without Memory features
    }
  }

  /**
   * Ensure Phase 5 schema tables exist (auto-migration)
   */
  private async ensurePhase5Schema(): Promise<void> {
    try {
      const { initializePhase5Schema } = await import('./cozo-schema-phase5')
      await initializePhase5Schema(this)
      schemaDebug(`[CozoDB] Phase 5 schema migration complete`)
    } catch (error) {
      this.schemaFailed = true
      console.error(`[CozoDB] Failed to ensure Phase 5 schema:`, error)
      // Don't throw - allow database to work without Phase 5 features
    }
  }

  /**
   * Initialize agent metadata table and store basic info
   */
  private async initializeAgentMetadata(): Promise<void> {
    try {
      // Create agent_metadata table if it doesn't exist
      await this.run(`
        :create agent_metadata {
          key: String,
          value: String,
          created_at: Int,
          updated_at: Int
        }
      `)

      console.log(`[CozoDB] Created agent_metadata table`)

      // Store agent creation timestamp
      const now = Date.now()
      await this.run(`
        ?[key, value, created_at, updated_at] <- [
          ['agent_id', ${escapeForCozo(this.agentId)}, ${now}, ${now}],
          ['created_at', ${escapeForCozo(String(now))}, ${now}, ${now}],
          ['db_version', '0.1.0', ${now}, ${now}]
        ]
        :put agent_metadata {key => value, created_at, updated_at}
      `)

      console.log(`[CozoDB] Stored agent metadata`)
    } catch (error) {
      // Table might already exist - check if we can query it
      try {
        const metadata = await this.run(`?[key, value] := *agent_metadata{key, value}`)
        schemaDebug(`[CozoDB] Agent metadata already exists:`, metadata)
      } catch (queryError) {
        console.error(`[CozoDB] Failed to initialize metadata:`, error)
        throw error
      }
    }
  }

  /**
   * Check if database is initialized
   */
  isInitialized(): boolean {
    return this.db !== null
  }

  /**
   * Execute a CozoDB query (Datalog or special commands)
   * @param query - CozoDB query string
   * @returns Query result
   */
  async run(query: string): Promise<any> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.')
    }

    try {
      return this.db.run(query)
    } catch (error) {
      console.error(`[CozoDB] Query failed:`, error)
      console.error(`[CozoDB] Query was:`, query)
      throw error
    }
  }

  /**
   * Get agent metadata
   */
  async getMetadata(): Promise<Record<string, string>> {
    const result = await this.run(`
      ?[key, value] := *agent_metadata{key, value}
    `)

    const metadata: Record<string, string> = {}
    if (result.rows) {
      for (const row of result.rows) {
        metadata[row[0]] = row[1]
      }
    }

    return metadata
  }

  /**
   * Get database file path
   */
  getPath(): string {
    return this.dbPath
  }

  /**
   * Check if database file exists
   */
  exists(): boolean {
    return fs.existsSync(this.dbPath)
  }

  /**
   * Get database file size in bytes
   */
  getSize(): number {
    if (!this.exists()) {
      return 0
    }
    const stats = fs.statSync(this.dbPath)
    return stats.size
  }

  /**
   * Get memory statistics (total messages, conversations indexed)
   */
  async getMemoryStats(): Promise<{
    totalMessages: number
    totalConversations: number
    totalVectors: number
    oldestMessage: number | null
    newestMessage: number | null
  }> {
    // Return defaults if database is not initialized (avoid log spam)
    if (!this.isInitialized()) {
      return {
        totalMessages: 0,
        totalConversations: 0,
        totalVectors: 0,
        oldestMessage: null,
        newestMessage: null
      }
    }

    try {
      // Count total messages
      const msgCountResult = await this.run(`?[count(msg_id)] := *messages{msg_id}`)
      const totalMessages = msgCountResult.rows?.[0]?.[0] || 0

      // Count unique conversation files
      const convCountResult = await this.run(`?[count_unique(conversation_file)] := *messages{conversation_file}`)
      const totalConversations = convCountResult.rows?.[0]?.[0] || 0

      // Count vectors
      const vecCountResult = await this.run(`?[count(msg_id)] := *msg_vec{msg_id}`)
      const totalVectors = vecCountResult.rows?.[0]?.[0] || 0

      // Get oldest and newest message timestamps
      const timeResult = await this.run(`?[min(ts), max(ts)] := *messages{ts}`)
      const oldestMessage = timeResult.rows?.[0]?.[0] || null
      const newestMessage = timeResult.rows?.[0]?.[1] || null

      return {
        totalMessages,
        totalConversations,
        totalVectors,
        oldestMessage,
        newestMessage
      }
    } catch {
      // Tables might not exist yet - return defaults silently
      return {
        totalMessages: 0,
        totalConversations: 0,
        totalVectors: 0,
        oldestMessage: null,
        newestMessage: null
      }
    }
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      console.log(`[CozoDB] Closing database for agent ${this.agentId}`)
      this.db.close()
      this.db = null
    }
  }
}

/**
 * Factory function to create and initialize an agent database
 */
export async function createAgentDatabase(config: AgentDatabaseConfig): Promise<AgentDatabase> {
  const agentDb = new AgentDatabase(config)
  await agentDb.initialize()
  return agentDb
}
