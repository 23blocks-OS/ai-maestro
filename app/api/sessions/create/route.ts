import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { persistSession } from '@/lib/session-persistence'

const execAsync = promisify(exec)

export async function POST(request: Request) {
  try {
    const { name, workingDirectory } = await request.json()

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Session name is required' }, { status: 400 })
    }

    // Validate session name (no spaces, special chars except dash/underscore)
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return NextResponse.json(
        { error: 'Session name can only contain letters, numbers, dashes, and underscores' },
        { status: 400 }
      )
    }

    // Check if session already exists
    const { stdout: existingCheck } = await execAsync(
      `tmux has-session -t "${name}" 2>&1 || echo "not_found"`
    )

    if (!existingCheck.includes('not_found')) {
      return NextResponse.json({ error: 'Session already exists' }, { status: 409 })
    }

    // Create new tmux session
    const cwd = workingDirectory || process.env.HOME || process.cwd()
    await execAsync(`tmux new-session -d -s "${name}" -c "${cwd}"`)

    // Persist session metadata
    persistSession({
      id: name,
      name: name,
      workingDirectory: cwd,
      createdAt: new Date().toISOString()
    })

    return NextResponse.json({ success: true, name })
  } catch (error) {
    console.error('Failed to create session:', error)
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }
}
