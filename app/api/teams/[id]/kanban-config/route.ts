import { NextRequest, NextResponse } from 'next/server'
import { getKanbanConfig, setKanbanConfig } from '@/services/teams-service'
import { authenticateAgent } from '@/lib/agent-auth'
import { isValidUuid } from '@/lib/validation'
import type { KanbanColumnConfig } from '@/types/team'

// GET /api/teams/[id]/kanban-config - Get team's kanban column configuration
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid team ID format' }, { status: 400 })
  }
  const auth = authenticateAgent(
    request.headers.get('Authorization'),
    request.headers.get('X-Agent-Id')
  )
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })
  }

  const result = await getKanbanConfig(id, auth.agentId)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

// PUT /api/teams/[id]/kanban-config - Set team's kanban column configuration
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid team ID format' }, { status: 400 })
  }
  const auth = authenticateAgent(
    request.headers.get('Authorization'),
    request.headers.get('X-Agent-Id')
  )
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Malformed JSON in request body' }, { status: 400 })
  }

  if (!body.columns || !Array.isArray(body.columns)) {
    return NextResponse.json({ error: 'columns array is required' }, { status: 400 })
  }

  // Validate that every element has the required KanbanColumnConfig fields with correct types
  const isValidColumns = (body.columns as unknown[]).every(
    (col) =>
      col !== null &&
      typeof col === 'object' &&
      typeof (col as Record<string, unknown>).id === 'string' &&
      typeof (col as Record<string, unknown>).label === 'string' &&
      typeof (col as Record<string, unknown>).color === 'string' &&
      ((col as Record<string, unknown>).icon === undefined ||
        typeof (col as Record<string, unknown>).icon === 'string')
  )
  if (!isValidColumns) {
    return NextResponse.json(
      { error: 'Each column must have string fields: id, label, color (icon is optional string)' },
      { status: 400 }
    )
  }

  const result = await setKanbanConfig(id, body.columns as KanbanColumnConfig[], auth.agentId)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
