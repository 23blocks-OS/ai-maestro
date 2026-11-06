/**
 * The owner's approval of new AMP members, like a new phone on the People page.
 *
 * This is not authentication: the project has none by design, and these endpoints are as open as every
 * other one on the network. It decides who joins the company, not who may call the API.
 *
 * Off by default, because a new outside member cannot be told apart from a local session safely:
 *   - amp-init and amp-send auto-register sessions that have no registry record, through the same route;
 *   - `kind` and `agent_id` are whatever the request says, so an outsider can leave them out;
 *   - the source address proves nothing, since tunnels on a host (cloudflared) arrive from loopback.
 * With the setting on, a registration that creates a NEW record waits. Agents already in the registry
 * never do: AI Maestro's own agents and Docker agents are adopted by name, existing ones re-register.
 * Agents that registered before the setting was on carry no status, so they stay members.
 *
 * The setting and the waiting list belong to the host that took the registration. Only that host holds
 * the record and its key, so it is the one to ask.
 *
 *   GET  /api/registrations              -> listPendingRegistrations
 *   PUT  /api/registrations              -> setRegistrationApproval
 *   POST /api/registrations/:id/approve  -> approveRegistration
 *   POST /api/registrations/:id/reject   -> rejectRegistration
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { deleteAgent, getAgent, loadAgents, updateAgent } from '@/lib/agent-registry'
import { activatePendingKeys, revokeAllKeysForAgent } from '@/lib/amp-auth'
import { memberKind, memberPlatform } from '@/types/agent'
import type { Agent } from '@/types/agent'
import { invalidField, notFound, operationFailed, type ServiceResult } from '@/services/service-errors'

const settingsFile = () => path.join(os.homedir(), '.aimaestro', 'amp-registrations.json')

/** A file that cannot be read means off: a broken setting must not stop new agents from messaging. */
export function isApprovalRequired(): boolean {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')).approvalRequired === true
  } catch {
    return false
  }
}

export interface PendingRegistration {
  id: string
  name: string
  label?: string
  address?: string
  kind: 'agent' | 'assistant'
  platform?: string
  avatar?: string
  fingerprint?: string
  registeredAt?: string
  hostId?: string
}

function toPending(a: Agent): PendingRegistration {
  const amp = a.metadata?.amp
  return {
    id: a.id,
    name: a.name,
    label: a.label,
    address: amp?.address,
    kind: memberKind(a),
    platform: memberPlatform(a),
    avatar: a.avatar,
    fingerprint: amp?.fingerprint,
    registeredAt: amp?.registeredAt,
    hostId: a.hostId,
  }
}

export function listPendingRegistrations(): ServiceResult<{ approvalRequired: boolean; pending: PendingRegistration[] }> {
  const pending = loadAgents().filter(a => a.registrationStatus === 'pending' && !a.deletedAt).map(toPending)
  return { data: { approvalRequired: isApprovalRequired(), pending }, status: 200 }
}

export function setRegistrationApproval(body: unknown): ServiceResult<{ approvalRequired: boolean }> {
  const approvalRequired = (body as { approvalRequired?: unknown } | null)?.approvalRequired
  if (typeof approvalRequired !== 'boolean') return invalidField('approvalRequired', 'must be true or false')
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true })
    fs.writeFileSync(settingsFile(), JSON.stringify({ approvalRequired }, null, 2))
  } catch (error) {
    return operationFailed('save the registration setting', (error as Error).message)
  }
  return { data: { approvalRequired }, status: 200 }
}

function pendingAgent(id: string): Agent | null {
  const agent = getAgent(id)
  return agent?.registrationStatus === 'pending' ? agent : null
}

export function approveRegistration(id: string): ServiceResult<{ approved: PendingRegistration }> {
  const agent = pendingAgent(id)
  if (!agent) return notFound('Pending registration', id)
  // Keys first: a failure here leaves the member pending, never approved with a dead key
  activatePendingKeys(id)
  updateAgent(id, { registrationStatus: undefined })
  console.log(`[AMP Register] Approved ${agent.name} (${id.substring(0, 8)}...)`)
  return { data: { approved: toPending({ ...agent, registrationStatus: undefined }) }, status: 200 }
}

export function rejectRegistration(id: string): ServiceResult<{ rejected: string }> {
  const agent = pendingAgent(id)
  if (!agent) return notFound('Pending registration', id)
  revokeAllKeysForAgent(id)
  // It never ran. A tmux session that happens to have its name belongs to someone else.
  deleteAgent(id, true, { keepSessions: true })
  console.log(`[AMP Register] Rejected ${agent.name} (${id.substring(0, 8)}...)`)
  return { data: { rejected: id }, status: 200 }
}
