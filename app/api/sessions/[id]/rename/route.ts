import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { newName } = await request.json()
    const { id: oldName } = await params

    if (!newName || typeof newName !== 'string') {
      return NextResponse.json({ error: 'New session name is required' }, { status: 400 })
    }

    // Validate session name (no spaces, special chars except dash/underscore)
    if (!/^[a-zA-Z0-9_-]+$/.test(newName)) {
      return NextResponse.json(
        { error: 'Session name can only contain letters, numbers, dashes, and underscores' },
        { status: 400 }
      )
    }

    // Check if old session exists
    const { stdout: existingCheck } = await execAsync(
      `tmux has-session -t "${oldName}" 2>&1 || echo "not_found"`
    )

    if (existingCheck.includes('not_found')) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Check if new name is already taken
    const { stdout: newNameCheck } = await execAsync(
      `tmux has-session -t "${newName}" 2>&1 || echo "not_found"`
    )

    if (!newNameCheck.includes('not_found')) {
      return NextResponse.json({ error: 'Session name already exists' }, { status: 409 })
    }

    // Rename the session
    await execAsync(`tmux rename-session -t "${oldName}" "${newName}"`)

    return NextResponse.json({ success: true, oldName, newName })
  } catch (error) {
    console.error('Failed to rename session:', error)
    return NextResponse.json({ error: 'Failed to rename session' }, { status: 500 })
  }
}
