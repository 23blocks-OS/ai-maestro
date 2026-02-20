/**
 * Agents Docs Service
 *
 * Business logic for agent documentation indexing and querying (RAG).
 * Routes are thin wrappers that call these functions.
 */

import { agentRegistry } from '@/lib/agent'
import { getAgent as getAgentFromRegistry } from '@/lib/agent-registry'
import { getSelfHost } from '@/lib/hosts-config'
import {
  indexDocumentation,
  indexDocsDelta,
  clearDocGraph,
  getDocStats,
  searchDocsBySimilarity,
  searchDocsByKeyword,
  findDocsByType,
  getDocumentWithSections,
} from '@/lib/rag/doc-indexer'

// ── Types ───────────────────────────────────────────────────────────────────

export interface ServiceResult<T> {
  data?: T
  error?: string
  status: number
}

export interface DocsQueryOptions {
  action: string
  q?: string | null
  keyword?: string | null
  type?: string | null
  docId?: string | null
  limit?: number
  project?: string | null
}

export interface DocsIndexOptions {
  projectPath?: string
  delta?: boolean
  clear?: boolean
  generateEmbeddings?: boolean
  includePatterns?: string[]
  excludePatterns?: string[]
}

// ── Public Functions ────────────────────────────────────────────────────────

/**
 * Query documentation for an agent.
 */
export async function queryDocs(
  agentId: string,
  options: DocsQueryOptions
): Promise<ServiceResult<Record<string, unknown>>> {
  const { action, q, keyword, type: docType, docId, limit = 10, project } = options

  console.log(`[Docs Service] Agent: ${agentId}, Action: ${action}`)

  const agent = await agentRegistry.getAgent(agentId)
  const agentDb = await agent.getDatabase()

  let result: any = {}

  switch (action) {
    case 'stats': {
      result = await getDocStats(agentDb, project || undefined)
      break
    }

    case 'search': {
      if (!q && !keyword) {
        return { error: 'search requires "q" (semantic) or "keyword" (lexical) parameter', status: 400 }
      }

      // Trigger delta indexing in background
      triggerBackgroundDocsDeltaIndexing(agentId, project || undefined).catch((err) => {
        console.error('[Docs Service] Background delta indexing failed:', err)
      })

      if (keyword) {
        result = await searchDocsByKeyword(agentDb, keyword, limit, project || undefined)
      } else {
        result = await searchDocsBySimilarity(agentDb, q!, limit, project || undefined)
      }
      break
    }

    case 'find-by-type': {
      if (!docType) {
        return { error: 'find-by-type requires "type" parameter', status: 400 }
      }
      result = await findDocsByType(agentDb, docType, project || undefined)
      break
    }

    case 'get-doc': {
      if (!docId) {
        return { error: 'get-doc requires "docId" parameter', status: 400 }
      }
      result = await getDocumentWithSections(agentDb, docId)
      break
    }

    case 'list': {
      const listLimit = limit || 50

      let query = `
        ?[doc_id, file_path, title, doc_type, updated_at] :=
          *documents{doc_id, file_path, title, doc_type, updated_at}
      `

      if (project) {
        query = `
          ?[doc_id, file_path, title, doc_type, updated_at] :=
            *documents{doc_id, file_path, title, doc_type, project_path, updated_at},
            project_path = '${project.replace(/'/g, "''")}'
        `
      }

      query += ` :order -updated_at :limit ${listLimit}`

      const docsResult = await agentDb.run(query)
      result = docsResult.rows.map((row: any[]) => ({
        docId: row[0],
        filePath: row[1],
        title: row[2],
        docType: row[3],
        updatedAt: row[4],
      }))
      break
    }

    default:
      return { error: `Unknown action: ${action}`, status: 400 }
  }

  return {
    data: {
      success: true,
      agent_id: agentId,
      action,
      result,
    },
    status: 200
  }
}

/**
 * Index documentation for a project.
 */
