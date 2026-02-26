import { NextRequest, NextResponse } from 'next/server'
import { wakeAgent } from '@/services/agents-core-service'
import { isValidUuid } from '@/lib/validation'

/**
 * POST /api/agents/[id]/wake
 * Wake a hibernated agent
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }

    // Parse optional body
    let startProgram = true
    let sessionIndex = 0
    let program: string | undefined
    try {
      const body = await request.json()
      if (body.startProgram === false) {
        startProgram = false
      }
      if (typeof body.sessionIndex === 'number') {
        sessionIndex = body.sessionIndex
      }
      if (typeof body.program === 'string') {
        // SF-010: Do not lowercase program name -- case-sensitive filesystems need exact case
        program = body.program
      }
    } catch {
      // No body or invalid JSON — use defaults (CC-P1-611: removed debug logging)
    }

    const result = await wakeAgent(id, { startProgram, sessionIndex, program })

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // MF-003: Outer try-catch for unhandled service throws
    console.error('[Wake POST] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
