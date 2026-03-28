import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/agent-auth'
import { isValidUuid } from '@/lib/validation'
import { getTeam } from '@/lib/team-registry'
import { moveProjectItem, archiveProjectItem, configureProjectTemplate } from '@/lib/github-cli'

// PATCH /api/teams/[id]/kanban/items/[itemId] — Move item to new status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id, itemId } = await params
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid team ID' }, { status: 400 })
  }
  const auth = authenticateAgent(
    request.headers.get('Authorization'),
    request.headers.get('X-Agent-Id')
  )
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })

  const team = getTeam(id)
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  if (!team.githubProject) {
    return NextResponse.json({ error: 'Team has no GitHub project linked' }, { status: 400 })
  }

  try {
    const { status } = await request.json()
    if (!status) return NextResponse.json({ error: 'status is required' }, { status: 400 })

    // Map short names to display names
    const statusMap: Record<string, string> = {
      'backlog': 'Backlog',
      'todo': 'To Do',
      'in_progress': 'In Progress',
      'review': 'Review',
      'done': 'Done',
    }
    const displayStatus = statusMap[status] || status

    // Get field IDs (may need to configure template first)
    const fieldIds = configureProjectTemplate(
      team.githubProject.owner,
      team.githubProject.number
    )

    moveProjectItem(
      team.githubProject.owner,
      team.githubProject.number,
      itemId,
      displayStatus,
      fieldIds
    )

    return NextResponse.json({ success: true, status: displayStatus })
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to move item: ${(error as Error).message}` },
      { status: 500 }
    )
  }
}

// DELETE /api/teams/[id]/kanban/items/[itemId] — Archive item
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id, itemId } = await params
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid team ID' }, { status: 400 })
  }
  const auth = authenticateAgent(
    request.headers.get('Authorization'),
    request.headers.get('X-Agent-Id')
  )
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })

  const team = getTeam(id)
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  if (!team.githubProject) {
    return NextResponse.json({ error: 'Team has no GitHub project linked' }, { status: 400 })
  }

  try {
    archiveProjectItem(
      team.githubProject.owner,
      team.githubProject.number,
      itemId
    )
    return NextResponse.json({ success: true, archived: itemId })
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to archive item: ${(error as Error).message}` },
      { status: 500 }
    )
  }
}
