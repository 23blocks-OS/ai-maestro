import { NextRequest, NextResponse } from 'next/server'
import { updateTeamTask, deleteTeamTask, UpdateTaskParams } from '@/services/teams-service'
import { authenticateAgent } from '@/lib/agent-auth'
import { isValidUuid } from '@/lib/validation'
import type { TaskStatus } from '@/types/task'

// SF-014: Allowed TaskStatus values for route-level validation
const VALID_TASK_STATUSES: TaskStatus[] = ['backlog', 'pending', 'in_progress', 'review', 'completed']

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

  // SF-014: Validate body.status against allowed TaskStatus values before passing to service
  if (body.status !== undefined && !VALID_TASK_STATUSES.includes(body.status as TaskStatus)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_TASK_STATUSES.join(', ')}` }, { status: 400 })
  }
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
