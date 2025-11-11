import { NextRequest, NextResponse } from 'next/server'
import { agentRegistry } from '@/lib/agent'
import { getConversations } from '@/lib/cozo-schema-simple'
import { indexConversationDelta } from '@/lib/rag/ingest'
import { recordConversation } from '@/lib/cozo-schema-simple'
import * as fs from 'fs'

/**
 * POST /api/agents/:id/index-delta
 * Index new messages (delta) for all conversations of an agent
 *
 * This endpoint checks each conversation's last_indexed_message_count and
 * indexes only the new messages since the last index.
 *
 * Query parameters:
 * - dryRun: If true, only report what would be indexed without actually indexing (default: false)
 * - batchSize: Batch size for processing (default: 10)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const searchParams = request.nextUrl.searchParams

    const dryRun = searchParams.get('dryRun') === 'true'
    const batchSize = parseInt(searchParams.get('batchSize') || '10')

    console.log(`[Delta Index API] Processing agent ${agentId} (dryRun: ${dryRun})`)

    // Get or create agent (will initialize with subconscious if first time)
    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    // Get all projects for this agent
    const projectsResult = await agentDb.run(`
      ?[project_path] := *projects{project_path}
    `)

    const conversations: Array<{
      jsonl_file: string
      message_count: number
      last_indexed_message_count: number
    }> = []

    // Get all conversations for all projects
    for (const projectRow of projectsResult.rows) {
      const projectPath = projectRow[0]
      const convosResult = await getConversations(agentDb, projectPath)

      for (const convoRow of convosResult.rows) {
        const jsonlFile = convoRow[0]
        const messageCount = convoRow[4]
        const lastIndexedMessageCount = convoRow[10] || 0

        conversations.push({
          jsonl_file: jsonlFile,
          message_count: messageCount,
          last_indexed_message_count: lastIndexedMessageCount,
        })
      }
    }

    console.log(`[Delta Index API] Found ${conversations.length} conversations`)

    // Filter conversations that need indexing
    const conversationsNeedingIndex = conversations.filter(
      (conv) => {
        // Check if file exists and has new messages
        if (!fs.existsSync(conv.jsonl_file)) {
          console.log(`[Delta Index API] File not found: ${conv.jsonl_file}`)
          return false
        }

        const fileContent = fs.readFileSync(conv.jsonl_file, 'utf-8')
        const currentLineCount = fileContent.split('\n').filter(line => line.trim()).length

        const delta = currentLineCount - conv.last_indexed_message_count
        return delta > 0
      }
    )

    console.log(`[Delta Index API] ${conversationsNeedingIndex.length} conversations need indexing`)

    if (dryRun) {
      // Dry run - just report what would be indexed
      const report = conversationsNeedingIndex.map((conv) => {
        const fileContent = fs.readFileSync(conv.jsonl_file, 'utf-8')
        const currentLineCount = fileContent.split('\n').filter(line => line.trim()).length
        const delta = currentLineCount - conv.last_indexed_message_count

        return {
          file: conv.jsonl_file,
          last_indexed: conv.last_indexed_message_count,
          current_messages: currentLineCount,
          delta_to_index: delta,
        }
      })

      // NOTE: Don't close agentDb - it's owned by the agent and stays open

      return NextResponse.json({
        success: true,
        dry_run: true,
        agent_id: agentId,
        conversations_needing_index: conversationsNeedingIndex.length,
        report,
      })
    }

    // Actually index the deltas
    const results: Array<{
      file: string
      delta: number
      processed: number
      duration_ms: number
    }> = []

    let totalProcessed = 0
    let totalDuration = 0

    for (const conv of conversationsNeedingIndex) {
      console.log(`\n[Delta Index API] Processing: ${conv.jsonl_file}`)

      const fileContent = fs.readFileSync(conv.jsonl_file, 'utf-8')
      const currentLineCount = fileContent.split('\n').filter(line => line.trim()).length
      const delta = currentLineCount - conv.last_indexed_message_count

      const stats = await indexConversationDelta(
        agentDb,
        conv.jsonl_file,
        conv.last_indexed_message_count,
        { batchSize }
      )

      // Update conversation record with new indexed count
      await recordConversation(agentDb, {
        jsonl_file: conv.jsonl_file,
        project_path: '', // Will be preserved by :put
        message_count: currentLineCount,
        last_indexed_at: Date.now(),
        last_indexed_message_count: currentLineCount,
      })

      results.push({
        file: conv.jsonl_file,
        delta,
        processed: stats.processedMessages,
        duration_ms: stats.durationMs,
      })

      totalProcessed += stats.processedMessages
      totalDuration += stats.durationMs
    }

    // NOTE: Don't close agentDb - it's owned by the agent and stays open

    console.log(`\n[Delta Index API] ✅ Complete: ${totalProcessed} messages in ${totalDuration}ms`)

    return NextResponse.json({
      success: true,
      agent_id: agentId,
      conversations_indexed: conversationsNeedingIndex.length,
      total_messages_processed: totalProcessed,
      total_duration_ms: totalDuration,
      results,
    })
  } catch (error) {
    console.error('[Delta Index API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
