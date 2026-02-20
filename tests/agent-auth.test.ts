import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Mock the amp-auth dependency before importing agent-auth
// ============================================================================

const mockAuthenticateRequest = vi.fn()

vi.mock('@/lib/amp-auth', () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
}))

// ============================================================================
// Import module under test (after mocks)
// ============================================================================

import { authenticateAgent } from '@/lib/agent-auth'

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks()
})

// ============================================================================
// Tests
// ============================================================================

describe('authenticateAgent', () => {
  it('returns empty result (system owner) when no headers are provided', () => {
    /** No auth headers means system owner / web UI — full access with no agentId */
    const result = authenticateAgent(null, null)

    expect(result).toEqual({})
    expect(result.agentId).toBeUndefined()
    expect(result.error).toBeUndefined()
    expect(result.status).toBeUndefined()
    // authenticateRequest should NOT be called when no headers are present
    expect(mockAuthenticateRequest).not.toHaveBeenCalled()
  })

  it('returns 401 when X-Agent-Id is present without Authorization header', () => {
    /** X-Agent-Id without Bearer token is identity spoofing — must reject */
    const result = authenticateAgent(null, 'agent-123')

    expect(result.error).toBeDefined()
    expect(result.status).toBe(401)
    expect(result.agentId).toBeUndefined()
    expect(result.error).toContain('authentication')
    // authenticateRequest should NOT be called — rejected before reaching validation
    expect(mockAuthenticateRequest).not.toHaveBeenCalled()
  })

  it('returns authenticated agentId when valid Authorization with matching X-Agent-Id', () => {
    /** Valid Bearer token with matching X-Agent-Id — agent is authenticated */
    mockAuthenticateRequest.mockReturnValue({
      authenticated: true,
      agentId: 'agent-uuid-123',
      tenantId: 'tenant-1',
      address: 'agent@local',
    })

    const result = authenticateAgent('Bearer amp_live_sk_validkey', 'agent-uuid-123')

    expect(result.agentId).toBe('agent-uuid-123')
    expect(result.error).toBeUndefined()
    expect(result.status).toBeUndefined()
    expect(mockAuthenticateRequest).toHaveBeenCalledWith('Bearer amp_live_sk_validkey')
  })

  it('returns authenticated agentId when valid Authorization without X-Agent-Id', () => {
    /** Valid Bearer token without X-Agent-Id — agent is authenticated from token alone */
    mockAuthenticateRequest.mockReturnValue({
      authenticated: true,
      agentId: 'agent-uuid-456',
      tenantId: 'tenant-1',
      address: 'agent@local',
    })

    const result = authenticateAgent('Bearer amp_live_sk_validkey', null)

    expect(result.agentId).toBe('agent-uuid-456')
    expect(result.error).toBeUndefined()
    expect(result.status).toBeUndefined()
  })

  it('returns 401 when Authorization header contains invalid API key', () => {
    /** Invalid or expired API key in Bearer token — reject with 401 */
    mockAuthenticateRequest.mockReturnValue({
      authenticated: false,
      error: 'unauthorized',
      message: 'Invalid or expired API key',
    })

    const result = authenticateAgent('Bearer amp_live_sk_badkey', null)

    expect(result.error).toBeDefined()
    expect(result.status).toBe(401)
    expect(result.agentId).toBeUndefined()
    expect(result.error).toContain('Invalid or expired API key')
  })

  it('returns 401 when authenticateRequest returns no agentId despite authenticated=true', () => {
    /** Edge case: token validates but has no agentId (corrupted key record) */
    mockAuthenticateRequest.mockReturnValue({
      authenticated: true,
      agentId: undefined,
    })

    const result = authenticateAgent('Bearer amp_live_sk_noagent', null)

    expect(result.status).toBe(401)
    expect(result.agentId).toBeUndefined()
  })

  it('returns 403 when X-Agent-Id does not match authenticated agent identity', () => {
    /** X-Agent-Id header claims to be a different agent than the Bearer token proves — reject with 403 */
    mockAuthenticateRequest.mockReturnValue({
      authenticated: true,
      agentId: 'agent-real',
      tenantId: 'tenant-1',
      address: 'agent@local',
    })

    const result = authenticateAgent('Bearer amp_live_sk_validkey', 'agent-impersonator')

    expect(result.error).toBeDefined()
    expect(result.status).toBe(403)
    expect(result.agentId).toBeUndefined()
    expect(result.error).toContain('does not match')
  })

  it('returns 401 when Authorization header is malformed', () => {
    /** Malformed authorization header that fails amp-auth validation */
    mockAuthenticateRequest.mockReturnValue({
      authenticated: false,
      error: 'unauthorized',
      message: 'Missing or invalid Authorization header',
    })

    const result = authenticateAgent('NotBearer garbage', null)

    expect(result.status).toBe(401)
    expect(result.agentId).toBeUndefined()
  })
})
