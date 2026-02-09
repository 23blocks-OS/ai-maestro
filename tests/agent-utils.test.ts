import { describe, it, expect } from 'vitest'
import { agentToSession } from '@/lib/agent-utils'
import type { Agent } from '@/types/agent'
import { parseSessionName, computeSessionName, parseNameForDisplay } from '@/types/agent'

// ============================================================================
// agentToSession
// ============================================================================

describe('agentToSession', () => {
  const baseAgent = {
    id: 'agent-123',
    name: 'test-agent',
    label: 'Test Agent',
    alias: 'test-alias',
    hostId: 'test-host',
    status: 'active',
    createdAt: '2025-01-01T00:00:00.000Z',
    lastActive: '2025-01-02T00:00:00.000Z',
    sessions: [],
    preferences: {
      defaultWorkingDirectory: '/default/dir',
    },
  } as unknown as Agent

  it('uses tmux session name as id when session exists', () => {
    const agent = {
      ...baseAgent,
      session: {
        tmuxSessionName: 'my-tmux-session',
        status: 'online' as const,
        workingDirectory: '/work/dir',
      },
    }

    const session = agentToSession(agent)
    expect(session.id).toBe('my-tmux-session')
    expect(session.workingDirectory).toBe('/work/dir')
  })

  it('falls back to agent.id when no session exists', () => {
    const session = agentToSession(baseAgent)
    expect(session.id).toBe('agent-123')
  })

  it('uses label for session name', () => {
    const session = agentToSession(baseAgent)
    expect(session.name).toBe('Test Agent')
  })

  it('falls back to name when label is empty', () => {
    const agent = { ...baseAgent, label: undefined }
    const session = agentToSession(agent)
    expect(session.name).toBe('test-agent')
  })

  it('uses preferences.defaultWorkingDirectory as fallback', () => {
    const session = agentToSession(baseAgent)
    expect(session.workingDirectory).toBe('/default/dir')
  })

  it('preserves agentId reference', () => {
    const session = agentToSession(baseAgent)
    expect(session.agentId).toBe('agent-123')
  })

  it('preserves hostId', () => {
    const session = agentToSession(baseAgent)
    expect(session.hostId).toBe('test-host')
  })
})

// ============================================================================
// parseSessionName
// ============================================================================

describe('parseSessionName', () => {
  it('parses simple name as index 0', () => {
    const result = parseSessionName('website')
    expect(result).toEqual({ agentName: 'website', index: 0 })
  })

  it('parses name with explicit index 0', () => {
    const result = parseSessionName('website_0')
    expect(result).toEqual({ agentName: 'website', index: 0 })
  })

  it('parses name with index 1', () => {
    const result = parseSessionName('website_1')
    expect(result).toEqual({ agentName: 'website', index: 1 })
  })

  it('handles hyphenated names', () => {
    const result = parseSessionName('23blocks-apps-backend')
    expect(result).toEqual({ agentName: '23blocks-apps-backend', index: 0 })
  })

  it('handles hyphenated names with index', () => {
    const result = parseSessionName('23blocks-apps-backend_2')
    expect(result).toEqual({ agentName: '23blocks-apps-backend', index: 2 })
  })

  it('handles multi-digit indices', () => {
    const result = parseSessionName('agent_12')
    expect(result).toEqual({ agentName: 'agent', index: 12 })
  })
})

// ============================================================================
// computeSessionName
// ============================================================================

describe('computeSessionName', () => {
  it('returns plain name for index 0', () => {
    expect(computeSessionName('website', 0)).toBe('website')
  })

  it('appends index for non-zero', () => {
    expect(computeSessionName('website', 1)).toBe('website_1')
  })

  it('handles hyphenated names', () => {
    expect(computeSessionName('23blocks-apps-backend', 2)).toBe('23blocks-apps-backend_2')
  })

  it('is the inverse of parseSessionName', () => {
    const names = ['website', 'website_0', 'website_1', '23blocks-apps-backend_2']
    for (const name of names) {
      const { agentName, index } = parseSessionName(name)
      const computed = computeSessionName(agentName, index)
      const reparsed = parseSessionName(computed)
      expect(reparsed.agentName).toBe(agentName)
      expect(reparsed.index).toBe(index)
    }
  })
})

// ============================================================================
// parseNameForDisplay
// ============================================================================

describe('parseNameForDisplay', () => {
  it('returns no tags for single-segment name', () => {
    const result = parseNameForDisplay('website')
    expect(result).toEqual({ tags: [], shortName: 'website' })
  })

  it('splits hyphenated name into tags + shortName', () => {
    const result = parseNameForDisplay('23blocks-apps-website')
    expect(result).toEqual({ tags: ['23blocks', 'apps'], shortName: 'website' })
  })

  it('handles two-segment names', () => {
    const result = parseNameForDisplay('project-backend')
    expect(result).toEqual({ tags: ['project'], shortName: 'backend' })
  })

  it('handles many segments', () => {
    const result = parseNameForDisplay('org-team-service-worker')
    expect(result).toEqual({ tags: ['org', 'team', 'service'], shortName: 'worker' })
  })
})
