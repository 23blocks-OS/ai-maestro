import { NextRequest, NextResponse } from 'next/server'
import { getTask, updateTask, deleteTask, wouldCreateCycle } from '@/lib/task-registry'
import { getTeam } from '@/lib/team-registry'
import { checkTeamAccess } from '@/lib/team-acl'

// PUT /api/teams/[id]/tasks/[taskId] - Update a task
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const { id, taskId } = await params
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

    const body = await request.json()
    const { subject, description, status, assigneeAgentId, blockedBy, priority } = body

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
    if (status !== undefined && !['backlog', 'pending', 'in_progress', 'review', 'completed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status. Must be backlog, pending, in_progress, review, or completed' }, { status: 400 })
    }

    const result = updateTask(id, taskId, {
      subject,
      description,
      status,
      assigneeAgentId,
      blockedBy,
      priority,
    })

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
  const { id, taskId } = await params
  const team = getTeam(id)
  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }
  const agentId = request.headers.get('X-Agent-Id') || undefined
  const access = checkTeamAccess({ teamId: id, requestingAgentId: agentId })
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason }, { status: 403 })
  }

  const deleted = deleteTask(id, taskId)
  if (!deleted) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
