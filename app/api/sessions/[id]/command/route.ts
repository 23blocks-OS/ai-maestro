import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * @deprecated Use /api/agents/[id]/session with PATCH method instead.
 * This endpoint uses tmux session names directly, while the agent endpoint
 * uses agent IDs and looks up the session from the agent's tools configuration.
 */
function logDeprecation() {
  console.warn('[DEPRECATED] /api/sessions/[id]/command - Use /api/agents/[id]/session (PATCH) instead')
}

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
 * Check if tmux pane is in copy-mode and cancel it if so
 */
async function cancelCopyModeIfActive(sessionName: string): Promise<void> {
  try {
    // Check if we're in copy-mode by querying the pane mode
    const { stdout } = await execAsync(`tmux display-message -t "${sessionName}" -p "#{pane_in_mode}"`)
    const inMode = stdout.trim() === '1'

    if (inMode) {
      // Send 'q' to exit copy-mode
      await execAsync(`tmux send-keys -t "${sessionName}" q`)
      // Small delay for mode to exit
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  } catch {
    // Ignore errors - session might not exist or other issue
  }
}

/**
 * Send keys to a tmux session using tmux send-keys
 * This works regardless of whether we have a PTY connection
 */
async function sendKeysToTmux(sessionName: string, keys: string): Promise<void> {
  // Cancel copy-mode if active (otherwise the 'q' would be typed)
  await cancelCopyModeIfActive(sessionName)

  // Use -l for literal text (treats keys as literal characters, not key names)
  // Escape single quotes for shell safety
  const escapedKeys = keys.replace(/'/g, "'\\''")
  await execAsync(`tmux send-keys -t "${sessionName}" -l '${escapedKeys}'`)
}

/**
 * POST /api/sessions/[id]/command
 * Send a command to a terminal session via tmux send-keys
 *
 * Body:
 * - command: string - The command to send
 * - requireIdle: boolean - Only send if session is idle (default: true)
 * - addNewline: boolean - Add Enter key to execute command (default: true)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  logDeprecation()
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
      }, { status: 409 }) // Conflict
    }

    // Format the command
    const keysToSend = command

    // Send keys via tmux using -l (literal) to avoid interpreting special characters
    // When addNewline is true, text and Enter are sent atomically via tmux \; chaining to prevent race conditions
    if (addNewline) {
      await cancelCopyModeIfActive(sessionName)
      const escapedKeys = keysToSend.replace(/'/g, "'\\''")
      await execAsync(`tmux send-keys -t "${sessionName}" -l '${escapedKeys}' \\; send-keys -t "${sessionName}" Enter`)
    } else {
      await sendKeysToTmux(sessionName, keysToSend)
    }

    // Update activity timestamp
    if (global.sessionActivity) {
      global.sessionActivity.set(sessionName, Date.now())
    }

    return NextResponse.json({
      success: true,
      sessionName,
      commandSent: command,
      method: 'tmux-send-keys',
      wasIdle: true
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
  logDeprecation()
  try {
    const { id: sessionName } = await params

    // Check if tmux session exists
    const exists = await tmuxSessionExists(sessionName)

    if (!exists) {
      return NextResponse.json({
        success: true,
        sessionName,
        exists: false,
        idle: false,
        reason: 'Tmux session not found'
      })
    }

    const lastActivity = global.sessionActivity?.get(sessionName)
    const timeSinceActivity = lastActivity ? Date.now() - lastActivity : null
    const idle = isSessionIdle(sessionName)

    return NextResponse.json({
      success: true,
      sessionName,
      exists: true,
      idle,
      lastActivity,
      timeSinceActivity,
      idleThreshold: IDLE_THRESHOLD_MS
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
