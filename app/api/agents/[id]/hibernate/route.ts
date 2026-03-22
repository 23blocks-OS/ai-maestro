import { NextRequest, NextResponse } from 'next/server'
import { hibernateAgent } from '@/services/agents-core-service'
import { isValidUuid } from '@/lib/validation'

/**
 * POST /api/agents/[id]/hibernate
 * Hibernate an agent by stopping its session and updating status.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }

    // Parse optional body for sessionIndex
    let sessionIndex = 0
    try {
      const body = await request.json()
      if (typeof body.sessionIndex === 'number') {
        sessionIndex = body.sessionIndex
      }
    } catch {
      // No body or invalid JSON, use defaults
    }

    const result = await hibernateAgent(id, { sessionIndex })

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // MF-003: Outer try-catch for unhandled service throws
    console.error('[Hibernate POST] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
