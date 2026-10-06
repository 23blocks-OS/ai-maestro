import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// 0.60.0: one commit in history pointed the plugin submodule at an unpushed plugin
// commit, and a recursing `git fetch` aborted the update on two hosts. The updater
// must not recurse into submodules while fetching or pulling; the later
// `git submodule update` fetches the one commit the final pointer names.
const script = fs.readFileSync(path.join(__dirname, '..', 'update-aimaestro.sh'), 'utf8')

describe('update-aimaestro.sh', () => {
  it('fetches without recursing into submodules', () => {
    expect(script).toMatch(/git fetch --no-recurse-submodules origin main/)
    expect(script).not.toMatch(/^\s*git fetch origin main/m)
  })
  it('pulls without recursing into submodules', () => {
    expect(script).toMatch(/git pull --no-recurse-submodules origin main/)
  })
  it('still updates the submodule to the recorded pointer', () => {
    expect(script).toMatch(/git submodule update --init --recursive --force/)
  })
})
