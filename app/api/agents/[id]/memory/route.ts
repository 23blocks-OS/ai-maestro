import { NextRequest, NextResponse } from 'next/server'
import { createAgentDatabase } from '@/lib/cozo-db'
import {
  initializeSimpleSchema,
  recordSession,
  recordProject,
  getSessions,
  getProjects
} from '@/lib/cozo-schema-simple'

/**
 * GET /api/agents/:id/memory
 * Get agent's memory (sessions and projects)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params

    const agentDb = await createAgentDatabase({ agentId })

    // Get sessions and projects
    const sessions = await getSessions(agentDb, agentId)
    const projects = await getProjects(agentDb)

    await agentDb.close()

    return NextResponse.json({
      success: true,
      agent_id: agentId,
      sessions: sessions.rows || [],
      projects: projects.rows || []
    })
  } catch (error) {
    console.error('[Memory API] GET Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/agents/:id/memory
 * Initialize schema and optionally populate from current tmux sessions
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const body = await request.json().catch(() => ({}))

    const agentDb = await createAgentDatabase({ agentId })

    // Initialize schema
    await initializeSimpleSchema(agentDb)

    // If requested, populate from current tmux sessions
    if (body.populateFromSessions) {
      console.log('[Memory API] Populating from tmux sessions...')

      // Fetch current sessions
      const sessionsResponse = await fetch('http://localhost:23000/api/sessions')
      const sessionsData = await sessionsResponse.json()

      // Record sessions that belong to this agent
      for (const session of sessionsData.sessions || []) {
        if (session.agentId === agentId) {
          await recordSession(agentDb, {
            session_id: session.id,
            session_name: session.name,
            agent_id: agentId,
            working_directory: session.workingDirectory,
            started_at: new Date(session.createdAt).getTime(),
            status: session.status
          })

          // Record project if working directory exists
          if (session.workingDirectory) {
            const projectName = session.workingDirectory.split('/').pop() || 'unknown'
            await recordProject(agentDb, {
              project_path: session.workingDirectory,
              project_name: projectName
            })
          }
        }
      }

      console.log('[Memory API] ✅ Populated from sessions')
    }

    await agentDb.close()

    return NextResponse.json({
      success: true,
      agent_id: agentId,
      message: 'Memory initialized' + (body.populateFromSessions ? ' and populated from sessions' : '')
    })
  } catch (error) {
    console.error('[Memory API] POST Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
