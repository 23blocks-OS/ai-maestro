import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { once } from 'events'
import type { Server } from 'http'

const agents = new Map<string, any>()
vi.mock('@/lib/agent-registry', () => ({ getAgent: (id: string) => agents.get(id), loadAgents: () => [...agents.values()] }))

const { createDeviceHost } = await import('@/lib/device-host.mjs')
const { identity } = await import('@/lib/device-sdk/index.mjs')
const { bridge } = await import('./fixtures/device-protocol/clients/linux/server.mjs')
const svc = await import('@/services/agent-devices-service')

let dir = ''
let hosts: any[] = []
let servers: Server[] = []
const g = globalThis as any
const deviceKeys = new Map<string, any>()
const hardware = {
  cameraReady: () => true, indicatorReady: () => true, indicate: async () => {},
  snapshot: async () => ({ mime: 'image/jpeg', data: '/9j/2Q==' }),
  playReady: () => true,
  play: async (bytes: Buffer) => { played.push(bytes); return { played: true } },
}
const played: Buffer[] = []

function startHost() {
  const host = createDeviceHost({ agentsDir: dir })
  hosts.push(host)
  g._deviceHost = host
  return host
}

async function startDevice(peer: () => any) {
  const device = identity()
  deviceKeys.set(device.key, device)
  const server = bridge(device, peer, hardware)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  servers.push(server)
  return { key: device.key, endpoint: `http://127.0.0.1:${(server.address() as any).port}`, name: 'kitchen' }
}

/** An agent with a device assigned to it, as `cli.mjs assign` on the device would do */
async function pair(id: string) {
  const { data } = await svc.getAgentDeviceIdentity(id) as any
  const device = await startDevice(() => ({ key: data.key, assignedAgent: data.address, camera: true, revision: 'r1' }))
  expect((await svc.addAgentDevice(id, device)).status).toBe(201)
  return device
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-devices-'))
  for (const id of ['a', 'b']) agents.set(id, { id, name: id, metadata: { amp: { address: `${id}@town.local` } } })
  startHost()
})

