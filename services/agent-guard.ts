/**
 * Service-level check that an agent id names a real agent (B009).
 *
 * `AgentRegistry.getAgent` is get-or-create: it used to build an agent, and its
 * database folder, for ANY id, so a request for an unknown id answered success and
 * left a folder behind. The registry now refuses unknown ids; this turns that into a
 * clean 404 before a service starts work.
 */
import { isKnownAgentId } from '@/lib/agent'
import { agentNotFound, type ServiceResult } from '@/services/service-errors'

/** Null when the agent is known, otherwise a ready-to-return 404 result. */
export function unknownAgentResult(agentId: string): ServiceResult<never> | null {
  return isKnownAgentId(agentId) ? null : agentNotFound(agentId)
}
