import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { unpersistSession } from '@/lib/session-persistence'

const execAsync = promisify(exec)

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const sessionName = params.id

    // Check if session exists
    const { stdout: existingCheck } = await execAsync(
      `tmux has-session -t "${sessionName}" 2>&1 || echo "not_found"`
    )

    if (existingCheck.includes('not_found')) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Kill the tmux session
    await execAsync(`tmux kill-session -t "${sessionName}"`)

    // Remove from persistence
    unpersistSession(sessionName)

    return NextResponse.json({ success: true, name: sessionName })
  } catch (error) {
    console.error('Failed to delete session:', error)
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
  }
}
