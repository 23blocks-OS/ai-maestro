/**
 * Memory Subsystem - Adapter wrapping the existing AgentSubconscious
 *
 * Zero changes to AgentSubconscious. This adapter implements the Subsystem
 * interface and delegates all calls to the inner subconscious instance.
 */

import type { Subsystem, SubsystemContext, SubsystemStatus, ActivityState } from './types'

// We use `any` for the subconscious type since AgentSubconscious is not exported.
// The factory pattern ensures type safety at the call site (in agent.ts where the class is visible).
// eslint-disable-next-line
type AgentSubconsciousInstance = any

// Factory type for creating subconscious instances
export type SubconsciousFactory = () => AgentSubconsciousInstance

export class MemorySubsystem implements Subsystem {
  readonly name = 'memory'
  private subconscious: AgentSubconsciousInstance

  constructor(subconsciousFactory: SubconsciousFactory) {
    this.subconscious = subconsciousFactory()
  }

  start(_context: SubsystemContext): void {
    this.subconscious.start()
  }

  stop(): void {
    this.subconscious.stop()
  }

  getStatus(): SubsystemStatus {
    const inner = this.subconscious.getStatus()
    return {
      name: this.name,
      running: inner.isRunning,
      startedAt: inner.startedAt,
      totalMemoryRuns: inner.totalMemoryRuns,
      totalMessageRuns: inner.totalMessageRuns,
      activityState: this.subconscious.getActivityState(),
    }
  }

  onActivityStateChange(state: ActivityState): void {
    this.subconscious.setActivityState(state)
  }

  /**
   * Expose the inner subconscious for backward-compatible API access
   * (e.g., /api/agents/[id]/subconscious still works)
   */
  getSubconscious(): AgentSubconsciousInstance {
    return this.subconscious
  }
}
