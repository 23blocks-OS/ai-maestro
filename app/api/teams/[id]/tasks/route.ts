import { NextRequest, NextResponse } from 'next/server'
import { loadTasks, resolveTaskDeps, createTask } from '@/lib/task-registry'
import { getTeam } from '@/lib/team-registry'

// GET /api/teams/[id]/tasks - List tasks with resolved dependencies
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const team = getTeam(id)
  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }

  const tasks = loadTasks(id)
  const resolved = resolveTaskDeps(tasks)
  return NextResponse.json({ tasks: resolved })
}

// POST /api/teams/[id]/tasks - Create a new task
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const team = getTeam(id)
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    const body = await request.json()
    const { subject, description, assigneeAgentId, blockedBy, priority } = body

    if (!subject || typeof subject !== 'string' || !subject.trim()) {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
    }

    // Validate blockedBy is an array of strings if provided
    if (blockedBy !== undefined) {
      if (!Array.isArray(blockedBy) || !blockedBy.every((id: unknown) => typeof id === 'string')) {
        return NextResponse.json({ error: 'blockedBy must be an array of task ID strings' }, { status: 400 })
      }
    }

    const task = createTask({
      teamId: id,
      subject: subject.trim(),
      description,
      assigneeAgentId,
      blockedBy,
      priority,
    })

    return NextResponse.json({ task }, { status: 201 })
  } catch (error) {
    console.error('Failed to create task:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create task' },
      { status: 500 }
    )
  }
}
