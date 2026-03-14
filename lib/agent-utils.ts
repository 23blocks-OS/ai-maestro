/**
 * Shared agent utility functions
 *
 * Extracted from page.tsx, MobileDashboard.tsx, zoom/page.tsx, zoom/agent/page.tsx
 * to eliminate duplication.
 */

import type { Agent } from '@/types/agent'
import type { Session } from '@/types/session'

/**
 * Get the base URL for API calls to an agent's host.
 *
 * Returns '' (empty string = relative fetch) when the agent lives on the same
 * machine as the dashboard, even if hostUrl is a WSL2/NAT internal IP that
 * the browser can't reach.
 *
 * Components that receive `hostUrl` as a prop should have callers pass the
 * result of this function instead of raw `agent.hostUrl`.
 */
export function getAgentBaseUrl(agent: { hostUrl?: string; isSelf?: boolean } | null | undefined): string {
  if (!agent) return ''
  if (agent.isSelf) return ''
  if (!agent.hostUrl) return ''
  const lowered = agent.hostUrl.toLowerCase()
  if (lowered.includes('localhost') || lowered.includes('127.0.0.1')) return ''
  return agent.hostUrl
}

// Fun AI-themed aliases - split by gender to match avatar photos
// IA names are feminine (Spanish style), AI names are masculine
export const FEMALE_ALIASES = [
  'MarIA', 'SofIA', 'LucIA', 'JulIA', 'NatalIA', 'OlivIA', 'VictorIA', 'ValerIA',
  'NovaIA', 'StellaIA', 'AuroraIA', 'CelestIA', 'HarmonIA', 'SerenIA', 'DataIA',
]
export const MALE_ALIASES = [
  'LunAI', 'NovAI', 'AriAI', 'ZarAI', 'KAI', 'SkyAI', 'MaxAI', 'LeoAI',
  'MirAI', 'EchoAI', 'ZenAI', 'NeoAI', 'PixAI', 'BytAI', 'CodeAI',
  'AtlAI', 'OrionAI', 'PhoenixAI', 'TitanAI', 'VegAI', 'CosmAI',
]

/**
 * Get a gender-matched alias based on the agent name.
 * Uses same hash logic as AgentBadge avatar selection for consistency.
 */
export function getRandomAlias(agentName: string): string {
  let hash = 0
  for (let i = 0; i < agentName.length; i++) {
    const char = agentName.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  const isMale = (Math.abs(hash >> 8) % 2 === 0)
  const aliases = isMale ? MALE_ALIASES : FEMALE_ALIASES
  return aliases[Math.abs(hash) % aliases.length]
}

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
