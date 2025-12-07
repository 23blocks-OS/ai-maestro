import { NextRequest, NextResponse } from 'next/server'
import { agentRegistry } from '@/lib/agent'
import { AgentDatabase } from '@/lib/cozo-db'

/**
 * GET /api/agents/:id/database
 * Get agent database information and metadata
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params

    // Get or create agent (will initialize with subconscious if first time)
    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    // Get database info
    const metadata = await agentDb.getMetadata()
    const dbPath = agentDb.getPath()
    const exists = agentDb.exists()
    const size = agentDb.getSize()

    // NOTE: Don't close agentDb - it's owned by the agent and stays open

    return NextResponse.json({
      success: true,
      agent_id: agentId,
      database: {
        path: dbPath,
        exists,
        size_bytes: size,
        size_human: formatBytes(size),
        metadata
      }
    })
  } catch (error) {
    console.error('[Database API] Error:', error)
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
 * POST /api/agents/:id/database
 * Initialize or reset agent database
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params

    // Get or create agent (will initialize with subconscious if first time)
    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    // Test a simple query
    const testResult = await agentDb.run(`
      ?[key, value] := *agent_metadata[key, value, _, _]
    `)

    console.log('[Database API] Test query result:', testResult)

    // Get database info
    const metadata = await agentDb.getMetadata()
    const dbPath = agentDb.getPath()
    const size = agentDb.getSize()

    // NOTE: Don't close agentDb - it's owned by the agent and stays open

    return NextResponse.json({
      success: true,
      agent_id: agentId,
      message: 'Database initialized successfully',
      database: {
        path: dbPath,
        size_bytes: size,
        size_human: formatBytes(size),
        metadata
      },
      test_result: testResult
    })
  } catch (error) {
    console.error('[Database API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}
