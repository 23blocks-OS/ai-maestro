/**
 * The shared agent header (components/AgentHeaderBar.tsx): the terminal,
 * chat and streaming tabs all say which agent, where it runs and in which
 * folder, so the chat no longer hides the agent's name behind its activity.
 */

import { describe, it, expect } from 'vitest'
import { shortenPath } from '@/components/AgentHeaderBar'
import { agentWorkingDirectory, agentToSession } from '@/lib/agent-utils'

describe('shortenPath', () => {
  it('shows the home folder as ~', () => {
    expect(shortenPath('/Users/juan/23blocks/webApps/IaC')).toBe('~/23blocks/webApps/IaC')
    expect(shortenPath('/home/jpelaez/agents/lola')).toBe('~/agents/lola')
    expect(shortenPath('/Users/juan')).toBe('~')
    expect(shortenPath('/opt/work')).toBe('/opt/work')
  })
})

describe('agentWorkingDirectory', () => {
  it('uses the folder stored on the agent first (the registry is the source of truth)', () => {
    const agent: any = { id: 'a', workingDirectory: '/stored', sessions: [{ workingDirectory: '/session' }], preferences: { defaultWorkingDirectory: '/default' } }
    expect(agentWorkingDirectory(agent)).toBe('/stored')
    expect(agentToSession(agent).workingDirectory).toBe('/stored')
  })

  it('falls back to the session, then the default', () => {
    expect(agentWorkingDirectory({ id: 'a', sessions: [{ workingDirectory: '/session' }] } as any)).toBe('/session')
    expect(agentWorkingDirectory({ id: 'a', preferences: { defaultWorkingDirectory: '/default' } } as any)).toBe('/default')
    expect(agentWorkingDirectory({ id: 'a' } as any)).toBe('')
  })
})
