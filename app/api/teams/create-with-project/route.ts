import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword } from '@/lib/governance'
import { createTeam, getTeam, loadTeams } from '@/lib/team-registry'
import { getAgent } from '@/lib/agent-registry'
import { getManagerId } from '@/lib/governance'
import { ChangeTitle } from '@/services/element-management-service'

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

    // Governance: teams require an existing MANAGER first
    const existingManager = getManagerId()
    if (!existingManager) {
      return NextResponse.json(
        { error: 'Teams require an existing MANAGER first. Assign the MANAGER title to an agent before creating teams.' },
        { status: 400 }
      )
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

    // Auto-create COS agent if none was specified (COS is mandatory for every team)
    let cosId = body.chiefOfStaffId || null
    if (!cosId) {
      try {
        const { createAgent: createCosAgent } = await import('@/lib/agent-registry')
        const teamSlug = body.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 30)
        const cosName = `cos-${teamSlug}`
        const robotIndex = Math.floor(Math.random() * 50) + 1
        const robotAvatar = `/avatars/robots_${robotIndex.toString().padStart(2, '0')}.jpg`
        const cosAgent = await createCosAgent({
          name: cosName,
          program: 'claude',
          avatar: robotAvatar,
          workingDirectory: process.env.HOME || '/tmp',
          taskDescription: `Chief-of-Staff for team "${body.name.trim()}"`,
          role: 'chief-of-staff',
          createSession: false,
        })
        cosId = cosAgent.id
        const { updateTeam: updateTeamCos } = await import('@/lib/team-registry')
        await updateTeamCos(team.id, {
          chiefOfStaffId: cosId,
          agentIds: [...(team.agentIds || []), cosId],
        })
        console.log(`[create-with-project] Auto-created COS agent "${cosName}" (${cosId})`)
      } catch (err) {
        console.warn('[create-with-project] Auto-create COS failed:', err instanceof Error ? err.message : err)
      }
    }

    // Assign COS title + role-plugin
    if (cosId) {
      try { await ChangeTitle(cosId, 'chief-of-staff') }
      catch (err) { console.warn('[create-with-project] ChangeTitle COS failed:', err) }
    }
    if (body.orchestratorId) {
      try { await ChangeTitle(body.orchestratorId, 'orchestrator') }
      catch (err) { console.warn('[create-with-project] ChangeTitle Orchestrator failed:', err) }
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
