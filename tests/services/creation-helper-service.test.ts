/**
 * Creation Helper Service Tests
 *
 * Tests the pure business logic in services/creation-helper-service.ts.
 * Covers session lifecycle, message relay, response capture, config parsing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Mocks — vi.hoisted() ensures availability before vi.mock() runs
// ============================================================================

const {
  mockRuntime,
  mockAgentRegistry,
  mockFs,
} = vi.hoisted(() => {
  return {
    mockRuntime: {
      sessionExists: vi.fn().mockResolvedValue(false),
      createSession: vi.fn().mockResolvedValue(undefined),
      killSession: vi.fn().mockResolvedValue(undefined),
      sendKeys: vi.fn().mockResolvedValue(undefined),
      unsetEnvironment: vi.fn().mockResolvedValue(undefined),
      capturePane: vi.fn().mockResolvedValue(''),
    },
    mockAgentRegistry: {
      getAgentByName: vi.fn().mockReturnValue(null),
      createAgent: vi.fn().mockResolvedValue({ id: 'test-uuid', name: '_aim-creation-helper' }),
      deleteAgent: vi.fn().mockResolvedValue(undefined),
    },
    mockFs: {
      existsSync: vi.fn().mockReturnValue(true),
      copyFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      unlinkSync: vi.fn(),
    },
  }
})

// Mock agent-runtime
vi.mock('@/lib/agent-runtime', () => ({
  getRuntime: () => mockRuntime,
}))

// Mock agent-registry
vi.mock('@/lib/agent-registry', () => ({
  getAgentByName: (...args: unknown[]) => mockAgentRegistry.getAgentByName(...args),
  createAgent: (...args: unknown[]) => mockAgentRegistry.createAgent(...args),
  deleteAgent: (...args: unknown[]) => mockAgentRegistry.deleteAgent(...args),
}))

// Mock types/agent
vi.mock('@/types/agent', () => ({
  parseNameForDisplay: () => ({ tags: ['system'] }),
}))

// Mock fs
vi.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockFs.existsSync(...args),
  copyFileSync: (...args: unknown[]) => mockFs.copyFileSync(...args),
  mkdirSync: (...args: unknown[]) => mockFs.mkdirSync(...args),
  unlinkSync: (...args: unknown[]) => mockFs.unlinkSync(...args),
}))

// Now import the service under test
import {
  createCreationHelper,
  deleteCreationHelper,
  getCreationHelperStatus,
  sendMessage,
  captureResponse,
} from '@/services/creation-helper-service'

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks()
  mockRuntime.sessionExists.mockResolvedValue(false)
  mockRuntime.capturePane.mockResolvedValue('')
  mockAgentRegistry.getAgentByName.mockReturnValue(null)
  mockAgentRegistry.createAgent.mockResolvedValue({ id: 'test-uuid', name: '_aim-creation-helper' })
  mockFs.existsSync.mockReturnValue(true)
})

// ============================================================================
// Session Lifecycle
// ============================================================================

describe('createCreationHelper', () => {
  it('creates a new session when none exists', async () => {
    const result = await createCreationHelper()

    expect(result.status).toBe(200)
    expect(result.data?.success).toBe(true)
    expect(result.data?.created).toBe(true)
    expect(result.data?.status).toBe('starting')
    expect(mockFs.copyFileSync).toHaveBeenCalled()
    expect(mockRuntime.createSession).toHaveBeenCalledWith('_aim-creation-helper', expect.any(String))
    expect(mockAgentRegistry.createAgent).toHaveBeenCalled()
    expect(mockRuntime.unsetEnvironment).toHaveBeenCalledWith('_aim-creation-helper', 'CLAUDECODE')
    expect(mockRuntime.sendKeys).toHaveBeenCalledTimes(2) // unset CLAUDECODE + launch command
  })

  it('returns existing session when already running (idempotent)', async () => {
    mockAgentRegistry.getAgentByName.mockReturnValue({ id: 'existing-id', name: '_aim-creation-helper' })
    mockRuntime.sessionExists.mockResolvedValue(true)

    const result = await createCreationHelper()

    expect(result.status).toBe(200)
    expect(result.data?.created).toBe(false)
    expect(result.data?.agentId).toBe('existing-id')
    expect(result.data?.status).toBe('online')
    expect(mockRuntime.createSession).not.toHaveBeenCalled()
  })

  it('cleans stale registry entry if session is gone', async () => {
    mockAgentRegistry.getAgentByName
      .mockReturnValueOnce({ id: 'stale-id', name: '_aim-creation-helper' }) // First call: found stale
      .mockReturnValueOnce(null) // After cleanup
    mockRuntime.sessionExists.mockResolvedValue(false)

    const result = await createCreationHelper()

    expect(result.status).toBe(200)
    expect(result.data?.created).toBe(true)
    expect(mockAgentRegistry.deleteAgent).toHaveBeenCalledWith('stale-id')
  })

  it('fails when agent file is missing', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const result = await createCreationHelper()

    expect(result.status).toBe(500)
    expect(result.error).toContain('Agent file not found')
  })

  it('creates .claude/agents/ directory if missing', async () => {
    // existsSync returns true for source file, false for destination dir
    mockFs.existsSync.mockImplementation((path: string) => {
      return typeof path === 'string' && path.includes('agents/haephestos-creation-helper.md') && !path.includes('.claude')
    })

    await createCreationHelper()

    expect(mockFs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('.claude/agents'), { recursive: true })
  })

  it('launches claude with correct flags', async () => {
    await createCreationHelper()

    // The second sendKeys call is the launch command
    const launchCall = mockRuntime.sendKeys.mock.calls[1]
    expect(launchCall[0]).toBe('_aim-creation-helper')
    const cmd = launchCall[1] as string
    expect(cmd).toContain('claude')
    expect(cmd).toContain('--agent haephestos-creation-helper')
    expect(cmd).toContain('--model sonnet')
    expect(cmd).toContain('--permission-mode bypassPermissions')
    expect(cmd).toContain('--tools Read,Glob,Grep')
  })
})

describe('deleteCreationHelper', () => {
  it('kills session and removes agent from registry', async () => {
    mockRuntime.sessionExists.mockResolvedValue(true)
    mockAgentRegistry.getAgentByName.mockReturnValue({ id: 'test-id', name: '_aim-creation-helper' })

    const result = await deleteCreationHelper()

    expect(result.status).toBe(200)
    expect(result.data?.success).toBe(true)
    expect(mockRuntime.killSession).toHaveBeenCalledWith('_aim-creation-helper')
    expect(mockAgentRegistry.deleteAgent).toHaveBeenCalledWith('test-id')
    expect(mockFs.unlinkSync).toHaveBeenCalled()
  })

  it('succeeds even when session already gone', async () => {
    mockRuntime.sessionExists.mockResolvedValue(false)
    mockAgentRegistry.getAgentByName.mockReturnValue(null)

    const result = await deleteCreationHelper()

    expect(result.status).toBe(200)
    expect(result.data?.success).toBe(true)
    expect(mockRuntime.killSession).not.toHaveBeenCalled()
  })
})

describe('getCreationHelperStatus', () => {
  it('returns offline when no session exists', async () => {
    const result = await getCreationHelperStatus()

    expect(result.data?.status).toBe('offline')
    expect(result.data?.ready).toBe(false)
  })

  it('returns ready when input prompt detected', async () => {
    mockRuntime.sessionExists.mockResolvedValue(true)
    mockAgentRegistry.getAgentByName.mockReturnValue({ id: 'test-id' })
    // Simulate Claude's terminal: top separator, response, bottom separator, input prompt
    mockRuntime.capturePane.mockResolvedValue([
      '──────────────────────────────',
      'Some response text from Claude',
      '──────────────────────────────',
      '> ',
    ].join('\n'))

    const result = await getCreationHelperStatus()

    expect(result.data?.status).toBe('ready')
    expect(result.data?.ready).toBe(true)
  })

  it('returns thinking when thinking indicators present', async () => {
    mockRuntime.sessionExists.mockResolvedValue(true)
    mockAgentRegistry.getAgentByName.mockReturnValue({ id: 'test-id' })
    mockRuntime.capturePane.mockResolvedValue('Processing your request... esc to interrupt')

    const result = await getCreationHelperStatus()

    expect(result.data?.status).toBe('thinking')
    expect(result.data?.ready).toBe(false)
  })
})

// ============================================================================
// Message Sending
// ============================================================================

describe('sendMessage', () => {
  it('sends sanitized text to tmux session', async () => {
    mockRuntime.sessionExists.mockResolvedValue(true)

    const result = await sendMessage('Hello Haephestos!')

    expect(result.status).toBe(200)
    expect(result.data?.success).toBe(true)
    expect(mockRuntime.sendKeys).toHaveBeenCalledWith(
      '_aim-creation-helper',
      'Hello Haephestos!',
      { literal: true, enter: true }
    )
  })

  it('rejects empty messages', async () => {
    mockRuntime.sessionExists.mockResolvedValue(true)

    const result = await sendMessage('')

    expect(result.status).toBe(400)
    expect(result.error).toContain('Empty message')
  })

  it('rejects when session not running', async () => {
    mockRuntime.sessionExists.mockResolvedValue(false)

    const result = await sendMessage('Hello')

    expect(result.status).toBe(404)
    expect(result.error).toContain('not running')
  })

  it('strips null bytes and control characters', async () => {
    mockRuntime.sessionExists.mockResolvedValue(true)

    await sendMessage('Hello\x00World\x07!')

    expect(mockRuntime.sendKeys).toHaveBeenCalledWith(
      '_aim-creation-helper',
      'HelloWorld!',
      { literal: true, enter: true }
    )
  })

  it('strips bidi override characters', async () => {
    mockRuntime.sessionExists.mockResolvedValue(true)

    await sendMessage('Hello\u202AWorld\u202E!')

    expect(mockRuntime.sendKeys).toHaveBeenCalledWith(
      '_aim-creation-helper',
      'HelloWorld!',
      { literal: true, enter: true }
    )
  })
})

// ============================================================================
// Response Capture
// ============================================================================

describe('captureResponse', () => {
  it('returns incomplete when no response yet', async () => {
    mockRuntime.sessionExists.mockResolvedValue(true)
    mockRuntime.capturePane.mockResolvedValue('Loading...')

    const result = await captureResponse()

    expect(result.data?.isComplete).toBe(false)
    expect(result.data?.text).toBe('')
  })

  it('returns complete response with clean text', async () => {
    mockRuntime.sessionExists.mockResolvedValue(true)
    mockRuntime.capturePane.mockResolvedValue([
      '──────────────────────────────',
      'Welcome to the Agent Forge! I am Haephestos.',
      '──────────────────────────────',
      '> ',
    ].join('\n'))

    const result = await captureResponse()

    expect(result.data?.isComplete).toBe(true)
    expect(result.data?.text).toContain('Welcome to the Agent Forge!')
    expect(result.data?.isThinking).toBe(false)
  })

  it('detects thinking state', async () => {
    mockRuntime.sessionExists.mockResolvedValue(true)
    mockRuntime.capturePane.mockResolvedValue('Analyzing your requirements... esc to interrupt')

    const result = await captureResponse()

    expect(result.data?.isComplete).toBe(false)
    expect(result.data?.isThinking).toBe(true)
  })

  it('returns 404 when session not running', async () => {
    mockRuntime.sessionExists.mockResolvedValue(false)

    const result = await captureResponse()

    expect(result.status).toBe(404)
    expect(result.error).toContain('not running')
  })

  it('strips ANSI escape codes from response', async () => {
    mockRuntime.sessionExists.mockResolvedValue(true)
    mockRuntime.capturePane.mockResolvedValue([
      '──────────────────────────────',
      '\x1B[1m\x1B[33mBold yellow text\x1B[0m normal text',
      '──────────────────────────────',
      '> ',
    ].join('\n'))

    const result = await captureResponse()

    expect(result.data?.isComplete).toBe(true)
    expect(result.data?.text).toBe('Bold yellow text normal text')
    expect(result.data?.text).not.toContain('\x1B')
  })
})

// ============================================================================
// Config Suggestion Parsing
// ============================================================================

describe('config suggestion parsing', () => {
  it('parses json:config blocks from response', async () => {
    mockRuntime.sessionExists.mockResolvedValue(true)
    const responseWithConfig = [
      '──────────────────────────────',
      'I suggest a development setup!',
      '',
      '```json:config',
      '[{"action": "set", "field": "name", "value": "my-dev-agent"}]',
      '```',
      '',
      'How does that sound?',
      '──────────────────────────────',
      '> ',
    ].join('\n')
    mockRuntime.capturePane.mockResolvedValue(responseWithConfig)

    const result = await captureResponse()

    expect(result.data?.isComplete).toBe(true)
    expect(result.data?.configSuggestions).toHaveLength(1)
    expect(result.data?.configSuggestions?.[0]).toEqual({
      action: 'set',
      field: 'name',
      value: 'my-dev-agent',
    })
    // Config block should be stripped from visible text
    expect(result.data?.text).not.toContain('json:config')
    expect(result.data?.text).toContain('I suggest a development setup!')
    expect(result.data?.text).toContain('How does that sound?')
  })

  it('parses multiple config suggestions in one block', async () => {
    mockRuntime.sessionExists.mockResolvedValue(true)
    mockRuntime.capturePane.mockResolvedValue([
      '──────────────────────────────',
      'Setting up your agent:',
      '',
      '```json:config',
      '[',
      '  {"action": "set", "field": "name", "value": "my-agent"},',
      '  {"action": "set", "field": "program", "value": "claude-code"},',
      '  {"action": "add", "field": "skills", "value": {"name": "tdd", "description": "TDD workflow"}}',
      ']',
      '```',
      '──────────────────────────────',
      '> ',
    ].join('\n'))

    const result = await captureResponse()

    expect(result.data?.configSuggestions).toHaveLength(3)
    expect(result.data?.configSuggestions?.[0]).toEqual({ action: 'set', field: 'name', value: 'my-agent' })
    expect(result.data?.configSuggestions?.[2]).toEqual({
      action: 'add',
      field: 'skills',
      value: { name: 'tdd', description: 'TDD workflow' },
    })
  })

  it('ignores malformed JSON in config blocks', async () => {
    mockRuntime.sessionExists.mockResolvedValue(true)
    mockRuntime.capturePane.mockResolvedValue([
      '──────────────────────────────',
      'Here is my suggestion:',
      '',
      '```json:config',
      'this is not valid json',
      '```',
      '',
      'What do you think?',
      '──────────────────────────────',
      '> ',
    ].join('\n'))

    const result = await captureResponse()

    expect(result.data?.isComplete).toBe(true)
    expect(result.data?.configSuggestions).toHaveLength(0)
    // Malformed block is kept visible since we couldn't parse it
    expect(result.data?.text).toContain('json:config')
  })

  it('handles response with no config blocks', async () => {
    mockRuntime.sessionExists.mockResolvedValue(true)
    mockRuntime.capturePane.mockResolvedValue([
      '──────────────────────────────',
      'Sure, I can help with that! What kind of agent do you need?',
      '──────────────────────────────',
      '> ',
    ].join('\n'))

    const result = await captureResponse()

    expect(result.data?.isComplete).toBe(true)
    expect(result.data?.configSuggestions).toHaveLength(0)
    expect(result.data?.text).toContain('Sure, I can help with that!')
  })

  it('ignores invalid suggestion objects missing required fields', async () => {
    mockRuntime.sessionExists.mockResolvedValue(true)
    mockRuntime.capturePane.mockResolvedValue([
      '──────────────────────────────',
      'Config:',
      '```json:config',
      '[{"action": "set"}, {"field": "name", "value": "test"}, {"action": "set", "field": "name", "value": "valid"}]',
      '```',
      '──────────────────────────────',
      '> ',
    ].join('\n'))

    const result = await captureResponse()

    // Only the last item has all 3 required fields
    expect(result.data?.configSuggestions).toHaveLength(1)
    expect(result.data?.configSuggestions?.[0].value).toBe('valid')
  })
})

// ============================================================================
// Edge Cases
// ============================================================================

describe('edge cases', () => {
  it('handles concurrent create calls gracefully', async () => {
    // Both calls should succeed — second returns existing
    const [r1, r2] = await Promise.all([
      createCreationHelper(),
      createCreationHelper(),
    ])

    // At least one should succeed
    expect(r1.status === 200 || r2.status === 200).toBe(true)
  })

  it('handles empty pane capture', async () => {
    mockRuntime.sessionExists.mockResolvedValue(true)
    mockRuntime.capturePane.mockResolvedValue('')

    const result = await captureResponse()

    expect(result.data?.isComplete).toBe(false)
    expect(result.data?.text).toBe('')
  })
})
