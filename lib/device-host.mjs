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
import path from 'path'
import { Controller } from './device-sdk/controller.mjs'
import { identity as newIdentity } from './device-sdk/index.mjs'

const POLL_MS = 30_000
const SNAPSHOTS_KEPT = 20

function writePrivate(file, text) {
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, text, { mode: 0o600 })
  fs.renameSync(tmp, file)
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/**
 * @param {object} [options]
 * @param {string} [options.agentsDir] where each agent's folder is
 * @param {(event: object) => void | Promise<void>} [options.onEvent] throw to have the SDK deliver it again later
 */
export function createDeviceHost({ agentsDir = path.join(os.homedir(), '.aimaestro', 'agents'), onEvent = () => {} } = {}) {
  const idByAddress = new Map()
  const savedText = new Map()
  // An active device still offline after a restart: it cannot be selected until the device proves its owner again
  const wantActive = new Map()

  const folder = (agentId) => path.join(agentsDir, agentId, 'devices')
  const addressOf = (agent) => agent?.metadata?.amp?.address || null

  function save(snapshot) {
    for (const entry of snapshot.agents) {
      const agentId = idByAddress.get(entry.address)
      if (!agentId) continue
      const text = JSON.stringify({
        version: 1,
        activeDeviceKey: entry.activeDeviceKey ?? wantActive.get(entry.address) ?? null,
        // What to ask after a restart, never who owns it: the device says that
        devices: entry.devices.map(({ key, name, endpoint, lastSeen }) => ({ key, name, endpoint, lastSeen })),
        proposals: snapshot.proposals.filter((p) => p.agent === entry.address),
        pendingEvents: snapshot.pendingEvents.filter((e) => e.agent === entry.address),
      }, null, 2)
      if (savedText.get(agentId) === text) continue
      savedText.set(agentId, text)
      fs.mkdirSync(folder(agentId), { recursive: true, mode: 0o700 })
      writePrivate(path.join(folder(agentId), 'state.json'), text)
    }
  }

  const controller = new Controller({
    onStateChange: save,
    onEvent: async (event) => {
      if (event.type === 'device.online') selectWanted(event.agent, event.deviceKey)
      await onEvent(event)
    },
  })

  function selectWanted(address, deviceKey) {
    if (wantActive.get(address) !== deviceKey) return
    wantActive.delete(address)
    controller.jump(address, deviceKey)
  }

  function loadIdentity(agentId) {
    const saved = readJson(path.join(folder(agentId), 'identity.json'))
    return saved?.secret && saved?.key ? saved : null
  }

  /** Registers the agent with the controller when it has a key. With `create`, makes the key: its first device. */
  function ensureAgent(agent, { create = false } = {}) {
    const address = addressOf(agent)
    if (!address) return null
    if (controller.agents.has(address)) return address
    let identity = loadIdentity(agent.id)
    if (!identity) {
      if (!create) return null
      identity = newIdentity()
      fs.mkdirSync(folder(agent.id), { recursive: true, mode: 0o700 })
      writePrivate(path.join(folder(agent.id), 'identity.json'), JSON.stringify(identity))
    }
    idByAddress.set(address, agent.id)
    controller.addAgent({ address, identity })
    return address
  }

  function startPolling() {
    if (!controller.timer) controller.start({ intervalMs: POLL_MS })
  }

  return {
    controller,
    addressOf,

    /** After a server restart: every agent with a saved key, its devices pinned again and asked who owns them. */
    async restore(agents) {
      const refreshes = []
      for (const agent of agents) {
        if (!fs.existsSync(folder(agent.id))) continue
        const address = ensureAgent(agent)
        const state = readJson(path.join(folder(agent.id), 'state.json'))
        if (!address || !state) continue
        if (state.activeDeviceKey) wantActive.set(address, state.activeDeviceKey)
        for (const { key, name, endpoint } of state.devices || []) {
          try {
            controller.pinDevice(address, { key, name, endpoint })
          } catch (err) {
            console.error(`[Devices] Could not restore ${name} for ${address}: ${err.message}`)
            continue
          }
          refreshes.push(controller.refresh(address, key).then(() => selectWanted(address, key)).catch(() => {}))
        }
      }
      await Promise.all(refreshes)
      if (refreshes.length > 0) startPolling()
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

    async add(agent, device) {
      const address = ensureAgent(agent, { create: true })
      if (!address) return null
      try {
        return await controller.registerDevice(address, device)
      } finally {
        startPolling()
      }
    },

    async refresh(agent, key) {
      return controller.refresh(ensureAgent(agent), key)
    },

    jump(agent, key) {
      const address = ensureAgent(agent)
      wantActive.delete(address)
      return controller.jump(address, key)
    },

    async invoke(agent, key, capability, args) {
      return controller.invoke(ensureAgent(agent), key, capability, args)
    },

    /** Forgets it on this side only. The device stays assigned until its owner changes that. */
    forget(agent, key) {
      const address = ensureAgent(agent)
      const record = controller.agent(address)
      if (!record.devices.has(key)) return false
      if (record.active === key) controller.jump(address, null)
      if (wantActive.get(address) === key) wantActive.delete(address)
      // shortcut: the SDK has no remove call, so this reaches into its map; use one when the protocol adds it
      record.devices.delete(key)
      controller.changed()
      return true
    },

    saveSnapshot(agent, key, { data }) {
      const dir = path.join(folder(agent.id), 'snapshots')
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
      const file = path.join(dir, `${key}-${Date.now()}.jpg`)
      writePrivate(file, Buffer.from(data, 'base64'))
      const own = fs.readdirSync(dir).filter((f) => f.startsWith(`${key}-`)).sort()
      for (const old of own.slice(0, Math.max(0, own.length - SNAPSHOTS_KEPT))) fs.rmSync(path.join(dir, old), { force: true })
      return file
    },

    stop: () => controller.stop(),
  }
}