afterEach(async () => {
  for (const h of hosts) await h.stop()
  for (const s of servers) { s.close(); s.closeAllConnections() }
  hosts = []; servers = []
  agents.clear()
  delete g._deviceHost
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('an agent with no device costs nothing', () => {
  it('lists an empty list and writes no key and no file', async () => {
    expect((await svc.listAgentDevices('a')).data).toEqual({ devices: [] })
    expect(fs.existsSync(path.join(dir, 'a'))).toBe(false)
    expect(g._deviceHost.controller.timer).toBeFalsy()
  })

  it('an agent with no AMP address cannot own one, and says so', async () => {
    agents.set('c', { id: 'c' })
    expect((await svc.getAgentDeviceIdentity('c')).status).toBe(409)
    expect((await svc.addAgentDevice('c', { key: 'k', endpoint: 'http://127.0.0.1:1' })).status).toBe(409)
  })
})

describe('storage', () => {
  it('keeps the key private and out of the state file', async () => {
    await pair('a')
    const f = path.join(dir, 'a/devices')
    expect(fs.statSync(path.join(f, 'identity.json')).mode & 0o777).toBe(0o600)
    expect(fs.statSync(path.join(f, 'state.json')).mode & 0o777).toBe(0o600)
    const { secret } = JSON.parse(fs.readFileSync(path.join(f, 'identity.json'), 'utf8'))
    expect(fs.readFileSync(path.join(f, 'state.json'), 'utf8')).not.toContain(secret.split('\n')[1])
  })

  it('a restart brings back the devices and the active one, asking each device who owns it', async () => {
    const device = await pair('a')
    svc.jumpAgentDevice('a', device.key)
    await hosts[0].stop()
    await startHost().restore([...agents.values()])
    const { devices } = (await svc.listAgentDevices('a')).data as any
    expect(devices).toMatchObject([{ key: device.key, verified: true, active: true, owner: 'a@town.local' }])
  })

  it('saved state is not ownership: a device now assigned elsewhere comes back unverified, and not active', async () => {
    const { data } = await svc.getAgentDeviceIdentity('a') as any
    let peer = { key: data.key, assignedAgent: data.address, camera: true, revision: 'r1' }
    const device = await startDevice(() => peer)
    await svc.addAgentDevice('a', device)
    svc.jumpAgentDevice('a', device.key)
    await hosts[0].stop()
    peer = { ...peer, assignedAgent: 'b@town.local', revision: 'r2' }
    await startHost().restore([...agents.values()])
    const { devices } = (await svc.listAgentDevices('a')).data as any
    expect(devices[0]).toMatchObject({ verified: false, owner: null, active: false })
  })

  it('an offline device keeps its place, and becomes active again when it answers', async () => {
    const device = await pair('a')
    svc.jumpAgentDevice('a', device.key)
    await hosts[0].stop()
    const server = servers.pop()!
    const { port } = server.address() as any
    server.close(); server.closeAllConnections()
    await once(server, 'close')

    const host = startHost()
    await host.restore([...agents.values()])
    expect(((await svc.listAgentDevices('a')).data as any).devices[0].active).toBe(false)

    const { data } = await svc.getAgentDeviceIdentity('a') as any
    const again = bridge(deviceKeys.get(device.key), () => ({ key: data.key, assignedAgent: data.address, camera: true, revision: 'r1' }), hardware)
    again.listen(port, '127.0.0.1')
    await once(again, 'listening')
    servers.push(again)
    await svc.refreshAgentDevice('a', device.key)
    await vi.waitFor(() => expect(host.inventory(agents.get('a'))[0].active).toBe(true))
  })
})

describe('two agents on one host', () => {
  it('each sees only its own, and the wrong agent gets 404', async () => {
    const device = await pair('a')
    await svc.getAgentDeviceIdentity('b')
    expect(((await svc.listAgentDevices('b')).data as any).devices).toEqual([])
    expect((await svc.invokeAgentDevice('b', device.key, { capability: 'device.health' })).status).toBe(404)
    expect((await svc.forgetAgentDevice('b', device.key)).status).toBe(404)
    const all = svc.listHostDevices().data as any
    expect(all.agents.map((x: any) => x.agentId)).toEqual(['a'])
  })

  it('a device already verified for one agent cannot be pinned by another', async () => {
    const device = await pair('a')
    await svc.getAgentDeviceIdentity('b')
    expect((await svc.addAgentDevice('b', device)).status).toBe(409)
  })
})

describe('pairing', () => {
  it('a device that has not assigned this agent yet stays pinned, not verified', async () => {
    const device = await startDevice(() => ({ key: identity().key, assignedAgent: 'x@town.local', camera: false, revision: 'r' }))
    const r = await svc.addAgentDevice('a', device) as any
    expect(r.status).toBe(202)
    expect(r.data.device).toMatchObject({ verified: false })
    expect((svc.jumpAgentDevice('a', device.key) as any).status).toBe(409)
  })

  it('refuses a public address, a bad key and a long name, before any network call', async () => {
    const key = identity().key
    expect((await svc.addAgentDevice('a', { key, endpoint: 'http://8.8.8.8:23110' })).status).toBe(400)
    expect((await svc.addAgentDevice('a', { key: 'nope', endpoint: 'http://127.0.0.1:1' })).status).toBe(400)
    expect((await svc.addAgentDevice('a', { key, endpoint: 'http://127.0.0.1:1', name: 'x'.repeat(81) })).status).toBe(400)
    expect(((await svc.listAgentDevices('a')).data as any).devices).toEqual([])
  })
})

describe('use', () => {
  it('a snapshot is a private file, not bytes in the answer, and only 20 are kept', async () => {
    const device = await pair('a')
    svc.jumpAgentDevice('a', device.key)
    const r = await svc.invokeAgentDevice('a', device.key, { capability: 'camera.snapshot' }) as any
    expect(r.data.value.data).toBeUndefined()
    expect(fs.statSync(r.data.value.path).mode & 0o777).toBe(0o600)
    const folder = path.dirname(r.data.value.path)
    for (let i = 0; i < 25; i++) fs.writeFileSync(path.join(folder, `${device.key}-${1000 + i}.jpg`), 'x')
    g._deviceHost.saveSnapshot(agents.get('a'), device.key, { data: '/9j/2Q==' })
    expect(fs.readdirSync(folder)).toHaveLength(20)
  })

  it('an idle device refuses the camera with 409; health still works', async () => {
    const device = await pair('a')
    expect((await svc.invokeAgentDevice('a', device.key, { capability: 'camera.snapshot' })).status).toBe(409)
    expect((await svc.invokeAgentDevice('a', device.key, { capability: 'device.health' })).status).toBe(200)
  })

  it('forget removes it here and clears the active device', async () => {
    const device = await pair('a')
    svc.jumpAgentDevice('a', device.key)
    expect((await svc.forgetAgentDevice('a', device.key)).status).toBe(200)
    expect(((await svc.listAgentDevices('a')).data as any).devices).toEqual([])
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'a/devices/state.json'), 'utf8'))).toMatchObject({ devices: [], activeDeviceKey: null })
  })

  it('answers 503 when the controller is not running, and 404 for an unknown agent', async () => {
    expect((await svc.listAgentDevices('nobody')).status).toBe(404)
    delete g._deviceHost
    expect((await svc.listAgentDevices('a')).status).toBe(503)
  })
})

