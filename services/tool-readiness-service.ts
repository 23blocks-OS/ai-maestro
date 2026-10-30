/**
 * Tool readiness (F040 step 4): which agent tools can start on this host, and which Node they would use.
 *
 *   GET /api/tools/readiness[?hostUrl=<a configured host>]
 *
 * It checks in the same kind of shell an agent session uses. The server's own environment has a different PATH
 * from an agent's login shell (we hit this with `aim-secret`), so the PATH is asked of the login shell once and
 * every tool is looked up on THAT. Tools are found by walking the PATH and run with execFile and a fixed argv
 * (`--version`): no shell string is built from anything a caller can influence. Sign-in is not checked; every tool
 * asks for it itself.
 */
import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getHosts, isSelf } from '@/lib/hosts-config'
import { READINESS_TOOLS, judgeTool, parseVersion, type ReadinessReport } from '@/lib/tool-readiness'
import type { ServiceResult } from '@/services/service-errors'

const PROXY_TIMEOUT_MS = 15000
const REPORT_TTL_MS = 60_000
const PATH_TTL_MS = 5 * 60_000

type RunResult = { ok: boolean; output: string }

export interface ReadinessDeps {
  /** PATH of an agent's login shell. */
  agentPath: () => Promise<string>
  isExecutable: (file: string) => boolean
  run: (file: string, args: string[], env: NodeJS.ProcessEnv) => Promise<RunResult>
}

/** What the login shell says its PATH is. Falls back to the server's PATH plus the usual install folders. */
async function loginShellPath(): Promise<string> {
  const shell = process.env.SHELL && path.isAbsolute(process.env.SHELL) ? process.env.SHELL : '/bin/zsh'
  const fallback = [
    process.env.PATH || '',
    path.join(os.homedir(), '.local/bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ].filter(Boolean).join(path.delimiter)
  return new Promise<string>((resolve) => {
    // The marker keeps a shell's own start-up chatter (prompts, banners, warnings) out of the value.
    execFile(shell, ['-ilc', 'printf "\\nAIMPATH=%s\\n" "$PATH"'], { timeout: 10_000, maxBuffer: 256 * 1024 }, (err, stdout) => {
      const line = String(stdout || '').split('\n').reverse().find((l) => l.startsWith('AIMPATH='))
      resolve(!err && line && line.length > 'AIMPATH='.length ? line.slice('AIMPATH='.length) : fallback)
    })
  })
}

function realRun(file: string, args: string[], env: NodeJS.ProcessEnv): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = execFile(file, args, { env, timeout: 8000, maxBuffer: 64 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, output: `${stdout || ''}\n${stderr || ''}`.trim() })
    })
    child.stdin?.end()
  })
}

function isExecutableFile(file: string): boolean {
  try {
    return fs.statSync(file).isFile() && (fs.accessSync(file, fs.constants.X_OK), true)
  } catch {
    return false
  }
}

/** First executable named `command` on the PATH, or undefined. */
export function findOnPath(command: string, searchPath: string, isExecutable: (f: string) => boolean): string | undefined {
  for (const dir of searchPath.split(path.delimiter)) {
    if (!dir) continue
    const candidate = path.join(dir, command)
    if (isExecutable(candidate)) return candidate
  }
  return undefined
}

export async function buildReadinessReport(deps: ReadinessDeps): Promise<ReadinessReport> {
  const searchPath = await deps.agentPath()
  const env = { ...process.env, PATH: searchPath }

  const nodePath = findOnPath('node', searchPath, deps.isExecutable)
  const nodeRun = nodePath ? await deps.run(nodePath, ['--version'], env) : undefined
  const node = nodeRun?.ok ? parseVersion(nodeRun.output) : undefined

  const tools = await Promise.all(READINESS_TOOLS.map(async (t) => {
    const foundPath = findOnPath(t.command, searchPath, deps.isExecutable)
    const run = foundPath ? await deps.run(foundPath, ['--version'], env) : undefined
    return judgeTool({ ...t, foundPath, run, node: node ? `v${node}` : undefined })
  }))

  return { checkedAt: new Date().toISOString(), ...(node ? { node: `v${node}` } : {}), tools }
}

const realDeps: ReadinessDeps = { agentPath: cachedLoginShellPath, isExecutable: isExecutableFile, run: realRun }

let pathCache: { at: number; value: string } | null = null
async function cachedLoginShellPath(): Promise<string> {
  if (pathCache && Date.now() - pathCache.at < PATH_TTL_MS) return pathCache.value
  const value = await loginShellPath()
  pathCache = { at: Date.now(), value }
  return value
}

let reportCache: { at: number; report: ReadinessReport } | null = null
let reportInFlight: Promise<ReadinessReport> | null = null

/** Test hook: forget the cached results. */
export function resetReadinessCache(): void {
  pathCache = null
  reportCache = null
}

export async function checkToolReadiness(deps: ReadinessDeps = realDeps): Promise<ServiceResult<ReadinessReport>> {
  if (deps === realDeps && reportCache && Date.now() - reportCache.at < REPORT_TTL_MS) {
    return { data: reportCache.report, status: 200 }
  }
  if (deps !== realDeps) return { data: await buildReadinessReport(deps), status: 200 }
  // Concurrent callers share one build (a login shell plus a --version per tool) instead of each spawning their own.
  reportInFlight ??= buildReadinessReport(deps)
    .then((report) => { reportCache = { at: Date.now(), report }; return report })
    .finally(() => { reportInFlight = null })
  return { data: await reportInFlight, status: 200 }
}

/**
 * The report for this host, or for another host AI Maestro already knows. A URL that is not a configured host is
 * refused: this endpoint must not be a way to make the server fetch arbitrary addresses.
 */
export async function toolReadinessRequest(hostUrl?: string | null): Promise<ServiceResult<any>> {
  if (!hostUrl || isSelf(hostUrl)) return checkToolReadiness()
  const known = getHosts().find((h) => h.url.replace(/\/+$/, '') === hostUrl.replace(/\/+$/, ''))
  if (!known) return { data: { error: 'Unknown host' } as any, status: 400 }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS)
    const response = await fetch(`${known.url.replace(/\/+$/, '')}/api/tools/readiness`, { signal: controller.signal })
    clearTimeout(timer)
    return { data: await response.json(), status: response.status }
  } catch {
    return { data: { error: `Host is unreachable (${known.name || known.url})` } as any, status: 502 }
  }
}
