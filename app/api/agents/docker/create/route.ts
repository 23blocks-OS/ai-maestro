import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { createAgent, loadAgents, saveAgents } from '@/lib/agent-registry'
import { getHosts, isSelf } from '@/lib/hosts-config'

const execAsync = promisify(exec)

export const dynamic = 'force-dynamic'

interface DockerCreateRequest {
  name: string
  workingDirectory?: string
  hostId?: string
  program?: string
  yolo?: boolean
  model?: string
  prompt?: string
  timeout?: number
  githubToken?: string
  cpus?: number
  memory?: string
  autoRemove?: boolean
  label?: string
  avatar?: string
}

/**
 * POST /api/agents/docker/create
 * Create a new agent running inside a Docker container.
 */
export async function POST(request: Request) {
  try {
    const body: DockerCreateRequest = await request.json()

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Agent name is required' }, { status: 400 })
    }

    const name = body.name.trim().toLowerCase()

    // If targeting a remote host, forward the request
    if (body.hostId) {
      const hosts = getHosts()
      const targetHost = hosts.find(h => h.id === body.hostId)
      if (targetHost && !isSelf(targetHost.id)) {
        try {
          const resp = await fetch(`${targetHost.url}/api/agents/docker/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30000),
          })
          const data = await resp.json()
          return NextResponse.json(data, { status: resp.status })
        } catch (err) {
          return NextResponse.json(
            { error: `Failed to reach remote host: ${err instanceof Error ? err.message : 'Unknown error'}` },
            { status: 502 }
          )
        }
      }
    }

    // Verify Docker is available
    try {
      await execAsync("docker version --format '{{.Server.Version}}'", { timeout: 5000 })
    } catch {
      return NextResponse.json(
        { error: 'Docker is not available on this host' },
        { status: 400 }
      )
    }

    // Find an available port in 23001-23100 range
    let port: number | null = null
    try {
      const { stdout: portsOutput } = await execAsync(
        "docker ps --format '{{.Ports}}' 2>/dev/null || echo ''"
      )
      const usedPorts = new Set<number>()
      const portRegex = /(\d+)->23000/g
      let match
      while ((match = portRegex.exec(portsOutput)) !== null) {
        usedPorts.add(parseInt(match[1], 10))
      }

      for (let p = 23001; p <= 23100; p++) {
        if (!usedPorts.has(p)) {
          port = p
          break
        }
      }
    } catch {
      port = 23001
    }

    if (!port) {
      return NextResponse.json(
        { error: 'No available ports in range 23001-23100' },
        { status: 503 }
      )
    }

    // Build the AI_TOOL environment variable
    const program = body.program || 'claude'
    let aiTool = program
    if (body.yolo) {
      aiTool += ' --dangerously-skip-permissions'
    }
    if (body.model) {
      aiTool += ` --model ${body.model}`
    }
    if (body.prompt) {
      // Escape single quotes in the prompt for shell safety
      const escapedPrompt = body.prompt.replace(/'/g, "'\\''")
      aiTool += ` -p '${escapedPrompt}'`
    }

    const containerName = `aim-${name}`
    const workDir = body.workingDirectory || '/tmp'
    const cpus = body.cpus || 2
    const memory = body.memory || '4g'

    // Build docker run command
    const envFlags = [
      `-e TMUX_SESSION_NAME="${name}"`,
      `-e AI_TOOL="${aiTool}"`,
    ]
    if (body.githubToken) {
      envFlags.push(`-e GITHUB_TOKEN="${body.githubToken}"`)
    }

    const dockerCmd = [
      'docker run -d',
      `--name "${containerName}"`,
      ...envFlags,
      `-v "${workDir}:/workspace"`,
      `-p ${port}:23000`,
      `--cpus=${cpus}`,
      `--memory=${memory}`,
      body.autoRemove ? '--rm' : '',
      'ai-maestro-agent:latest',
    ].filter(Boolean).join(' ')

    let containerId: string
    try {
      const { stdout } = await execAsync(dockerCmd, { timeout: 30000 })
      containerId = stdout.trim().slice(0, 12)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json(
        { error: `Failed to start container: ${message}` },
        { status: 500 }
      )
    }

    // Register in agent registry with cloud deployment
    let agentId: string | undefined
    try {
      const agent = createAgent({
        name,
        label: body.label,
        avatar: body.avatar,
        program,
        model: body.model,
        taskDescription: body.prompt || '',
        workingDirectory: workDir,
        createSession: true,
        deploymentType: 'cloud',
        hostId: body.hostId,
      })
      agentId = agent.id

      // Patch deployment with container details directly
      const agents = loadAgents()
      const idx = agents.findIndex(a => a.id === agent.id)
      if (idx !== -1) {
        agents[idx].deployment = {
          type: 'cloud',
          cloud: {
            provider: 'local-container',
            containerName,
            websocketUrl: `ws://localhost:${port}/term`,
            healthCheckUrl: `http://localhost:${port}/health`,
            status: 'running',
          }
        }
        saveAgents(agents)
      }
    } catch (err) {
      // Agent registry error is non-fatal - container is already running
      console.error('[Docker Create] Registry error:', err)
    }

    return NextResponse.json({
      success: true,
      agentId,
      containerId,
      port,
      containerName,
    })
  } catch (error) {
    console.error('[Docker Create] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create Docker agent' },
      { status: 500 }
    )
  }
}
