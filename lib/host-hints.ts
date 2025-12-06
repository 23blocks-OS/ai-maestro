/**
 * Host Hints - Optional optimization for agents running on AI Maestro
 *
 * This module provides a simple pub/sub system for the host to send hints
 * to agents. Agents can work perfectly fine without these hints - they're
 * just optimizations to improve responsiveness and resource usage.
 *
 * Design Philosophy:
 * - Agents are autonomous and self-sufficient
 * - Host hints are optional optimizations, not requirements
 * - If an agent doesn't receive hints, it uses its own timers
 * - Hints are advisory, not commands
 */

import type { HostHint, HostHintType } from './agent'

// Callback type for hint listeners
type HintCallback = (hint: HostHint) => void

/**
 * HostHintBroadcaster - Simple pub/sub for host hints
 *
 * The host (AI Maestro server) uses this to notify agents of events like:
 * - Session going idle (good time to index)
 * - System load being low (good time to run)
 * - System being busy (skip this cycle)
 */
class HostHintBroadcaster {
  private listeners = new Map<string, HintCallback>()

  /**
   * Subscribe an agent to receive hints
   * Called by AgentSubconscious when starting
   */
  subscribe(agentId: string, callback: HintCallback): void {
    this.listeners.set(agentId, callback)
    console.log(`[HostHints] Agent ${agentId.substring(0, 8)} subscribed to hints`)
  }

  /**
   * Unsubscribe an agent from hints
   * Called by AgentSubconscious when stopping
   */
  unsubscribe(agentId: string): void {
    this.listeners.delete(agentId)
    console.log(`[HostHints] Agent ${agentId.substring(0, 8)} unsubscribed from hints`)
  }

  /**
   * Broadcast a hint to a specific agent
   */
  broadcast(agentId: string, type: HostHintType): void {
    const listener = this.listeners.get(agentId)
    if (listener) {
      const hint: HostHint = {
        type,
        agentId,
        timestamp: Date.now()
      }
      listener(hint)
    }
  }

  /**
   * Broadcast a hint to all subscribed agents
   */
  broadcastAll(type: HostHintType): void {
    const timestamp = Date.now()
    for (const [agentId, listener] of this.listeners) {
      const hint: HostHint = {
        type,
        agentId,
        timestamp
      }
      listener(hint)
    }
    console.log(`[HostHints] Broadcast ${type} to ${this.listeners.size} agent(s)`)
  }

  /**
   * Notify a specific agent that its session went idle
   * This is the most common hint - triggers immediate indexing
   */
  notifyIdleTransition(agentId: string): void {
    this.broadcast(agentId, 'idle_transition')
  }

  /**
   * Notify a specific agent that it's a good time to run
   */
  notifyRunNow(agentId: string): void {
    this.broadcast(agentId, 'run_now')
  }

  /**
   * Notify a specific agent to skip this cycle
   */
  notifySkip(agentId: string): void {
    this.broadcast(agentId, 'skip')
  }

  /**
   * Get count of subscribed agents
   */
  getSubscriberCount(): number {
    return this.listeners.size
  }

  /**
   * Check if an agent is subscribed
   */
  isSubscribed(agentId: string): boolean {
    return this.listeners.has(agentId)
  }
}

// Singleton instance using globalThis for Next.js compatibility
declare global {
  // eslint-disable-next-line no-var
  var _hostHintBroadcaster: HostHintBroadcaster | undefined
}

if (!globalThis._hostHintBroadcaster) {
  globalThis._hostHintBroadcaster = new HostHintBroadcaster()
}

export const hostHints = globalThis._hostHintBroadcaster
