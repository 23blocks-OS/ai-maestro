import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import {
  listAgentHomes,
  requestHomeChange
} from '../services/agent-homes-service'

let dir: string
const deviceKey = crypto.randomBytes(32).toString('base64url')
const owner = 'lola@host.local'
function report(
  agent = owner,
  state = 'online',
  checkedAt = new Date().toISOString()
) {
  fs.writeFileSync(
    path.join(
      dir,
      'status',
      crypto.createHash('sha256').update(agent).digest('hex') + '.json'
    ),
    JSON.stringify({
      agent,
      updatedAt: checkedAt,
      devices: {
        macbook: {
          name: 'macbook',
          key: deviceKey,
          assignedAgent: agent,
          state,
          checkedAt,
          lastSeen: checkedAt,
          permissions: { camera: false },
          capabilities: ['device.health'],
          streams: []
        }
      }
    })
  )
}
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-homes-'))
  process.env.ADP_DASHBOARD_DIR = dir
  fs.mkdirSync(path.join(dir, 'status'))
})
afterEach(() => {
  delete process.env.ADP_DASHBOARD_DIR
  fs.rmSync(dir, { recursive: true, force: true })
})
describe('agent homes', () => {
  it('reports a stale monitor as offline', () => {
    report(owner, 'online', new Date(Date.now() - 100000).toISOString())
    const result = listAgentHomes().data
    expect(result && 'devices' in result && result.devices[0].state).toBe(
      'offline'
    )
  })
  it('queues a transfer without changing ownership and requires a signed monitor confirmation', () => {
    report()
    const request = requestHomeChange({
      deviceKey,
      agent: owner,
      change: {
        action: 'transfer',
        agent: 'other@host.local',
        key: crypto.randomBytes(32).toString('base64url')
      }
    })
    expect(request.status).toBe(202)
    const listed = listAgentHomes().data
    expect(
      listed && 'devices' in listed && listed.devices[0].assignedAgent
    ).toBe(owner)
    expect(listed && 'requests' in listed && listed.requests[0].status).toBe(
      'queued'
    )
    expect(
      requestHomeChange({
        deviceKey,
        agent: owner,
        change: { action: 'revoke' }
      }).status
    ).toBe(400)
  })
  it('prefers current verified ownership over the previous agent polling with a revoked key', () => {
    report('other@host.local')
    report(owner, 'revoked')
    const result = listAgentHomes().data
    expect(result && 'devices' in result && result.devices).toHaveLength(1)
    expect(
      result && 'devices' in result && result.devices[0].assignedAgent
    ).toBe('other@host.local')
  })
  it('rejects unknown devices and invalid operations', () => {
    report()
    expect(
      requestHomeChange({
        deviceKey,
        agent: 'wrong@host.local',
        change: { action: 'revoke' }
      }).status
    ).toBe(404)
    expect(
      requestHomeChange({
        deviceKey,
        agent: owner,
        change: { action: 'shell', command: 'id' }
      }).status
    ).toBe(400)
  })
})
