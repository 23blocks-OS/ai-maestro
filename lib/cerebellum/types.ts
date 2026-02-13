/**
 * Cerebellum - Agent Subsystem Coordinator Types
 *
 * The Cerebellum orchestrates autonomous subsystems (memory, voice, etc.)
 * Each subsystem implements the Subsystem interface and receives lifecycle events.
 */

export type ActivityState = 'active' | 'idle' | 'disconnected'

export type SubsystemStatus = {
  name: string
  running: boolean
  [key: string]: unknown
}

export interface SubsystemContext {
  agentId: string
  emit: (event: CerebellumEvent) => void
}

export interface Subsystem {
  readonly name: string
  start(context: SubsystemContext): void
  stop(): void
  getStatus(): SubsystemStatus
  onActivityStateChange?(state: ActivityState): void
  onCompanionConnectionChange?(connected: boolean): void
}

export interface CerebellumEvent {
  type: string          // e.g. 'voice:speak', 'voice:status'
  agentId: string
  payload: unknown
}

export type CerebellumEventListener = (event: CerebellumEvent) => void
