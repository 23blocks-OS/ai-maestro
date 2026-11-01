import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// aimaestro.sh/install (GitHub Pages serves docs/) must be exactly the installer in scripts/
describe('aimaestro.sh/install', () => {
  it('is byte for byte scripts/remote-install.sh', () => {
    const root = path.resolve(__dirname, '..')
    const served = fs.readFileSync(path.join(root, 'docs/install'))
    const source = fs.readFileSync(path.join(root, 'scripts/remote-install.sh'))
    expect(served.equals(source), 'run: cp scripts/remote-install.sh docs/install').toBe(true)
  })
})
