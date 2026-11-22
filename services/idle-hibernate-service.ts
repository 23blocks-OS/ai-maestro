/**
 * Idle hibernate (F073 step 3). Every 5 minutes, a local Claude Code agent that opted in
 * (`preferences.hibernateAfterIdleHours`) is hibernated when its program last said it was idle longer ago
 * than that. Never an agent that is working, has a question or a permission open, has wakes waiting, or runs outside AI Maestro (no terminal here). With "Wake for messages" on, mail and
 * board instructions start it again.
 */
import { loadAgents } from '@/lib/agent-registry'
import { isSelf } from '@/lib/hosts-config'
import { getRuntime } from '@/lib/agent-runtime'
import { matchProgramName } from '@/lib/program-names'
import { computeSessionName, type Agent } from '@/types/agent'
import { lastHookReport } from '@/services/sessions-service'
import { msSinceActivity } from '@/lib/session-idle'
import { pendingWakeCount } from '@/lib/wake-queue'
import { hasStreamSession } from '@/lib/streaming-bridge.mjs'

export interface IdleDeps {
  report: (agent: Agent) => { status: string; at: number; notificationType?: string } | null
  sessionExists: (sessionName: string) => Promise<boolean>
  /** Ms since the terminal last printed, or null when no terminal is attached */
  sinceOutput: (sessionName: string) => number | null
  /** Wakes queued, or a streaming session */
  busy: (agent: Agent) => boolean
  hibernate: (agentId: string) => Promise<boolean>
  now: () => number
}

/** Only states that say the turn is over; a permission or question notice is not idle */
function isIdle(r: { status: string; notificationType?: string }): boolean {
  return r.status === 'idle' || (r.status === 'waiting_for_input' && r.notificationType === 'idle_prompt')
}

/** One pass. Returns the names it hibernated. */
export async function hibernateIdleAgents(deps: IdleDeps, agents: Agent[] = loadAgents()): Promise<string[]> {
  const done: string[] = []
  for (const agent of agents) {
    const hours = agent.preferences?.hibernateAfterIdleHours
    if (!hours || hours < 1 || agent.deletedAt || (agent.hostId && !isSelf(agent.hostId))) continue
    if (matchProgramName(agent.program)?.kind !== 'claude') continue // only Claude Code reports idle
    const name = agent.name || agent.alias
    if (!name) continue
    const session = computeSessionName(name, 0)
    if (!(await deps.sessionExists(session))) continue
    const r = deps.report(agent)
    const limit = hours * 3_600_000
    if (!r || !isIdle(r) || deps.now() - r.at < limit) continue
    const out = deps.sinceOutput(session)
    if (out !== null && out < limit) continue
    if (deps.busy(agent)) continue
    if (await deps.hibernate(agent.id)) {
      console.log(`[IdleHibernate] ${name}: idle ${Math.round((deps.now() - r.at) / 3_600_000)}h (limit ${hours}h), hibernated`)
      done.push(name)
    }
  }
  return done
}

const defaultDeps: IdleDeps = {
  report: agent => {
    const dir = agent.workingDirectory || agent.sessions?.[0]?.workingDirectory
    return dir ? lastHookReport(dir) : null
  },
  sessionExists: name => getRuntime().sessionExists(name),
  sinceOutput: name => msSinceActivity(name),
  busy: agent => pendingWakeCount(agent.id) > 0 || hasStreamSession(agent.id),
  hibernate: async id => {
    const { hibernateAgent } = await import('@/services/agents-core-service')
    const r = await hibernateAgent(id, {})
    return r.status === 200
  },
  now: () => Date.now(),
}

const g = globalThis as { _aimIdleHibernate?: ReturnType<typeof setInterval> }

export function ensureIdleHibernate(): void {
  if (g._aimIdleHibernate || process.env.VITEST) return
  let running = false
  g._aimIdleHibernate = setInterval(() => {
    if (running) return
    running = true
    hibernateIdleAgents(defaultDeps).catch(e => console.warn(`[IdleHibernate] pass failed: ${e.message}`)).finally(() => { running = false })
  }, 5 * 60_000)
  g._aimIdleHibernate.unref?.()
}
