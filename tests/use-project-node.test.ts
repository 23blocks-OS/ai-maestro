import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

// A host moves to the pinned Node when nvm has it. Without it PATH stays put: mini-lola's system Node serves other services too.
const script = path.join(__dirname, '../scripts/use-project-node.sh')
const homes: string[] = []
afterEach(() => { homes.splice(0).forEach(h => fs.rmSync(h, { recursive: true, force: true })) })

function pathAfterSourcing(nodes: string[], { executable = true } = {}): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-node-'))
  homes.push(home)
  for (const v of nodes) {
    const bin = path.join(home, '.nvm/versions/node', v, 'bin')
    fs.mkdirSync(bin, { recursive: true })
    fs.writeFileSync(path.join(bin, 'node'), '', { mode: executable ? 0o755 : 0o644 })
  }
  return execFileSync('bash', ['-c', `set -e; . "${script}"; printf %s "$PATH"`], { env: { HOME: home, PATH: '/usr/bin:/bin' }, encoding: 'utf8' })
}

describe('use-project-node.sh', () => {
  const want = fs.readFileSync(path.join(__dirname, '../.nvmrc'), 'utf8').trim()

  it('puts the newest matching Node first', () => {
    const p = pathAfterSourcing([`v${want}.2.0`, `v${want}.10.1`, 'v20.19.0'])
    expect(p.split(':')[0]).toMatch(new RegExp(`/v${want}\\.10\\.1/bin$`))
    expect(p.endsWith('/usr/bin:/bin')).toBe(true)
  })

  it('leaves PATH alone when nvm does not have it, under set -e', () => {
    expect(pathAfterSourcing(['v20.19.0'])).toBe('/usr/bin:/bin')
    expect(pathAfterSourcing([])).toBe('/usr/bin:/bin')
  })

  it('ignores a folder with no working node', () => {
    expect(pathAfterSourcing([`v${want}.1.0`], { executable: false })).toBe('/usr/bin:/bin')
  })
})
