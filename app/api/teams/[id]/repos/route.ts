import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/agent-auth'
import { isValidUuid } from '@/lib/validation'
import { getTeam, updateTeam } from '@/lib/team-registry'
import { checkTeamAccess } from '@/lib/team-acl'
import { listProjectItems, extractReposFromItems } from '@/lib/github-cli'

// GET /api/teams/[id]/repos — List repos for a team
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

  // If team has a GitHub project, scan items for repos
  if (team.githubProject) {
    try {
      const items = listProjectItems(team.githubProject.owner, team.githubProject.number)
      const repos = extractReposFromItems(items)
      return NextResponse.json({ repos, source: 'github-project' })
    } catch (error) {
      return NextResponse.json(
        { error: `GitHub project scan failed: ${(error as Error).message}` },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ repos: [], source: 'none' })
}

// POST /api/teams/[id]/repos — Register a repo with the team
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid team ID' }, { status: 400 })
  }

  const { url, name } = await request.json()
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })

  return NextResponse.json({ registered: true, url, name })
}
