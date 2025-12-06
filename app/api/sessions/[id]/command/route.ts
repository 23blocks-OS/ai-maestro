import { NextRequest, NextResponse } from 'next/server'

// Define types for global terminal sessions (from server.mjs)
declare global {
  // eslint-disable-next-line no-var
  var terminalSessions: Map<string, {
    clients: Set<unknown>
    ptyProcess: {
      write: (data: string) => void
    }
    logStream: unknown
    loggingEnabled: boolean
  }> | undefined

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
 * POST /api/sessions/[id]/command
 * Send a command to a terminal session
 *
 * Body:
 * - command: string - The command to send
 * - requireIdle: boolean - Only send if session is idle (default: true)
 * - addNewline: boolean - Add newline to execute command (default: true)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionName } = await params
    const body = await request.json()

    const command = body.command as string
    const requireIdle = body.requireIdle !== false // Default true
    const addNewline = body.addNewline !== false // Default true

    if (!command || typeof command !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Command is required' },
        { status: 400 }
      )
    }

    // Check if terminal sessions are available
    if (!global.terminalSessions) {
      return NextResponse.json(
        { success: false, error: 'Terminal sessions not available' },
        { status: 503 }
      )
    }

    // Get the session
    const session = global.terminalSessions.get(sessionName)
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Session not found or not connected' },
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
      }, { status: 409 }) // Conflict
    }

    // Send command to PTY
    const fullCommand = addNewline ? command + '\n' : command
    session.ptyProcess.write(fullCommand)

    // Update activity timestamp
    if (global.sessionActivity) {
      global.sessionActivity.set(sessionName, Date.now())
    }

    return NextResponse.json({
      success: true,
      sessionName,
      commandSent: command,
      wasIdle: isSessionIdle(sessionName)
    })

  } catch (error) {
    console.error('[Session Command API] Error:', error)
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
 * GET /api/sessions/[id]/command
 * Check if a session is idle and ready for commands
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionName } = await params

    // Check if terminal sessions are available
    if (!global.terminalSessions) {
      return NextResponse.json({
        success: true,
        sessionName,
        connected: false,
        idle: false,
        reason: 'Terminal sessions not available'
      })
    }

    // Get the session
    const session = global.terminalSessions.get(sessionName)
    if (!session) {
      return NextResponse.json({
        success: true,
        sessionName,
        connected: false,
        idle: false,
        reason: 'Session not connected'
      })
    }

    const lastActivity = global.sessionActivity?.get(sessionName)
    const timeSinceActivity = lastActivity ? Date.now() - lastActivity : null
    const idle = isSessionIdle(sessionName)

    return NextResponse.json({
      success: true,
      sessionName,
      connected: true,
      idle,
      lastActivity,
      timeSinceActivity,
      idleThreshold: IDLE_THRESHOLD_MS,
      clientCount: session.clients.size
    })

  } catch (error) {
    console.error('[Session Command API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
