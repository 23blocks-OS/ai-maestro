import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { resolveProgramCommand } from '@/lib/program-command'

const root = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')

describe('F031: Aider is deprecated, not advertised', () => {
  it('the wake dialog no longer offers Aider', () => {
    expect(read('components/WakeAgentDialog.tsx')).not.toMatch(/id:\s*'aider'/)
  })

  it('an existing Aider agent still launches', () => {
    const r = resolveProgramCommand('aider')
    expect(r.error).toBeUndefined()
    expect(r.kind).toBe('aider')
    expect(r.command).toBe('aider')
  })

  it('the unrecognised-program message does not list Aider', () => {
    expect(resolveProgramCommand('nonsense-tool').error).not.toMatch(/aider/i)
  })

  it.each(['README.md', 'PRODUCT.md', 'docs/index.html', 'docs/ai-index.html', 'docs/OPERATIONS-GUIDE.md',
    'components/onboarding/UseCaseSelector.tsx', 'services/help-service.ts'])('%s does not advertise Aider', (f) => {
    expect(read(f)).not.toMatch(/aider/i)
  })
})

describe('F032: no claim that AI Maestro manages GitHub Copilot', () => {
  it.each(['README.md', 'docs/OPERATIONS-GUIDE.md', 'docs/copy-for-ai.js', 'docs/messaging.html'])(
    '%s does not mention Copilot', (f) => {
      expect(read(f)).not.toMatch(/copilot/i)
    })

  it('the website only names Copilot as an Agent Skills Standard adopter', () => {
    for (const f of ['docs/index.html', 'docs/ai-index.html']) {
      const lines = read(f).split('\n').filter((l) => /copilot/i.test(l))
      for (const l of lines) expect(l).toMatch(/Agent Skills Standard/)
    }
  })
})
