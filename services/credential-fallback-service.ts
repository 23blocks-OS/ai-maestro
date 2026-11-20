/**
 * F128 watcher: once a minute, every agent on this host that has a fallback list and a running terminal is checked
 * for a usage limit in its conversation file (lib/credential-fallback). On a limit newer than its last move, the
 * agent moves to the next entry of ITS OWN list, is restarted in the same conversation, and is told to go on.
 * Every move is logged and kept on the agent (`credentialSwitch`). Names only: no value is ever read here.
 */
import fs from 'fs'
import { loadAgents, getAgent, updateAgent } from '@/lib/agent-registry'
import { isSelf } from '@/lib/hosts-config'
import { resolveJsonlPathForDir } from '@/lib/chat-transcript.mjs'
import { listSecretNames } from '@/lib/secret-vault.mjs'
import { getRuntime } from '@/lib/agent-runtime'
import { computeSessionName } from '@/types/agent'
import { chooseFallback, usageLimitFromLines, FALLBACK_KINDS, type UsageLimitHit } from '@/lib/credential-fallback'
import type { Agent } from '@/types/agent'

const TAIL_BYTES = 64 * 1024
/** When the reset time is not in the text: Claude Code's subscription window */
const DEFAULT_WINDOW_MS = 5 * 60 * 60 * 1000
const NUDGE_DELAY_MS = 20_000

const g = globalThis as { _aimCredLimited?: Map<string, number>; _aimCredWatcher?: ReturnType<typeof setInterval>; _aimCredWarned?: Map<string, number> }
/** vault name -> when its window opens again (this host's view) */
const limited = (g._aimCredLimited ??= new Map())
const warned = (g._aimCredWarned ??= new Map())

function tail(file: string): string[] {
  let fd: number | null = null
  try {
    const size = fs.statSync(file).size
    const start = Math.max(0, size - TAIL_BYTES)
    fd = fs.openSync(file, 'r')
    const buf = Buffer.alloc(size - start)
    fs.readSync(fd, buf, 0, buf.length, start)
    const lines = buf.toString('utf8').split('\n')
    return start > 0 ? lines.slice(1) : lines
  } catch {
    return []
  } finally {
    if (fd !== null) try { fs.closeSync(fd) } catch { /* closed */ }
  }
}

/** The limit this agent's current conversation is in, if any */
export function agentUsageLimit(agent: Agent): UsageLimitHit | null {
  const dir = agent.workingDirectory || agent.sessions?.[0]?.workingDirectory
  const file = dir ? resolveJsonlPathForDir(dir) : null
  return file ? usageLimitFromLines(tail(file.path)) : null
}

export interface FallbackDeps {
  inVault: (name: string) => boolean
  sessionRunning: (agent: Agent) => Promise<boolean>
  restart: (agentId: string) => Promise<{ status: number; data?: unknown }>
  tell: (agentId: string, text: string) => void
  now: () => number
}

const defaultDeps: FallbackDeps = {
  inVault: name => listSecretNames().includes(name),
  sessionRunning: async agent => getRuntime().sessionExists(computeSessionName(agent.name || agent.alias || '', 0)),
  restart: async id => (await import('@/services/agents-core-service')).restartAgentResuming(id),
  tell: (id, text) => {
    // After the restart Claude needs a moment to draw its prompt; the chat send checks the text was submitted
    setTimeout(() => {
      import('@/services/agents-chat-service').then(m => m.sendChatMessage(id, text))
        .then(r => { if (r.status >= 300) console.warn(`[Credential] could not tell ${id} to continue (${r.status})`) })
        .catch(e => console.warn(`[Credential] could not tell ${id} to continue: ${e.message}`))
    }, NUDGE_DELAY_MS).unref?.()
  },
  now: () => Date.now(),
}

/** One pass. Returns the moves made (for tests and the log). */
export async function checkCredentialFallbacks(deps: FallbackDeps = defaultDeps): Promise<{ agent: string; from: string; to: string }[]> {
  const moves: { agent: string; from: string; to: string }[] = []
  const now = deps.now()
  for (const agent of loadAgents()) {
    const cred = agent.credential
    if (agent.deletedAt || !cred?.fallback?.length || !FALLBACK_KINDS.includes(cred.kind)) continue
    if (agent.hostId && !isSelf(agent.hostId)) continue
    const hit = agentUsageLimit(agent)
    // Only a limit newer than the last move: the resumed conversation still ends with the old line
    if (!hit || hit.at <= Date.parse(agent.credentialSwitch?.at || '')) continue
    // Its window has opened again: Claude Code goes on by itself
    if (hit.resetsAt && hit.resetsAt <= now) continue
    if (!(await deps.sessionRunning(agent))) continue
    const from = cred.secret!
    const opensAt = hit.resetsAt ?? hit.at + DEFAULT_WINDOW_MS
    limited.set(from, Math.max(limited.get(from) ?? 0, opensAt))
    const pick = chooseFallback(cred, { inVault: deps.inVault, limitedUntil: n => limited.get(n), now })
    const name = agent.name || agent.alias || agent.id
    if (!pick) {
      // Once per limit, not every minute
      if (warned.get(agent.id) !== hit.at) {
        warned.set(agent.id, hit.at)
        console.warn(`[Credential] ${name} hit the usage limit on ${from}; no entry of its fallback list is free (each is at its limit or not in the vault), so it waits`)
      }
      continue
    }
    // Re-read: another pass or an operator may have changed it since loadAgents
    if (getAgent(agent.id)?.credential?.secret !== from) continue
    const at = new Date(now).toISOString()
    updateAgent(agent.id, {
      credential: { ...cred, secret: pick.next, fallback: pick.fallback },
      credentialSwitch: { at, from, to: pick.next, reason: hit.text, resetsAt: new Date(opensAt).toISOString() },
    } as Partial<Agent>)
    console.log(`[Credential] ${name} hit the usage limit on ${from} (${hit.text}); moved to ${pick.next} from its own fallback list, restarting`)
    moves.push({ agent: name, from, to: pick.next })
    const r = await deps.restart(agent.id)
    if (r.status !== 200) {
      console.warn(`[Credential] ${name} moved to ${pick.next} but did not restart (${r.status}); it uses the new credential at its next wake`)
      continue
    }
    deps.tell(agent.id, `Your account (${from}) hit its usage limit. AI Maestro moved you to ${pick.next}, one of the credentials you are allowed to use, and restarted you in the same conversation. Continue where you left off.`)
  }
  return moves
}

/** Started at server start; one pass a minute. Cheap when no agent has a fallback list. */
export function ensureCredentialFallbackWatcher(): void {
  if (g._aimCredWatcher || process.env.VITEST) return
  let running = false
  g._aimCredWatcher = setInterval(() => {
    if (running) return
    running = true
    checkCredentialFallbacks().catch(e => console.warn(`[Credential] fallback check failed: ${e.message}`)).finally(() => { running = false })
  }, 60_000)
  g._aimCredWatcher.unref?.()
}

/** For tests */
export function resetFallbackState(): void { limited.clear(); warned.clear() }
