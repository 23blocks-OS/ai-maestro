import { NextRequest, NextResponse } from 'next/server'
import { agentRegistry } from '@/lib/agent'
import {
  initializeTrackingSchema,
  upsertAgent,
  createSession,
  upsertProject,
  createClaudeSession,
  getAgentFullContext,
  getAgentWorkHistory
} from '@/lib/cozo-schema'

/**
 * GET /api/agents/:id/tracking
 * Get agent's complete tracking data (sessions, projects, conversations)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params

    // Get or create agent (will initialize with subconscious if first time)
    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    // Get full context
    const context = await getAgentFullContext(agentDb, agentId)

    // Get work history
    const history = await getAgentWorkHistory(agentDb, agentId)

    // NOTE: Don't close agentDb - it's owned by the agent and stays open

    return NextResponse.json({
      success: true,
      agent_id: agentId,
      context,
      history
    })
  } catch (error) {
    console.error('[Tracking API] Error:', error)
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
 * POST /api/agents/:id/tracking
 * Initialize tracking schema and optionally add sample data
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const body = await request.json().catch(() => ({}))

    // Get or create agent (will initialize with subconscious if first time)
    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    // Initialize schema
    await initializeTrackingSchema(agentDb)

    // If requested, add sample data
    if (body.addSampleData) {
      console.log('[Tracking API] Adding sample data...')

      // 1. Create agent record
      try {
        console.log('[Tracking API] Step 1: Creating agent...')
        await upsertAgent(agentDb, {
          agent_id: agentId,
          name: agentId,
          type: 'local',
          model: 'sonnet'
          // Optional fields will be discovered/populated later:
          // - working_directory (from tmux session cwd)
          // - config_file (from ~/.aimaestro scan)
          // - metadata_file (from file system discovery)
        })
        console.log('[Tracking API] ✅ Agent created')
      } catch (error) {
        console.error('[Tracking API] ❌ Failed at step 1 (upsertAgent):', error)
        throw error
      }

      // 2. Create a session
      try {
        console.log('[Tracking API] Step 2: Creating session...')
        await createSession(agentDb, {
          session_id: `${agentId}-session-1`,
          agent_id: agentId,
          session_name: agentId,
          project_path: `/Users/juanpelaez/projects/example-project`,
          log_file: `~/.aimaestro/agents/${agentId}/logs/session-1.log`
        })
        console.log('[Tracking API] ✅ Session created')
      } catch (error) {
        console.error('[Tracking API] ❌ Failed at step 2 (createSession):', error)
        throw error
      }

      // 3. Create a project
      try {
        console.log('[Tracking API] Step 3: Creating project...')
        const projectId = 'example-project-id'
        await upsertProject(agentDb, {
          project_id: projectId,
          agent_id: agentId,
          project_path: '/Users/juanpelaez/projects/example-project',
          project_name: 'example-project'
          // Optional fields will be discovered later:
          // - claude_config_dir (scan for .claude directories)
          // - claude_settings, claude_md (file system discovery)
          // - language, framework (detected from package.json, etc.)
        })
        console.log('[Tracking API] ✅ Project created')
      } catch (error) {
        console.error('[Tracking API] ❌ Failed at step 3 (upsertProject):', error)
        throw error
      }

      // 4. Create Claude sessions
      try {
        console.log('[Tracking API] Step 4: Creating Claude sessions...')
        const projectId = 'example-project-id'
        await createClaudeSession(agentDb, {
          claude_session_id: 'claude-session-1',
          agent_id: agentId,
          project_id: projectId,
          ai_maestro_session_id: `${agentId}-session-1`,
          jsonl_file: '~/.claude/projects/example-project/8ae3f2.jsonl',
          session_type: 'main'
        })

        await createClaudeSession(agentDb, {
          claude_session_id: 'claude-session-2',
          agent_id: agentId,
          project_id: projectId,
          ai_maestro_session_id: `${agentId}-session-1`,
          jsonl_file: '~/.claude/projects/example-project/7bc2a1.jsonl',
          session_type: 'sidechain'
        })
        console.log('[Tracking API] ✅ Claude sessions created')
      } catch (error) {
        console.error('[Tracking API] ❌ Failed at step 4 (createClaudeSession):', error)
        throw error
      }

      console.log('[Tracking API] ✅ Sample data added')
    }

    // Get the created structure
    // TODO: Fix getAgentFullContext query syntax
    // const context = await getAgentFullContext(agentDb, agentId)

    // NOTE: Don't close agentDb - it's owned by the agent and stays open

    return NextResponse.json({
      success: true,
      agent_id: agentId,
      message: 'Tracking schema initialized' + (body.addSampleData ? ' with sample data' : ''),
      // context
    })
  } catch (error) {
    console.error('[Tracking API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}