describe('capture and the last picture (step 2)', () => {
  const stream = (frames: Buffer[]) => async function* () { for (const bytes of frames) yield { kind: 'x', sequence: 1, bytes } }

  it('video keeps the last frame; audio is a WAV; both are private files', async () => {
    const device = await pair('a')
    svc.jumpAgentDevice('a', device.key)
    const media = vi.spyOn(g._deviceHost.controller, 'media')
    media.mockImplementationOnce(stream([Buffer.from('one'), Buffer.from('two')]))
    const video = await svc.captureAgentDevice('a', device.key, { kind: 'video', seconds: 2 }) as any
    expect(fs.readFileSync(video.data.value.path, 'utf8')).toBe('two')
    expect(fs.statSync(video.data.value.path).mode & 0o777).toBe(0o600)
    media.mockImplementationOnce(stream([Buffer.alloc(32)]))
    const audio = await svc.captureAgentDevice('a', device.key, { kind: 'microphone' }) as any
    expect(audio.data.value.path).toMatch(/\.wav$/)
    expect(fs.readFileSync(audio.data.value.path).subarray(0, 4).toString()).toBe('RIFF')
    expect(media).toHaveBeenLastCalledWith('a@town.local', device.key, 'microphone', 5)
  })

  it('refuses a kind or length outside the limits before reaching the device', async () => {
    const device = await pair('a')
    const media = vi.spyOn(g._deviceHost.controller, 'media')
    for (const body of [{ kind: 'shell' }, { kind: 'toString' }, { kind: 'video', seconds: 31 }, { kind: 'microphone', seconds: 11 }, { kind: 'video', seconds: 0 }, { kind: 'video', seconds: '5' }]) {
      expect((await svc.captureAgentDevice('a', device.key, body)).status, JSON.stringify(body)).toBe(400)
    }
    expect(media).not.toHaveBeenCalled()
  })

  it('an idle device refuses a capture', async () => {
    const device = await pair('a')
    expect((await svc.captureAgentDevice('a', device.key, { kind: 'video' })).status).toBe(409)
  })

  it('a capture the person ended is the device\'s answer, not a network failure', async () => {
    const device = await pair('a')
    svc.jumpAgentDevice('a', device.key)
    vi.spyOn(g._deviceHost.controller, 'media').mockImplementationOnce(async function* () { throw new Error('Media ended: revoked') })
    expect(await svc.captureAgentDevice('a', device.key, { kind: 'video' })).toEqual({ data: { ok: false, error: 'revoked' }, status: 200 })
  })

  it('no capture yields an answer, not an empty file', async () => {
    const device = await pair('a')
    svc.jumpAgentDevice('a', device.key)
    vi.spyOn(g._deviceHost.controller, 'media').mockImplementationOnce(stream([]))
    expect((await svc.captureAgentDevice('a', device.key, { kind: 'video' })).status).toBe(409)
  })

  it('the last picture is only for its own agent and device', async () => {
    const device = await pair('a')
    expect((await svc.latestAgentDeviceSnapshot('a', device.key)).status).toBe(404)
    svc.jumpAgentDevice('a', device.key)
    const taken = await svc.invokeAgentDevice('a', device.key, { capability: 'camera.snapshot' }) as any
    expect(((await svc.latestAgentDeviceSnapshot('a', device.key)).data as any).path).toBe(taken.data.value.path)
    await svc.getAgentDeviceIdentity('b')
    expect((await svc.latestAgentDeviceSnapshot('b', device.key)).status).toBe(404)
    expect((await svc.latestAgentDeviceSnapshot('a', '../../identity.json')).status).toBe(404)
  })
})

