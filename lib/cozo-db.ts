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

export interface AgentDatabaseConfig {
  agentId: string
  workingDirectory?: string
}

export class AgentDatabase {
  private db: CozoDb | null = null
  private dbPath: string
  private agentId: string

  constructor(config: AgentDatabaseConfig) {
    this.agentId = config.agentId

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
      console.log(`[CozoDB] Initializing database for agent ${this.agentId}`)
      console.log(`[CozoDB] Database path: ${this.dbPath}`)

      // Create CozoDB instance with SQLite storage backend
      this.db = new CozoDb('sqlite', this.dbPath)

      // Test connection with a simple query
      const result = this.db.run('::relations')
      console.log(`[CozoDB] Database initialized successfully`)
      console.log(`[CozoDB] Existing relations:`, result)

      // Store agent metadata
      await this.initializeAgentMetadata()
    } catch (error) {
      console.error(`[CozoDB] Failed to initialize database:`, error)
      throw error
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
          ['agent_id', '${this.agentId}', ${now}, ${now}],
          ['created_at', '${now}', ${now}, ${now}],
          ['db_version', '0.1.0', ${now}, ${now}]
        ]
        :put agent_metadata {key => value, created_at, updated_at}
      `)

      console.log(`[CozoDB] Stored agent metadata`)
    } catch (error) {
      // Table might already exist - check if we can query it
      try {
        const metadata = await this.run(`?[key, value] := *agent_metadata{key, value}`)
        console.log(`[CozoDB] Agent metadata already exists:`, metadata)
      } catch (queryError) {
        console.error(`[CozoDB] Failed to initialize metadata:`, error)
        throw error
      }
    }
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
