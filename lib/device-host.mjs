/**
 * AI Maestro's implementation of the device protocol's controller role (docs/SPEC-AGENT-DEVICES.md).
 *
 * One Controller per host, for all its agents. server.mjs creates it and keeps it on globalThis: routes must never
 * import this file, or `ws` and a second Controller end up in a Next bundle. They reach it with deviceHost().
 *
 * The SDK owns signing, ownership truth, the active device and refusals. This file owns what the role leaves to the
 * host: where keys and state live, and restoring after a restart. An agent with no device has no key and no record.
 */

import fs from 'fs'
import os from 'os'
import { hear, hearingBy, speakWith, voiceReady } from './speech.mjs'
import path from 'path'
import { Controller } from './device-sdk/controller.mjs'
import { identity as newIdentity, publishActivity } from './device-sdk/index.mjs'
import { wav } from './device-sdk/media.mjs'

const POLL_MS = 30_000
/** Under the 15 s after which a device's screen says the agent disconnected, so one lost update does not show */
const PRESENCE_MS = 5_000
const HUB_PORT = 23112
const timedFetch = (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(4000) })
const SNAPSHOTS_KEPT = 20

function writePrivate(file, text) {
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, text, { mode: 0o600 })
  fs.renameSync(tmp, file)
}

/** The parsed file, or null when it does not exist. Anything else throws: an unreadable file is not an empty one. */
function readJson(file) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
  return JSON.parse(text)
}

/**
 * @param {object} [options]
 * @param {string} [options.agentsDir] where each agent's folder is
 * @param {(event: object) => void | Promise<void>} [options.onEvent] throw to have the SDK deliver it again later
 * @param {(agentId: string) => boolean} [options.agentExists] false once an agent is deleted: its record is dropped
 */
