/**
 * An agent's devices: the API of AI Maestro's controller (docs/SPEC-AGENT-DEVICES.md).
 *
 *   GET    /api/agents/[id]/devices                  the agent's devices; ?refresh=1 asks each one first
 *   GET    /api/agents/[id]/devices/identity         its public key and address, for pairing
 *   POST   /api/agents/[id]/devices                  { key, endpoint, name } pair
 *   POST   /api/agents/[id]/devices/[key]/refresh    ask the device again who owns it
 *   POST   /api/agents/[id]/devices/[key]/jump       make it the active device
 *   DELETE /api/agents/[id]/devices/[key]/jump       no active device
 *   POST   /api/agents/[id]/devices/[key]/invoke     { capability, args }
 *   POST   /api/agents/[id]/devices/[key]/media      { kind: video|microphone, seconds }: a bounded capture, as a file
 *   GET    /api/agents/[id]/devices/[key]/snapshot   the newest picture from this device
 *   DELETE /api/agents/[id]/devices/[key]            forget it on this side
 *   GET    /api/devices                              every agent's devices on this host; never asks a peer
 *
 * The controller lives in the server process (lib/device-host.mjs, created by server.mjs). This file reaches it through
 * globalThis and must not import it, or `ws` lands in a Next bundle. The API acts for the agent it names; agents on one
 * machine are not isolated from each other, so that prevents mistakes, not a deliberate misuse of another agent's key.
 */

import { getAgent, loadAgents } from '@/lib/agent-registry'
import { isSelf } from '@/lib/hosts-config'
import type { Agent } from '@/types/agent'
import type { ServiceResult } from '@/services/service-errors'

const MAX_NAME = 80
/** The protocol's reference tools use the same limits */
const MAX_SECONDS: Record<string, number> = { video: 30, microphone: 10 }

interface DeviceHost {
  addressOf(agent: Agent): string | null
  publicIdentity(agent: Agent): { address: string; key: string } | null
  inventory(agent: Agent): any[]
  add(agent: Agent, device: { key: string; endpoint: string; name: string }): Promise<{ device: any; pending?: string } | null>
  refresh(agent: Agent, key: string): Promise<any>
  jump(agent: Agent, key: string | null): { activeDeviceKey: string | null; generation: number }
  invoke(agent: Agent, key: string, capability: string, args: Record<string, unknown>): Promise<any>
  forget(agent: Agent, key: string): boolean
  saveSnapshot(agent: Agent, key: string, value: { mime: string; data: string }): string
  capture(agent: Agent, key: string, kind: string, seconds: number): Promise<string>
  latestSnapshot(agent: Agent, key: string): string | null
}

const host = () => (globalThis as unknown as { _deviceHost?: DeviceHost })._deviceHost

const fail = <T>(status: number, error: string, message: string): ServiceResult<T> => ({ data: { error, message } as any, status })

/** The signed answers of a device: an outcome to show, not a failure of this API */
const DEVICE_ANSWERS = new Set(['denied', 'hardware_unavailable', 'invalid_arguments', 'grant_revoked', 'permission_denied', 'media_busy', 'revoked', 'stopped'])

/** SDK errors are plain messages. Order matters. */
function fromError<T>(err: unknown): ServiceResult<T> {
  // A capture the device ended is its answer too: a person revoking it is not a network failure
  const message = (err instanceof Error ? err.message : String(err)).replace(/^Media ended: /, '')
  if (DEVICE_ANSWERS.has(message)) return { data: { ok: false, error: message } as any, status: 200 }
  if (message.startsWith('device_state_unreadable')) return fail(500, 'device_state_unreadable', message)
  if (message.startsWith('address_conflict') || message === 'Each agent must use its own key') return fail(409, 'address_conflict', message)
  if (/^Unknown (device|agent)/.test(message)) return fail(404, 'not_found', message)
  if (message === 'Device is idle') return fail(409, 'device_idle', message)
  if (/another agent|another verified owner|verified ownership|Request rejected: 403/.test(message)) return fail(409, 'not_owner', message)
  if (/Activation changed|Active device changed|superseded/i.test(message)) return fail(409, 'superseded', message)
  if (/not granted or available|No media received/.test(message)) return fail(409, 'not_available', message)
  // Before the device is reached: the request is wrong
  if (/^(Unknown capability|Invalid Ed25519 public key|Invalid device endpoint|Expected one full AMP address|Use a loopback|Invalid (image|enum))|argument/.test(message)) {
    return fail(400, 'invalid_request', message)
  }
  // Everything else is the device not answering, or answering badly: a bad signature is not the caller's fault
  return fail(502, 'device_unreachable', message)
}

function withAgent<T>(agentId: string, run: (h: DeviceHost, agent: Agent) => ServiceResult<T> | Promise<ServiceResult<T>>) {
  const h = host()
  if (!h) return fail<T>(503, 'not_ready', 'The device controller is not running on this host')
  const agent = getAgent(agentId)
  if (!agent || agent.deletedAt) return fail<T>(404, 'not_found', `Unknown agent ${agentId}`)
  // The controller of an agent is the host it lives on: a key made here would be useless there
  if (agent.hostId && !isSelf(agent.hostId)) return fail<T>(409, 'other_host', `This agent lives on ${agent.hostId}. Ask that host`)
  try {
    const result = run(h, agent)
    return result instanceof Promise ? result.catch((err) => fromError<T>(err)) : result
  } catch (err) {
    return fromError<T>(err)
  }
}

