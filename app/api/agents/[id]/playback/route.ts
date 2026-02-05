import { NextResponse } from 'next/server'
import { getAgent, getAgentByAlias, getAgentByName } from '@/lib/agent-registry'
import { agentRegistry } from '@/lib/agent'

/**
 * Playback state interface (placeholder for Phase 5)
 * TODO: This will be moved to types/playback.ts in a future task
 */
interface PlaybackState {
  agentId: string
  sessionId?: string
  isPlaying: boolean
  currentMessageIndex: number
  speed: number // 0.5x, 1x, 1.5x, 2x
  totalMessages?: number
  createdAt: string
  updatedAt: string
}

/**
 * Playback control interface (placeholder for Phase 5)
 */
interface PlaybackControl {
  action: 'play' | 'pause' | 'seek' | 'setSpeed' | 'reset'
  value?: number // Used for seek or setSpeed actions
}

/**
 * GET /api/agents/[id]/playback
 * Get playback state for an agent
 *
 * Query parameters:
 * - sessionId: Specific session to get playback state for (optional)
 *
 * Returns:
 * - success: true/false
 * - playbackState: Current playback state
 * - message: Status message
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Try to find agent by ID first, then by name, then by alias (deprecated)
    let agent = getAgent(params.id)
    if (!agent) {
      agent = getAgentByName(params.id)
    }
    if (!agent) {
      agent = getAgentByAlias(params.id)
    }

    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    console.log(
      `[Playback API] Get state: Agent=${params.id}, Session=${sessionId || 'all'}`
    )

    // TODO: Load playback state from CozoDB
    // This will use lib/playback-manager.ts in a future task
    // For now, return a default placeholder state
    const playbackState: PlaybackState = {
      agentId: agent.id,
      sessionId: sessionId || undefined,
      isPlaying: false,
      currentMessageIndex: 0,
      speed: 1,
      totalMessages: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    return NextResponse.json({
      success: true,
      playbackState,
      message: 'Playback state retrieved (placeholder - Phase 5 implementation pending)'
    })
  } catch (error) {
    console.error('[Playback API] Failed to get playback state:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get playback state'
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/agents/[id]/playback
 * Control playback state for an agent
 *
 * Body:
 * - action: Playback action (play | pause | seek | setSpeed | reset)
 * - sessionId: Specific session to control (optional)
 * - value: Numeric value for seek or setSpeed actions (optional)
 *
 * Returns:
 * - success: true/false
 * - playbackState: Updated playback state
 * - message: Status message
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Try to find agent by ID first, then by name, then by alias (deprecated)
    let agent = getAgent(params.id)
    if (!agent) {
      agent = getAgentByName(params.id)
    }
    if (!agent) {
      agent = getAgentByAlias(params.id)
    }

    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    const body = await request.json()

    // Validate required action parameter
    const { action, sessionId, value } = body
    if (!action) {
      return NextResponse.json(
        { error: 'Missing required parameter: action' },
        { status: 400 }
      )
    }

    // Validate action value
    const validActions = ['play', 'pause', 'seek', 'setSpeed', 'reset']
    if (!validActions.includes(action)) {
      return NextResponse.json(
        {
          error: `Invalid action. Must be one of: ${validActions.join(', ')}`
        },
        { status: 400 }
      )
    }

    // Validate value is provided for seek and setSpeed actions
    if ((action === 'seek' || action === 'setSpeed') && (value === undefined || isNaN(value))) {
      return NextResponse.json(
        { error: `Action '${action}' requires a numeric value parameter` },
        { status: 400 }
      )
    }

    // Validate sessionId exists for this agent
    if (sessionId && !agent.sessions?.some(s => s.index === parseInt(sessionId))) {
      return NextResponse.json(
        { error: 'Session not found for this agent' },
        { status: 404 }
      )
    }

    console.log(
      `[Playback API] Control: Agent=${params.id}, Action=${action}, Session=${sessionId || 'all'}`
    )

    // TODO: Implement actual playback control logic
    // This will use lib/playback-manager.ts in a future task
    // For now, return a placeholder response
    const playbackState: PlaybackState = {
      agentId: agent.id,
      sessionId: sessionId || undefined,
      isPlaying: action === 'play' ? true : action === 'pause' ? false : false,
      currentMessageIndex: action === 'seek' ? Math.floor(value || 0) : 0,
      speed: action === 'setSpeed' ? (value || 1) : 1,
      totalMessages: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    return NextResponse.json({
      success: true,
      playbackState,
      message: 'Playback control executed (placeholder - Phase 5 implementation pending)'
    })
  } catch (error) {
    console.error('[Playback API] Failed to control playback:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to control playback'
      },
      { status: 500 }
    )
  }
}
