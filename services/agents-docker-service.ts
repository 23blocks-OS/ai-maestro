/**
 * Agents Docker Service
 *
 * Business logic for creating agents in Docker containers.
 * Routes are thin wrappers that call these functions.
 */

import { execFile } from 'child_process'
import path from 'path'
import { promisify } from 'util'
import { createAgent, loadAgents, saveAgents } from '@/lib/agent-registry'
import { getHosts, isSelf } from '@/lib/hosts-config'
import { ServiceResult } from '@/types/service'

const execFileAsync = promisify(execFile)

// ── Types ───────────────────────────────────────────────────────────────────

// CC-P2-005: Use canonical ServiceResult from types/service.ts (deduplication)
export type { ServiceResult }

export interface DockerCreateRequest {
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

// ── Public Functions ────────────────────────────────────────────────────────

/**
 * Create a new agent running inside a Docker container.
 */
export async function createDockerAgent(body: DockerCreateRequest): Promise<ServiceResult<Record<string, unknown>>> {
  if (!body.name?.trim()) {
    return { error: 'Agent name is required', status: 400 }
  }

  const name = body.name.trim().toLowerCase()

  // CC-P2-005: Validate container name characters to prevent shell injection
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return { error: 'Container name must contain only alphanumeric characters, hyphens, and underscores', status: 400 }
  }

  // If targeting a remote host, forward the request
  if (body.hostId) {
    const hosts = getHosts()
    const targetHost = hosts.find(h => h.id === body.hostId)
    if (targetHost && !isSelf(targetHost.id)) {
      // CC-P4-003: Validate target host URL scheme to prevent SSRF via file://, gopher://, etc.
      let parsedHostUrl: URL
      try {
        parsedHostUrl = new URL(targetHost.url)
      } catch {
        return { error: 'Invalid host URL format in hosts config', status: 400 }
      }
      if (parsedHostUrl.protocol !== 'http:' && parsedHostUrl.protocol !== 'https:') {
        return { error: 'Only http and https host URLs are allowed', status: 400 }
      }
      try {
        const resp = await fetch(`${targetHost.url}/api/agents/docker/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30000),
        })
        const data = await resp.json()
        return { data, status: resp.status }
      } catch (err) {
        return {
          error: `Failed to reach remote host: ${err instanceof Error ? err.message : 'Unknown error'}`,
          status: 502
        }
      }
    }
  }

  // Verify Docker is available
  // CV-P2-001: Use execFileAsync to prevent shell injection
  try {
    await execFileAsync('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 5000 })
  } catch {
    return { error: 'Docker is not available on this host', status: 400 }
  }

  // Find an available port in 23001-23100 range
  let port: number | null = null
  try {
    // CV-P2-001: Use execFileAsync to prevent shell injection
    const { stdout: portsOutput } = await execFileAsync(
      'docker', ['ps', '--format', '{{.Ports}}']
    )
    const usedPorts = new Set<number>()
    // CC-P1-523: Anchor regex to match port after colon to avoid matching IP octets
    // Matches Docker port formats: 0.0.0.0:23001->23000/tcp, :::23001->23000/tcp, 23001->23000/tcp
    const portRegex = /(?:^|:)(\d+)->23000/g
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
    return { error: 'No available ports in range 23001-23100', status: 503 }
  }

  // Build the AI_TOOL environment variable
  const program = body.program || 'claude'
  let aiTool = program
  if (body.yolo) {
    aiTool += ' --dangerously-skip-permissions'
  }
  if (body.model) {
    // CC-P1-504: Validate model name to prevent shell injection via docker env interpolation
    if (!/^[a-zA-Z0-9._:/-]+$/.test(body.model)) {
      return { error: 'Invalid model name: must match /^[a-zA-Z0-9._:/-]+$/', status: 400 }
    }
    aiTool += ` --model ${body.model}`
  }
  if (body.prompt) {
    // Shell-style escaping for prompt: the container's entrypoint evaluates AI_TOOL through a shell,
    // so single-quote escaping is needed despite execFileAsync not using a shell on the host side.
    const escapedPrompt = body.prompt.replace(/'/g, "'\\''")
    aiTool += ` -p '${escapedPrompt}'`
  }

  const containerName = `aim-${name}`
  const workDir = body.workingDirectory || '/tmp'

  // CC-P1-505: Validate volume mount path to prevent mounting sensitive host directories
  const resolvedWorkDir = path.resolve(workDir)
  if (!path.isAbsolute(workDir) || resolvedWorkDir.includes('..')) {
    return { error: 'workingDirectory must be an absolute path without ".."', status: 400 }
  }
  // Block sensitive host paths from being mounted into containers
  const BLOCKED_MOUNT_PREFIXES = ['/etc', '/root', '/var', '/proc', '/sys', '/dev', '/boot', '/sbin', '/bin', '/usr']
  if (BLOCKED_MOUNT_PREFIXES.some(prefix => resolvedWorkDir === prefix || resolvedWorkDir.startsWith(prefix + '/'))) {
    return { error: `workingDirectory must not be under a system directory (${BLOCKED_MOUNT_PREFIXES.join(', ')})`, status: 400 }
  }

  // CC-P2-006: Validate cpus to prevent injection via numeric fields
  // CC-P4-009: Use null check instead of || to avoid cpus=0 silently defaulting to 2
  const cpus = body.cpus != null ? Number(body.cpus) : 2
  if (cpus < 1 || cpus > 16 || !Number.isInteger(cpus)) {
    return { error: 'cpus must be an integer between 1 and 16', status: 400 }
  }

  // CC-P2-006: Validate memory format to prevent injection via --memory flag
  if (body.memory && !/^\d+[bkmg]$/i.test(body.memory)) {
    return { error: 'Memory must be a valid Docker memory value (e.g., 512m, 4g)', status: 400 }
  }
  const memory = body.memory || '4g'

  // CV-P2-001/CC-P2-001/CC-P2-002: Build docker run command as array args
  // to prevent shell injection -- each flag is a separate array element,
  // eliminating shell interpretation entirely
  const dockerArgs: string[] = [
    'run', '-d',
    '--name', containerName,
    '-e', `TMUX_SESSION_NAME=${name}`,
    '-e', `AI_TOOL=${aiTool}`,
  ]
  if (body.githubToken) {
    dockerArgs.push('-e', `GITHUB_TOKEN=${body.githubToken}`)
  }
  dockerArgs.push(
    '-v', `${workDir}:/workspace`,
    '-p', `${port}:23000`,
    `--cpus=${cpus}`,
    `--memory=${memory}`,
  )
  if (body.autoRemove) {
    dockerArgs.push('--rm')
  }
  dockerArgs.push('ai-maestro-agent:latest')

  let containerId: string
  try {
    const { stdout } = await execFileAsync('docker', dockerArgs, { timeout: 30000 })
    containerId = stdout.trim().slice(0, 12)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { error: `Failed to start container: ${message}`, status: 500 }
  }

  // Register in agent registry
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
    console.error('[Docker Service] Registry error:', err)
  }

  return {
    data: {
      success: true,
      agentId,
      containerId,
      port,
      containerName,
    },
    status: 200
  }
}
