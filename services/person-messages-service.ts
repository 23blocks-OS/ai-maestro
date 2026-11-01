/**
 * Person Messages Service (AMP spec 13): a person sends from a device, and reads their mailbox.
 *
 * Sending goes through routeMessage, the same path as every AMP message, entered as this host's own
 * mesh traffic. routeMessage runs the person check (lib/person-signing) and delivers to the agent here,
 * or forwards it to the agent's host, which checks it again. Routes are thin wrappers.
 */

import { getPerson } from '@/lib/people-registry'
import { getSelfHostId } from '@/lib/hosts-config'
import { personAddress } from '@/lib/person-address'
import { saveMessage, listMessages, getMessage, setMessageStatus, type Box, type PersonMessage, type PersonMessageStatus } from '@/lib/person-mailbox'
import { routeMessage } from '@/services/amp-service'
import { type ServiceResult, notFound, invalidField, missingField } from '@/services/service-errors'
import type { AMPRouteRequest } from '@/lib/types/amp'

const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const

function activePerson(personId: string) {
  const p = getPerson(personId)
  return p && p.active !== false ? p : null
}

export async function sendAsPerson(personId: string, body: Record<string, unknown>): Promise<ServiceResult<{ message: PersonMessage }>> {
  if (!activePerson(personId)) return notFound('Person', personId)
  const from = personAddress(personId)
  if (body.from !== undefined && body.from !== from) return invalidField('from', `This person's address is ${from}; sign that as from`)
  for (const k of ['to', 'subject', 'key_id', 'signature'] as const) {
    if (typeof body[k] !== 'string' || !(body[k] as string)) return missingField(k)
  }
  const payload = body.payload as PersonMessage['payload'] | undefined
  if (!payload || typeof payload !== 'object' || typeof payload.message !== 'string') return invalidField('payload', 'payload must be an object with a message')
  const priority = (body.priority ?? 'normal') as AMPRouteRequest['priority']
  if (!PRIORITIES.includes(priority as typeof PRIORITIES[number])) return invalidField('priority', `priority must be one of ${PRIORITIES.join(', ')}`)

  const req: AMPRouteRequest = {
    from,
    to: body.to as string,
    subject: body.subject as string,
    priority,
    ...(typeof body.in_reply_to === 'string' && body.in_reply_to ? { in_reply_to: body.in_reply_to } : {}),
    payload: payload as AMPRouteRequest['payload'],
    signature: body.signature as string,
    key_id: body.key_id as string,
    sender_kind: 'person',
  }
  const routed = await routeMessage(req, null, getSelfHostId(), null, null, null)
  if (routed.status >= 400 || !routed.data) return routed as unknown as ServiceResult<{ message: PersonMessage }>

  const r = routed.data as { id?: string; delivered_at?: string; queued_at?: string }
  const message: PersonMessage = {
    id: r.id || `msg_${Date.now()}`,
    box: 'sent',
    from,
    to: req.to,
    subject: req.subject,
    priority: priority || 'normal',
    ...(req.in_reply_to ? { in_reply_to: req.in_reply_to } : {}),
    timestamp: r.delivered_at || r.queued_at || new Date().toISOString(),
    payload,
    signature: req.signature,
    key_id: req.key_id,
    sender_kind: 'person',
    verified: true,
    status: 'read',
  }
  saveMessage(personId, message)
  return { data: { message }, status: 200 }
}

export function listPersonMessages(personId: string, q: { box?: string | null; since?: string | null; with?: string | null; limit?: string | null }): ServiceResult<{ messages: PersonMessage[] }> {
  if (!activePerson(personId)) return notFound('Person', personId)
  if (q.box && q.box !== 'inbox' && q.box !== 'sent') return invalidField('box', 'box must be inbox or sent')
  const limit = q.limit ? Number(q.limit) : undefined
  if (limit !== undefined && !Number.isFinite(limit)) return invalidField('limit', 'limit must be a number')
  const messages = listMessages(personId, { box: (q.box as Box) || undefined, since: q.since || undefined, withAddress: q.with || undefined, limit })
  return { data: { messages }, status: 200 }
}

export function getPersonMessage(personId: string, id: string): ServiceResult<{ message: PersonMessage }> {
  if (!activePerson(personId)) return notFound('Person', personId)
  const message = getMessage(personId, id)
  return message ? { data: { message }, status: 200 } : notFound('Message', id)
}

export function updatePersonMessage(personId: string, id: string, body: Record<string, unknown>): ServiceResult<{ message: PersonMessage }> {
  if (!activePerson(personId)) return notFound('Person', personId)
  const status = body.status as PersonMessageStatus
  if (!['unread', 'read', 'archived'].includes(status)) return invalidField('status', 'status must be unread, read or archived')
  const message = setMessageStatus(personId, id, status)
  return message ? { data: { message }, status: 200 } : notFound('Message', id)
}
