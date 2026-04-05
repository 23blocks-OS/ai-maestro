import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword } from '@/lib/governance'
import { createNewTeam } from '@/services/teams-service'

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

  // COS assignment (optional — auto-created if not provided)
  chiefOfStaffId?: string   // existing AUTONOMOUS agent UUID

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

    // Delegate to createNewTeam — the All-In-One function that handles:
    // - MANAGER existence check
    // - COS validation (must be AUTONOMOUS) or auto-creation
    // - Auto-MEMBER titling for all team agents
    // - Orchestrator assignment
    const result = await createNewTeam({
      name: body.name.trim(),
      description: body.description?.trim(),
      chiefOfStaffId: body.chiefOfStaffId,
      orchestratorId: body.orchestratorId,
    })

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const team = result.data!.team

    // Post-creation: GitHub project linking (not part of createNewTeam)
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

      // Configure GitHub project template
      try {
        const { configureProjectTemplate } = await import('@/lib/github-cli')
        const fieldIds = configureProjectTemplate(
          body.githubProject.owner,
          body.githubProject.number
        )
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
