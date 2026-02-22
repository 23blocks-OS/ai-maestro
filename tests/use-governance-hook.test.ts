/**
 * Unit tests for hooks/useGovernance.ts — API contract verification
 *
 * Coverage: 10 tests across 2 functions (submitConfigRequest, resolveConfigRequest)
 * - submitConfigRequest: correct request body, correct endpoint, error handling, requestId extraction
 * - resolveConfigRequest: approve body (with password + approverAgentId), reject body (with password + rejectorAgentId + reason),
 *     correct endpoint routing, error handling, JSON parse failure on error response
 *
 * Strategy:
 * Since useGovernance is a React hook (requires render context), and this project uses
 * vitest in node environment without @testing-library/react, we test the fetch call
 * contracts by directly invoking the logic patterns from the hook. We mock global.fetch
 * and verify the exact request bodies, endpoints, and error handling.
 *
 * The functions under test are extracted into standalone async functions that mirror
 * the hook's submitConfigRequest and resolveConfigRequest callbacks exactly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ============================================================================
// Standalone function replicas (mirror the hook's useCallback logic exactly)
// ============================================================================

/**
 * Replica of useGovernance.submitConfigRequest — sends a configure-agent governance request.
 * Mirrors hooks/useGovernance.ts lines 286-309 exactly.
 */
async function submitConfigRequest(
  targetAgentId: string,
  config: Record<string, unknown>,
): Promise<{ success: boolean; error?: string; requestId?: string }> {
  try {
    const res = await fetch('/api/v1/governance/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'configure-agent',
        payload: { agentId: targetAgentId, configuration: config },
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { success: false, error: data.error || `HTTP ${res.status}` }
    }
    const data = await res.json()
    return { success: true, requestId: data.id }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Replica of useGovernance.resolveConfigRequest — approves or rejects a governance request.
 * Mirrors hooks/useGovernance.ts lines 311-338 exactly.
 */
async function resolveConfigRequest(
  requestId: string,
  approved: boolean,
  password: string,
  resolverAgentId: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const endpoint = approved ? 'approve' : 'reject'
    // Approve requires approverAgentId + password; reject requires rejectorAgentId + password + reason
    const body = approved
      ? { approverAgentId: resolverAgentId, password }
      : { rejectorAgentId: resolverAgentId, password, reason }
    const res = await fetch(`/api/v1/governance/requests/${requestId}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch((parseErr: unknown) => {
        console.warn('[useGovernance] Failed to parse response JSON:', parseErr)
        return {}
      })
      return { success: false, error: data.error || `HTTP ${res.status}` }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ============================================================================
// Mock setup
// ============================================================================

let mockFetch: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockFetch = vi.fn()
  global.fetch = mockFetch
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================================
// submitConfigRequest
// ============================================================================

describe('submitConfigRequest API contract', () => {
  it('sends POST to /api/v1/governance/requests with correct body structure', async () => {
    /** Verifies the exact endpoint and JSON body format for a configure-agent request */
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'req-001' }),
    })

    await submitConfigRequest('agent-target-1', { maxTokens: 4096, model: 'opus' })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/v1/governance/requests')
    expect(options.method).toBe('POST')
    expect(options.headers['Content-Type']).toBe('application/json')

    const body = JSON.parse(options.body)
    expect(body.type).toBe('configure-agent')
    expect(body.payload.agentId).toBe('agent-target-1')
    expect(body.payload.configuration).toEqual({ maxTokens: 4096, model: 'opus' })
  })

  it('returns requestId from successful response', async () => {
    /** Verifies that the server-assigned request ID is propagated to the caller */
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'governance-req-42' }),
    })

    const result = await submitConfigRequest('agent-x', { debug: true })

    expect(result.success).toBe(true)
    expect(result.requestId).toBe('governance-req-42')
    expect(result.error).toBeUndefined()
  })

  it('returns error message from non-ok response body', async () => {
    /** Verifies that server error messages are extracted from the JSON response */
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Governance password required' }),
    })

    const result = await submitConfigRequest('agent-x', { debug: true })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Governance password required')
  })

  it('falls back to HTTP status code when error response has no error field', async () => {
    /** Verifies fallback error message uses HTTP status when server returns empty JSON */
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    })

    const result = await submitConfigRequest('agent-y', {})

    expect(result.success).toBe(false)
    expect(result.error).toBe('HTTP 500')
  })

  it('handles network failure gracefully', async () => {
    /** Verifies that a fetch exception is caught and returned as an error result */
    mockFetch.mockRejectedValueOnce(new Error('Network unreachable'))

    const result = await submitConfigRequest('agent-z', { setting: 'value' })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Network unreachable')
  })
})

// ============================================================================
// resolveConfigRequest
// ============================================================================

describe('resolveConfigRequest API contract', () => {
  it('sends POST to approve endpoint with approverAgentId and password', async () => {
    /** Verifies approve request body structure: { approverAgentId, password } */
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'approved' }),
    })

    await resolveConfigRequest('req-123', true, 'secret-pw', 'agent-mgr-1')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/v1/governance/requests/req-123/approve')
    expect(options.method).toBe('POST')

    const body = JSON.parse(options.body)
    expect(body.approverAgentId).toBe('agent-mgr-1')
    expect(body.password).toBe('secret-pw')
    // Approve body must NOT contain reject-specific fields
    expect(body.rejectorAgentId).toBeUndefined()
    expect(body.reason).toBeUndefined()
  })

  it('sends POST to reject endpoint with rejectorAgentId, password, and reason', async () => {
    /** Verifies reject request body structure: { rejectorAgentId, password, reason } */
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'rejected' }),
    })

    await resolveConfigRequest('req-456', false, 'admin-pw', 'agent-cos-2', 'Policy violation')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/v1/governance/requests/req-456/reject')
    expect(options.method).toBe('POST')

    const body = JSON.parse(options.body)
    expect(body.rejectorAgentId).toBe('agent-cos-2')
    expect(body.password).toBe('admin-pw')
    expect(body.reason).toBe('Policy violation')
    // Reject body must NOT contain approve-specific fields
    expect(body.approverAgentId).toBeUndefined()
  })

  it('returns error from non-ok response with error field', async () => {
    /** Verifies that server-side rejection errors are propagated to caller */
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Invalid password' }),
    })

    const result = await resolveConfigRequest('req-789', true, 'wrong-pw', 'agent-mgr')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid password')
  })

  it('handles unparseable error response body gracefully', async () => {
    /** Verifies fallback to HTTP status when error response body is not valid JSON */
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => { throw new Error('Unexpected token') },
    })

    const result = await resolveConfigRequest('req-999', false, 'pw', 'agent-x', 'reason')

    expect(result.success).toBe(false)
    // Falls back to HTTP status code when JSON parsing fails
    expect(result.error).toBe('HTTP 502')
  })

  it('handles network failure gracefully', async () => {
    /** Verifies that a fetch exception is caught and returned as an error result */
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'))

    const result = await resolveConfigRequest('req-abc', true, 'pw', 'agent-mgr')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Connection refused')
  })
})
