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
        const remoteUrl = `${targetHost.url}/api/sessions/create`
        console.log(`[Sessions] Creating session "${name}" on remote host ${targetHost.name} at ${remoteUrl}`)

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

        const response = await fetch(remoteUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, workingDirectory, agentId }),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          const data = await response.json()
          console.error(`[Sessions] Remote host returned error: ${response.status} - ${data.error}`)
          return NextResponse.json(
            { error: data.error || 'Failed to create session on remote host' },
            { status: response.status }
          )
        }

        const data = await response.json()
        console.log(`[Sessions] Successfully created session "${name}" on ${targetHost.name}`)
        return NextResponse.json(data)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[Sessions] Failed to connect to ${targetHost.name} (${targetHost.url}):`, errorMessage)

        // Provide more specific error messages
        if (errorMessage.includes('aborted')) {
          return NextResponse.json(
            { error: `Timeout connecting to ${targetHost.name}. Is the remote AI Maestro running?` },
            { status: 504 }
          )
        } else if (errorMessage.includes('ECONNREFUSED')) {
          return NextResponse.json(
            { error: `Connection refused by ${targetHost.name}. Verify the remote AI Maestro is running on ${targetHost.url}` },
            { status: 503 }
          )
        } else if (errorMessage.includes('EHOSTUNREACH')) {
          return NextResponse.json(
            { error: `Cannot reach ${targetHost.name} at ${targetHost.url}. Check: 1) Remote host is online, 2) IP address hasn't changed, 3) Both on same network` },
            { status: 503 }
          )
        } else if (errorMessage.includes('ENETUNREACH')) {
          return NextResponse.json(
            { error: `Network unreachable to ${targetHost.name}. Are you on the same network/VPN?` },
            { status: 503 }
          )
        } else {
          return NextResponse.json(
            { error: `Failed to connect to ${targetHost.name}: ${errorMessage}` },
            { status: 500 }
          )
        }
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
