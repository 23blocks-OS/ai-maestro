import { NextRequest, NextResponse } from 'next/server'
import {
  getConsolidationStatus,
  triggerConsolidation,
  manageConsolidation,
} from '@/services/agents-memory-service'

/**
 * GET /api/agents/:id/memory/consolidate
 * Get consolidation status and history
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  const result = await getConsolidationStatus(agentId)

  if (result.error) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
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
  const { id: agentId } = await params
  const searchParams = request.nextUrl.searchParams

  const result = await triggerConsolidation(agentId, {
    dryRun: searchParams.get('dryRun') === 'true',
    provider: searchParams.get('provider') || undefined,
    maxConversations: searchParams.get('maxConversations')
      ? parseInt(searchParams.get('maxConversations')!)
      : undefined,
  })

  if (result.error) {
    return NextResponse.json(
      { success: false, status: 'failed', error: result.error },
      { status: result.status }
    )
  }
  return NextResponse.json(result.data)
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
  const { id: agentId } = await params
  const body = await request.json()

  const result = await manageConsolidation(agentId, {
    action: body.action,
    minReinforcements: body.minReinforcements,
    minAgeDays: body.minAgeDays,
    retentionDays: body.retentionDays,
    dryRun: body.dryRun,
  })

  if (result.error) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
