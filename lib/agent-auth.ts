/**
 * Agent Authentication for Internal APIs
 *
 * Bridges AMP API key auth to governance-restricted internal API calls.
 * Agents must prove identity via Bearer token for operations requiring agent identity.
 *
 * Three outcomes:
 * 1. No auth headers → system owner (web UI) → { agentId: undefined }
 * 2. Valid Authorization: Bearer → authenticated agent → { agentId: 'uuid' }
 * 3. X-Agent-Id without valid Bearer, or invalid Bearer → { error, status: 401 }
 */
import { authenticateRequest } from './amp-auth'

export interface AgentAuthResult {
  /** Verified agent ID, or undefined for system owner / web UI */
  agentId?: string
  /** Error message if authentication failed */
  error?: string
  /** HTTP status code for the error */
  status?: number
}

/**
 * Authenticate an agent from HTTP header values.
 *
 * @param authHeader - Value of Authorization header (or null)
 * @param agentIdHeader - Value of X-Agent-Id header (or null)
 * @returns AgentAuthResult with agentId for success, error for failure, or empty for system owner
 */
export function authenticateAgent(authHeader: string | null, agentIdHeader: string | null): AgentAuthResult {
  // Case 1: No auth attempt at all → system owner / web UI
  if (!authHeader && !agentIdHeader) {
    return {}
  }

  // Case 2: X-Agent-Id present without Authorization → reject (identity spoofing)
  if (agentIdHeader && !authHeader) {
    return {
      error: 'Agent identity requires authentication. Include Authorization: Bearer <api-key> header.',
      status: 401
    }
  }

  // Case 3: Authorization header present → validate API key
  if (authHeader) {
    const result = authenticateRequest(authHeader)

    if (!result.authenticated || !result.agentId) {
      return {
        error: result.message || 'Invalid or expired API key',
        status: 401
      }
    }

    // If X-Agent-Id is also present, it must match the authenticated agent
    if (agentIdHeader && agentIdHeader !== result.agentId) {
      return {
        error: 'X-Agent-Id does not match authenticated agent identity',
        status: 403
      }
    }

    return { agentId: result.agentId }
  }

  // Should not reach here, but return empty (system owner) for safety
  return {}
}
