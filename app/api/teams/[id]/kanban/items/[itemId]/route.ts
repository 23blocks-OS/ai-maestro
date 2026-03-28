import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/agent-auth'
import { isValidUuid } from '@/lib/validation'
import { getTeam } from '@/lib/team-registry'
import { checkTeamAccess } from '@/lib/team-acl'
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
  // Validate itemId — GitHub project item IDs are like "PVTI_xxx", not UUIDs
  if (!itemId || typeof itemId !== 'string' || itemId.length > 100) {
    return NextResponse.json({ error: 'Invalid item ID' }, { status: 400 })
  }
  const auth = authenticateAgent(
    request.headers.get('Authorization'),
    request.headers.get('X-Agent-Id')
  )
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })

  const access = checkTeamAccess({ teamId: id, requestingAgentId: auth.agentId })
  if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: 403 })

  const team = getTeam(id)
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  if (!team.githubProject) {
    return NextResponse.json({ error: 'Team has no GitHub project linked' }, { status: 400 })
  }

  // Kanban write: only ORCHESTRATOR, COS, or MANAGER agents can modify. Web UI (no agentId) is allowed.
  if (auth.agentId) {
    const { isManager, isOrchestrator, isChiefOfStaff } = await import('@/lib/governance')
    const isWriteAllowed = isManager(auth.agentId) || isOrchestrator(auth.agentId, id) || isChiefOfStaff(auth.agentId, id)
    if (!isWriteAllowed) {
      return NextResponse.json({ error: 'Only ORCHESTRATOR, COS, or MANAGER can modify kanban' }, { status: 403 })
    }
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
  // Validate itemId — GitHub project item IDs are like "PVTI_xxx", not UUIDs
  if (!itemId || typeof itemId !== 'string' || itemId.length > 100) {
    return NextResponse.json({ error: 'Invalid item ID' }, { status: 400 })
  }
  const auth = authenticateAgent(
    request.headers.get('Authorization'),
    request.headers.get('X-Agent-Id')
  )
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })

  const accessDel = checkTeamAccess({ teamId: id, requestingAgentId: auth.agentId })
  if (!accessDel.allowed) return NextResponse.json({ error: accessDel.reason }, { status: 403 })

  const team = getTeam(id)
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  if (!team.githubProject) {
    return NextResponse.json({ error: 'Team has no GitHub project linked' }, { status: 400 })
  }

  // Kanban write: only ORCHESTRATOR, COS, or MANAGER agents can modify. Web UI (no agentId) is allowed.
  if (auth.agentId) {
    const { isManager, isOrchestrator, isChiefOfStaff } = await import('@/lib/governance')
    const isWriteAllowed = isManager(auth.agentId) || isOrchestrator(auth.agentId, id) || isChiefOfStaff(auth.agentId, id)
    if (!isWriteAllowed) {
      return NextResponse.json({ error: 'Only ORCHESTRATOR, COS, or MANAGER can modify kanban' }, { status: 403 })
    }
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
