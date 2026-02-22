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
  if (!isValidUuid(id) || !isValidUuid(taskId)) {
    return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
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

  // Whitelist only known UpdateTaskParams fields to avoid passing arbitrary data
  const safeParams: UpdateTaskParams = {
    ...(body.subject !== undefined && { subject: String(body.subject) }),
    ...(body.description !== undefined && { description: String(body.description) }),
    ...(body.status !== undefined && { status: body.status as UpdateTaskParams['status'] }),
    ...(body.priority !== undefined && { priority: Number(body.priority) }),
    ...(body.assigneeAgentId !== undefined && { assigneeAgentId: String(body.assigneeAgentId) }),
    ...(body.blockedBy !== undefined && { blockedBy: body.blockedBy as string[] }),
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
  if (!isValidUuid(id) || !isValidUuid(taskId)) {
    return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
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
