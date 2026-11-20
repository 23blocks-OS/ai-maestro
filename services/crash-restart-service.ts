/**
 * Crash restart watcher (F044 item 6). Once a minute, every local agent with a terminal is looked at: when its
 * program crashed and left a bare shell (lib/crash-restart decides), the agent is restarted in the same
 * conversation, with backoff. After too many crashes it is marked failed, the person is told, and it is left alone
 * until its program runs again.
 */
import { loadAgents, getAgent, updateAgent } from '@/lib/agent-registry'
import { isSelf } from '@/lib/hosts-config'
import { getRuntime } from '@/lib/agent-runtime'
import { isShellCommand } from '@/lib/pane-occupant'
import { matchProgramName } from '@/lib/program-names'
import { computeSessionName } from '@/types/agent'
import { crashAction, MAX_RESTARTS, WINDOW_MS } from '@/lib/crash-restart'
import { lastHookReport } from '@/services/sessions-service'
import type { Agent } from '@/types/agent'

export interface CrashDeps {
  /** The pane's current command and last activity (ms), or null when there is no terminal */
  pane: (sessionName: string) => Promise<{ command: string; activityMs?: number } | null>
  report: (agent: Agent) => { status: string; at: number } | null
  restart: (agentId: string) => Promise<{ status: number }>
  notify: (agent: Agent) => void
  now: () => number
}

const defaultDeps: CrashDeps = {
  pane: async name => {
    const runtime = getRuntime()
    if (!runtime.describePane || !(await runtime.sessionExists(name))) return null
    const info = await runtime.describePane(`${name}:0.0`)
    if (!info?.command) return null
    const activity = Number(info.activity)
    return { command: info.command, ...(activity > 0 && { activityMs: activity * 1000 }) }
  },
  report: agent => {
    const dir = agent.workingDirectory || agent.sessions?.[0]?.workingDirectory
    return dir ? lastHookReport(dir) : null
  },
  restart: async id => (await import('@/services/agents-core-service')).restartAgentResuming(id),
  notify: agent => { import('@/lib/push-expo').then(m => m.pushNeedsYou(agent.id)).catch(() => { /* push is best effort */ }) },
  now: () => Date.now(),
}

/** At most this many restarts a minute: one bad Claude Code update must not restart the whole host at once */
const MAX_PER_PASS = 3
const seen = ((globalThis as { _aimCrashSeen?: Set<string> })._aimCrashSeen ??= new Set<string>())

/** One pass. Returns what it did (for tests and the log). */
export async function checkCrashedAgents(deps: CrashDeps = defaultDeps): Promise<{ agent: string; did: 'restarted' | 'failed' | 'restart-failed' }[]> {
  const done: { agent: string; did: 'restarted' | 'failed' | 'restart-failed' }[] = []
  for (const agent of loadAgents()) {
    if (done.filter(d => d.did !== 'failed').length >= MAX_PER_PASS) break
    if (agent.deletedAt || (agent.hostId && !isSelf(agent.hostId))) continue
    // Only Claude Code reports a deliberate quit (SessionEnd); for another program a quit and a crash look the same
    if (matchProgramName(agent.program)?.kind !== 'claude') continue
    const name = agent.name || agent.alias
    if (!name) continue
    const pane = await deps.pane(computeSessionName(name, 0))
    if (!pane) continue
    const atShell = isShellCommand(pane.command)
    if (!atShell) seen.add(agent.id)
    // Only an agent seen running during this server run: one that was already at its shell (a crash days ago, or
    // a deploy) is left as it is
    else if (!seen.has(agent.id)) continue
    // The program runs again (restarted by a person or by us): forget the failure
    if (!atShell && agent.crashFailedAt) { updateAgent(agent.id, { crashFailedAt: undefined } as Partial<Agent>); continue }
    const now = deps.now()
    const a = crashAction({ atShell, lastActivityMs: pane.activityMs, record: atShell ? deps.report(agent) : null, restarts: agent.crashRestarts || [], failed: !!agent.crashFailedAt, now })
    if (a.action === 'fail') {
      updateAgent(agent.id, { crashFailedAt: new Date(now).toISOString(), crashRestarts: a.restarts } as Partial<Agent>)
      console.warn(`[CrashRestart] ${name} crashed ${MAX_RESTARTS} times in ${WINDOW_MS / 60_000} minutes; it is left at its shell until someone starts it`)
      deps.notify(agent)
      done.push({ agent: name, did: 'failed' })
    } else if (a.action === 'restart') {
      // Re-read: the operator may have hibernated or restarted it since loadAgents
      if (getAgent(agent.id)?.crashFailedAt) continue
      updateAgent(agent.id, { crashRestarts: a.restarts } as Partial<Agent>)
      seen.delete(agent.id) // seen again once the restarted program runs
      const r = await deps.restart(agent.id)
      console.log(`[CrashRestart] ${name}'s program ended without quitting (a crash); ${r.status === 200 ? 'restarted it in the same conversation' : `restart failed (${r.status})`} (${a.restarts.length} in ${WINDOW_MS / 60_000} minutes)`)
      done.push({ agent: name, did: r.status === 200 ? 'restarted' : 'restart-failed' })
    }
  }
  return done
}

const g = globalThis as { _aimCrashWatcher?: ReturnType<typeof setInterval> }

/** Started at server start; one pass a minute. AIMAESTRO_CRASH_RESTART=0 turns it off. */
export function ensureCrashRestartWatcher(): void {
  if (g._aimCrashWatcher || process.env.VITEST || process.env.AIMAESTRO_CRASH_RESTART === '0') return
  let running = false
  g._aimCrashWatcher = setInterval(() => {
    if (running) return
    running = true
    checkCrashedAgents().catch(e => console.warn(`[CrashRestart] check failed: ${e.message}`)).finally(() => { running = false })
  }, 60_000)
  g._aimCrashWatcher.unref?.()
}

/** For tests */
export function resetCrashState(): void { seen.clear() }
