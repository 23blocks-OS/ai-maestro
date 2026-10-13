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

describe('F032 / F038: Copilot is named only at the tier it actually has', () => {
  // We never supported Copilot until F038 (0.68.1: launch, terminal tab, wake by typing into the pane).
  // These pages must not describe it as anything more, and the pages that make no mention stay quiet.
  it.each(['docs/OPERATIONS-GUIDE.md', 'docs/copy-for-ai.js', 'docs/messaging.html'])(
    '%s does not mention Copilot', (f) => {
      expect(read(f)).not.toMatch(/copilot/i)
    })

  it('the README names Copilot CLI only as launching and running in the terminal tab', () => {
    // Look at the SENTENCE that names Copilot, not the whole line: one line also says what other agents get.
    const sentences = read('README.md').split('\n').flatMap((l) => l.split(/(?<=[.!?])\s+/)).filter((x) => /copilot/i.test(x))
    expect(sentences.length).toBeGreaterThan(0)
    for (const x of sentences) {
      expect(x).toMatch(/terminal tab/)
      expect(x).not.toMatch(/first-class|full support|approval cards|chat history/i)
    }
  })

  it('the website only names Copilot as an Agent Skills Standard adopter', () => {
    for (const f of ['docs/index.html', 'docs/ai-index.html']) {
      const lines = read(f).split('\n').filter((l) => /copilot/i.test(l))
      for (const l of lines) expect(l).toMatch(/Agent Skills Standard/)
    }
  })

  it('the wake dialog offers GitHub Copilot CLI with the command copilot (the tool list lives in lib/program-choices.ts)', () => {
    expect(read('lib/program-choices.ts')).toMatch(/id:\s*'copilot'[\s\S]*?command:\s*'copilot'/)
    // The dialog renders the shared launch panel (also used by the create wizard), which lists PROGRAM_CHOICES.
    expect(read('components/WakeAgentDialog.tsx')).toMatch(/LaunchChoicePanel/)
    expect(read('components/launch/LaunchChoicePanel.tsx')).toMatch(/PROGRAM_CHOICES/)
    expect(read('components/AgentCreationWizard.tsx')).toMatch(/LaunchChoicePanel/)
  })
})