export async function indexDocs(
  agentId: string,
  options: DocsIndexOptions
): Promise<ServiceResult<Record<string, unknown>>> {
  let { projectPath, delta = false, clear = true, generateEmbeddings = true, includePatterns, excludePatterns } = options

  // Auto-detect projectPath from agent registry if not provided
  if (!projectPath) {
    const registryAgent = getAgentFromRegistry(agentId)
    if (!registryAgent) {
      return { error: `Agent not found in registry: ${agentId}`, status: 404 }
    }

    projectPath = registryAgent.workingDirectory ||
                  registryAgent.sessions?.[0]?.workingDirectory ||
                  registryAgent.preferences?.defaultWorkingDirectory

    if (!projectPath) {
      return { error: 'No projectPath provided and agent has no configured working directory', status: 400 }
    }

    console.log(`[Docs Service] Auto-detected projectPath from registry: ${projectPath}`)
  }

  const agent = await agentRegistry.getAgent(agentId)
  const agentDb = await agent.getDatabase()

  let stats: any

  if (delta) {
    console.log(`[Docs Service] Delta indexing for agent ${agentId}: ${projectPath}`)
    stats = await indexDocsDelta(agentDb, projectPath, {
      generateEmbeddings,
      includePatterns,
      excludePatterns,
      onProgress: (status) => {
        console.log(`[Docs Service] ${status}`)
      },
    })
    console.log(`[Docs Service] Delta indexing complete, stats:`, JSON.stringify(stats))
  } else {
    console.log(`[Docs Service] Full indexing for agent ${agentId}: ${projectPath}`)
    stats = await indexDocumentation(agentDb, projectPath, {
      clear,
      generateEmbeddings,
      includePatterns,
      excludePatterns,
      onProgress: (status) => {
        console.log(`[Docs Service] ${status}`)
      },
    })
    console.log(`[Docs Service] Full indexing complete, stats:`, JSON.stringify(stats))
  }

  const response = {
    success: true,
    agent_id: agentId,
    projectPath,
    mode: delta ? 'delta' : 'full',
    stats,
  }

  console.log(`[Docs Service] Sending response:`, JSON.stringify(response))
  return { data: response, status: 200 }
}

/**
 * Clear documentation for a project.
 */
export async function clearDocs(
  agentId: string,
  projectPath?: string
): Promise<ServiceResult<Record<string, unknown>>> {
  console.log(`[Docs Service] Clearing docs for agent ${agentId}${projectPath ? `: ${projectPath}` : ' (all)'}`)

  const agent = await agentRegistry.getAgent(agentId)
  const agentDb = await agent.getDatabase()

  await clearDocGraph(agentDb, projectPath)

  return {
    data: {
      success: true,
      agent_id: agentId,
      projectPath: projectPath || 'all',
      message: 'Documentation cleared',
    },
    status: 200
  }
}

// ── Internal ────────────────────────────────────────────────────────────────

async function triggerBackgroundDocsDeltaIndexing(agentId: string, projectPath?: string): Promise<void> {
  console.log(`[Docs Service] Triggering background docs delta indexing for agent ${agentId}`)

  try {
    const body: any = { delta: true }
    if (projectPath) {
      body.projectPath = projectPath
    }

    const selfHost = getSelfHost()
    const response = await fetch(`${selfHost.url}/api/agents/${agentId}/docs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      console.error(`[Docs Service] Delta indexing returned status ${response.status}`)
      return
    }

    const result = await response.json()
    if (result.success) {
      const stats = result.stats || {}
      const totalChanges = (stats.filesNew || 0) + (stats.filesModified || 0) + (stats.filesDeleted || 0)
      if (totalChanges > 0) {
        console.log(`[Docs Service] Delta indexed: ${stats.filesNew || 0} new, ${stats.filesModified || 0} modified, ${stats.filesDeleted || 0} deleted files`)
      }
    }
  } catch (error) {
    console.error('[Docs Service] Failed to trigger docs delta indexing:', error)
  }
}
