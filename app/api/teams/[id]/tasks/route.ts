import { NextRequest, NextResponse } from 'next/server'
import { listTeamTasks, createTeamTask, CreateTaskParams } from '@/services/teams-service'
import { authenticateAgent } from '@/lib/agent-auth'
import { isValidUuid } from '@/lib/validation'

// GET /api/teams/[id]/tasks - List tasks with resolved dependencies
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
  const requestingAgentId = auth.agentId

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Malformed JSON in request body' }, { status: 400 })
  }

  // SF-011: Validate priority is a finite number to prevent NaN from propagating
  if (body.priority !== undefined) {
    const priority = Number(body.priority)
    if (!Number.isFinite(priority)) {
      return NextResponse.json({ error: 'priority must be a finite number' }, { status: 400 })
    }
  }
  // MF-006: Runtime validation for blockedBy -- must be an array of strings if provided
  // SF-005: Also validate each element is a string (defense-in-depth)
  if (body.blockedBy !== undefined) {
    if (!Array.isArray(body.blockedBy)) {
      return NextResponse.json({ error: 'blockedBy must be an array of strings' }, { status: 400 })
    }
    if (!body.blockedBy.every((v: unknown) => typeof v === 'string')) {
      return NextResponse.json({ error: 'blockedBy array elements must all be strings' }, { status: 400 })
    }
  }
  // Whitelist only known CreateTaskParams fields to avoid passing arbitrary data
  // SF-007: Handle null assigneeAgentId explicitly -- String(null) produces literal "null" string
  const safeParams: CreateTaskParams = {
    subject: String(body.subject ?? ''),
    ...(body.description !== undefined && { description: String(body.description) }),
    ...(body.assigneeAgentId !== undefined && { assigneeAgentId: body.assigneeAgentId === null ? null : String(body.assigneeAgentId) }),
    ...(body.blockedBy !== undefined && { blockedBy: body.blockedBy }),
    ...(body.priority !== undefined && { priority: Number(body.priority) }),
    requestingAgentId,
  }
  const result = await createTeamTask(id, safeParams)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}
