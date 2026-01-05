import { NextRequest, NextResponse } from 'next/server'
import { agentRegistry } from '@/lib/agent'
import { getConversations, getProjects } from '@/lib/cozo-schema-simple'
import { consolidateMemories, promoteMemories, pruneShortTermMemory } from '@/lib/memory/consolidate'
import { PreparedConversation, ConversationMessage } from '@/lib/memory/types'
import * as fs from 'fs'

/**
 * Load and prepare conversations for consolidation
 */
async function prepareConversations(
  agentDb: Awaited<ReturnType<typeof agentRegistry.getAgent>>['getDatabase'],
  limit: number = 50
): Promise<PreparedConversation[]> {
  const prepared: PreparedConversation[] = []

  // Get all projects for this agent
  const projectsResult = await (await agentDb()).run(`
    ?[project_path, project_name, claude_dir] :=
      *projects{project_path, project_name, claude_dir}
  `)

  for (const projectRow of projectsResult.rows) {
    const projectPath = projectRow[0] as string
    const claudeDir = projectRow[2] as string

    if (!claudeDir || !fs.existsSync(claudeDir)) {
      continue
    }

    // Get conversations for this project
    const convosResult = await getConversations(await agentDb(), projectPath)

    for (const convoRow of convosResult.rows) {
      const jsonlFile = convoRow[0] as string
      const firstMessageAt = convoRow[5] as number | null
      const lastMessageAt = convoRow[6] as number | null

      if (!fs.existsSync(jsonlFile)) {
        continue
      }

      try {
        // Read and parse the conversation file
        const fileContent = fs.readFileSync(jsonlFile, 'utf-8')
        const lines = fileContent.split('\n').filter(line => line.trim())

        const messages: ConversationMessage[] = []

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line)

            // Skip non-message entries (like tool results)
            if (!parsed.type || !['user', 'assistant'].includes(parsed.type)) {
              continue
            }

            // Extract content from user or assistant message
            let content = ''
            if (parsed.message?.content) {
              if (typeof parsed.message.content === 'string') {
                content = parsed.message.content
              } else if (Array.isArray(parsed.message.content)) {
                // Handle content blocks (for assistant messages)
                content = parsed.message.content
                  .filter((block: { type: string }) => block.type === 'text')
                  .map((block: { text: string }) => block.text || '')
                  .join('\n')
              }
            }

            if (!content.trim()) {
              continue
            }

            messages.push({
              role: parsed.type as 'user' | 'assistant',
              content: content.trim(),
              timestamp: parsed.timestamp ? new Date(parsed.timestamp).getTime() : undefined,
              tool_use: parsed.type === 'assistant' && parsed.message?.content?.some?.(
                (block: { type: string }) => block.type === 'tool_use'
              )
            })
          } catch {
            // Skip malformed lines
          }
        }

        if (messages.length > 0) {
          prepared.push({
            file_path: jsonlFile,
            project_path: projectPath,
            messages,
            message_count: messages.length,
            first_message_at: firstMessageAt || undefined,
            last_message_at: lastMessageAt || undefined
          })
        }

        // Check limit
        if (prepared.length >= limit) {
          break
        }
      } catch (err) {
        console.error(`[Consolidate API] Error processing ${jsonlFile}:`, err)
      }
    }

    if (prepared.length >= limit) {
      break
    }
  }

  return prepared
}

