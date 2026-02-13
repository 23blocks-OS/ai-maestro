/**
 * Cerebellum - Thin orchestrator for agent subsystems
 *
 * Manages lifecycle, event routing, and state propagation for
 * registered subsystems (memory, voice, etc.)
 */

import type {
  Subsystem,
  SubsystemContext,
  CerebellumEvent,
  CerebellumEventListener,
  ActivityState,
  SubsystemStatus,
} from './types'

export class Cerebellum {
  private agentId: string
  private subsystems = new Map<string, Subsystem>()
  private listeners = new Map<string, Set<CerebellumEventListener>>()
  private running = false

  constructor(agentId: string) {
    this.agentId = agentId
  }

  registerSubsystem(subsystem: Subsystem): void {
    if (this.subsystems.has(subsystem.name)) {
      console.warn(`[Cerebellum:${this.agentId.substring(0, 8)}] Subsystem "${subsystem.name}" already registered, replacing`)
    }
    this.subsystems.set(subsystem.name, subsystem)
  }

  start(): void {
    if (this.running) return
    this.running = true

    const context: SubsystemContext = {
      agentId: this.agentId,
      emit: (event) => this.dispatchEvent(event),
    }

    for (const [name, subsystem] of this.subsystems) {
      try {
        subsystem.start(context)
        console.log(`[Cerebellum:${this.agentId.substring(0, 8)}] Started subsystem: ${name}`)
      } catch (err) {
        console.error(`[Cerebellum:${this.agentId.substring(0, 8)}] Failed to start subsystem ${name}:`, err)
      }
    }

    console.log(`[Cerebellum:${this.agentId.substring(0, 8)}] Running with ${this.subsystems.size} subsystem(s)`)
  }

  stop(): void {
    if (!this.running) return

    for (const [name, subsystem] of this.subsystems) {
      try {
        subsystem.stop()
      } catch (err) {
        console.error(`[Cerebellum:${this.agentId.substring(0, 8)}] Error stopping subsystem ${name}:`, err)
      }
    }

    this.listeners.clear()
    this.running = false
    console.log(`[Cerebellum:${this.agentId.substring(0, 8)}] Stopped`)
  }

  setActivityState(state: ActivityState): void {
    for (const subsystem of this.subsystems.values()) {
      try {
        subsystem.onActivityStateChange?.(state)
      } catch (err) {
        console.error(`[Cerebellum:${this.agentId.substring(0, 8)}] Error in ${subsystem.name}.onActivityStateChange:`, err)
      }
    }
  }

  setCompanionConnected(connected: boolean): void {
    for (const subsystem of this.subsystems.values()) {
      try {
        subsystem.onCompanionConnectionChange?.(connected)
      } catch (err) {
        console.error(`[Cerebellum:${this.agentId.substring(0, 8)}] Error in ${subsystem.name}.onCompanionConnectionChange:`, err)
      }
    }
  }

  on(eventType: string, listener: CerebellumEventListener): void {
    let set = this.listeners.get(eventType)
    if (!set) {
      set = new Set()
      this.listeners.set(eventType, set)
    }
    set.add(listener)
  }

  off(eventType: string, listener: CerebellumEventListener): void {
    this.listeners.get(eventType)?.delete(listener)
  }

  getSubsystem<T extends Subsystem>(name: string): T | undefined {
    return this.subsystems.get(name) as T | undefined
  }

  getStatus(): { running: boolean; subsystems: SubsystemStatus[] } {
    return {
      running: this.running,
      subsystems: Array.from(this.subsystems.values()).map(s => s.getStatus()),
    }
  }

  private dispatchEvent(event: CerebellumEvent): void {
    const listeners = this.listeners.get(event.type)
    if (!listeners) return

    for (const listener of listeners) {
      try {
        listener(event)
      } catch (err) {
        console.error(`[Cerebellum:${this.agentId.substring(0, 8)}] Error in event listener for ${event.type}:`, err)
      }
    }
  }
}