describe("the agent's own voice (F092)", () => {
  const wav = () => { const b = Buffer.alloc(64); b.write('RIFF', 0, 'latin1'); b.write('WAVE', 8, 'latin1'); return b }
  let stopped = false
  const speech = (files: string[]) => ({
    ready: () => true,
    synthesize: async function* () { try { yield* files } finally { stopped = true } },
  })
  const setup = async (files: string[], outputs: Record<string, boolean>, voice?: object) => {
    played.length = 0
    stopped = false
    const host = createDeviceHost({ agentsDir: dir, speech: speech(files) } as any)
    hosts.push(host)
    g._deviceHost = host
    agents.get('a').voice = voice
    const { data } = await svc.getAgentDeviceIdentity('a') as any
    const device = await startDevice(() => ({ key: data.key, assignedAgent: data.address, revision: 'r1', outputs }))
    expect((await svc.addAgentDevice('a', device)).status).toBe(201)
    await svc.jumpAgentDevice('a', device.key)
    return device
  }
  const file = (name: string, bytes: Buffer) => { const p = path.join(dir, name); fs.writeFileSync(p, bytes); return p }

  it('plays each sentence on the device, in order', async () => {
    const one = wav(); const two = wav(); two[63] = 9
    const device = await setup([file('1.wav', one), file('2.wav', two)], { 'speaker.play': true }, { engine: 'local' })
    const result = await svc.invokeAgentDevice('a', device.key, { capability: 'speaker.say', args: { text: 'Hello. Bye.' } }) as any
    expect(result.data).toEqual({ ok: true, value: { played: true, voice: 'agent' } })
    expect(played).toEqual([one, two])
  })

  it('a refusal stops the rest of the speech', async () => {
    const device = await setup([file('1.wav', Buffer.from('not audio')), file('2.wav', wav())], { 'speaker.play': true }, { engine: 'local' })
    const result = await svc.invokeAgentDevice('a', device.key, { capability: 'speaker.say', args: { text: 'Hello. Bye.' } })
    expect(result.status).toBeGreaterThanOrEqual(400)
    expect(played).toEqual([])
    expect(stopped).toBe(true)
  })

  it('without the grant, a chosen voice, or an active device, no audio is made or played', async () => {
    const say = { capability: 'speaker.say', args: { text: 'Hello.' } }
    const noGrant = await setup([file('1.wav', wav())], { 'speaker.say': true }, { engine: 'local' })
    await svc.invokeAgentDevice('a', noGrant.key, say)
    expect(played).toEqual([])
    const noVoice = await setup([file('1.wav', wav())], { 'speaker.play': true })
    await svc.invokeAgentDevice('a', noVoice.key, say)
    expect(played).toEqual([])
    const paid = await setup([file('1.wav', wav())], { 'speaker.play': true }, { engine: 'elevenlabs' })
    await svc.invokeAgentDevice('a', paid.key, say)
    expect(played).toEqual([])
    const idle = await setup([file('1.wav', wav())], { 'speaker.play': true }, { engine: 'local' })
    svc.jumpAgentDevice('a', null as any)
    expect((await svc.invokeAgentDevice('a', idle.key, say)).status).toBe(409)
    expect(played).toEqual([])
  })

  it('the same limit on what an agent may say', async () => {
    const device = await setup([file('1.wav', wav())], { 'speaker.play': true }, { engine: 'local' })
    const result = await svc.invokeAgentDevice('a', device.key, { capability: 'speaker.say', args: { text: 'x'.repeat(501) } })
    expect(result.status).toBeGreaterThanOrEqual(400)
    expect(played).toEqual([])
  })
})

