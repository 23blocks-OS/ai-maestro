/**
 * Install a missing agent program on this host (F072 phase 2).
 *
 *   POST /api/tools/install   { tool, hostUrl? }   → 202 { job }   starts it
 *   GET  /api/tools/install[?hostUrl=]             → 200 { job }   the current or last job (null when none)
 *
 * Only the tools in READINESS_TOOLS with a verified npm package can be installed, and the command is fixed:
 * `npm install -g <that package>`, run with execFile and argv, with the npm an agent's login shell finds. Nothing
 * the caller sends reaches the command except the tool id, which picks the package. One install at a time per host
 * (two global npm installs at once can corrupt each other). Never sudo: when npm cannot write its global folder the
 * job fails and says what to run in a terminal.
 */
import { execFile } from 'child_process'
import { getHosts, isSelf } from '@/lib/hosts-config'
import { READINESS_TOOLS, installCommand, type ReadinessReport } from '@/lib/tool-readiness'
import { allOnPath, checkToolReadiness, realDeps, resetReadinessCache } from '@/services/tool-readiness-service'
import type { ServiceResult } from '@/services/service-errors'

const INSTALL_TIMEOUT_MS = 10 * 60_000
const OUTPUT_TAIL = 4000
const PROXY_TIMEOUT_MS = 15_000

export type InstallState = 'running' | 'done' | 'failed'

export interface InstallJob {
  tool: string
  command: string
  state: InstallState
  startedAt: string
  finishedAt?: string
  /** One line for the person: what happened, or what to do. */
  message?: string
  /** The last few KB of npm's output, for when the message is not enough. */
  output?: string
}

export interface InstallDeps {
  agentPath: () => Promise<string>
  isExecutable: (file: string) => boolean
  /** Runs the installer; resolves when it ends. */
  run: (file: string, args: string[], env: NodeJS.ProcessEnv) => Promise<{ ok: boolean; output: string; timedOut?: boolean }>
  /** Is the tool ready now (after the install)? */
  recheck: (tool: string) => Promise<boolean>
}

function runInstaller(file: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ ok: boolean; output: string; timedOut?: boolean }> {
  return new Promise((resolve) => {
    const child = execFile(file, args, { env, timeout: INSTALL_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, output: `${stdout || ''}\n${stderr || ''}`.trim(), ...((err as { killed?: boolean } | null)?.killed && { timedOut: true }) })
    })
    child.stdin?.end()
  })
}

const realInstallDeps: InstallDeps = {
  agentPath: realDeps.agentPath,
  isExecutable: realDeps.isExecutable,
  run: runInstaller,
  recheck: async (tool) => {
    resetReadinessCache()
    const report = (await checkToolReadiness()).data as ReadinessReport | undefined
    return report?.tools?.find((t) => t.id === tool)?.state === 'ready'
  },
}

const g = globalThis as unknown as { _programInstall?: InstallJob }

/** Test hook. */
export function resetInstallJob(): void { g._programInstall = undefined }

export function getInstallJob(): ServiceResult<{ job: InstallJob | null }> {
  return { data: { job: g._programInstall ?? null }, status: 200 }
}

/** Why it failed, in one line a person can act on. */
function failureMessage(command: string, output: string, timedOut?: boolean): string {
  if (timedOut) return `It did not finish in ${INSTALL_TIMEOUT_MS / 60_000} minutes and was stopped.`
  if (/EACCES|permission denied/i.test(output)) {
    return `npm cannot write to its global folder without administrator rights. Run it in a terminal on this host: sudo ${command}`
  }
  if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|network/i.test(output)) return 'npm could not reach the registry. Check the host\'s internet connection.'
  return 'npm failed. Its output is below.'
}

/** Starts the install and returns at once; the job is read with getInstallJob. `wait` resolves when it ends (tests). */
export async function startInstall(body: { tool?: unknown }, deps: InstallDeps = realInstallDeps): Promise<ServiceResult<{ job: InstallJob; wait?: Promise<void> }>> {
  const tool = READINESS_TOOLS.find((t) => t.id === body?.tool)
  if (!tool?.npmPackage) {
    return { data: { error: 'unknown_tool', message: 'This program cannot be installed from AI Maestro.' } as any, status: 400 }
  }
  if (g._programInstall?.state === 'running') {
    return { data: { error: 'busy', message: `${g._programInstall.tool} is being installed. Wait for it to finish.`, job: g._programInstall } as any, status: 409 }
  }
  const command = installCommand(tool.npmPackage)
  const searchPath = await deps.agentPath()
  const npm = allOnPath('npm', searchPath, deps.isExecutable)[0]
  if (!npm) {
    return { data: { error: 'no_npm', message: 'npm is not installed on this host. Install Node.js first.' } as any, status: 409 }
  }

  const job: InstallJob = { tool: tool.id, command, state: 'running', startedAt: new Date().toISOString() }
  g._programInstall = job
  const wait = (async () => {
    let result: { ok: boolean; output: string; timedOut?: boolean }
    try {
      result = await deps.run(npm, ['install', '-g', tool.npmPackage!], { ...process.env, PATH: searchPath })
    } catch (err) {
      result = { ok: false, output: err instanceof Error ? err.message : String(err) }
    }
    const output = result.output.slice(-OUTPUT_TAIL)
    let ready = false
    if (result.ok) ready = await deps.recheck(tool.id).catch(() => false)
    Object.assign(job, {
      state: result.ok && ready ? 'done' : 'failed',
      finishedAt: new Date().toISOString(),
      output,
      message: !result.ok
        ? failureMessage(command, result.output, result.timedOut)
        : ready
          ? `${tool.command} is installed.`
          : `npm finished, but an agent's shell still does not find ${tool.command}. npm's global folder may not be on the PATH.`,
    } satisfies Partial<InstallJob>)
  })()
  return { data: { job, wait }, status: 202 }
}

/** This host, or a configured host by URL (never an arbitrary address), as toolReadinessRequest does. */
export async function programInstallRequest(method: 'GET' | 'POST', hostUrl?: string | null, body?: { tool?: unknown }): Promise<ServiceResult<any>> {
  if (!hostUrl || isSelf(hostUrl)) {
    if (method === 'GET') return getInstallJob()
    const r = await startInstall(body || {})
    return { data: r.data && 'job' in r.data ? { job: r.data.job } : r.data, status: r.status }
  }
  const known = getHosts().find((h) => h.url.replace(/\/+$/, '') === hostUrl.replace(/\/+$/, ''))
  if (!known) return { data: { error: 'Unknown host' }, status: 400 }
  try {
    const response = await fetch(`${known.url.replace(/\/+$/, '')}/api/tools/install`, {
      method,
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
      ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool: body?.tool }) } : {}),
    })
    const data = await response.json().catch(() => null)
    // A host older than this feature answers 404 with a page, not JSON
    if (!data) return { data: { error: 'not_supported', message: `${known.name || known.url} cannot install programs yet. Update AI Maestro there.` }, status: 501 }
    return { data, status: response.status }
  } catch {
    return { data: { error: `Host is unreachable (${known.name || known.url})` }, status: 502 }
  }
}
