import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import fs from 'fs'
import nodeOs from 'os'
import path from 'path'

const home = fs.mkdtempSync(path.join(nodeOs.tmpdir(), 'agentdir-'))
vi.mock('os', async (orig) => {
  const real: any = await orig()
  return { ...real, default: { ...real, homedir: () => home }, homedir: () => home }
})
let agents: any[] = []
vi.mock('@/lib/agent-registry', () => ({ loadAgents: () => agents, normalizeHostId: (h: string) => (h || '').toLowerCase() }))
vi.mock('@/lib/hosts-config', () => ({ getSelfHostId: () => 'me', getPeerHosts: () => [{ id: 'mac-mini', url: 'http://mini:23000' }] }))

const dir = await import('@/lib/agent-directory')
const { peerAgents } = await import('@/services/shared-state')

afterAll(() => fs.rmSync(home, { recursive: true, force: true }))
beforeEach(() => { peerAgents.clear(); dir.clearDirectoryCache(); agents = [{ id: 'l1', name: 'lola', hostId: 'me' }]; dir.rebuildLocalDirectory() })

describe('agent directory (B035)', () => {
  it('lists the agents of a peer on /mesh, not of a dropped one, and local wins', () => {
    peerAgents.set('mac-mini', { items: { r1: { id: 'r1', name: 'Dahlia', hostId: 'mac-mini', ampRegistered: true }, r2: { id: 'r2', name: 'lola', hostId: 'mac-mini' } }, seq: 1, okAt: 1, connected: true })
    peerAgents.set('down', { items: { r3: { id: 'r3', name: 'gone', hostId: 'down' } }, seq: 1, okAt: 1, connected: false })
    expect(dir.lookupAgent('dahlia')).toMatchObject({ hostId: 'mac-mini', hostUrl: 'http://mini:23000', ampRegistered: true, source: 'remote' })
    expect(dir.lookupAgent('gone')).toBeNull()
    expect(dir.lookupAgent('lola')).toMatchObject({ hostId: 'me', source: 'local' })
    expect(dir.getDirectoryStats()).toMatchObject({ total: 2, local: 1, remote: 1 })
  })
})
