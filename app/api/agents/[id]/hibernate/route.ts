import { NextRequest, NextResponse } from 'next/server'
import { hibernateAgent } from '@/services/agents-core-service'

/**
 * POST /api/agents/[id]/hibernate
 * Hibernate an agent by stopping its session and updating status.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

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
}
