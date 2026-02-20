import { NextRequest, NextResponse } from 'next/server'
import { listTeamTasks, createTeamTask } from '@/services/teams-service'

// GET /api/teams/[id]/tasks - List tasks with resolved dependencies
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const requestingAgentId = request.headers.get('X-Agent-Id') || undefined

  const result = listTeamTasks(id, requestingAgentId)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

// POST /api/teams/[id]/tasks - Create a new task
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const requestingAgentId = request.headers.get('X-Agent-Id') || undefined

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Malformed JSON in request body' }, { status: 400 })
  }

  const result = createTeamTask(id, { ...body, requestingAgentId })

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}
