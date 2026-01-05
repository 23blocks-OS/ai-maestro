import { NextRequest, NextResponse } from 'next/server'
import { agentRegistry } from '@/lib/agent'
import { getAgent as getAgentFromRegistry } from '@/lib/agent-registry'
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

/**
 * GET /api/agents/:id/docs
 * Query documentation for an agent
 *
 * Query parameters:
 * - action: Query action (stats | search | find-by-type | get-doc | list)
 * - q: Search query text (for search action)
 * - type: Document type filter (for find-by-type action)
 * - docId: Document ID (for get-doc action)
 * - keyword: Keyword search term (alternative to semantic search)
 * - limit: Max results (default: 10)
 * - project: Project path filter
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const searchParams = request.nextUrl.searchParams

    const action = searchParams.get('action') || 'stats'

    console.log(`[Docs API] Agent: ${agentId}, Action: ${action}`)

    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    let result: any = {}

    switch (action) {
      case 'stats': {
        const projectPath = searchParams.get('project') || undefined
        result = await getDocStats(agentDb, projectPath)
        break
      }

      case 'search': {
        const query = searchParams.get('q')
        const keyword = searchParams.get('keyword')
        const limit = parseInt(searchParams.get('limit') || '10', 10)
        const projectPath = searchParams.get('project') || undefined

        if (!query && !keyword) {
          return NextResponse.json(
            { success: false, error: 'search requires "q" (semantic) or "keyword" (lexical) parameter' },
            { status: 400 }
          )
        }

        // Trigger delta indexing in the background before search (ensures fresh results)
        triggerBackgroundDocsDeltaIndexing(agentId, projectPath).catch((err) => {
          console.error('[Docs API] Background delta indexing failed:', err)
        })

        if (keyword) {
          result = await searchDocsByKeyword(agentDb, keyword, limit, projectPath)
        } else {
          result = await searchDocsBySimilarity(agentDb, query!, limit, projectPath)
        }
        break
      }

      case 'find-by-type': {
        const docType = searchParams.get('type')
        const projectPath = searchParams.get('project') || undefined

        if (!docType) {
          return NextResponse.json(
            { success: false, error: 'find-by-type requires "type" parameter' },
            { status: 400 }
          )
        }

        result = await findDocsByType(agentDb, docType, projectPath)
        break
      }

      case 'get-doc': {
        const docId = searchParams.get('docId')

        if (!docId) {
          return NextResponse.json(
            { success: false, error: 'get-doc requires "docId" parameter' },
            { status: 400 }
          )
        }

        result = await getDocumentWithSections(agentDb, docId)
        break
      }

      case 'list': {
        const projectPath = searchParams.get('project') || undefined
        const limit = parseInt(searchParams.get('limit') || '50', 10)

        let query = `
          ?[doc_id, file_path, title, doc_type, updated_at] :=
            *documents{doc_id, file_path, title, doc_type, updated_at}
        `

        if (projectPath) {
          query = `
            ?[doc_id, file_path, title, doc_type, updated_at] :=
              *documents{doc_id, file_path, title, doc_type, project_path, updated_at},
              project_path = '${projectPath.replace(/'/g, "''")}'
          `
        }

        query += ` :order -updated_at :limit ${limit}`

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
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }

    return NextResponse.json({
      success: true,
      agent_id: agentId,
      action,
      result,
    })
  } catch (error) {
    console.error('[Docs API] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/agents/:id/docs
 * Index documentation for a project
 *
 * Body (optional):
 * - projectPath: Path to the project to index (auto-detected from agent config if not provided)
 * - delta: Use delta indexing (only index changed files) (default: false)
 * - clear: Whether to clear existing data first (default: true, ignored if delta=true)
 * - generateEmbeddings: Whether to generate semantic embeddings (default: true)
 * - includePatterns: Glob patterns to include (optional)
 * - excludePatterns: Glob patterns to exclude (optional)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params

    // Parse body - handle empty body gracefully
    let body: any = {}
    try {
      const text = await request.text()
      if (text && text.trim()) {
        body = JSON.parse(text)
      }
    } catch {
      // Empty or invalid body - use defaults
    }

    let { projectPath, delta = false, clear = true, generateEmbeddings = true, includePatterns, excludePatterns } = body

    // Auto-detect projectPath from agent registry if not provided
    if (!projectPath) {
      const registryAgent = getAgentFromRegistry(agentId)
      if (!registryAgent) {
        return NextResponse.json(
          { success: false, error: `Agent not found in registry: ${agentId}` },
          { status: 404 }
        )
      }

      // Try to get working directory from various sources in registry data
      projectPath = registryAgent.workingDirectory ||
                    registryAgent.sessions?.[0]?.workingDirectory ||
                    registryAgent.preferences?.defaultWorkingDirectory

      if (!projectPath) {
        return NextResponse.json(
          { success: false, error: 'No projectPath provided and agent has no configured working directory' },
          { status: 400 }
        )
      }

      console.log(`[Docs API] Auto-detected projectPath from registry: ${projectPath}`)
    }

    // Get agent instance for database access
    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    let stats: any

    if (delta) {
      // Delta indexing - only index changed files
      console.log(`[Docs API] Delta indexing documentation for agent ${agentId}: ${projectPath}`)
      stats = await indexDocsDelta(agentDb, projectPath, {
        generateEmbeddings,
        includePatterns,
        excludePatterns,
        onProgress: (status) => {
          console.log(`[Docs API] ${status}`)
        },
      })
      console.log(`[Docs API] Delta indexing complete, stats:`, JSON.stringify(stats))
    } else {
      // Full indexing
      console.log(`[Docs API] Full indexing documentation for agent ${agentId}: ${projectPath}`)
      stats = await indexDocumentation(agentDb, projectPath, {
        clear,
        generateEmbeddings,
        includePatterns,
        excludePatterns,
        onProgress: (status) => {
          console.log(`[Docs API] ${status}`)
        },
      })
      console.log(`[Docs API] Full indexing complete, stats:`, JSON.stringify(stats))
    }

    const response = {
      success: true,
      agent_id: agentId,
      projectPath,
      mode: delta ? 'delta' : 'full',
      stats,
    }

    console.log(`[Docs API] Sending response:`, JSON.stringify(response))
    return NextResponse.json(response)
  } catch (error) {
    console.error('[Docs API] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[Docs API] Error message:', errorMessage)
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/agents/:id/docs
 * Clear documentation for a project
 *
 * Query parameters:
 * - project: Project path to clear (optional, clears all if not provided)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const searchParams = request.nextUrl.searchParams
    const projectPath = searchParams.get('project') || undefined

    console.log(`[Docs API] Clearing documentation for agent ${agentId}${projectPath ? `: ${projectPath}` : ' (all)'}`)

    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    await clearDocGraph(agentDb, projectPath)

    return NextResponse.json({
      success: true,
      agent_id: agentId,
      projectPath: projectPath || 'all',
      message: 'Documentation cleared',
    })
  } catch (error) {
    console.error('[Docs API] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * Trigger delta indexing of documentation in the background (non-blocking)
 */
async function triggerBackgroundDocsDeltaIndexing(agentId: string, projectPath?: string): Promise<void> {
  console.log(`[Docs API] Triggering background docs delta indexing for agent ${agentId}`)

  try {
    const body: any = { delta: true }
    if (projectPath) {
      body.projectPath = projectPath
    }

    const response = await fetch(`http://localhost:23000/api/agents/${agentId}/docs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      console.error(`[Docs API] Delta indexing returned status ${response.status}`)
      return
    }

    const result = await response.json()
    if (result.success) {
      const stats = result.stats || {}
      const totalChanges = (stats.filesNew || 0) + (stats.filesModified || 0) + (stats.filesDeleted || 0)
      if (totalChanges > 0) {
        console.log(`[Docs API] Delta indexed: ${stats.filesNew || 0} new, ${stats.filesModified || 0} modified, ${stats.filesDeleted || 0} deleted files`)
      }
    }
  } catch (error) {
    console.error('[Docs API] Failed to trigger docs delta indexing:', error)
  }
}
