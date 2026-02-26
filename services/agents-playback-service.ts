/**
 * Agents Playback Service
 *
 * Business logic for agent session playback (Phase 5 placeholder).
 * Routes are thin wrappers that call these functions.
 */

import { getAgent, getAgentByAlias, getAgentByName } from '@/lib/agent-registry'
import type { Agent } from '@/types/agent'

// ── Types ───────────────────────────────────────────────────────────────────

import { ServiceResult } from '@/types/service'
// ServiceResult imported directly from canonical source

interface PlaybackState {
  agentId: string
  sessionId?: string
  isPlaying: boolean
  currentMessageIndex: number
  speed: number
  totalMessages?: number
  createdAt: string
  updatedAt: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveAgent(idOrName: string): Agent | null {
  return getAgent(idOrName) || getAgentByName(idOrName) || getAgentByAlias(idOrName) || null
}

// ── Public Functions ────────────────────────────────────────────────────────

/**
 * Get playback state for an agent.
 */
export function getPlaybackState(
  agentIdOrName: string,
  sessionId?: string | null
): ServiceResult<Record<string, unknown>> {
  const agent = resolveAgent(agentIdOrName)
  if (!agent) {
    return { error: 'Agent not found', status: 404 }
  }

  // TODO: Load playback state from CozoDB (Phase 5 -- this file is a placeholder)
  const playbackState: PlaybackState = {
    agentId: agent.id,
    sessionId: sessionId || undefined,
    isPlaying: false,
    currentMessageIndex: 0,
    speed: 1,
    totalMessages: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  return {
    data: {
      success: true,
      playbackState,
      message: 'Playback state retrieved (placeholder - Phase 5 implementation pending)'
    },
    status: 200
  }
}

/**
 * Control playback state for an agent.
 */
export function controlPlayback(
  agentIdOrName: string,
  body: { action: string; sessionId?: string; value?: number }
): ServiceResult<Record<string, unknown>> {
  const agent = resolveAgent(agentIdOrName)
  if (!agent) {
    return { error: 'Agent not found', status: 404 }
  }

  const { action, sessionId, value } = body

  if (!action) {
    return { error: 'Missing required parameter: action', status: 400 }
  }

  const validActions = ['play', 'pause', 'seek', 'setSpeed', 'reset']
  if (!validActions.includes(action)) {
    return { error: `Invalid action. Must be one of: ${validActions.join(', ')}`, status: 400 }
  }

  // Use Number.isNaN + type check instead of global isNaN which coerces argument
  if ((action === 'seek' || action === 'setSpeed') && (value === undefined || typeof value !== 'number' || Number.isNaN(value))) {
    return { error: `Action '${action}' requires a numeric value parameter`, status: 400 }
  }

  // Validate parseInt result to avoid NaN comparison (always false) silently returning 404
  if (sessionId) {
    const parsedIndex = parseInt(sessionId, 10)
    if (Number.isNaN(parsedIndex)) {
      return { error: 'sessionId must be a numeric session index', status: 400 }
    }
    if (!agent.sessions?.some(s => s.index === parsedIndex)) {
      return { error: 'Session not found for this agent', status: 404 }
    }
  }

  // TODO: Phase 5 -- placeholder

  // TODO: Implement actual playback control (Phase 5)
  const playbackState: PlaybackState = {
    agentId: agent.id,
    sessionId: sessionId || undefined,
    isPlaying: action === 'play',
    currentMessageIndex: action === 'seek' ? Math.floor(value || 0) : 0,
    speed: action === 'setSpeed' ? (value || 1) : 1,
    totalMessages: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  return {
    data: {
      success: true,
      playbackState,
      message: 'Playback control executed (placeholder - Phase 5 implementation pending)'
    },
    status: 200
  }
}
