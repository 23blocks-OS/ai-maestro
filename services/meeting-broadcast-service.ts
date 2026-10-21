/**
 * Meeting broadcast: one message to every agent in a meeting, with an answer per agent.
 *
 * The browser used to send one POST per participant and ignore the replies, so an agent on another
 * host (not in this host's registry) or one whose delivery failed looked the same as one that got
 * it. Now one call goes to the server, which sends to all participants at once and reports, for each:
 * delivered or failed, whether the agent was woken, and why a failure happened.
 *
 * Multi-host: a participant not in this host's registry is looked for on the peers
 * (`findPeerHostUrl`) and the message is posted to the host that owns it.
 */
import { getAgent } from '@/lib/agent-registry'
import { findPeerHostUrl } from '@/lib/owning-host'
import { sendMessage } from '@/services/messages-service'
import { invalidRequest, missingField, type ServiceResult } from '@/services/service-errors'

export interface BroadcastParams {
  meetingId: string
  teamName?: string
  message: string
  /** Everyone in the meeting (sent in the message context so agents know who else is there) */
  participantIds: string[]
  /** Send only to these (a retry, or one agent); default: all participants */
  recipients?: string[]
}

export type DeliveryStatus = 'delivered' | 'failed'

export interface AgentDelivery {
  agentId: string
  name: string
  hostId?: string
  status: DeliveryStatus
  /** A route accepted the message */
  notified: boolean
  /** A route proved the agent received it */
  verified: boolean
  /** The agent is busy or offline: the message waits in its inbox */
  deferred: boolean
  error?: string
}

export interface BroadcastResult {
  meetingId: string
  results: AgentDelivery[]
  delivered: number
  failed: number
}

export interface BroadcastDeps {
  getAgent: (id: string) => { id: string; name?: string; label?: string; alias?: string; hostId?: string } | null | undefined
  findPeerHostUrl: (id: string) => Promise<string | undefined>
  sendLocal: (body: Record<string, unknown>) => Promise<ServiceResult<any>>
  fetchImpl: typeof fetch
}

const defaultDeps: BroadcastDeps = {
  getAgent: (id) => getAgent(id),
  findPeerHostUrl: (id) => findPeerHostUrl(id),
  sendLocal: (body) => sendMessage(body as any),
  fetchImpl: fetch,
}

const REMOTE_TIMEOUT_MS = 10_000
const MAX_PARTICIPANTS = 100
const MAX_MESSAGE_CHARS = 20_000
const ID = /^[A-Za-z0-9][A-Za-z0-9_.@-]{0,127}$/

const display = (a: { label?: string; name?: string; alias?: string; id: string }) => a.label || a.name || a.alias || a.id.slice(0, 8)

export async function broadcastToMeeting(
  params: BroadcastParams,
  deps: BroadcastDeps = defaultDeps,
): Promise<ServiceResult<BroadcastResult>> {
  const { meetingId, teamName, message, participantIds } = params
  if (!meetingId || typeof meetingId !== 'string') return missingField('meetingId') as ServiceResult<BroadcastResult>
  if (!message || typeof message !== 'string' || !message.trim()) return missingField('message') as ServiceResult<BroadcastResult>
  if (message.length > MAX_MESSAGE_CHARS) return invalidRequest(`message is longer than ${MAX_MESSAGE_CHARS} characters`) as ServiceResult<BroadcastResult>
  if (!Array.isArray(participantIds) || participantIds.length === 0) return missingField('participantIds') as ServiceResult<BroadcastResult>

  const everyone = [...new Set(participantIds.filter(x => typeof x === 'string'))]
  if (everyone.length > MAX_PARTICIPANTS) return invalidRequest(`a meeting has at most ${MAX_PARTICIPANTS} participants`) as ServiceResult<BroadcastResult>
  if (everyone.some(x => !ID.test(x))) return invalidRequest('participantIds contain an invalid id') as ServiceResult<BroadcastResult>

  const targets = params.recipients?.length ? [...new Set(params.recipients)] : everyone
  const unknown = targets.filter(t => !everyone.includes(t))
  if (unknown.length > 0) return invalidRequest(`recipients not in the meeting: ${unknown.join(', ')}`) as ServiceResult<BroadcastResult>

  const isBroadcast = targets.length > 1 || targets.length === everyone.length
  const body = (agentId: string) => ({
    from: 'maestro',
    fromAlias: 'Maestro',
    to: agentId,
    subject: `[MEETING:${meetingId}] ${teamName || 'Meeting'}`,
    content: {
      type: 'notification',
      message,
      context: { meeting: { meetingId, teamName: teamName || 'Meeting', participantIds: everyone, isBroadcast } },
    },
  })

  // All at once: each agent's send is independent, one slow or dead host does not hold up the others
  const results = await Promise.all(targets.map(agentId => deliverOne(agentId, body(agentId), deps)))

  const delivered = results.filter(r => r.status === 'delivered').length
  return { data: { meetingId, results, delivered, failed: results.length - delivered }, status: 200 }
}

async function deliverOne(agentId: string, body: Record<string, unknown>, deps: BroadcastDeps): Promise<AgentDelivery> {
  const fail = (name: string, error: string, hostId?: string): AgentDelivery =>
    ({ agentId, name, hostId, status: 'failed', notified: false, verified: false, deferred: false, error })

  try {
    const local = deps.getAgent(agentId)
    if (local) {
      const res = await deps.sendLocal(body)
      return fromSend(agentId, display(local), local.hostId, res.status, res.data)
    }

    const peer = await deps.findPeerHostUrl(agentId)
    if (!peer) return fail(agentId.slice(0, 8), 'not on this host, and no other host has it (a host that is down cannot answer)')

    const res = await deps.fetchImpl(`${peer.replace(/\/$/, '')}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
    })
    const data = await res.json().catch(() => ({}))
    return fromSend(agentId, agentId.slice(0, 8), undefined, res.status, data, peer)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    return fail(agentId.slice(0, 8), timedOut ? 'the host did not answer in time' : /fetch failed|ECONN|ENOTFOUND|EHOSTUNREACH/i.test(msg) ? 'the host cannot be reached' : msg)
  }
}

function fromSend(agentId: string, name: string, hostId: string | undefined, status: number, data: any, peer?: string): AgentDelivery {
  if (status >= 200 && status < 300) {
    return {
      agentId, name, hostId: hostId || peer, status: 'delivered',
      notified: !!data?.notified, verified: !!data?.verified, deferred: !!data?.deferred,
    }
  }
  const error = data?.message || data?.error || `the host answered ${status}`
  return { agentId, name, hostId: hostId || peer, status: 'failed', notified: false, verified: false, deferred: false, error: String(error) }
}
