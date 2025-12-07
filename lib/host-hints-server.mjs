/**
 * Host Hints Server Module (ESM version for server.mjs)
 *
 * This is the ESM counterpart to lib/host-hints.ts
 * Uses the same globalThis singleton pattern to share state across modules
 */

// Callback type for hint listeners
// type HintCallback = (hint: HostHint) => void

/**
 * HostHintBroadcaster - Simple pub/sub for host hints
 */
class HostHintBroadcaster {
  constructor() {
    this.listeners = new Map()
  }

  /**
   * Subscribe an agent to receive hints
   */
  subscribe(agentId, callback) {
    this.listeners.set(agentId, callback)
    console.log(`[HostHints] Agent ${agentId.substring(0, 8)} subscribed to hints`)
  }

  /**
   * Unsubscribe an agent from hints
   */
  unsubscribe(agentId) {
    this.listeners.delete(agentId)
    console.log(`[HostHints] Agent ${agentId.substring(0, 8)} unsubscribed from hints`)
  }

  /**
   * Broadcast a hint to a specific agent
   */
  broadcast(agentId, type) {
    const listener = this.listeners.get(agentId)
    if (listener) {
      const hint = {
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
  broadcastAll(type) {
    const timestamp = Date.now()
    for (const [agentId, listener] of this.listeners) {
      const hint = {
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
   */
  notifyIdleTransition(agentId) {
    this.broadcast(agentId, 'idle_transition')
  }

  /**
   * Notify a specific agent that it's a good time to run
   */
  notifyRunNow(agentId) {
    this.broadcast(agentId, 'run_now')
  }

  /**
   * Notify a specific agent to skip this cycle
   */
  notifySkip(agentId) {
    this.broadcast(agentId, 'skip')
  }

  /**
   * Get count of subscribed agents
   */
  getSubscriberCount() {
    return this.listeners.size
  }

  /**
   * Check if an agent is subscribed
   */
  isSubscribed(agentId) {
    return this.listeners.has(agentId)
  }
}

// Singleton instance using globalThis for sharing across modules
if (!globalThis._hostHintBroadcaster) {
  globalThis._hostHintBroadcaster = new HostHintBroadcaster()
}

export const hostHints = globalThis._hostHintBroadcaster
