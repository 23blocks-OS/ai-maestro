import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { loadPersistedSessions, unpersistSession } from '@/lib/session-persistence'

const execAsync = promisify(exec)

/**
 * GET /api/sessions/restore
 * Returns list of persisted sessions that can be restored
 */
export async function GET() {
  try {
    const persistedSessions = loadPersistedSessions()

    // Get currently active tmux sessions
    const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}" 2>/dev/null || echo ""')
    const activeSessions = stdout.trim().split('\n').filter(Boolean)

    // Filter to only sessions that don't currently exist
    const restorableSessions = persistedSessions.filter(
      session => !activeSessions.includes(session.id)
    )

    return NextResponse.json({
      sessions: restorableSessions,
      count: restorableSessions.length
    })
  } catch (error) {
    console.error('Failed to load restorable sessions:', error)
    return NextResponse.json({ error: 'Failed to load restorable sessions' }, { status: 500 })
  }
}

/**
 * POST /api/sessions/restore
 * Restores one or all persisted sessions
 */
export async function POST(request: Request) {
  try {
    const { sessionId, all } = await request.json()

    const persistedSessions = loadPersistedSessions()
    const sessionsToRestore = all
      ? persistedSessions
      : persistedSessions.filter(s => s.id === sessionId)

    if (sessionsToRestore.length === 0) {
      return NextResponse.json({ error: 'No sessions to restore' }, { status: 404 })
    }

    const results = []

    for (const session of sessionsToRestore) {
      try {
        // Check if session already exists
        const { stdout: existingCheck } = await execAsync(
          `tmux has-session -t "${session.id}" 2>&1 || echo "not_found"`
        )

        if (existingCheck.includes('not_found')) {
          // Create the session
          await execAsync(
            `tmux new-session -d -s "${session.id}" -c "${session.workingDirectory}"`
          )
          results.push({ sessionId: session.id, status: 'restored' })
        } else {
          results.push({ sessionId: session.id, status: 'already_exists' })
        }
      } catch (error) {
        console.error(`Failed to restore session ${session.id}:`, error)
        results.push({ sessionId: session.id, status: 'failed' })
      }
    }

    const restored = results.filter(r => r.status === 'restored').length
    const failed = results.filter(r => r.status === 'failed').length
    const alreadyExisted = results.filter(r => r.status === 'already_exists').length

    return NextResponse.json({
      success: true,
      results,
      summary: {
        restored,
        failed,
        alreadyExisted,
        total: results.length
      }
    })
  } catch (error) {
    console.error('Failed to restore sessions:', error)
    return NextResponse.json({ error: 'Failed to restore sessions' }, { status: 500 })
  }
}

/**
 * DELETE /api/sessions/restore?sessionId=<id>
 * Permanently deletes a persisted session from storage
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
    }

    const success = unpersistSession(sessionId)

    if (!success) {
      return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete persisted session:', error)
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
  }
}