describe('a bad file on disk (review of step 1)', () => {
  const stateFile = (id: string) => path.join(dir, id, 'devices/state.json')
  const keyFile = (id: string) => path.join(dir, id, 'devices/identity.json')

  it('an unreadable device list is left alone, and that agent says why', async () => {
    await pair('a')
    await hosts[0].stop()
    fs.writeFileSync(stateFile('a'), '{ not json')
    await startHost().restore([...agents.values()])
    const r = await svc.listAgentDevices('a')
    expect(r.status).toBe(500)
    expect((r.data as any).error).toBe('device_state_unreadable')
    expect(fs.readFileSync(stateFile('a'), 'utf8')).toBe('{ not json')
  })

  it('one bad agent does not stop the others restoring', async () => {
    await pair('a')
    const b = await pair('b')
    await hosts[0].stop()
    fs.writeFileSync(keyFile('a'), '{ not json')
    await startHost().restore([...agents.values()])
    expect(((await svc.listAgentDevices('b')).data as any).devices.map((d: any) => d.key)).toEqual([b.key])
    expect((svc.listHostDevices().data as any).agents.find((x: any) => x.agentId === 'a').error).toContain('device_state_unreadable')
  })

  it('a corrupt key is never replaced by a new one', async () => {
    await pair('a')
    await hosts[0].stop()
    fs.writeFileSync(keyFile('a'), 'garbage')
    startHost()
    expect((await svc.getAgentDeviceIdentity('a')).status).toBe(500)
    expect(fs.readFileSync(keyFile('a'), 'utf8')).toBe('garbage')
  })

  it('a saved device the SDK refuses stays on disk', async () => {
    await pair('a')
    await hosts[0].stop()
    const state = JSON.parse(fs.readFileSync(stateFile('a'), 'utf8'))
    state.devices.push({ key: identity().key, name: 'old', endpoint: 'http://8.8.8.8:1' })
    fs.writeFileSync(stateFile('a'), JSON.stringify(state))
    await startHost().restore([...agents.values()])
    await vi.waitFor(() => expect(JSON.parse(fs.readFileSync(stateFile('a'), 'utf8')).devices.map((d: any) => d.name)).toContain('old'))
  })

  it('a loaded agent is never saved half way through: saves during loading are held', async () => {
    const one = await pair('a')
    const { data } = await svc.getAgentDeviceIdentity('a') as any
    const two = await startDevice(() => ({ key: data.key, assignedAgent: data.address, camera: true, revision: 'r' }))
    await svc.addAgentDevice('a', { ...two, name: 'office' })
    await hosts[0].stop()
    const writes: string[] = []
    const real = fs.renameSync
    const spy = vi.spyOn(fs, 'renameSync').mockImplementation((from: any, to: any) => {
      real(from, to)
      if (String(to).endsWith('state.json')) writes.push(fs.readFileSync(to, 'utf8'))
    })
    await startHost().restore([...agents.values()])
    spy.mockRestore()
    for (const w of writes) expect(JSON.parse(w).devices.map((d: any) => d.key).sort()).toEqual([one.key, two.key].sort())
  })
})

