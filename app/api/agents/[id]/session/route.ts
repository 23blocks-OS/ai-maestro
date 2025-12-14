import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { linkSession, unlinkSession, getAgent, deleteAgent } from '@/lib/agent-registry'
import { unpersistSession } from '@/lib/session-persistence'

const execAsync = promisify(exec)

// Define types for global session activity (from server.mjs)
declare global {
  // eslint-disable-next-line no-var
  var sessionActivity: Map<string, number> | undefined
}

// Idle threshold in milliseconds (30 seconds)
const IDLE_THRESHOLD_MS = 30 * 1000

/**
 * Check if a session is idle
 */
function isSessionIdle(sessionName: string): boolean {
  const activity = global.sessionActivity?.get(sessionName)
  if (!activity) return true // No activity recorded = idle

  const timeSinceActivity = Date.now() - activity
  return timeSinceActivity > IDLE_THRESHOLD_MS
}

/**
 * Check if a tmux session exists
 */
async function tmuxSessionExists(sessionName: string): Promise<boolean> {
  try {
    await execAsync(`tmux has-session -t "${sessionName}" 2>/dev/null`)
    return true
  } catch {
    return false
  }
}

/**
 * Cancel copy-mode if active
 */
async function cancelCopyModeIfActive(sessionName: string): Promise<void> {
  try {
    const { stdout } = await execAsync(`tmux display-message -t "${sessionName}" -p "#{pane_in_mode}"`)
    if (stdout.trim() === '1') {
      await execAsync(`tmux send-keys -t "${sessionName}" q`)
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  } catch {
    // Ignore errors
  }
}

/**
 * POST /api/agents/[id]/session
 * Link a tmux session to an agent
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { sessionName, workingDirectory } = body

    if (!sessionName) {
      return NextResponse.json(
        { error: 'sessionName is required' },
        { status: 400 }
      )
    }

    const success = linkSession(
      id,
      sessionName,
      workingDirectory || process.cwd()
    )

    if (!success) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to link session'
    console.error('Failed to link session:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

/**
 * PATCH /api/agents/[id]/session
 * Send a command to the agent's tmux session
 *
 * Body:
 * - command: string - The command to send
 * - requireIdle: boolean - Only send if session is idle (default: true)
 * - addNewline: boolean - Add Enter key to execute command (default: true)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const command = body.command as string
    const requireIdle = body.requireIdle !== false
    const addNewline = body.addNewline !== false

    if (!command || typeof command !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Command is required' },
        { status: 400 }
      )
    }

    // Get agent and its session info
    const agent = getAgent(id)
    if (!agent) {
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 }
      )
    }

    const sessionName = agent.tools.session?.tmuxSessionName
    if (!sessionName) {
      return NextResponse.json(
        { success: false, error: 'Agent has no linked session' },
        { status: 400 }
      )
    }

    // Check if tmux session exists
    const exists = await tmuxSessionExists(sessionName)
    if (!exists) {
      return NextResponse.json(
        { success: false, error: 'Tmux session not found' },
        { status: 404 }
      )
    }

    // Check if idle (if required)
    if (requireIdle && !isSessionIdle(sessionName)) {
      const lastActivity = global.sessionActivity?.get(sessionName)
      const timeSinceActivity = lastActivity ? Date.now() - lastActivity : 0

      return NextResponse.json({
        success: false,
        error: 'Session is not idle',
        idle: false,
        timeSinceActivity,
        idleThreshold: IDLE_THRESHOLD_MS
      }, { status: 409 })
    }

    // Cancel copy-mode if active
    await cancelCopyModeIfActive(sessionName)

    // Send keys via tmux
    const escapedKeys = command.replace(/'/g, "'\\''")
    await execAsync(`tmux send-keys -t "${sessionName}" -l '${escapedKeys}'`)

    // Send Enter key if requested
    if (addNewline) {
      await execAsync(`tmux send-keys -t "${sessionName}" Enter`)
    }

    // Update activity timestamp
    if (global.sessionActivity) {
      global.sessionActivity.set(sessionName, Date.now())
    }

    return NextResponse.json({
      success: true,
      agentId: id,
      sessionName,
      commandSent: command,
      method: 'tmux-send-keys',
      wasIdle: true
    })

  } catch (error) {
    console.error('[Agent Session Command API] Error:', error)
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
 * GET /api/agents/[id]/session
 * Get session status for an agent
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const agent = getAgent(id)
    if (!agent) {
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 }
      )
    }

    const sessionName = agent.tools.session?.tmuxSessionName
    if (!sessionName) {
      return NextResponse.json({
        success: true,
        agentId: id,
        hasSession: false,
        exists: false,
        idle: false
      })
    }

    const exists = await tmuxSessionExists(sessionName)
    const lastActivity = global.sessionActivity?.get(sessionName)
    const timeSinceActivity = lastActivity ? Date.now() - lastActivity : null
    const idle = isSessionIdle(sessionName)

    return NextResponse.json({
      success: true,
      agentId: id,
      sessionName,
      hasSession: true,
      exists,
      idle,
      lastActivity,
      timeSinceActivity,
      idleThreshold: IDLE_THRESHOLD_MS
    })

  } catch (error) {
    console.error('[Agent Session API] Error:', error)
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
 * DELETE /api/agents/[id]/session
 * Unlink session from agent, optionally kill the tmux session
 *
 * Query params:
 * - kill: boolean - Also kill the tmux session (default: false)
 * - deleteAgent: boolean - Delete the entire agent (default: false)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const searchParams = request.nextUrl.searchParams
    const killSession = searchParams.get('kill') === 'true'
    const shouldDeleteAgent = searchParams.get('deleteAgent') === 'true'

    const agent = getAgent(id)
    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    const sessionName = agent.tools.session?.tmuxSessionName

    // If deleting the agent
    if (shouldDeleteAgent) {
      // Kill tmux session if requested and exists
      if (sessionName && killSession) {
        const exists = await tmuxSessionExists(sessionName)
        if (exists) {
          await execAsync(`tmux kill-session -t "${sessionName}"`)
          unpersistSession(sessionName)
        }
      }

      // Delete the agent
      const success = deleteAgent(id)
      if (!success) {
        return NextResponse.json(
          { error: 'Failed to delete agent' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        agentId: id,
        deleted: true,
        sessionKilled: killSession && !!sessionName
      })
    }

    // Just unlink the session
    if (sessionName && killSession) {
      const exists = await tmuxSessionExists(sessionName)
      if (exists) {
        await execAsync(`tmux kill-session -t "${sessionName}"`)
        unpersistSession(sessionName)
      }
    }

    const success = unlinkSession(id)

    if (!success) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      agentId: id,
      sessionUnlinked: true,
      sessionKilled: killSession && !!sessionName
    })
  } catch (error) {
    console.error('Failed to unlink/delete session:', error)
    return NextResponse.json(
      { error: 'Failed to unlink session' },
      { status: 500 }
    )
  }
}
