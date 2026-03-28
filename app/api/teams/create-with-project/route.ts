import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword } from '@/lib/governance'
import { createTeam, getTeam, loadTeams } from '@/lib/team-registry'
import { getAgent } from '@/lib/agent-registry'
import { getManagerId } from '@/lib/governance'
import { autoAssignRolePluginForTitle } from '@/services/role-plugin-service'

export const dynamic = 'force-dynamic'

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

  // NOTE: repos field intentionally removed — repo registration is not implemented;
  // callers should use POST /api/teams/[id]/repos after team creation.
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
      // Validate githubProject fields to prevent shell injection via gh CLI
      const safeOwnerRepo = /^[a-zA-Z0-9_.-]+$/
      if (
        typeof body.githubProject.owner !== 'string' ||
        !safeOwnerRepo.test(body.githubProject.owner) ||
        typeof body.githubProject.repo !== 'string' ||
        !safeOwnerRepo.test(body.githubProject.repo) ||
        typeof body.githubProject.number !== 'number' ||
        !Number.isInteger(body.githubProject.number) ||
        body.githubProject.number < 1
      ) {
        return NextResponse.json(
          { error: 'githubProject.owner and repo must be alphanumeric, number must be a positive integer' },
          { status: 400 }
        )
      }
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
      { error: 'Failed to create team' },
      { status: 500 }
    )
  }
}
