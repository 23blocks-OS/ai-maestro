import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// F129: an agent's Wi-Fi networks. A fake vault and a fake device controller: what matters here is where the password goes
const PASSWORD = 'hunter2-wifi-pass'
const agents = new Map<string, any>()
const vault = new Map<string, string>()

vi.mock('@/lib/agent-registry', () => ({
  getAgent: (id: string) => agents.get(id),
  loadAgents: () => [...agents.values()],
  updateAgent: (id: string, u: any) => {
    const a = agents.get(id)
    for (const [k, v] of Object.entries(u)) { if (v === null) delete a[k]; else a[k] = structuredClone(v) }
    return a
  },
}))
vi.mock('@/lib/hosts-config', () => ({ isSelf: () => true }))
vi.mock('@/lib/secret-vault.mjs', async () => {
  const real = await vi.importActual<any>('@/lib/secret-vault.mjs')
  return {
    ...real,
    setSecret: async (name: string, value: string) => { real.assertSecretName(name); vault.set(name, value) },
    getSecret: async (name: string) => vault.get(name) ?? null,
    deleteSecret: async (name: string) => { vault.delete(name) },
  }
})

const svc = await import('@/services/agent-devices-service')
const g = globalThis as any

const ID = '3f2a9c1e-0000-4000-8000-000000000001'
let devices: any[]
let calls: { key: string; capability: string; args: any }[]

beforeEach(() => {
  agents.set(ID, { id: ID, name: 'bruce' })
  vault.clear()
  calls = []
  devices = [
    { key: 'board', state: 'online', capabilities: ['device.health', 'network.add', 'network.remove', 'network.list'] },
    { key: 'asleep', state: 'offline', capabilities: ['network.add', 'network.remove'] },
    { key: 'old-board', state: 'online', capabilities: ['device.health'] },
  ]
  g._deviceHost = {
    inventory: () => devices,
    invoke: async (_a: any, key: string, capability: string, args: any) => {
      calls.push({ key, capability, args })
      if (key === 'broken') throw new Error(`Device said no to ${args.password}`)
      return { stored: true, count: 1 }
    },
  }
})
afterEach(() => { agents.clear(); delete g._deviceHost })

const leaks = (x: unknown) => JSON.stringify(x).includes(PASSWORD)

describe('adding a network', () => {
  it('keeps the password in the vault only and pushes it to online boards that offer network.add', async () => {
    const r = await svc.addAgentNetwork(ID, { ssid: 'Home', password: PASSWORD })
    expect(r.status).toBe(201)
    expect(r.data).toEqual({ networks: [{ ssid: 'Home', open: false }], pushed: [{ key: 'board', ok: true }] })
    expect(leaks(r)).toBe(false)
    expect(leaks(agents.get(ID))).toBe(false)
    const [entry] = agents.get(ID).deviceNetworks
    expect(entry.secret).toMatch(/^WIFI_3F2A9C1E_[0-9A-F]{8}$/)
    expect(vault.get(entry.secret)).toBe(PASSWORD)
    expect(calls).toEqual([{ key: 'board', capability: 'network.add', args: { ssid: 'Home', password: PASSWORD } }])
    expect(leaks(await svc.listAgentNetworks(ID))).toBe(false)
  })

  it('an open network has no vault entry, and replacing a name keeps its place', async () => {
    await svc.addAgentNetwork(ID, { ssid: 'Home', password: PASSWORD })
    await svc.addAgentNetwork(ID, { ssid: 'Cafe' })
    const r = await svc.addAgentNetwork(ID, { ssid: 'Home', password: '' })
    expect(r.status).toBe(200)
    expect((r.data as any).networks).toEqual([{ ssid: 'Home', open: true }, { ssid: 'Cafe', open: true }])
    expect(vault.size).toBe(0)
  })

  it('a device error is an outcome, with the password hidden', async () => {
    devices.push({ key: 'broken', state: 'online', capabilities: ['network.add'] })
    const r = await svc.addAgentNetwork(ID, { ssid: 'Home', password: PASSWORD })
    expect((r.data as any).pushed).toContainEqual({ key: 'broken', ok: false, error: 'Device said no to [hidden]' })
    expect(leaks(r)).toBe(false)
  })

  it.each([
    [{ ssid: '', password: PASSWORD }],
    [{ ssid: 'x'.repeat(33), password: PASSWORD }],
    [{ ssid: 'ñ'.repeat(17) }], // 34 bytes
    [{ ssid: 'Home', password: 'short' }],
    [{ ssid: 'Home', password: 'p'.repeat(64) }],
    [{ ssid: 'Home', password: ' padded-password' }],
    [{ ssid: 'Home', password: 42 }],
  ])('refuses %j', async (body) => {
    const r = await svc.addAgentNetwork(ID, body as any)
    expect(r.status).toBe(400)
    expect(agents.get(ID).deviceNetworks).toBeUndefined()
    expect(vault.size).toBe(0)
    expect(calls).toEqual([])
  })

  it('keeps at most 8', async () => {
    for (let i = 0; i < 8; i++) expect((await svc.addAgentNetwork(ID, { ssid: `n${i}` })).status).toBe(201)
    expect((await svc.addAgentNetwork(ID, { ssid: 'n8' })).status).toBe(400)
    expect((await svc.addAgentNetwork(ID, { ssid: 'n3', password: PASSWORD })).status).toBe(200)
  })
})

