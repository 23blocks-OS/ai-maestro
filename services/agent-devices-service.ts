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
 *   GET    /api/agents/[id]/devices/networks         the agent's Wi-Fi networks, names only (F129, ADP S005)
 *   POST   /api/agents/[id]/devices/networks         { ssid, password } add or replace one, and push it to the online boards
 *   DELETE /api/agents/[id]/devices/networks?ssid=   remove one, here and on the online boards
 *
 * The controller lives in the server process (lib/device-host.mjs, created by server.mjs). This file reaches it through
 * globalThis and must not import it, or `ws` lands in a Next bundle. The API acts for the agent it names; agents on one
 * machine are not isolated from each other, so that prevents mistakes, not a deliberate misuse of another agent's key.
 */

import { createHash } from 'crypto'
import { getAgent, loadAgents, updateAgent } from '@/lib/agent-registry'
import { isSelf } from '@/lib/hosts-config'
import { cleanSecretValue, deleteSecret, getSecret, setSecret } from '@/lib/secret-vault.mjs'
import type { Agent, DeviceNetwork } from '@/types/agent'
import type { ServiceResult } from '@/services/service-errors'

const MAX_NAME = 80
/** speaker.say's limit: one rule for what an agent may say, whichever voice says it */
const MAX_SPEECH = 500
/** The protocol's reference tools use the same limits */
const MAX_SECONDS: Record<string, number> = { video: 30, microphone: 10 }

