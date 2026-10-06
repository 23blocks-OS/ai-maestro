/**
 * The doorbell: a sender that wrote a message straight into a same-host
 * recipient's inbox (amp-send.sh does this) tells the server "message X landed
 * for agent Y", and the server wakes the agent now instead of waiting for the
 * next inbox sweep (lib/inbox-sweeper.ts, up to about two minutes).
 *
 * The inbox file stays the source of truth. The doorbell only wakes: it never
 * writes an inbox, never marks anything read, and it is safe to ring twice or
 * to ring for a message the sweeper or the poll already handled, because every
 * path shares one record of what was handed to a wake route (lib/wake-state.ts).
 * It honours AIM_INBOX_SWEEP: `off` rings nothing, `shadow` only logs.
 *
 * Backlog F027, phase 2.
 */

import { getAgent, getAgentByName } from '@/lib/agent-registry'
import { listInboxMessages } from '@/lib/messageQueue'
import { getWakeRecord } from '@/lib/wake-state'
import { computeSessionName } from '@/types/agent'
import { handOver, liveDeps, sweepMode, type SweepCandidate, type SweepDeps } from '@/lib/inbox-sweeper'

export type DoorbellStatus =
  | 'woken'
  | 'already_handled'
  | 'in_progress'
  | 'not_found'
  | 'not_unread'
  | 'unknown_recipient'
  | 'disabled'
  | 'shadow'
  | 'error'

export interface DoorbellResult {
  status: DoorbellStatus
  agentName?: string
}

export interface DoorbellDeps extends SweepDeps {
  resolve: (recipient: string) => SweepCandidate | null
}

const SKIP_TYPES = new Set(['system', 'heartbeat'])
const inFlight = new Set<string>()

export const MESSAGE_ID_RE = /^[A-Za-z0-9_.-]{1,128}$/
export const RECIPIENT_RE = /^[A-Za-z0-9_.@-]{1,200}$/

export function liveDoorbellDeps(): DoorbellDeps {
  return {
    ...liveDeps(),
    resolve: (recipient) => {
      // An agent id, a name, or a full AMP address (name@tenant.provider).
      const bare = recipient.includes('@') ? recipient.split('@')[0] : recipient
      const agent = getAgent(recipient) || getAgentByName(bare)
      if (!agent) return null
      return { agentId: agent.id, agentName: agent.name, sessionName: computeSessionName(agent.name, 0) }
    },
  }
}

export async function ringDoorbell(
  input: { recipient: string; messageId: string },
  deps: DoorbellDeps = liveDoorbellDeps()
): Promise<DoorbellResult> {
  const mode = deps.mode()
  if (mode === 'off') return { status: 'disabled' }

  const cand = deps.resolve(input.recipient)
  if (!cand) return { status: 'unknown_recipient' }

  const key = `${cand.agentId}:${input.messageId}`
  if (inFlight.has(key)) return { status: 'in_progress', agentName: cand.agentName }
  inFlight.add(key)
  try {
    // Already handed to a wake route by the push, the poll or the sweeper.
    if (getWakeRecord(cand.agentId, input.messageId)) return { status: 'already_handled', agentName: cand.agentName }

    const unread = await deps.unread(cand.agentId)
    const msg = unread.find((m) => m.id === input.messageId)
    if (!msg) return { status: 'not_found', agentName: cand.agentName }
    if (msg.status !== 'unread' || SKIP_TYPES.has(String(msg.type))) return { status: 'not_unread', agentName: cand.agentName }

    if (mode === 'shadow') {
      deps.log(`[Doorbell] shadow: would wake ${cand.agentName} for ${msg.id}`)
      return { status: 'shadow', agentName: cand.agentName }
    }

    const handed = await handOver(cand, [msg], deps, deps.now(), 'Doorbell')
    return { status: handed ? 'woken' : 'error', agentName: cand.agentName }
  } catch (err) {
    deps.log(`[Doorbell] failed for ${cand.agentName}: ${err instanceof Error ? err.message : String(err)}`)
    return { status: 'error', agentName: cand.agentName }
  } finally {
    inFlight.delete(key)
  }
}

export { sweepMode }
