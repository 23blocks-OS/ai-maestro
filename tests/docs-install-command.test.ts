import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')

const CANON = 'curl -fsSL aimaestro.sh/install | bash'
const RAW = 'raw.githubusercontent.com/23blocks-OS/ai-maestro/main/scripts/remote-install.sh'

describe('aimaestro.sh docs install command', () => {
  it('keeps the served installer byte-for-byte with scripts/remote-install.sh', () => {
    const served = fs.readFileSync(path.join(root, 'docs/install'))
    const source = fs.readFileSync(path.join(root, 'scripts/remote-install.sh'))
    expect(served.equals(source)).toBe(true)
  })

  it('leaves the GitHub Pages CNAME on aimaestro.sh', () => {
    expect(read('docs/CNAME').trim()).toBe('aimaestro.sh')
  })

  it('teaches the canonical command on the home page and the one-computer quickstart', () => {
    for (const file of ['docs/index.html', 'docs/single-computer.html']) {
      const html = read(file)
      expect(html).toContain(CANON)
      expect(html).not.toContain(RAW)
      expect(html).toContain('http://localhost:23000')
      expect(html).toContain('id="install"')
    }
    expect(read('docs/single-computer.html')).toContain('id="quickstart"')
    expect(read('docs/single-computer.html')).toContain('id="how-it-works"')
    expect(read('docs/index.html')).toContain('id="docs"')
    expect(read('docs/index.html')).toContain('id="setup"')
    expect(read('docs/index.html')).toContain('id="agents"')
    expect(read('docs/index.html')).toContain('id="messaging"')
    expect(read('docs/index.html')).toContain('id="skills"')
    expect(read('docs/index.html')).toContain('id="ai"')
  })

  it('does not teach an installer flag the script rejects', () => {
    const script = read('scripts/remote-install.sh')
    expect(script).not.toContain('--auto-start')
    for (const file of [
      'docs/index.html',
      'docs/single-computer.html',
      'docs/QUICKSTART.md',
      'docs/SETUP-TUTORIAL.md',
      'docs/WINDOWS-INSTALLATION.md',
      'docs/advanced-setup.html',
    ]) {
      expect(read(file)).not.toContain('--auto-start')
    }
  })
})