interface DeviceHost {
  addressOf(agent: Agent): string | null
  publicIdentity(agent: Agent): { address: string; key: string } | null
  inventory(agent: Agent): any[]
  add(agent: Agent, device: { key: string; endpoint: string | { reverse: string }; name: string }): Promise<{ device: any; pending?: string } | null>
  refresh(agent: Agent, key: string): Promise<any>
  jump(agent: Agent, key: string | null): { activeDeviceKey: string | null; generation: number }
  invoke(agent: Agent, key: string, capability: string, args: Record<string, unknown>): Promise<any>
  forget(agent: Agent, key: string): boolean
  saveSnapshot(agent: Agent, key: string, value: { mime: string; data: string }): string
  capture(agent: Agent, key: string, kind: string, seconds: number): Promise<string>
  record(agent: Agent, key: string, seconds: number): Promise<Buffer>
  recordVoice?(agent: Agent, key: string, seconds: number): Promise<Buffer>
  canSpeak(agent: Agent, key: string): Promise<boolean>
  hubOrigin(): string | null
  homeOrigin(): string | null
  relayOrigin?(): string | null
  setupOf?(agent: Agent, key: string): string | null
  rememberSetup?(agent: Agent, key: string, code: string): boolean
  speak(agent: Agent, key: string, text: string, voice: Agent['voice']): Promise<unknown>
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
  if (message.startsWith('speech_failed')) return fail(500, 'speech_failed', message)
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

/**
 * ADP S005: a board's Bluetooth setup mode, for the owner's phone: its name (ADP_ + the start of the device key) and
 * the code the board gave over the encrypted connection. The network has no login (the security model): anyone on
 * it can read this, which the owner accepted so that a toy needs no sticker. Wi-Fi passwords are never here.
 */
const asked = new Map<string, number>() // device key -> when its code was last asked for
function withSetup(h: DeviceHost, agent: Agent, d: any) {
  const code = h.setupOf?.(agent, d.key)
  // A board that came back without an online event (the host restarted, it reconnected): ask now, in the background
  if (!code && d.state === 'online' && d.capabilities?.includes('network.list') && Date.now() - (asked.get(d.key) ?? 0) > 5 * 60_000) {
    asked.set(d.key, Date.now())
    void learnBoardSetup(agent.id, d.key).catch(() => {})
  }
  return code ? { ...d, setup: { name: `ADP_${String(d.key).slice(0, 8)}`, code } } : d
}

/** When a board comes online: ask its network list once, and keep its setup code (S005). */
export async function learnBoardSetup(agentId: string, key: string): Promise<ServiceResult<{ learned: boolean }>> {
  return withAgent(agentId, async (h, agent) => {
    // device.online can come before the device's capabilities are read: read it first
    try { await h.refresh(agent, key) } catch { /* the check below says whether it is usable */ }
    const device = h.inventory(agent).find((d) => d.key === key)
    if (device?.state !== 'online' || !device.capabilities?.includes('network.list')) return { data: { learned: false }, status: 200 }
    const value = await h.invoke(agent, key, 'network.list', {})
    const code = value?.setupCode
    return { data: { learned: typeof code === 'string' && !!h.rememberSetup?.(agent, key, code) }, status: 200 }
  })
}

export async function listAgentDevices(agentId: string, { refresh = false } = {}): Promise<ServiceResult<{ devices: any[] }>> {
  return withAgent(agentId, async (h, agent) => {
    if (refresh) await Promise.allSettled(h.inventory(agent).map((d) => h.refresh(agent, d.key)))
    // F103: who a device speaks for, if the operator said so
    return { data: { devices: h.inventory(agent).map((d) => ({ ...withSetup(h, agent, d), speaksAs: agent.devicePeople?.[d.key] ?? null })) }, status: 200 }
  })
}

export function getAgentDeviceIdentity(agentId: string) {
  return withAgent<{ address: string; key: string; hub: string | null; home: string | null }>(agentId, (h, agent) => {
    const identity = h.publicIdentity(agent)
    if (!identity) return fail(409, 'no_amp_address', 'This agent has no AMP address yet, so it cannot own a device')
    return { data: { ...identity, hub: h.hubOrigin(), home: h.homeOrigin(), relay: h.relayOrigin?.() ?? null }, status: 200 }
  })
}

export async function addAgentDevice(agentId: string, body: { key?: unknown; endpoint?: unknown; name?: unknown }): Promise<ServiceResult<{ device: any }>> {
  return withAgent(agentId, async (h, agent) => {
    const { key, name } = body || {}
    // A device that opens its own connection, such as a phone: 'reverse' means this host's hub
    const hub = h.hubOrigin()
    if (body?.endpoint === 'reverse' && !hub) return fail(409, 'no_hub', 'This host has no Tailscale address, so a device cannot connect in')
    const endpoint = body?.endpoint === 'reverse' ? { reverse: hub as string } : body?.endpoint
    const validEndpoint = typeof endpoint === 'string' || typeof (endpoint as { reverse?: unknown } | null | undefined)?.reverse === 'string'
    if (typeof key !== 'string' || !validEndpoint) return fail(400, 'invalid_request', 'key and endpoint are required')
    if (name !== undefined && (typeof name !== 'string' || name.length > MAX_NAME)) return fail(400, 'invalid_request', `name must be text of at most ${MAX_NAME} characters`)
    if (!h.addressOf(agent)) return fail(409, 'no_amp_address', 'This agent has no AMP address yet, so it cannot own a device')
    const known = h.inventory(agent).find((d) => d.key === key)
    const added = await h.add(agent, { key, endpoint: endpoint as string | { reverse: string }, name: (name as string) || known?.name || key })
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
    // The agent's own voice when it can be used here; otherwise the device speaks, with the device's voice
    const text = (args as { text?: unknown }).text
    // What the agent says also shows on the device's screen. Without the grant it just is not shown
    if (capability === 'speaker.say' && typeof text === 'string' && text.trim()) {
      h.invoke(agent, key, 'display.text', { text }).catch(() => {})
    }
    if (capability === 'speaker.say' && agent.voice && typeof text === 'string' && text.trim() && Buffer.byteLength(text) <= MAX_SPEECH && await h.canSpeak(agent, key)) {
      return { data: { ok: true, value: await h.speak(agent, key, text, agent.voice) }, status: 200 }
    }
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

/** Shows a line on the device's screen, then records its microphone, in memory (voice enrollment, #78). */
export async function recordAgentDeviceVoice(agentId: string, key: string, line: string, seconds: number): Promise<ServiceResult<{ wav?: Buffer; ok?: false; error?: string }>> {
  return withAgent(agentId, async (h, agent) => {
    // Without the screen grant the person reads the line from the dashboard instead
    await h.invoke(agent, key, 'display.text', { text: line }).catch(() => {})
    return { data: { wav: await (h.recordVoice ?? h.record).call(h, agent, key, seconds) }, status: 200 }
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
    // A forgotten device no longer speaks for anyone (F103)
    if (agent.devicePeople?.[key]) {
      const { [key]: _gone, ...rest } = agent.devicePeople
      updateAgent(agent.id, { devicePeople: Object.keys(rest).length ? rest : null })
    }
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
        return { agentId: a.id, name: a.name || a.alias, devices: h.inventory(a).map((d) => withSetup(h, a, d)) }
      } catch (err) {
        // One agent's bad file must not hide every other agent's devices
        return { agentId: a.id, name: a.name || a.alias, devices: [], error: err instanceof Error ? err.message : String(err) }
      }
    })
    .filter((a) => a.devices.length > 0 || a.error)
  return { data: { agents }, status: 200 }
}

// ---------- F129: the agent's Wi-Fi networks (ADP S005) ----------

/** A board keeps at most 8; the list order is the priority */
const MAX_NETWORKS = 8
const bytes = (s: string) => Buffer.byteLength(s, 'utf8')
const hex8 = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 8).toUpperCase()

/** The vault entry for one network's password: WIFI_<agent>_<ssid>, both short so the name is always valid */
function networkSecretName(agentId: string, ssid: string) {
  const agent = /^[0-9a-f]{8}/i.test(agentId) ? agentId.slice(0, 8).toUpperCase() : hex8(agentId)
  return `WIFI_${agent}_${hex8(ssid)}`
}

type NetworkName = { ssid: string; open: boolean }
type Pushed = { key: string; ok: boolean; error?: string }

const networkNames = (list: DeviceNetwork[]): NetworkName[] => list.map((n) => ({ ssid: n.ssid, open: !n.secret }))

/** An error message from a device or the vault, never carrying the password */
function scrub(err: unknown, password: string) {
  const message = err instanceof Error ? err.message : String(err)
  return password ? message.split(password).join('[hidden]') : message
}

/** One network call to every online device that offers it. An offline device gets the whole list when it connects */
async function pushToDevices(h: DeviceHost, agent: Agent, capability: string, args: Record<string, unknown>, password = ''): Promise<Pushed[]> {
  const targets = h.inventory(agent).filter((d) => d.state === 'online' && Array.isArray(d.capabilities) && d.capabilities.includes(capability))
  return Promise.all(targets.map(async (d) => {
    try {
      await h.invoke(agent, d.key, capability, args)
      return { key: d.key, ok: true }
    } catch (err) {
      return { key: d.key, ok: false, error: scrub(err, password) }
    }
  }))
}

export function listAgentNetworks(agentId: string) {
  return withAgent<{ networks: NetworkName[] }>(agentId, (_h, agent) => {
    return { data: { networks: networkNames(agent.deviceNetworks ?? []) }, status: 200 }
  })
}

export async function addAgentNetwork(agentId: string, body: { ssid?: unknown; password?: unknown }): Promise<ServiceResult<{ networks: NetworkName[]; pushed: Pushed[] }>> {
  return withAgent(agentId, async (h, agent) => {
    const { ssid, password = '' } = body || {}
    if (typeof ssid !== 'string' || bytes(ssid) < 1 || bytes(ssid) > 32) return fail(400, 'invalid_request', 'ssid must be 1 to 32 bytes')
    if (typeof password !== 'string' || (password !== '' && (bytes(password) < 8 || bytes(password) > 63))) {
      return fail(400, 'invalid_request', 'password must be empty (an open network) or 8 to 63 bytes')
    }
    // shortcut: the vault trims a value and joins its line breaks (cleanSecretValue), so such a password would change on
    // the way in; it is refused instead. Upgrade if a real network needs one: store it encoded (base64) and decode on read
    if (cleanSecretValue(password) !== password) return fail(400, 'invalid_request', 'password must not start or end with a space or contain a line break')
    const list = agent.deviceNetworks ?? []
    const at = list.findIndex((n) => n.ssid === ssid)
    if (at < 0 && list.length >= MAX_NETWORKS) return fail(400, 'invalid_request', `An agent keeps at most ${MAX_NETWORKS} networks. Remove one first`)
    const entry: DeviceNetwork = { ssid }
    try {
      if (password) {
        entry.secret = networkSecretName(agent.id, ssid)
        await setSecret(entry.secret, password)
      } else if (list[at]?.secret) {
        await deleteSecret(list[at].secret)
      }
    } catch (err) {
      return fail(500, 'vault_unavailable', scrub(err, password))
    }
    // A name it already has keeps its place: only the password changes
    const next = at < 0 ? [...list, entry] : list.map((n, i) => (i === at ? entry : n))
    updateAgent(agent.id, { deviceNetworks: next })
    const pushed = await pushToDevices(h, agent, 'network.add', { ssid, password }, password)
    return { data: { networks: networkNames(next), pushed }, status: at < 0 ? 201 : 200 }
  })
}

export async function removeAgentNetwork(agentId: string, ssid: unknown): Promise<ServiceResult<{ networks: NetworkName[]; pushed: Pushed[] }>> {
  return withAgent(agentId, async (h, agent) => {
    if (typeof ssid !== 'string' || !ssid) return fail(400, 'invalid_request', 'ssid is required')
    const list = agent.deviceNetworks ?? []
    const gone = list.find((n) => n.ssid === ssid)
    if (!gone) return fail(404, 'not_found', 'This agent has no network with that name')
    const next = list.filter((n) => n !== gone)
    updateAgent(agent.id, { deviceNetworks: next.length ? next : null })
    if (gone.secret) await deleteSecret(gone.secret).catch((err: unknown) => console.error(`[Devices] Could not delete vault entry ${gone.secret}: ${scrub(err, '')}`))
    const pushed = await pushToDevices(h, agent, 'network.remove', { ssid })
    return { data: { networks: networkNames(next), pushed }, status: 200 }
  })
}

/**
 * A device came online: give it every network of its agent, in order. Only adds: the board's built-in network stays,
 * and so does anything it got another way. Called by server.mjs on device.online.
 */
export async function syncAgentNetworks(agentId: string, key: string): Promise<ServiceResult<{ synced: { ssid: string; ok: boolean; error?: string }[] }>> {
  return withAgent(agentId, async (h, agent) => {
    const list = agent.deviceNetworks ?? []
    const device = h.inventory(agent).find((d) => d.key === key)
    if (!list.length || device?.state !== 'online' || !device.capabilities?.includes('network.add')) return { data: { synced: [] }, status: 200 }
    const synced: { ssid: string; ok: boolean; error?: string }[] = []
    // One at a time: a small board, and the order is the priority
    for (const n of list) {
      let password = ''
      try {
        password = n.secret ? (await getSecret(n.secret)) ?? '' : ''
        if (n.secret && !password) throw new Error('password_missing')
        await h.invoke(agent, key, 'network.add', { ssid: n.ssid, password })
        synced.push({ ssid: n.ssid, ok: true })
      } catch (err) {
        synced.push({ ssid: n.ssid, ok: false, error: scrub(err, password) })
      }
    }
    return { data: { synced }, status: 200 }
  })
}
