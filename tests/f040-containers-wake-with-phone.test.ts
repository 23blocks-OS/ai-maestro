/**
 * F040, last three items: Docker and AWS agents choose their tool, "Wake with…" is a visible control, and a
 * sleeping agent can be woken from the phone.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { CONTAINER_TOOL_IDS, containerProgram, PROGRAM_CHOICES } from '@/lib/program-choices'
import { wakeSummary } from '@/lib/wake-flow'

const root = path.resolve(__dirname, '..')
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

describe('containerProgram', () => {
  it('turns the names agents are stored under into the command the image has', () => {
    expect(containerProgram('claude-code')).toBe('claude')
    expect(containerProgram('Claude Code')).toBe('claude')
    expect(containerProgram('claude')).toBe('claude')
    expect(containerProgram('codex')).toBe('codex')
    expect(containerProgram('Gemini CLI')).toBe('gemini')
  })

  it('defaults to Claude Code when nothing is given', () => {
    expect(containerProgram(undefined)).toBe('claude')
    expect(containerProgram('')).toBe('claude')
    expect(containerProgram('   ')).toBe('claude')
  })

  it('leaves a wrapper path and a tool the image does not know as given (a custom image keeps working)', () => {
    expect(containerProgram('/opt/bin/claude-sandboxed.sh')).toBe('/opt/bin/claude-sandboxed.sh')
    expect(containerProgram('my-tool')).toBe('my-tool')
    expect(containerProgram('grok')).toBe('grok')
  })
})

describe('the tools a container can run', () => {
  it('are exactly the ones the Docker image installs', () => {
    const dockerfile = read('agent-container/Dockerfile')
    const installed = [
      ['claude', '@anthropic-ai/claude-code'],
      ['codex', '@openai/codex'],
      ['gemini', '@google/gemini-cli'],
    ]
    for (const [id, pkg] of installed) {
      expect(dockerfile, pkg).toContain(pkg)
      expect(CONTAINER_TOOL_IDS as readonly string[]).toContain(id)
    }
    expect(CONTAINER_TOOL_IDS.length).toBe(installed.length)
  })

  it('are the ones an AWS server installs', () => {
    const userData = read('infrastructure/terraform/aws-agent/user_data.sh')
    for (const id of CONTAINER_TOOL_IDS) expect(userData, id).toMatch(new RegExp(`\\b${id}\\)\\s+npm install -g`))
  })

  it('all exist as offered tools', () => {
    for (const id of CONTAINER_TOOL_IDS) expect(PROGRAM_CHOICES.some((c) => c.id === id), id).toBe(true)
  })
})

describe('the create wizard for Docker and AWS', () => {
  const wizard = read('components/AgentCreationWizard.tsx')

  it('sends the chosen tool, not a fixed Claude Code', () => {
    expect(wizard).not.toMatch(/\) : 'claude-code'/)
    expect(wizard).toMatch(/runtime === 'tmux' \? programForCreate\(launch\.selected\) : launch\.selected\.command/)
    expect(wizard).not.toMatch(/program: 'claude',/)
  })

  it('offers only the container tools there', () => {
    expect(wizard).toContain('onlyTools={CONTAINER_TOOL_IDS}')
  })

  it('takes how freely it acts from the tool choice, not a separate Trust Level box', () => {
    expect(wizard).not.toContain('TrustLevelSelector')
    expect(wizard).toMatch(/launch\.modes\.length > 0 && launch\.permissionMode !== 'supervised'\) dockerPayload\.permissionMode/)
  })

  it('sends the Anthropic key only for Claude Code', () => {
    expect(wizard).toMatch(/cloudAnthropicKey && launch\.selected\.kind === 'claude'/)
  })
})

describe('Wake with… is visible', () => {
  it('the sidebar row has a button for it, shown once the agent has a tool (a first wake already opens the dialog)', () => {
    const list = read('components/AgentList.tsx')
    expect(list).toMatch(/isHibernated && canWakeInOneClick\(agent\) && \([\s\S]{0,400}setWakeDialogAgent\(agent\)/)
    expect(list).toContain('data-testid="wake-with"')
  })

  it('the full-page wake panels have it too', () => {
    const page = read('app/page.tsx')
    expect(page.match(/data-testid="wake-with"/g)?.length).toBe(2)
  })

  it('the zoom pages wake with what the agent runs, not always Claude Code', () => {
    for (const rel of ['components/zoom/AgentCard.tsx', 'app/zoom/agent/page.tsx']) {
      const src = read(rel)
      expect(src, rel).toContain('canWakeInOneClick(agent)')
      expect(src, rel).toContain('oneClickWakeOptions(agent)')
    }
  })
})

describe('wakeSummary', () => {
  it('says the tool and how freely, for the sleeping-agent screens', () => {
    expect(wakeSummary({ program: 'claude-code', permissionMode: 'supervised' })).toBe('Claude Code, asks before every change')
    expect(wakeSummary({ program: 'grok', permissionMode: 'fullAutonomy' })).toBe('Grok Build, asks for nothing')
  })

  it('names the tool alone when it has no permission choice', () => {
    expect(wakeSummary({ program: 'pi' })).toBe('Pi')
  })
})

describe('the phone', () => {
  it('shows a wake panel for a sleeping agent on the terminal tab', () => {
    const dash = read('components/MobileDashboard.tsx')
    expect(dash).toContain("import MobileWakePanel from './MobileWakePanel'")
    expect(dash).toMatch(/activeTab === 'terminal' && activeAgent && activeIsAsleep/)
  })

  it('the panel wakes through the same request builder and one-click choice as the desktop', () => {
    const panel = read('components/MobileWakePanel.tsx')
    expect(panel).toContain('buildWakeBody(program, options, agent.hostUrl)')
    expect(panel).toContain("wake('', oneClickWakeOptions(agent))")
    expect(panel).toContain('<WakeAgentDialog')
    // Touch targets of at least 44px.
    expect(panel).toContain('min-h-[48px]')
    expect(panel).toContain('min-h-[44px]')
  })
})