describe('agents that change (review of step 1)', () => {
  it('an agent whose AMP address changes keeps its key and devices', async () => {
    const device = await pair('a')
    const key = ((await svc.getAgentDeviceIdentity('a')).data as any).key
    agents.get('a').metadata.amp.address = 'a2@town.local'
    expect(((await svc.getAgentDeviceIdentity('a')).data as any)).toEqual({ address: 'a2@town.local', key })
    expect(((await svc.listAgentDevices('a')).data as any).devices.map((d: any) => d.key)).toEqual([device.key])
    expect(svc.listHostDevices().status).toBe(200)
  })

  it('two live agents with one address: the second is refused, not given the first one\'s key', async () => {
    await pair('a')
    agents.set('x', { id: 'x', metadata: { amp: { address: 'a@town.local' } } })
    expect((await svc.getAgentDeviceIdentity('x')).status).toBe(409)
    expect(fs.existsSync(path.join(dir, 'x'))).toBe(false)
  })

  it('an agent deleted and made again under its name starts clean', async () => {
    const live = new Set(['a'])
    const host = createDeviceHost({ agentsDir: dir, agentExists: (id: string) => live.has(id) })
    hosts.push(host); g._deviceHost = host
    await pair('a')
    const old = ((await svc.getAgentDeviceIdentity('a')).data as any).key
    live.delete('a'); agents.delete('a')
    live.add('a2'); agents.set('a2', { id: 'a2', metadata: { amp: { address: 'a@town.local' } } })
    expect(((await svc.listAgentDevices('a2')).data as any).devices).toEqual([])
    expect(((await svc.getAgentDeviceIdentity('a2')).data as any).key).not.toBe(old)
  })

  it('a save that fails does not reach the SDK, and is tried again', async () => {
    const device = await pair('a')
    const spy = vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw new Error('ENOSPC') })
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await svc.jumpAgentDevice('a', device.key) as any).status).toBe(200)
    spy.mockRestore(); errors.mockRestore()
    g._deviceHost.controller.changed()
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'a/devices/state.json'), 'utf8')).activeDeviceKey).toBe(device.key)
  })

  it('an agent that lives on another host is refused, and gets no key here', async () => {
    agents.set('r', { id: 'r', hostId: 'some-other-host', metadata: { amp: { address: 'r@town.local' } } })
    expect((await svc.getAgentDeviceIdentity('r')).status).toBe(409)
    expect(fs.existsSync(path.join(dir, 'r'))).toBe(false)
  })
})

describe('answers (review of step 1)', () => {
  it('re-pairing with a bad endpoint is 400, keeps the old one; a new device that has not assigned us is 202', async () => {
    const device = await pair('a')
    expect((await svc.addAgentDevice('a', { ...device, endpoint: 'http://8.8.8.8:1' })).status).toBe(400)
    expect(((await svc.listAgentDevices('a')).data as any).devices[0].endpoint).toBe(device.endpoint)
  })

  it('re-pairing with no name keeps the name', async () => {
    const device = await pair('a')
    await svc.addAgentDevice('a', { key: device.key, endpoint: device.endpoint })
    expect(((await svc.listAgentDevices('a')).data as any).devices[0].name).toBe('kitchen')
  })

  it('forget on an agent with no key, and a jump to an unknown device, are 404', async () => {
    expect((await svc.forgetAgentDevice('a', identity().key)).status).toBe(404)
    await pair('a')
    expect((await svc.jumpAgentDevice('a', identity().key) as any).status).toBe(404)
  })

  it.each([
    ['denied', 200], ['grant_revoked', 200], ['hardware_unavailable', 200], ['invalid_arguments', 200],
    ['Device is idle', 409], ['Request rejected: 403', 409], ['Device belongs to another agent', 409],
    ['Unknown capability', 400], ['Invalid capability arguments', 400], ['Invalid image format', 400],
    ['Unknown device', 404], ['Invalid signature', 502], ['Invalid packet', 502], ['Unexpected token < in JSON', 502],
    ['fetch failed', 502], ['Request rejected: 500', 502],
  ])('%s answers %i', async (message, status) => {
    const device = await pair('a')
    vi.spyOn(g._deviceHost, 'invoke').mockRejectedValueOnce(new Error(message))
    expect((await svc.invokeAgentDevice('a', device.key, { capability: 'device.health' })).status).toBe(status)
  })
})