describe('removing a network', () => {
  it('deletes the vault entry and tells online boards', async () => {
    await svc.addAgentNetwork(ID, { ssid: 'Home', password: PASSWORD })
    calls = []
    const r = await svc.removeAgentNetwork(ID, 'Home')
    expect(r.data).toEqual({ networks: [], pushed: [{ key: 'board', ok: true }] })
    expect(vault.size).toBe(0)
    expect(agents.get(ID).deviceNetworks).toBeUndefined()
    expect(calls).toEqual([{ key: 'board', capability: 'network.remove', args: { ssid: 'Home' } }])
    expect((await svc.removeAgentNetwork(ID, 'Home')).status).toBe(404)
  })
})

describe('a board that connects', () => {
  it('gets every network in order, with network.add only', async () => {
    await svc.addAgentNetwork(ID, { ssid: 'Home', password: PASSWORD })
    await svc.addAgentNetwork(ID, { ssid: 'Cafe' })
    calls = []
    const r = await svc.syncAgentNetworks(ID, 'board')
    expect(r.data).toEqual({ synced: [{ ssid: 'Home', ok: true }, { ssid: 'Cafe', ok: true }] })
    expect(leaks(r)).toBe(false)
    expect(calls).toEqual([
      { key: 'board', capability: 'network.add', args: { ssid: 'Home', password: PASSWORD } },
      { key: 'board', capability: 'network.add', args: { ssid: 'Cafe', password: '' } },
    ])
  })

  it('a board without network.add, or offline, gets nothing', async () => {
    await svc.addAgentNetwork(ID, { ssid: 'Cafe' })
    calls = []
    expect((await svc.syncAgentNetworks(ID, 'old-board')).data).toEqual({ synced: [] })
    expect((await svc.syncAgentNetworks(ID, 'asleep')).data).toEqual({ synced: [] })
    expect(calls).toEqual([])
  })

  it('a password the vault lost is reported, not sent empty', async () => {
    await svc.addAgentNetwork(ID, { ssid: 'Home', password: PASSWORD })
    vault.clear()
    calls = []
    expect((await svc.syncAgentNetworks(ID, 'board')).data).toEqual({ synced: [{ ssid: 'Home', ok: false, error: 'password_missing' }] })
    expect(calls).toEqual([])
  })
})

describe("a board's Bluetooth setup code (S005)", () => {
  it('is learned when the board comes online and shown with the device, never with a password', async () => {
    const codes = new Map<string, string>()
    g._deviceHost.invoke = async (_a: any, key: string, capability: string) => (calls.push({ key, capability, args: {} }), capability === 'network.list' ? { networks: [], current: 'Home', setupCode: 'KN8A-RQEU' } : {})
    g._deviceHost.setupOf = (_a: any, key: string) => codes.get(key) ?? null
    g._deviceHost.rememberSetup = (_a: any, key: string, code: string) => (codes.set(key, code), true)
    expect((await svc.learnBoardSetup(ID, 'board')).data).toEqual({ learned: true })
    expect((await svc.learnBoardSetup(ID, 'old-board')).data).toEqual({ learned: false }) // no network.list
    expect((await svc.learnBoardSetup(ID, 'asleep')).data).toEqual({ learned: false }) // offline
    const listed = (await svc.listAgentDevices(ID)).data as any
    expect(listed.devices.find((d: any) => d.key === 'board').setup).toEqual({ name: 'ADP_board', code: 'KN8A-RQEU' })
    expect(listed.devices.find((d: any) => d.key === 'old-board').setup).toBeUndefined()
    const host = svc.listHostDevices().data as any
    expect(host.agents[0].devices.find((d: any) => d.key === 'board').setup.code).toBe('KN8A-RQEU')
  })
})

describe('a board that reconnected without an online event', () => {
  it('is asked for its setup code when its devices are listed', async () => {
    const codes = new Map<string, string>()
    g._deviceHost.invoke = async (_a: any, key: string, capability: string) => (calls.push({ key, capability, args: {} }), capability === 'network.list' ? { setupCode: 'ABCD-EFGH' } : {})
    g._deviceHost.setupOf = (_a: any, key: string) => codes.get(key) ?? null
    g._deviceHost.rememberSetup = (_a: any, key: string, code: string) => (codes.set(key, code), true)
    const first = (await svc.listAgentDevices(ID)).data as any
    expect(first.devices.find((d: any) => d.key === 'board').setup).toBeUndefined()
    await new Promise((r) => setTimeout(r, 10))
    const second = (await svc.listAgentDevices(ID)).data as any
    expect(second.devices.find((d: any) => d.key === 'board').setup.code).toBe('ABCD-EFGH')
    expect(calls.filter((c) => c.capability === 'network.list').length).toBe(1)
  })
})
