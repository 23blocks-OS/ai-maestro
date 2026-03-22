import { NextRequest, NextResponse } from 'next/server'
import { updateTeamTask, deleteTeamTask, UpdateTaskParams } from '@/services/teams-service'
import { authenticateAgent } from '@/lib/agent-auth'
import { isValidUuid } from '@/lib/validation'

// PUT /api/teams/[id]/tasks/[taskId] - Update a task
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id, taskId } = await params
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid team ID format' }, { status: 400 })
  }
  // taskId can be a UUID (local storage) or a GitHub Project item node_id (PVTI_...)
  if (!taskId || taskId.length > 200) {
    return NextResponse.json({ error: 'Invalid task ID format' }, { status: 400 })
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

  // SF-014: Status validation is now done in the service layer (teams-service.ts updateTeamTask)
  // where it validates against the team's kanban config columns (or defaults)
  // SF-011: Validate priority is a finite number to prevent NaN from propagating
  if (body.priority !== undefined) {
    const priority = Number(body.priority)
    if (!Number.isFinite(priority)) {
      return NextResponse.json({ error: 'priority must be a finite number' }, { status: 400 })
    }
  }
  // MF-006: Runtime validation for blockedBy -- must be an array of strings if provided
  // SF-006: Also validate each element is a string (defense-in-depth)
  if (body.blockedBy !== undefined) {
    if (!Array.isArray(body.blockedBy)) {
      return NextResponse.json({ error: 'blockedBy must be an array of strings' }, { status: 400 })
    }
    if (!body.blockedBy.every((v: unknown) => typeof v === 'string')) {
      return NextResponse.json({ error: 'blockedBy array elements must all be strings' }, { status: 400 })
    }
  }
  // Whitelist only known UpdateTaskParams fields to avoid passing arbitrary data
  // SF-008: Handle null assigneeAgentId explicitly -- String(null) produces literal "null" string
  const safeParams: UpdateTaskParams = {
    ...(body.subject !== undefined && { subject: String(body.subject) }),
    ...(body.description !== undefined && { description: String(body.description) }),
    ...(body.status !== undefined && { status: body.status as UpdateTaskParams['status'] }),
    ...(body.priority !== undefined && { priority: Number(body.priority) }),
    ...(body.assigneeAgentId !== undefined && { assigneeAgentId: body.assigneeAgentId === null ? null : String(body.assigneeAgentId) }),
    ...(body.blockedBy !== undefined && { blockedBy: body.blockedBy }),
    ...(body.labels !== undefined && { labels: body.labels as string[] }),
    ...(body.taskType !== undefined && { taskType: String(body.taskType) }),
    ...(body.externalRef !== undefined && { externalRef: String(body.externalRef) }),
    ...(body.externalProjectRef !== undefined && { externalProjectRef: String(body.externalProjectRef) }),
    ...(body.previousStatus !== undefined && { previousStatus: String(body.previousStatus) }),
    ...(body.acceptanceCriteria !== undefined && { acceptanceCriteria: body.acceptanceCriteria as string[] }),
    ...(body.handoffDoc !== undefined && { handoffDoc: String(body.handoffDoc) }),
    ...(body.prUrl !== undefined && { prUrl: String(body.prUrl) }),
    ...(body.reviewResult !== undefined && { reviewResult: String(body.reviewResult) }),
    requestingAgentId,
  }
  const result = await updateTeamTask(id, taskId, safeParams)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

// DELETE /api/teams/[id]/tasks/[taskId] - Delete a task
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id, taskId } = await params
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid team ID format' }, { status: 400 })
  }
  // taskId can be a UUID (local storage) or a GitHub Project item node_id (PVTI_...)
  if (!taskId || taskId.length > 200) {
    return NextResponse.json({ error: 'Invalid task ID format' }, { status: 400 })
  }
  const auth = authenticateAgent(
    request.headers.get('Authorization'),
    request.headers.get('X-Agent-Id')
  )
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })
  }
  const requestingAgentId = auth.agentId

  const result = await deleteTeamTask(id, taskId, requestingAgentId)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
