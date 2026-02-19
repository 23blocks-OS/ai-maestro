import { NextRequest, NextResponse } from 'next/server'
import { getTask, updateTask, deleteTask, wouldCreateCycle } from '@/lib/task-registry'
import { getTeam } from '@/lib/team-registry'
import { checkTeamAccess } from '@/lib/team-acl'
import { isValidUuid } from '@/lib/validation'

// PUT /api/teams/[id]/tasks/[taskId] - Update a task
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const { id, taskId } = await params
    // Validate UUID format on both path parameters
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid team ID format' }, { status: 400 })
    }
    if (!isValidUuid(taskId)) {
      return NextResponse.json({ error: 'Invalid task ID format' }, { status: 400 })
    }
    const team = getTeam(id)
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }
    const agentId = request.headers.get('X-Agent-Id') || undefined
    const access = checkTeamAccess({ teamId: id, requestingAgentId: agentId })
    if (!access.allowed) {
      return NextResponse.json({ error: access.reason }, { status: 403 })
    }

    const existing = getTask(id, taskId)
    if (!existing) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Malformed JSON in request body' }, { status: 400 })
    }
    const { subject, description, status, assigneeAgentId, blockedBy, priority } = body

    // Validate priority is a non-negative number if provided
    if (priority !== undefined && (typeof priority !== 'number' || priority < 0)) {
      return NextResponse.json({ error: 'priority must be a non-negative number' }, { status: 400 })
    }

    // Validate description is a string if provided
    if (description !== undefined && typeof description !== 'string') {
      return NextResponse.json({ error: 'description must be a string' }, { status: 400 })
    }

    // Validate assigneeAgentId is a string if provided
    if (assigneeAgentId !== undefined && typeof assigneeAgentId !== 'string') {
      return NextResponse.json({ error: 'assigneeAgentId must be a string' }, { status: 400 })
    }

    // Validate blockedBy to prevent circular dependencies
    if (Array.isArray(blockedBy)) {
      for (const depId of blockedBy) {
        if (typeof depId !== 'string') {
          return NextResponse.json({ error: 'blockedBy must contain only string task IDs' }, { status: 400 })
        }
        if (depId === taskId) {
          return NextResponse.json({ error: 'A task cannot depend on itself' }, { status: 400 })
        }
        if (wouldCreateCycle(id, taskId, depId)) {
          return NextResponse.json({ error: `Adding dependency on task ${depId} would create a circular reference` }, { status: 400 })
        }
      }
    }

    // Validate status enum
    if (status !== undefined && (typeof status !== 'string' || !['backlog', 'pending', 'in_progress', 'review', 'completed'].includes(status))) {
      return NextResponse.json({ error: 'Invalid status. Must be backlog, pending, in_progress, review, or completed' }, { status: 400 })
    }

    // Build typed updates object — all fields were validated above so casts are safe
    const updates: Partial<Pick<import('@/types/task').Task, 'subject' | 'description' | 'status' | 'assigneeAgentId' | 'blockedBy' | 'priority'>> = {}
    if (typeof subject === 'string') updates.subject = subject
    if (typeof description === 'string') updates.description = description
    if (typeof status === 'string') updates.status = status as import('@/types/task').Task['status']
    if (typeof assigneeAgentId === 'string') updates.assigneeAgentId = assigneeAgentId
    if (Array.isArray(blockedBy)) updates.blockedBy = blockedBy as string[]
    if (typeof priority === 'number') updates.priority = priority
    const result = await updateTask(id, taskId, updates)

    if (!result.task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    return NextResponse.json({
      task: result.task,
      unblocked: result.unblocked,
    })
  } catch (error) {
    console.error('Failed to update task:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update task' },
      { status: 500 }
    )
  }
}

// DELETE /api/teams/[id]/tasks/[taskId] - Delete a task
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const { id, taskId } = await params
    // Validate UUID format on both path parameters
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid team ID format' }, { status: 400 })
    }
    if (!isValidUuid(taskId)) {
      return NextResponse.json({ error: 'Invalid task ID format' }, { status: 400 })
    }
    const team = getTeam(id)
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }
    const agentId = request.headers.get('X-Agent-Id') || undefined
    const access = checkTeamAccess({ teamId: id, requestingAgentId: agentId })
    if (!access.allowed) {
      return NextResponse.json({ error: access.reason }, { status: 403 })
    }

    const deleted = await deleteTask(id, taskId)
    if (!deleted) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting task:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
