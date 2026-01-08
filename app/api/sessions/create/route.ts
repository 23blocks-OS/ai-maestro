import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import os from 'os'
import { persistSession } from '@/lib/session-persistence'
import { getHostById, getLocalHost } from '@/lib/hosts-config'
import { getAgentByName, createAgent } from '@/lib/agent-registry'
import { parseNameForDisplay } from '@/types/agent'

const execAsync = promisify(exec)

/**
 * HTTP POST using native fetch (undici).
 * Note: Node.js http.request module has issues with Tailscale/VPN networks.
 * Native fetch works correctly.
 */
async function httpPost(url: string, body: any, timeout: number = 10000): Promise<any> {
  console.log(`[Sessions] Using fetch POST for ${url}`)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout)
  })

  const data = await response.text()

  if (response.ok) {
    try {
      return JSON.parse(data)
    } catch {
      throw new Error(`Invalid JSON: ${data.substring(0, 100)}`)
    }
  } else {
    try {
      const errorData = JSON.parse(data)
      throw new Error(errorData.error || `HTTP ${response.status}`)
    } catch (e) {
      if (e instanceof Error && e.message.includes('HTTP')) {
        throw e
      }
      throw new Error(`HTTP ${response.status}: ${data.substring(0, 100)}`)
    }
  }
}

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

        const data = await httpPost(remoteUrl, { name, workingDirectory, agentId })

        console.log(`[Sessions] Successfully created session "${name}" on ${targetHost.name}`)
        return NextResponse.json(data)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'

        // Check error.cause for network errors (Node.js fetch wraps errors)
        const errorCause = (error as any)?.cause
        const causeCode = errorCause?.code || ''
        const causeMessage = errorCause?.message || ''

        console.error(`[Sessions] Failed to connect to ${targetHost.name} (${targetHost.url}):`, {
          message: errorMessage,
          causeCode,
          causeMessage,
          fullError: error
        })

        // Provide more specific error messages (check both message and cause)
        const fullErrorText = `${errorMessage} ${causeCode} ${causeMessage}`

        if (errorMessage.includes('aborted') || causeCode === 'ABORT_ERR') {
          return NextResponse.json(
            { error: `Timeout connecting to ${targetHost.name}. Is the remote AI Maestro running?` },
            { status: 504 }
          )
        } else if (fullErrorText.includes('ECONNREFUSED') || causeCode === 'ECONNREFUSED') {
          return NextResponse.json(
            { error: `Connection refused by ${targetHost.name}. Verify the remote AI Maestro is running on ${targetHost.url}` },
            { status: 503 }
          )
        } else if (fullErrorText.includes('EHOSTUNREACH') || causeCode === 'EHOSTUNREACH') {
          return NextResponse.json(
            { error: `Cannot reach ${targetHost.name} at ${targetHost.url}. This is intermittent - the endpoint works with curl but Node.js fetch is failing. Try again or check if there's a network/firewall issue.` },
            { status: 503 }
          )
        } else if (fullErrorText.includes('ENETUNREACH') || causeCode === 'ENETUNREACH') {
          return NextResponse.json(
            { error: `Network unreachable to ${targetHost.name}. Are you on the same network/VPN?` },
            { status: 503 }
          )
        } else {
          return NextResponse.json(
            { error: `Failed to connect to ${targetHost.name}: ${errorMessage} (${causeCode})` },
            { status: 500 }
          )
        }
      }
    }

    // Local session creation
    // Determine the actual session name
    // If agentId is provided, use structured format: agentId@hostId (like email)
    // Otherwise use the provided name (legacy support)
    const localHostId = 'local'
    const actualSessionName = agentId ? `${agentId}@${localHostId}` : name

    // Check if session already exists
    const { stdout: existingCheck } = await execAsync(
      `tmux has-session -t "${actualSessionName}" 2>&1 || echo "not_found"`
    )

    if (!existingCheck.includes('not_found')) {
      return NextResponse.json({ error: 'Session already exists' }, { status: 409 })
    }

    // Create new tmux session with structured name
    // Default to current working directory if not specified
    const cwd = workingDirectory || process.cwd()
    await execAsync(`tmux new-session -d -s "${actualSessionName}" -c "${cwd}"`)

    // Register agent in registry if not already exists
    // The session name (without @host suffix) is the agent name
    const agentName = name // Use the original name, not actualSessionName
    let registeredAgent = getAgentByName(agentName)

    if (!registeredAgent) {
      try {
        // Parse agent name for display hierarchy
        const { tags } = parseNameForDisplay(agentName)

        registeredAgent = createAgent({
          name: agentName,
          program: 'claude-code',
          taskDescription: `Agent for ${agentName}`,
          tags,
          owner: os.userInfo().username,
          createSession: true,
          workingDirectory: cwd
        })
        console.log(`[Sessions] Registered new agent: ${agentName} (${registeredAgent.id})`)
      } catch (createError) {
        // Agent creation failed (e.g., already exists with different name)
        console.warn(`[Sessions] Could not register agent ${agentName}:`, createError)
      }
    }

    // Persist session metadata (legacy)
    persistSession({
      id: actualSessionName,
      name: actualSessionName,
      workingDirectory: cwd,
      createdAt: new Date().toISOString(),
      ...(agentId && { agentId }),
      ...(registeredAgent && { agentId: registeredAgent.id })
    })

    return NextResponse.json({
      success: true,
      name: actualSessionName,
      agentId: registeredAgent?.id
    })
  } catch (error) {
    console.error('Failed to create session:', error)
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }
}
