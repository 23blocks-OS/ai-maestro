/**
 * Shared agent utility functions
 *
 * Extracted from page.tsx, MobileDashboard.tsx, zoom/page.tsx, zoom/agent/page.tsx
 * to eliminate duplication.
 */

import type { Agent } from '@/types/agent'
import type { Session } from '@/types/session'

/**
 * Convert an Agent to a Session-like object for TerminalView compatibility.
 *
 * TerminalView expects a Session (tmux session metadata) for WebSocket connections.
 * This bridges the Agent-first architecture with the terminal layer.
 *
 * CRITICAL: session.id must be the tmux session name for WebSocket to connect.
 */
export function agentToSession(agent: Agent): Session {
  return {
    id: agent.session?.tmuxSessionName || agent.id,
    name: agent.label || agent.name || agent.alias || '',
    workingDirectory: agent.session?.workingDirectory || agent.preferences?.defaultWorkingDirectory || '',
    status: 'active' as const,
    createdAt: agent.createdAt,
    lastActivity: agent.lastActive || agent.createdAt,
    windows: 1,
    agentId: agent.id,
    hostId: agent.hostId,
  }
}