/**
 * POST /api/agents/:id/memory/consolidate
 * Trigger memory consolidation for an agent
 *
 * Query parameters:
 * - dryRun: If true, only report what would be extracted (default: false)
 * - provider: LLM provider to use ('ollama', 'claude', 'auto') (default: 'auto')
 * - maxConversations: Maximum conversations to process (default: 50)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const searchParams = request.nextUrl.searchParams

    const dryRun = searchParams.get('dryRun') === 'true'
    const provider = searchParams.get('provider') as 'ollama' | 'claude' | 'auto' | null
    const maxConversations = parseInt(searchParams.get('maxConversations') || '50')

    console.log(`[Consolidate API] Processing agent ${agentId} (dryRun: ${dryRun}, provider: ${provider || 'auto'})`)

    // Get or create agent
    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    // Prepare conversations for consolidation
    console.log(`[Consolidate API] Loading conversations...`)
    const conversations = await prepareConversations(
      async () => agentDb,
      maxConversations
    )

    if (conversations.length === 0) {
      console.log(`[Consolidate API] No conversations found for agent ${agentId}`)
      return NextResponse.json({
        success: true,
        status: 'no_data',
        agent_id: agentId,
        message: 'No conversations found to consolidate',
        conversations_processed: 0,
        memories_created: 0,
        memories_reinforced: 0,
        memories_linked: 0
      })
    }

    console.log(`[Consolidate API] Found ${conversations.length} conversations to process`)

    // Run consolidation
    const result = await consolidateMemories(agentDb, agentId, conversations, {
      dryRun,
      provider: provider || 'auto',
      maxConversations
    })

    console.log(`[Consolidate API] Consolidation complete:`, result)

    return NextResponse.json({
      success: result.status !== 'failed',
      ...result
    })
  } catch (error) {
    console.error('[Consolidate API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/agents/:id/memory/consolidate
 * Get consolidation status and history
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params

    // Get agent
    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    // Get consolidation runs
    const runsResult = await agentDb.run(`
      ?[run_id, started_at, completed_at, status, conversations_processed,
        memories_created, memories_reinforced, memories_linked, llm_provider, error] :=
        *consolidation_runs{run_id, agent_id, started_at, completed_at, status,
          conversations_processed, memories_created, memories_reinforced, memories_linked,
          llm_provider, error},
        agent_id = '${agentId}'

      :order -started_at
      :limit 20
    `)

    // Get memory stats
    const memoryStats = await agentDb.run(`
      ?[category, count(memory_id)] :=
        *memories{memory_id, agent_id, category},
        agent_id = '${agentId}'
    `)

    const byCategory: Record<string, number> = {}
    for (const row of memoryStats.rows) {
      byCategory[row[0] as string] = row[1] as number
    }

    // Get subconscious status
    const subconscious = agent.getSubconscious()
    const consolidationStatus = subconscious?.getStatus().consolidation || null

    return NextResponse.json({
      success: true,
      agent_id: agentId,
      consolidation: consolidationStatus,
      memory_stats: {
        by_category: byCategory,
        total: Object.values(byCategory).reduce((a, b) => a + b, 0)
      },
      recent_runs: runsResult.rows.map((row: unknown[]) => ({
        run_id: row[0],
        started_at: row[1],
        completed_at: row[2],
        status: row[3],
        conversations_processed: row[4],
        memories_created: row[5],
        memories_reinforced: row[6],
        memories_linked: row[7],
        llm_provider: row[8],
        error: row[9]
      }))
    })
  } catch (error) {
    console.error('[Consolidate API] GET Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/agents/:id/memory/consolidate
 * Manage consolidation settings and operations
 *
 * Actions:
 * - promote: Promote warm memories to long-term
 * - prune: Prune old short-term messages
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const body = await request.json()
    const action = body.action as string

    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    switch (action) {
      case 'promote': {
        const result = await promoteMemories(agentDb, agentId, {
          minReinforcements: body.minReinforcements,
          minAgeDays: body.minAgeDays,
          dryRun: body.dryRun
        })
        return NextResponse.json({
          success: true,
          action: 'promote',
          ...result
        })
      }

      case 'prune': {
        const result = await pruneShortTermMemory(agentDb, agentId, {
          retentionDays: body.retentionDays,
          dryRun: body.dryRun
        })
        return NextResponse.json({
          success: true,
          action: 'prune',
          ...result
        })
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Consolidate API] PATCH Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
