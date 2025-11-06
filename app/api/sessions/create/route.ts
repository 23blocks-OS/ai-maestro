import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { persistSession } from '@/lib/session-persistence'
import { getHostById, getLocalHost } from '@/lib/hosts-config'

const execAsync = promisify(exec)

export async function POST(request: Request) {
  try {
    const { name, workingDirectory, agentId, hostId } = await request.json()

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

    // Determine target host
    const localHost = getLocalHost()
    const targetHost = hostId ? getHostById(hostId) : localHost
    const isRemote = targetHost && targetHost.type === 'remote'

    // If remote host, forward request to worker
    if (isRemote && targetHost) {
      try {
        const response = await fetch(`${targetHost.url}/api/sessions/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, workingDirectory, agentId }),
        })

        if (!response.ok) {
          const data = await response.json()
          return NextResponse.json(
            { error: data.error || 'Failed to create session on remote host' },
            { status: response.status }
          )
        }

        const data = await response.json()
        return NextResponse.json(data)
      } catch (error) {
        console.error(`Failed to create session on remote host ${targetHost.name}:`, error)
        return NextResponse.json(
          { error: `Failed to connect to ${targetHost.name}` },
          { status: 500 }
        )
      }
    }

    // Local session creation
    // Check if session already exists
    const { stdout: existingCheck } = await execAsync(
      `tmux has-session -t "${name}" 2>&1 || echo "not_found"`
    )

    if (!existingCheck.includes('not_found')) {
      return NextResponse.json({ error: 'Session already exists' }, { status: 409 })
    }

    // Create new tmux session
    // Default to current working directory if not specified
    const cwd = workingDirectory || process.cwd()
    await execAsync(`tmux new-session -d -s "${name}" -c "${cwd}"`)

    // Persist session metadata
    persistSession({
      id: name,
      name: name,
      workingDirectory: cwd,
      createdAt: new Date().toISOString(),
      ...(agentId && { agentId })
    })

    return NextResponse.json({ success: true, name })
  } catch (error) {
    console.error('Failed to create session:', error)
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }
}
