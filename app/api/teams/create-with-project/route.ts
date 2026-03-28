import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword } from '@/lib/governance'
import { createTeam, getTeam, loadTeams } from '@/lib/team-registry'
import { getAgent } from '@/lib/agent-registry'
import { getManagerId } from '@/lib/governance'
import { autoAssignRolePluginForTitle } from '@/services/role-plugin-service'

interface CreateWithProjectRequest {
  name: string
  description?: string
  password: string

  // GitHub Project (optional)
  githubProject?: {
    owner: string
    repo: string
    number: number
  }

  // COS assignment (optional)
  chiefOfStaffId?: string   // existing agent UUID

  // Orchestrator assignment (optional)
  orchestratorId?: string   // existing agent UUID

  // Initial repos (optional)
  repos?: string[]
}

// POST /api/teams/create-with-project
export async function POST(request: NextRequest) {
  try {
    const body: CreateWithProjectRequest = await request.json()

    // Validate required fields
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Team name is required' }, { status: 400 })
    }
    if (!body.password) {
      return NextResponse.json({ error: 'Governance password is required' }, { status: 400 })
    }

    // Verify governance password
    const passwordValid = await verifyPassword(body.password)
    if (!passwordValid) {
      return NextResponse.json({ error: 'Invalid governance password' }, { status: 403 })
    }

    // Validate agent IDs if provided
    const agentIds: string[] = []
    if (body.chiefOfStaffId) {
      if (!getAgent(body.chiefOfStaffId)) {
        return NextResponse.json({ error: 'Chief-of-Staff agent not found' }, { status: 400 })
      }
      agentIds.push(body.chiefOfStaffId)
    }
    if (body.orchestratorId && !agentIds.includes(body.orchestratorId)) {
      if (!getAgent(body.orchestratorId)) {
        return NextResponse.json({ error: 'Orchestrator agent not found' }, { status: 400 })
      }
      agentIds.push(body.orchestratorId)
    }

    // Create team via registry (handles validation, UUID, file persistence)
    const managerId = getManagerId()
    const existingNames = loadTeams().map(t => t.name)
    const team = await createTeam(
      {
        name: body.name.trim(),
        description: body.description?.trim(),
        agentIds,
        chiefOfStaffId: body.chiefOfStaffId,
      },
      managerId,
      existingNames
    )

    // Set orchestrator (createTeam doesn't support it natively yet)
    if (body.orchestratorId) {
      const { updateTeam } = await import('@/lib/team-registry')
      await updateTeam(team.id, { orchestratorId: body.orchestratorId })
    }

    // Set GitHub project link if provided
    if (body.githubProject) {
      const { updateTeam } = await import('@/lib/team-registry')
      await updateTeam(team.id, { githubProject: body.githubProject })
    }

    // Auto-assign role-plugins for COS and Orchestrator
    if (body.chiefOfStaffId) {
      try { await autoAssignRolePluginForTitle('chief-of-staff', body.chiefOfStaffId) }
      catch (err) { console.warn('[create-with-project] COS plugin failed:', err) }
    }
    if (body.orchestratorId) {
      try { await autoAssignRolePluginForTitle('orchestrator', body.orchestratorId) }
      catch (err) { console.warn('[create-with-project] Orchestrator plugin failed:', err) }
    }

    // Configure GitHub project template if project linked
    if (body.githubProject) {
      try {
        const { configureProjectTemplate } = await import('@/lib/github-cli')
        const fieldIds = configureProjectTemplate(
          body.githubProject.owner,
          body.githubProject.number
        )
        // Store field IDs in team kanban config (for future use)
        console.log('[create-with-project] Project template configured with field IDs:', Object.keys(fieldIds))
      } catch (err) {
        // Non-fatal — project template can be configured later
        console.warn('[create-with-project] Failed to configure project template:', err)
      }
    }

    return NextResponse.json({
      team,
      message: `Team "${team.name}" created successfully`
    }, { status: 201 })

  } catch (error) {
    console.error('[create-with-project] Error:', error)
    return NextResponse.json(
      { error: `Failed to create team: ${(error as Error).message}` },
      { status: 500 }
    )
  }
}
