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
import { hasChannel, isChannelVerified } from '@/lib/channel-bridge.mjs'
import { loadKeyPair } from '@/lib/amp-keys'
import { deriveDidKey } from '@/lib/amp-did'
import { type ServiceResult } from '@/services/service-errors'

const execAsync = promisify(exec)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// Invariant: every AMP-registered agent must have a UNIQUE cryptographic identity.
// A shared fingerprint or address means two agents can sign/receive as each other —
// the contamination bug where a machine keypair was copied into many agent dirs
// (root-caused in lib/amp-inbox-writer.ts). This runs at every startup so drift can
// never sit silently again; scripts/amp-identity-audit.mjs is the deep on-disk check.
function checkAMPIdentityIntegrity(): DiagnosticCheck {
  try {
    const agents = loadAgents().filter((a: any) => !a.deletedAt && a.metadata?.amp?.fingerprint)
    const byFp = new Map<string, string[]>()
    const byAddr = new Map<string, string[]>()
    const byDid = new Map<string, string[]>()
    const didKeyDrift: string[] = []   // did ≠ deriveDidKey(registered key) — the structural violation
    let missingDid = 0
    for (const a of agents) {
      const fp = a.metadata!.amp!.fingerprint as string
      const addr = (a.metadata!.amp!.address as string) || ''
      const did = a.metadata!.amp!.did as string | undefined
      ;(byFp.get(fp) || byFp.set(fp, []).get(fp)!).push(a.name)
      if (addr) (byAddr.get(addr.toLowerCase()) || byAddr.set(addr.toLowerCase(), []).get(addr.toLowerCase())!).push(a.name)
      if (!did) { missingDid++; continue }
      ;(byDid.get(did) || byDid.set(did, []).get(did)!).push(a.name)
      // structural invariant: the stored did MUST equal the did derived from the
      // agent's registered public key. A mismatch means identity decoupled from key.
      const kp = loadKeyPair(a.id)
      if (kp?.publicHex && deriveDidKey(kp.publicHex) !== did) didKeyDrift.push(a.name)
    }
    const sharedFps = [...byFp.entries()].filter(([, n]) => n.length > 1)
    const sharedAddrs = [...byAddr.entries()].filter(([, n]) => n.length > 1)
    const sharedDids = [...byDid.entries()].filter(([, n]) => n.length > 1)
    if (sharedFps.length || sharedAddrs.length || sharedDids.length || didKeyDrift.length) {
      return {
        name: 'amp-identity-integrity',
        status: 'fail',
        message: `IDENTITY VIOLATION: ${sharedFps.length} shared key(s), ${sharedAddrs.length} shared address(es), ${sharedDids.length} shared did(s), ${didKeyDrift.length} did↔key mismatch(es) — run scripts/amp-identity-repair.mjs`,
        details: {
          sharedFingerprints: sharedFps.map(([fp, n]) => ({ fingerprint: fp.slice(0, 24), agents: n })),
          sharedAddresses: sharedAddrs.map(([addr, n]) => ({ address: addr, agents: n })),
          sharedDids: sharedDids.map(([did, n]) => ({ did, agents: n })),
          didKeyDrift,
        },
      }
    }
    const didStamped = agents.length - missingDid
    return {
      name: 'amp-identity-integrity',
      status: 'pass',
      message: `${agents.length} AMP agents, all identities unique; ${didStamped} did:key-bound${missingDid ? `, ${missingDid} pending did backfill` : ''}`,
      details: { ampAgents: agents.length, didBound: didStamped, missingDid },
    }
  } catch (error: any) {
    return { name: 'amp-identity-integrity', status: 'warn', message: `Could not verify: ${error.message}` }
  }
}

/**
 * Is the reliable wake route actually available to the fleet?
 *
 * The channel route injects a real turn with no keystrokes, which is the only
 * thing that works cleanly on an idle agent — the pane route has to type into
 * a TUI and can be defeated by its input state. When a session did not register
 * the channel server, the adapter reports `unavailable` and delivery quietly
 * falls back to the pane. That is correct behaviour and it lies to nobody, but
 * it is invisible: an estate of ~50 agents ran for months on the fallback
 * without knowing the better route had never been opened, and lost a day to it.
 *
 * So: say it out loud, once, at startup. Three preconditions can block it and
 * none is settable from a crew host — the --channels flag (AIMAESTRO_CHANNEL_FLAG
 * here), the plugin being on the Anthropic allowlist, and channelsEnabled for
 * the org.
 */
function checkChannelWake(): DiagnosticCheck {
  try {
    const online = loadAgents().filter(
      (a: any) => !a.deletedAt && a.sessions?.some((sess: any) => sess.status === 'online')
    )
    if (online.length === 0) {
      return { name: 'channel-wake', status: 'pass', message: 'No online agents' }
    }

    const registered = online.filter((a: any) => hasChannel(a.id))
    const verified = registered.filter((a: any) => isChannelVerified(a.id))
    const flagSet = !!process.env.AIMAESTRO_CHANNEL_FLAG

    if (registered.length === 0) {
      return {
        name: 'channel-wake',
        status: 'warn',
        message:
          `Channel delivery unavailable for all ${online.length} online agent(s) — no session has registered a channel. ` +
          `Waking falls back to typing into the tmux pane. ` +
          (flagSet
            ? 'AIMAESTRO_CHANNEL_FLAG is set, so the remaining preconditions are the plugin allowlist and channelsEnabled for the org.'
            : 'AIMAESTRO_CHANNEL_FLAG is NOT set, so agents boot without --channels and cannot register one.'),
        details: { online: online.length, registered: 0, verified: 0, channelFlagSet: flagSet },
      }
    }

    const status: DiagnosticStatus = verified.length === registered.length ? 'pass' : 'warn'
    return {
      name: 'channel-wake',
      status,
      message:
        `${registered.length}/${online.length} online agent(s) have a channel, ${verified.length} proven by ack` +
        (verified.length < registered.length
          ? ' — unacked channels still fall back to the pane, which is correct but slower and noisier'
          : ''),
      details: {
        online: online.length,
        registered: registered.length,
        verified: verified.length,
        channelFlagSet: flagSet,
        unregistered: online.filter((a: any) => !hasChannel(a.id)).map((a: any) => a.name),
      },
    }
  } catch (error: any) {
    return { name: 'channel-wake', status: 'warn', message: `Could not verify: ${error.message}` }
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
  checks.push(checkAMPIdentityIntegrity())
  checks.push(checkChannelWake())
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
