import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/agent-auth'
import { isValidUuid } from '@/lib/validation'
import { getTeam } from '@/lib/team-registry'
import { checkTeamAccess } from '@/lib/team-acl'
import { addProjectItem, listProjectItems, createIssue, linkIssueToProject } from '@/lib/github-cli'

// GET /api/teams/[id]/kanban/items — List kanban items
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid team ID' }, { status: 400 })
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

  try {
    const status = request.nextUrl.searchParams.get('status') || undefined
    const assignee = request.nextUrl.searchParams.get('assignee') || undefined
    let items = listProjectItems(team.githubProject.owner, team.githubProject.number)

    // Apply filters
    if (status) items = items.filter(i => i.status?.toLowerCase() === status.toLowerCase())
    if (assignee) items = items.filter(i => i.assignee === assignee)

    return NextResponse.json({ items })
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to list items: ${(error as Error).message}` },
      { status: 500 }
    )
  }
}

// POST /api/teams/[id]/kanban/items — Create a kanban item (issue + project card)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid team ID' }, { status: 400 })
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
    const { title, repo, assignee, labels } = await request.json()
    if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

    // Default repo from project owner
    const targetRepo = repo || `${team.githubProject.owner}/${team.githubProject.repo}`
    // Validate targetRepo format — must be "owner/name" with no shell metacharacters
    if (!targetRepo || !targetRepo.includes('/') || /[;&|`$(){}!#'"\\<>*?\[\]\n\r~]/.test(targetRepo)) {
      return NextResponse.json({ error: 'Invalid repo format (expected owner/name)' }, { status: 400 })
    }
    const [owner, repoName] = targetRepo.split('/')

    // Create issue
    const labelsList = labels ? labels.split(',').map((l: string) => l.trim()) : ['ai-maestro-task']
    const issue = createIssue(owner, repoName, title, `Assigned to: ${assignee || 'unassigned'}`, labelsList)

    // Link to project
    const itemId = linkIssueToProject(team.githubProject.owner, team.githubProject.number, issue.url)

    return NextResponse.json({ issue, itemId })
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to create item: ${(error as Error).message}` },
      { status: 500 }
    )
  }
}
