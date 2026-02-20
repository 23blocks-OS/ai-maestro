import { NextRequest, NextResponse } from 'next/server'
import { listTeamTasks, createTeamTask, CreateTaskParams } from '@/services/teams-service'
import { authenticateAgent } from '@/lib/agent-auth'

// GET /api/teams/[id]/tasks - List tasks with resolved dependencies
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = authenticateAgent(
    request.headers.get('Authorization'),
    request.headers.get('X-Agent-Id')
  )
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })
  }
  const requestingAgentId = auth.agentId

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
  const auth = authenticateAgent(
    request.headers.get('Authorization'),
    request.headers.get('X-Agent-Id')
  )
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })
  }
  const requestingAgentId = auth.agentId

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Malformed JSON in request body' }, { status: 400 })
  }

  const result = await createTeamTask(id, { ...body, requestingAgentId } as CreateTaskParams)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}