export function createDeviceHost({ agentsDir = path.join(os.homedir(), '.aimaestro', 'agents'), speech = { ready: voiceReady, synthesize: speakWith, transcribe: hear, hearingBy }, activity = async () => ({}), labelOf = () => null, voiceOf = () => undefined, hubAddress = null, onEvent = () => {}, agentExists = () => true } = {}) {
  const idByAddress = new Map()
  const addressById = new Map()
  const savedText = new Map()
  // An active device still offline after a restart: it cannot be selected until the device proves its owner again
  const wantActive = new Map()
  // Saved devices the SDK would not pin (say, an endpoint it now refuses): kept on disk, not dropped
  const notPinned = new Map()
  const background = new Set()
  let presenceTimer = null
  let hub = null
  let publishing = false
  // Being pinned one by one from its file: a save now would write only the first few
  const loading = new Set()

  const folder = (agentId) => path.join(agentsDir, agentId, 'devices')
  const addressOf = (agent) => agent?.metadata?.amp?.address || null

  function save(snapshot) {
    for (const entry of snapshot.agents) {
      const agentId = idByAddress.get(entry.address)
      if (!agentId || loading.has(entry.address) || !agentExists(agentId)) continue
      try {
        const text = JSON.stringify({
          version: 1,
          activeDeviceKey: entry.activeDeviceKey ?? wantActive.get(entry.address) ?? null,
          // What to ask after a restart, never who owns it: the device says that
          devices: [
            ...entry.devices.map(({ key, name, endpoint, lastSeen }) => ({ key, name, endpoint, lastSeen })),
            ...(notPinned.get(agentId) || []),
          ],
          proposals: snapshot.proposals.filter((p) => p.agent === entry.address),
          pendingEvents: snapshot.pendingEvents.filter((e) => e.agent === entry.address),
        }, null, 2)
        if (savedText.get(agentId) === text) continue
        fs.mkdirSync(folder(agentId), { recursive: true, mode: 0o700 })
        writePrivate(path.join(folder(agentId), 'state.json'), text)
        savedText.set(agentId, text)
      } catch (err) {
        // Must not reach the SDK: it would count a full disk as the device failing. The next change tries again
        console.error(`[Devices] Could not save the devices of ${entry.address}: ${err.message}`)
      }
    }
  }

  const controller = new Controller({
    onStateChange: save,
    onEvent: async (event) => {
      if (event.type === 'device.online') selectWanted(event.agent, event.deviceKey)
      if (event.type === 'device.revoked' && wantActive.get(event.agent) === event.deviceKey) wantActive.delete(event.agent)
      await onEvent({ ...event, name: controller.agents.get(event.agent)?.devices.get(event.deviceKey)?.name })
      // Hold to talk: the person sees they were heard long before the agent answers
      if (event.type === 'device.input' && event.source === 'voice') {
        controller.invoke(event.agent, event.deviceKey, 'display.text', { text: `You said: ${event.text}` }).catch(() => {})
      }
    },
  })

  function selectWanted(address, deviceKey) {
    if (wantActive.get(address) !== deviceKey) return
    try {
      controller.jump(address, deviceKey)
      wantActive.delete(address)
    } catch {
      // Not verified yet: it stays wanted until the device proves its owner
    }
  }

  function dropAddress(address) {
    const record = controller.agents.get(address)
    if (record) for (const operation of record.operations) operation.abort(new Error('Agent changed'))
    // shortcut: the SDK has no way to remove an agent, so this reaches into its map; use one when the protocol adds it
    controller.agents.delete(address)
    addressById.delete(idByAddress.get(address))
    idByAddress.delete(address)
    wantActive.delete(address)
  }

  /** The saved key and state pinned into the controller, in that order, so a later save cannot overwrite what was never loaded. */
  function loadAgent(agent, address, { create }) {
    const identityFile = path.join(folder(agent.id), 'identity.json')
    let identity
    try {
      identity = readJson(identityFile)
    } catch (err) {
      throw new Error(`device_state_unreadable: the device key of ${address} cannot be read (${err.message}). A new key would lock it out of its devices`)
    }
    if (identity === null && !create) return false
    let state
    try {
      state = readJson(path.join(folder(agent.id), 'state.json'))
    } catch (err) {
      throw new Error(`device_state_unreadable: the device list of ${address} cannot be read (${err.message})`)
    }
    if (identity === null) {
      identity = newIdentity()
      fs.mkdirSync(folder(agent.id), { recursive: true, mode: 0o700 })
      writePrivate(identityFile, JSON.stringify(identity))
    }
    controller.addAgent({ address, identity })
    idByAddress.set(address, agent.id)
    addressById.set(agent.id, address)
    if (!state) return true

    loading.add(address)
    if (state.activeDeviceKey) wantActive.set(address, state.activeDeviceKey)
    for (const event of Array.isArray(state.pendingEvents) ? state.pendingEvents : []) controller.pendingEvents.set(event.id, event)
    for (const proposal of Array.isArray(state.proposals) ? state.proposals : []) controller.proposals.set(proposal.requestId, proposal)
    const skipped = []
    for (const saved of Array.isArray(state.devices) ? state.devices : []) {
      const { key, name, endpoint, lastSeen } = saved
      try {
        controller.pinDevice(address, { key, name, endpoint })
      } catch (err) {
        console.error(`[Devices] Could not restore ${name} for ${address}: ${err.message}`)
        skipped.push(saved)
        continue
      }
      const record = controller.agent(address).devices.get(key)
      if (lastSeen) record.lastSeen = lastSeen
      const asked = controller.refresh(address, key).then(() => selectWanted(address, key)).catch(() => {}).finally(() => background.delete(asked))
      background.add(asked)
      startPolling()
    }
    if (skipped.length > 0) notPinned.set(agent.id, skipped)
    loading.delete(address)
    return true
  }

  /** The agent's address once it is in the controller, or null while it has no address or no key. With `create`, makes the key. */
  function ensureAgent(agent, { create = false } = {}) {
    const address = addressOf(agent)
    if (!address) return null
    const holder = idByAddress.get(address)
    if (holder === agent.id) return address
    if (holder) {
      if (agentExists(holder)) throw new Error(`address_conflict: ${address} belongs to another agent on this host`)
      dropAddress(address)
    }
    // Its AMP address changed: the same key, under the new address
    if (addressById.has(agent.id)) dropAddress(addressById.get(agent.id))
    return loadAgent(agent, address, { create }) ? address : null
  }

  function saveMedia(agent, key, bytes, extension) {
    const dir = path.join(folder(agent.id), 'snapshots')
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    const file = path.join(dir, `${key}-${Date.now()}.${extension}`)
    writePrivate(file, bytes)
    const own = fs.readdirSync(dir).filter((f) => f.startsWith(`${key}-`) && f.endsWith(`.${extension}`)).sort()
    for (const old of own.slice(0, Math.max(0, own.length - SNAPSHOTS_KEPT))) fs.rmSync(path.join(dir, old), { force: true })
    return file
  }

  function startPolling() {
    if (!controller.timer) controller.start({ intervalMs: POLL_MS })
    startHub()
    if (!presenceTimer) {
      presenceTimer = setInterval(() => void publishPresence(), PRESENCE_MS)
      presenceTimer.unref?.()
    }
  }

  /** Devices connect here to send input. Only once there is a device, and only on the private network. */
  function startHub() {
    if (hub || !hubAddress) return
    // Heard the way the clip's own agent chose (docs/SPEC-ELEVENLABS-HEARING.md, section 3)
    hub = controller.createHub({ transcribe: (audio, context) => speech.transcribe(audio, voiceOf(idByAddress.get(context?.agent))) })
    hub.on('audioFailed', (key, err) => console.error(`[Devices] Could not hear ${key}: ${err.message}`))
    hub.on('refused', ({ key, reason }) => console.log(`[Devices] Refused ${key}: ${reason}`))
    hub.server.on('error', (err) => console.error(`[Devices] Hub on ${hubAddress}:${HUB_PORT} failed: ${err.message}`))
    hub.server.listen(HUB_PORT, hubAddress)
  }

  /** What the agent is doing, to the devices it owns: a device's screen shows it, and calls it disconnected after 15 s of silence. */
  async function publishPresence() {
    if (publishing) return
    publishing = true
    try {
      const sessions = await activity()
      const sends = []
      for (const [address, record] of controller.agents) {
        const status = sessions[address.split('@')[0]]?.status
        const state = status === 'active' ? 'working' : ['idle', 'waiting'].includes(status) ? status : 'unknown'
        // A device refuses the whole update for a bad label, and then shows the agent as gone
        const name = labelOf(idByAddress.get(address))
        const label = typeof name === 'string' && /^[^\p{Cc}]{1,64}$/u.test(name) ? name : undefined
        // People near a device see where their voice goes when it leaves this network
        const hearing = (await speech.hearingBy?.(voiceOf(idByAddress.get(address)))) || undefined
        for (const [key, device] of record.devices) {
          if (device.state !== 'online' || typeof device.endpoint !== 'string') continue
          sends.push(publishActivity(device.endpoint, record.identity, key, address, state, timedFetch, record.active === key, label, hearing))
        }
      }
      // A device that does not answer is the poll's business, and a device with no screen refuses this
      await Promise.allSettled(sends)
    } catch (err) {
      console.error(`[Devices] Could not read agent activity: ${err.message}`)
    } finally {
      publishing = false
    }
  }

  return {
    controller,
    addressOf,
    /** Where a device that opens its own connection connects, or null with no private address */
    hubOrigin: () => (hubAddress ? `http://${hubAddress}:${HUB_PORT}` : null),
    agentIdOf: (address) => idByAddress.get(address),

    /** After a server restart: every agent with a saved key, its devices pinned again and asked who owns them. */
    async restore(agents) {
      for (const agent of agents) {
        if (!fs.existsSync(folder(agent.id))) continue
        try {
          ensureAgent(agent)
        } catch (err) {
          // One agent's bad file must not stop the others. It stays out of the controller, so nothing overwrites it
          console.error(`[Devices] Could not restore ${agent.name || agent.id}: ${err.message}`)
        }
      }
      await Promise.all(background)
    },

    /** The agent's public key and address: what the device pins. Makes the key. Null when it has no AMP address. */
    publicIdentity(agent) {
      const address = ensureAgent(agent, { create: true })
      return address ? { address, key: controller.agent(address).identity.key } : null
    },

    inventory(agent) {
      const address = ensureAgent(agent)
      return address ? controller.inventory(address) : []
    },

    /** A bad key or address throws. A device that does not answer yet stays pinned, and `pending` says why. */
    async add(agent, device) {
      const address = ensureAgent(agent, { create: true })
      if (!address) return null
      const pinned = controller.pinDevice(address, device)
      startPolling()
      try {
        await controller.refresh(address, device.key)
      } catch (err) {
        return { device: controller.inventory(address).find((d) => d.key === device.key) ?? pinned, pending: err.message }
      }
      return { device: controller.inventory(address).find((d) => d.key === device.key) }
    },

    async refresh(agent, key) {
      return controller.refresh(ensureAgent(agent), key)
    },

    jump(agent, key) {
      const address = ensureAgent(agent)
      if (key !== null && !controller.agent(address).devices.has(key)) throw new Error('Unknown device')
      const result = controller.jump(address, key)
      wantActive.delete(address)
      return result
    },

    async invoke(agent, key, capability, args) {
      return controller.invoke(ensureAgent(agent), key, capability, args)
    },

    /** The agent's own voice needs an engine here, an active device, and one that plays audio. */
    async canSpeak(agent, key) {
      const device = this.inventory(agent).find((d) => d.key === key)
      return !!device?.active && device.capabilities.includes('speaker.play') && (await speech.ready(agent.voice))
    },

    /**
     * One call per sentence: each plays while the next is made. Returns once the first has played, so the agent can
     * read what the person says next while it is still talking. A later refusal stops the rest and is only logged.
     */
    async speak(agent, key, text, voice) {
      const address = ensureAgent(agent)
      const files = speech.synthesize(text, voice)
      const play = (file) => controller.invoke(address, key, 'speaker.play', { mime: 'audio/wav', data: fs.readFileSync(file).toString('base64') })
      const first = await files.next()
      let answer
      try {
        if (!first.done) answer = await play(first.value)
      } catch (err) {
        await files.return()
        throw err
      }
      // A person is talking at the device: the rest would be made, and paid for, for nobody
      if (answer?.played === false) {
        await files.return()
        return { played: false, voice: 'agent' }
      }
      const rest = (async () => {
        try {
          for (let next = await files.next(); !next.done; next = await files.next()) {
            if ((await play(next.value))?.played === false) {
              await files.return()
              return
            }
          }
        } catch (err) {
          console.error(`[Devices] Speech to ${key} stopped: ${err.message}`)
          await files.return()
        }
      })()
      background.add(rest)
      void rest.finally(() => background.delete(rest))
      return { played: true, voice: 'agent' }
    },

    /** Forgets it on this side only. The device stays assigned until its owner changes that. */
    forget(agent, key) {
      const address = ensureAgent(agent)
      const record = address ? controller.agent(address) : null
      if (!record?.devices.has(key)) return false
      if (record.active === key) controller.jump(address, null)
      if (wantActive.get(address) === key) wantActive.delete(address)
      // shortcut: the SDK has no remove call, so this reaches into its map; use one when the protocol adds it
      record.devices.delete(key)
      controller.changed()
      return true
    },

    saveSnapshot(agent, key, { data }) {
      return saveMedia(agent, key, Buffer.from(data, 'base64'), 'jpg')
    },

    /** A bounded capture: the last camera frame, or the whole recording. Consent and the in-use sign are the device's. */
    async capture(agent, key, kind, seconds) {
      const video = kind === 'video'
      const audio = []
      let frame = null
      for await (const part of controller.media(ensureAgent(agent), key, kind, seconds)) {
        if (video) frame = part.bytes
        else audio.push(part.bytes)
      }
      if (video ? !frame : audio.length === 0) throw new Error('No media received')
      return saveMedia(agent, key, video ? frame : wav(Buffer.concat(audio)), video ? 'jpg' : 'wav')
    },

    /** The newest picture of a device this agent has, or null. */
    latestSnapshot(agent, key) {
      const dir = path.join(folder(agent.id), 'snapshots')
      if (!this.inventory(agent).some((d) => d.key === key) || !fs.existsSync(dir)) return null
      const newest = fs.readdirSync(dir).filter((f) => f.startsWith(`${key}-`) && f.endsWith('.jpg')).sort().pop()
      return newest ? path.join(dir, newest) : null
    },

    publishPresence,

    async stop() {
      clearInterval(presenceTimer)
      presenceTimer = null
      await hub?.close()
      hub = null
      return controller.stop()
    },
  }
}
