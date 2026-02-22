import { NextRequest, NextResponse } from 'next/server'
import { getDatabaseInfo, initializeDatabase } from '@/services/agents-graph-service'
import { isValidUuid } from '@/lib/validation'

/**
 * GET /api/agents/:id/database
 * Get agent database information and metadata
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  // SF-009: Validate UUID format for agent ID (defense-in-depth)
  if (!isValidUuid(agentId)) {
    return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
  }
  const result = await getDatabaseInfo(agentId)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

/**
 * POST /api/agents/:id/database
 * Initialize or reset agent database
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  // SF-009: Validate UUID format for agent ID (defense-in-depth)
  if (!isValidUuid(agentId)) {
    return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
  }
  const result = await initializeDatabase(agentId)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
