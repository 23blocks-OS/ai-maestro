import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'

// lib/device-sdk and the conformance fixtures are copies. A fix belongs in the protocol repo, or the next copy loses it.
const root = path.join(__dirname, '..')
const lines = fs.readFileSync(path.join(root, 'lib/device-sdk/SOURCE'), 'utf8').split('\n').filter(l => /^[0-9a-f]{64} /.test(l))

describe('device SDK copy', () => {
  it('records a pinned commit', () => {
    expect(fs.readFileSync(path.join(root, 'lib/device-sdk/SOURCE'), 'utf8')).toMatch(/^commit [0-9a-f]{40}$/m)
    expect(lines.length).toBeGreaterThan(10)
  })

  it('every file matches the protocol repo: no edits by hand', () => {
    for (const line of lines) {
      const [hash, file] = line.split(/\s+/)
      expect(createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex'), file).toBe(hash)
    }
  })

  it('no file in the copy is missing from the record', () => {
    const recorded = new Set(lines.map(l => path.basename(l.split(/\s+/)[1])))
    for (const f of fs.readdirSync(path.join(root, 'lib/device-sdk'))) if (f !== 'SOURCE') expect(recorded.has(f), f).toBe(true)
  })

  it('a route never imports the controller, or ws lands in a Next bundle', () => {
    const service = fs.readFileSync(path.join(root, 'services/agent-devices-service.ts'), 'utf8')
    expect(service).not.toMatch(/from ['"].*device-(host|sdk)/)
  })
})
