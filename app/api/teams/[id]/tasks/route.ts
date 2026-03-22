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

  // Extract optional query filters
  const url = new URL(request.url)
  const filters: { assignee?: string; status?: string; label?: string; taskType?: string } = {}
  if (url.searchParams.has('assignee')) filters.assignee = url.searchParams.get('assignee')!
  if (url.searchParams.has('status')) filters.status = url.searchParams.get('status')!
  if (url.searchParams.has('label')) filters.label = url.searchParams.get('label')!
  if (url.searchParams.has('taskType')) filters.taskType = url.searchParams.get('taskType')!

  const hasFilters = Object.keys(filters).length > 0
  const result = await listTeamTasks(id, requestingAgentId, hasFilters ? filters : undefined)

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
  // Runtime validation for labels -- must be an array of strings if provided
  if (body.labels !== undefined) {
    if (!Array.isArray(body.labels)) {
      return NextResponse.json({ error: 'labels must be an array of strings' }, { status: 400 })
    }
    if (!body.labels.every((v: unknown) => typeof v === 'string')) {
      return NextResponse.json({ error: 'labels array elements must all be strings' }, { status: 400 })
    }
  }
  // Runtime validation for acceptanceCriteria -- must be an array of strings if provided
  if (body.acceptanceCriteria !== undefined) {
    if (!Array.isArray(body.acceptanceCriteria)) {
      return NextResponse.json({ error: 'acceptanceCriteria must be an array of strings' }, { status: 400 })
    }
    if (!body.acceptanceCriteria.every((v: unknown) => typeof v === 'string')) {
      return NextResponse.json({ error: 'acceptanceCriteria array elements must all be strings' }, { status: 400 })
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
    ...(body.status !== undefined && { status: String(body.status) }),
    ...(body.labels !== undefined && { labels: body.labels as string[] }), // Safe: validated as string[] above
    ...(body.taskType !== undefined && { taskType: String(body.taskType) }),
    ...(body.externalRef !== undefined && { externalRef: String(body.externalRef) }),
    ...(body.externalProjectRef !== undefined && { externalProjectRef: String(body.externalProjectRef) }),
    ...(body.acceptanceCriteria !== undefined && { acceptanceCriteria: body.acceptanceCriteria as string[] }), // Safe: validated as string[] above
    ...(body.handoffDoc !== undefined && { handoffDoc: String(body.handoffDoc) }),
    ...(body.prUrl !== undefined && { prUrl: String(body.prUrl) }),
    requestingAgentId,
  }
  const result = await createTeamTask(id, safeParams)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}