export async function listAgentDevices(agentId: string, { refresh = false } = {}): Promise<ServiceResult<{ devices: any[] }>> {
  return withAgent(agentId, async (h, agent) => {
    if (refresh) await Promise.allSettled(h.inventory(agent).map((d) => h.refresh(agent, d.key)))
    return { data: { devices: h.inventory(agent) }, status: 200 }
  })
}

export function getAgentDeviceIdentity(agentId: string) {
  return withAgent<{ address: string; key: string }>(agentId, (h, agent) => {
    const identity = h.publicIdentity(agent)
    if (!identity) return fail(409, 'no_amp_address', 'This agent has no AMP address yet, so it cannot own a device')
    return { data: identity, status: 200 }
  })
}

export async function addAgentDevice(agentId: string, body: { key?: unknown; endpoint?: unknown; name?: unknown }): Promise<ServiceResult<{ device: any }>> {
  return withAgent(agentId, async (h, agent) => {
    const { key, endpoint, name } = body || {}
    if (typeof key !== 'string' || typeof endpoint !== 'string') return fail(400, 'invalid_request', 'key and endpoint are required')
    if (name !== undefined && (typeof name !== 'string' || name.length > MAX_NAME)) return fail(400, 'invalid_request', `name must be text of at most ${MAX_NAME} characters`)
    if (!h.addressOf(agent)) return fail(409, 'no_amp_address', 'This agent has no AMP address yet, so it cannot own a device')
    const known = h.inventory(agent).find((d) => d.key === key)
    const added = await h.add(agent, { key, endpoint, name: (name as string) || known?.name || key })
    if (!added) return fail(409, 'no_amp_address', 'This agent has no AMP address yet, so it cannot own a device')
    // Pinned, but the device has not confirmed this agent yet: the list says so, and refresh asks again
    if (added.pending) return { data: { device: added.device, pending: added.pending }, status: 202 }
    return { data: { device: added.device }, status: 201 }
  })
}

export async function refreshAgentDevice(agentId: string, key: string): Promise<ServiceResult<{ device: any }>> {
  return withAgent(agentId, async (h, agent) => {
    return { data: { device: await h.refresh(agent, key) }, status: 200 }
  })
}

export function jumpAgentDevice(agentId: string, key: string | null) {
  return withAgent<{ activeDeviceKey: string | null }>(agentId, (h, agent) => {
    return { data: { activeDeviceKey: h.jump(agent, key).activeDeviceKey }, status: 200 }
  })
}

export async function invokeAgentDevice(agentId: string, key: string, body: { capability?: unknown; args?: unknown }): Promise<ServiceResult<any>> {
  return withAgent(agentId, async (h, agent) => {
    const { capability, args = {} } = body || {}
    if (typeof capability !== 'string') return fail(400, 'invalid_request', 'capability is required')
    if (typeof args !== 'object' || args === null || Array.isArray(args)) return fail(400, 'invalid_request', 'args must be an object')
    const value = await h.invoke(agent, key, capability, args as Record<string, unknown>)
    if (capability === 'camera.snapshot') {
      // The agent reads a file: a picture does not travel through the API as text
      return { data: { ok: true, value: { mime: value.mime, path: h.saveSnapshot(agent, key, value) } }, status: 200 }
    }
    return { data: { ok: true, value }, status: 200 }
  })
}

export async function captureAgentDevice(agentId: string, key: string, body: { kind?: unknown; seconds?: unknown }): Promise<ServiceResult<any>> {
  return withAgent(agentId, async (h, agent) => {
    const { kind, seconds = 5 } = body || {}
    const max = typeof kind === 'string' ? MAX_SECONDS[kind] : undefined
    if (!max || !Object.hasOwn(MAX_SECONDS, kind as string)) return fail(400, 'invalid_request', 'kind must be video or microphone')
    if (!Number.isInteger(seconds) || (seconds as number) < 1 || (seconds as number) > max) return fail(400, 'invalid_request', `seconds must be 1 to ${max}`)
    return { data: { ok: true, value: { path: await h.capture(agent, key, kind as string, seconds as number) } }, status: 200 }
  })
}

export function latestAgentDeviceSnapshot(agentId: string, key: string) {
  return withAgent<{ path: string }>(agentId, (h, agent) => {
    const file = h.latestSnapshot(agent, key)
    if (!file) return fail(404, 'not_found', 'No picture from this device yet')
    return { data: { path: file }, status: 200 }
  })
}

export function forgetAgentDevice(agentId: string, key: string) {
  return withAgent<{ forgotten: true; note: string }>(agentId, (h, agent) => {
    if (!h.forget(agent, key)) return fail(404, 'not_found', 'Unknown device')
    return { data: { forgotten: true, note: 'Forgotten here. The device stays assigned to this agent until its owner changes that.' }, status: 200 }
  })
}

export function listHostDevices(): ServiceResult<{ agents: { agentId: string; name?: string; devices: any[]; error?: string }[] }> {
  const h = host()
  if (!h) return fail(503, 'not_ready', 'The device controller is not running on this host')
  const agents = loadAgents()
    .filter((a) => !a.deletedAt && (!a.hostId || isSelf(a.hostId)))
    .map((a) => {
      try {
        return { agentId: a.id, name: a.name || a.alias, devices: h.inventory(a) }
      } catch (err) {
        // One agent's bad file must not hide every other agent's devices
        return { agentId: a.id, name: a.name || a.alias, devices: [], error: err instanceof Error ? err.message : String(err) }
      }
    })
    .filter((a) => a.devices.length > 0 || a.error)
  return { data: { agents }, status: 200 }
}
