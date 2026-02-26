/**
 * Diagnostics Service
 *
 * Pure business logic for system self-diagnostics.
 * No HTTP concepts (Request, Response, NextResponse, headers) leak into this module.
 * API routes become thin wrappers that call these functions.
 *
 * Covers:
 *   GET /api/diagnostics -> runDiagnostics
 *
 * Checks:
 *   - tmux availability and version
 *   - node-pty native module loadability
 *   - Agent registry filesystem access
 *   - Remote host reachability
 *   - Node.js version
 *   - Disk space on ~/.aimaestro/ partition
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { getHosts, isSelf } from '@/lib/hosts-config'
import { loadAgents } from '@/lib/agent-registry'

const execAsync = promisify(exec)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceResult<T> {
  data?: T
  error?: string
  status: number
}

export type DiagnosticStatus = 'pass' | 'fail' | 'warn'

export interface DiagnosticCheck {
  name: string
  status: DiagnosticStatus
  message: string
  details?: Record<string, unknown>
}

export interface DiagnosticReport {
  timestamp: string
  hostname: string
  summary: {
    total: number
    passed: number
    failed: number
    warnings: number
    status: DiagnosticStatus
  }
  checks: DiagnosticCheck[]
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

async function checkTmux(): Promise<DiagnosticCheck> {
  try {
    const { stdout } = await execAsync('tmux -V', { timeout: 5000 })
    const version = stdout.trim()
    return {
      name: 'tmux',
      status: 'pass',
      message: `${version} available`,
      details: { version },
    }
  } catch {
    return {
      name: 'tmux',
      status: 'fail',
      message: 'tmux not found or not executable',
    }
  }
}

async function checkNodePty(): Promise<DiagnosticCheck> {
  try {
    // Dynamic import to test if the native module can be loaded
    await import('node-pty')
    return {
      name: 'node-pty',
      status: 'pass',
      message: 'Native module loaded',
    }
  } catch (error: any) {
    return {
      name: 'node-pty',
      status: 'fail',
      message: `Failed to load: ${error.message}`,
    }
  }
}

function checkAgentRegistry(): DiagnosticCheck {
  const agentsDir = path.join(os.homedir(), '.aimaestro', 'agents')
  const registryFile = path.join(agentsDir, 'registry.json')

  try {
    // Check directory exists
    if (!fs.existsSync(agentsDir)) {
      return {
        name: 'agent-registry',
        status: 'warn',
        message: `Directory not found: ${agentsDir}`,
      }
    }

    // Check writable
    fs.accessSync(agentsDir, fs.constants.W_OK)

    // Count agents
    const agents = loadAgents()
    const activeAgents = agents.filter(a => !a.deletedAt)

    return {
      name: 'agent-registry',
      status: 'pass',
      message: `Writable (${activeAgents.length} agents)`,
      details: {
        path: registryFile,
        totalAgents: agents.length,
        activeAgents: activeAgents.length,
      },
    }
  } catch (error: any) {
    return {
      name: 'agent-registry',
      status: 'fail',
      message: `Not writable: ${error.message}`,
      details: { path: agentsDir },
    }
  }
}

function checkNodeVersion(): DiagnosticCheck {
  const version = process.version
  const major = parseInt(version.slice(1).split('.')[0], 10)

  if (major < 18) {
    return {
      name: 'node-version',
      status: 'fail',
      message: `Node.js ${version} — minimum required is v18`,
      details: { version, major },
    }
  }

  return {
    name: 'node-version',
    status: 'pass',
    message: `Node.js ${version}`,
    details: { version, major },
  }
}

async function checkDiskSpace(): Promise<DiagnosticCheck> {
  const targetDir = path.join(os.homedir(), '.aimaestro')
  try {
    const { stdout } = await execAsync(
      `df -k "${targetDir}" | tail -1 | awk '{print $4}'`,
      { timeout: 5000 }
    )
    const availableKB = parseInt(stdout.trim(), 10)
    if (isNaN(availableKB)) {
      return {
        name: 'disk-space',
        status: 'warn',
        message: 'Could not parse disk space',
      }
    }

    const availableMB = Math.round(availableKB / 1024)
    const availableGB = (availableKB / 1024 / 1024).toFixed(1)

    if (availableMB < 100) {
      return {
        name: 'disk-space',
        status: 'fail',
        message: `Only ${availableMB}MB free on ~/.aimaestro partition`,
        details: { availableKB, availableMB },
      }
    }

    if (availableMB < 500) {
      return {
        name: 'disk-space',
        status: 'warn',
        message: `${availableMB}MB free — running low`,
        details: { availableKB, availableMB },
      }
    }

    return {
      name: 'disk-space',
      status: 'pass',
      message: `${availableGB}GB free`,
      details: { availableKB, availableMB, availableGB },
    }
  } catch {
    return {
      name: 'disk-space',
      status: 'warn',
      message: 'Could not check disk space',
    }
  }
}

async function checkRemoteHost(host: { id: string; name: string; url: string }): Promise<DiagnosticCheck> {
  const checkName = `host:${host.name}`
  try {
    // Try /api/diagnostics first for full details, fall back to /api/v1/health
    let url = `${host.url}/api/diagnostics`
    let response: Response

    try {
      response = await fetch(url, { signal: AbortSignal.timeout(5000) })
    } catch {
      // Diagnostics endpoint might not exist yet, try health
      url = `${host.url}/api/v1/health`
      response = await fetch(url, { signal: AbortSignal.timeout(5000) })
    }

    if (!response.ok) {
      return {
        name: checkName,
        status: 'warn',
        message: `${host.url} — HTTP ${response.status}`,
        details: { hostId: host.id, url: host.url },
      }
    }

    const data = await response.json()

    // If we got a diagnostics report, check if tmux is available there
    if (data.checks) {
      const tmuxCheck = data.checks.find((c: DiagnosticCheck) => c.name === 'tmux')
      if (tmuxCheck && tmuxCheck.status === 'fail') {
        return {
          name: checkName,
          status: 'warn',
          message: `${host.url} — reachable but tmux unavailable`,
          details: { hostId: host.id, url: host.url, remoteReport: data.summary },
        }
      }
      return {
        name: checkName,
        status: 'pass',
        message: `${host.url} — healthy (${data.summary?.passed}/${data.summary?.total} checks passed)`,
        details: { hostId: host.id, url: host.url, remoteReport: data.summary },
      }
    }

    // Health endpoint response — just check reachability
    return {
      name: checkName,
      status: 'pass',
      message: `${host.url} — healthy`,
      details: { hostId: host.id, url: host.url },
    }
  } catch (error: any) {
    return {
      name: checkName,
      status: 'fail',
      message: `${host.url} — unreachable: ${error.message}`,
      details: { hostId: host.id, url: host.url },
    }
  }
}

// ---------------------------------------------------------------------------
// Main diagnostics runner
// ---------------------------------------------------------------------------

export async function runDiagnostics(): Promise<ServiceResult<DiagnosticReport>> {
  const checks: DiagnosticCheck[] = []

  // Run local checks in parallel
  const [tmux, nodePty, diskSpace] = await Promise.all([
    checkTmux(),
    checkNodePty(),
    checkDiskSpace(),
  ])

  checks.push(tmux, nodePty)
  checks.push(checkAgentRegistry())
  checks.push(checkNodeVersion())
  checks.push(diskSpace)

  // Check remote hosts
  try {
    const hosts = getHosts()
    const remoteHosts = hosts.filter(h => h.type === 'remote' && h.enabled && !isSelf(h.id))

    if (remoteHosts.length > 0) {
      const hostChecks = await Promise.all(
        remoteHosts.map(h => checkRemoteHost({ id: h.id, name: h.name, url: h.url }))
      )
      checks.push(...hostChecks)
    }
  } catch {
    // hosts.json might not exist yet — not a failure
  }

  // Build summary
  const passed = checks.filter(c => c.status === 'pass').length
  const failed = checks.filter(c => c.status === 'fail').length
  const warnings = checks.filter(c => c.status === 'warn').length

  let summaryStatus: DiagnosticStatus = 'pass'
  if (failed > 0) summaryStatus = 'fail'
  else if (warnings > 0) summaryStatus = 'warn'

  const report: DiagnosticReport = {
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    summary: {
      total: checks.length,
      passed,
      failed,
      warnings,
      status: summaryStatus,
    },
    checks,
  }

  return { data: report, status: 200 }
}

// ---------------------------------------------------------------------------
// Console logger for startup
// ---------------------------------------------------------------------------

const STATUS_ICONS: Record<DiagnosticStatus, string> = {
  pass: '\u2713',
  fail: '\u2717',
  warn: '!',
}

export function logDiagnosticReport(report: DiagnosticReport): void {
  for (const check of report.checks) {
    const icon = STATUS_ICONS[check.status]
    console.log(`[Diagnostics] ${icon} ${check.message}`)
  }

  const { passed, total, failed, warnings } = report.summary
  const parts: string[] = [`${passed}/${total} checks passed`]
  if (failed > 0) parts.push(`${failed} failed`)
  if (warnings > 0) parts.push(`${warnings} warning(s)`)
  console.log(`[Diagnostics] Summary: ${parts.join(', ')}`)
}
