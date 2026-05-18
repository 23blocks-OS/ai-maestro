import { describe, it, expect } from 'vitest'
import { agentToSession } from '@/lib/agent-utils'
import type { Agent } from '@/types/agent'
import { parseSessionName, computeSessionName, computeCallSessionName, isCallSession, parseNameForDisplay, PERMISSION_MODE_TO_CLI } from '@/types/agent'
import type { AgentPermissionMode } from '@/types/agent'

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
// computeCallSessionName
// ============================================================================

describe('computeCallSessionName', () => {
  it('appends __call suffix', () => {
    expect(computeCallSessionName('website')).toBe('website__call')
  })

  it('handles hyphenated agent names', () => {
    expect(computeCallSessionName('23blocks-apps-backend')).toBe('23blocks-apps-backend__call')
  })
})

// ============================================================================
// isCallSession
// ============================================================================

describe('isCallSession', () => {
  it('returns true for call session names', () => {
    expect(isCallSession('website__call')).toBe(true)
    expect(isCallSession('23blocks-apps-backend__call')).toBe(true)
  })

  it('returns false for regular session names', () => {
    expect(isCallSession('website')).toBe(false)
    expect(isCallSession('website_0')).toBe(false)
    expect(isCallSession('website_1')).toBe(false)
  })

  it('returns false for names that contain but do not end with __call', () => {
    expect(isCallSession('__call_agent')).toBe(false)
  })

  it('is consistent with computeCallSessionName', () => {
    const names = ['website', 'my-agent', '23blocks-apps-backend']
    for (const name of names) {
      expect(isCallSession(computeCallSessionName(name))).toBe(true)
    }
  })
})

// ============================================================================
// parseSessionName does NOT collide with __call suffix
// ============================================================================

describe('parseSessionName with __call sessions', () => {
  it('does not extract agent name "foo" from "foo__call"', () => {
    const result = parseSessionName('foo__call')
    // __call is NOT the _N multi-brain pattern, so it should NOT match
    expect(result.agentName).toBe('foo__call')
    expect(result.index).toBe(0)
  })

  it('does not match multi-brain pattern for hyphenated call sessions', () => {
    const result = parseSessionName('my-agent__call')
    expect(result.agentName).toBe('my-agent__call')
    expect(result.index).toBe(0)
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

// ============================================================================
// PERMISSION_MODE_TO_CLI
// ============================================================================

describe('PERMISSION_MODE_TO_CLI', () => {
  it('maps supervised to default', () => {
    expect(PERMISSION_MODE_TO_CLI.supervised).toBe('default')
  })

  it('maps planOnly to plan', () => {
    expect(PERMISSION_MODE_TO_CLI.planOnly).toBe('plan')
  })

  it('maps trustEdits to acceptEdits', () => {
    expect(PERMISSION_MODE_TO_CLI.trustEdits).toBe('acceptEdits')
  })

  it('maps smartAuto to auto', () => {
    expect(PERMISSION_MODE_TO_CLI.smartAuto).toBe('auto')
  })

  it('maps fullAutonomy to bypassPermissions', () => {
    expect(PERMISSION_MODE_TO_CLI.fullAutonomy).toBe('bypassPermissions')
  })

  it('covers all 5 permission modes', () => {
    const modes: AgentPermissionMode[] = ['supervised', 'planOnly', 'trustEdits', 'smartAuto', 'fullAutonomy']
    expect(Object.keys(PERMISSION_MODE_TO_CLI).sort()).toEqual(modes.sort())
  })

  it('has no duplicate CLI values', () => {
    const cliValues = Object.values(PERMISSION_MODE_TO_CLI)
    expect(new Set(cliValues).size).toBe(cliValues.length)
  })
})
