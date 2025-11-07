import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import http from 'http'
import https from 'https'
import { persistSession } from '@/lib/session-persistence'
import { getHostById, getLocalHost } from '@/lib/hosts-config'

const execAsync = promisify(exec)

/**
 * HTTP POST using native Node.js http module (fetch/undici is broken for local networks)
 */
async function httpPost(url: string, body: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const client = urlObj.protocol === 'https:' ? https : http
    const postData = JSON.stringify(body)

    console.log(`[Sessions] Using http.request POST for ${url}`)

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 10000,
    }

    const req = client.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data))
          } catch (error) {
            reject(new Error(`Invalid JSON: ${data.substring(0, 100)}`))
          }
        } else {
          try {
            const errorData = JSON.parse(data)
            reject(new Error(errorData.error || `HTTP ${res.statusCode}`))
          } catch {
            reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 100)}`))
          }
        }
      })
    })

    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })

    req.write(postData)
    req.end()
  })
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
