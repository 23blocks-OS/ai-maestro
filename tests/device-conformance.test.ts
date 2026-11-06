import { describe, it, vi, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

// The protocol's own conformance scenarios, unchanged, against AI Maestro's controller. They use node:test; here each
// test() becomes a vitest it(), so the file runs without changes. The test double is the protocol's real Linux bridge.
vi.mock('node:test', () => ({
  default: (name: string, fn: (t: { after: (f: () => unknown) => void }) => unknown) => it(name, async () => {
    const after: (() => unknown)[] = []
    try { await fn({ after: f => after.push(f) }) } finally { for (const f of after.reverse()) await f() }
  }),
}))

const agents = new Map<string, any>()
vi.mock('@/lib/agent-registry', () => ({ getAgent: (id: string) => agents.get(id), loadAgents: () => [...agents.values()] }))

const { createDeviceHost } = await import('@/lib/device-host.mjs')
const svc = await import('@/services/agent-devices-service')
const { controllerConformance } = await import('./fixtures/device-protocol/tests/conformance/controller-contract.mjs')

const dirs: string[] = []
afterEach(() => { dirs.splice(0).forEach(d => fs.rmSync(d, { recursive: true, force: true })); agents.clear() })

/** The Controller surface the scenarios use, over AI Maestro's service: an error answer is a rejection */
function makeController({ onEvent }: { onEvent?: (e: any) => void } = {}) {
  const agentsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-conformance-'))
  dirs.push(agentsDir)
  const host = createDeviceHost({ agentsDir, onEvent })
  ;(globalThis as any)._deviceHost = host
  const ids = new Map<string, string>()
  const ok = (r: any) => {
    if (r.status >= 400 || r.data?.ok === false) throw new Error(r.data?.message || r.data?.error)
    return r.data
  }
  return {
    addAgent({ address, identity }: { address: string; identity?: { secret: string; key: string } }) {
      const id = `id-${ids.size}`
      ids.set(address, id)
      agents.set(id, { id, metadata: { amp: { address } } })
      if (identity) {
        fs.mkdirSync(path.join(agentsDir, id, 'devices'), { recursive: true })
        fs.writeFileSync(path.join(agentsDir, id, 'devices/identity.json'), JSON.stringify(identity))
      }
    },
    async registerDevice(address: string, device: any) {
      const r = await svc.addAgentDevice(ids.get(address)!, device)
      if (r.status !== 201) throw new Error(`pairing answered ${r.status}`)
    },
    inventory: (address: string) => host.inventory(agents.get(ids.get(address)!)),
    refresh: async (address: string, key: string) => ok(await svc.refreshAgentDevice(ids.get(address)!, key)),
    jump: (address: string, key: string | null) => ok(svc.jumpAgentDevice(ids.get(address)!, key)),
    invoke: async (address: string, key: string, capability: string, args?: any) => {
      const { value } = ok(await svc.invokeAgentDevice(ids.get(address)!, key, { capability, args }))
      return value
    },
    stop: () => host.stop(),
  }
}

describe('protocol conformance: AI Maestro as a controller', () => {
  controllerConformance(makeController)
})
