import { NextRequest, NextResponse } from 'next/server'
import {
  getConsolidationStatus,
  triggerConsolidation,
  manageConsolidation,
} from '@/services/agents-memory-service'
import { isValidUuid } from '@/lib/validation'

/**
 * GET /api/agents/:id/memory/consolidate
 * Get consolidation status and history
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(agentId)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    const result = await getConsolidationStatus(agentId)

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // MF-003: Outer try-catch for unhandled service throws
    console.error('[Consolidate GET] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
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
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(agentId)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    const searchParams = request.nextUrl.searchParams

    const result = await triggerConsolidation(agentId, {
      dryRun: searchParams.get('dryRun') === 'true',
      provider: searchParams.get('provider') || undefined,
      // SF-018 fix: Use NaN-check instead of || undefined to preserve valid zero
      maxConversations: searchParams.get('maxConversations')
        ? (Number.isNaN(parseInt(searchParams.get('maxConversations')!, 10)) ? undefined : parseInt(searchParams.get('maxConversations')!, 10))
        : undefined,
    })

    if (result.error) {
      return NextResponse.json(
        { success: false, status: 'failed', error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // MF-003: Outer try-catch for unhandled service throws
    console.error('[Consolidate POST] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(agentId)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
    }

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
  } catch (error) {
    // MF-003: Outer try-catch for unhandled service throws
    console.error('[Consolidate PATCH] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
