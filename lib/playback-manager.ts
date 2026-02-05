/**
 * Playback State Management for Phase 5 Features
 *
 * Provides playback functionality for conversation transcripts:
 * - PlaybackState class with start(), pause(), seek(), setSpeed() methods
 * - Load and persist playback state from CozoDB
 * - Track playback position, speed, and playing state
 */

import { AgentDatabase } from './cozo-db'
import {
  upsertPlaybackState,
  getPlaybackState
} from './cozo-schema-phase5'

/**
 * Playback state interface
 */
export interface PlaybackState {
  agentId: string
  sessionId: string
  isPlaying: boolean
  currentPosition: number
  playbackSpeed: number
  updatedAt: number
}

/**
 * Playback control interface
 */
export interface PlaybackControl {
  start(): void
  pause(): void
  seek(position: number): void
  setSpeed(speed: number): void
  getState(): PlaybackState
}

/**
 * Playback Manager Class
 * Manages playback state for conversation transcripts
 */
export class PlaybackManager implements PlaybackControl {
  private state: PlaybackState
  private db: AgentDatabase
  private persistInterval: NodeJS.Timeout | null = null
  private stateChangeCallback: ((state: PlaybackState) => void) | null = null

  constructor(state: PlaybackState, db: AgentDatabase) {
    this.state = state
    this.db = db
  }

  /**
   * Start playback
   */
  start(): void {
    if (!this.state.isPlaying) {
      this.state.isPlaying = true
      this.state.updatedAt = Date.now()
      this.notifyStateChange()
      console.log(`[Playback Manager] Started playback for session ${this.state.sessionId} at position ${this.state.currentPosition}`)
    }
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (this.state.isPlaying) {
      this.state.isPlaying = false
      this.state.updatedAt = Date.now()
      this.notifyStateChange()
      console.log(`[Playback Manager] Paused playback for session ${this.state.sessionId} at position ${this.state.currentPosition}`)
    }
  }

  /**
   * Seek to specific position
   *
   * @param position - Message index to seek to
   */
  seek(position: number): void {
    if (position < 0) {
      console.warn(`[Playback Manager] Cannot seek to negative position: ${position}`)
      return
    }

    const wasPlaying = this.state.isPlaying
    this.state.currentPosition = position
    this.state.updatedAt = Date.now()
    this.notifyStateChange()

    console.log(`[Playback Manager] Sought to position ${position} for session ${this.state.sessionId}`)
  }

  /**
   * Set playback speed
   *
   * @param speed - Playback speed multiplier (0.5x to 2.0x)
   */
  setSpeed(speed: number): void {
    if (speed < 0.5 || speed > 2.0) {
      console.warn(`[Playback Manager] Invalid speed: ${speed}. Must be between 0.5x and 2.0x`)
      return
    }

    this.state.playbackSpeed = speed
    this.state.updatedAt = Date.now()
    this.notifyStateChange()

    console.log(`[Playback Manager] Set playback speed to ${speed}x for session ${this.state.sessionId}`)
  }

  /**
   * Get current playback state
   *
   * @returns Current playback state
   */
  getState(): PlaybackState {
    return { ...this.state }
  }

  /**
   * Toggle play/pause
   */
  toggle(): void {
    if (this.state.isPlaying) {
      this.pause()
    } else {
      this.start()
    }
  }

  /**
   * Move to next message
   */
  next(): void {
    this.seek(this.state.currentPosition + 1)
  }

  /**
   * Move to previous message
   */
  previous(): void {
    this.seek(Math.max(0, this.state.currentPosition - 1))
  }

  /**
   * Jump to start of transcript
   */
  jumpToStart(): void {
    this.seek(0)
  }

  /**
   * Jump to end of transcript
   *
   * @param totalMessages - Total number of messages in transcript
   */
  jumpToEnd(totalMessages: number): void {
    this.seek(Math.max(0, totalMessages - 1))
  }

  /**
   * Enable auto-persist (saves state periodically)
   *
   * @param intervalMs - Persist interval in milliseconds (default: 5000ms)
   */
  enableAutoPersist(intervalMs: number = 5000): void {
    if (this.persistInterval) {
      clearInterval(this.persistInterval)
    }

    this.persistInterval = setInterval(() => {
      this.savePlaybackState()
    }, intervalMs)

    console.log(`[Playback Manager] Enabled auto-persist every ${intervalMs}ms`)
  }

  /**
   * Disable auto-persist
   */
  disableAutoPersist(): void {
    if (this.persistInterval) {
      clearInterval(this.persistInterval)
      this.persistInterval = null
      console.log('[Playback Manager] Disabled auto-persist')
    }
  }

  /**
   * Set state change callback
   *
   * @param callback - Callback function called when state changes
   */
  setStateChangeCallback(callback: (state: PlaybackState) => void): void {
    this.stateChangeCallback = callback
  }

  /**
   * Manually save playback state to database
   */
  async savePlaybackState(): Promise<void> {
    try {
      await upsertPlaybackState(this.db, {
        agent_id: this.state.agentId,
        session_id: this.state.sessionId,
        is_playing: this.state.isPlaying,
        current_position: this.state.currentPosition,
        playback_speed: this.state.playbackSpeed
      })

      console.log(`[Playback Manager] Saved playback state for session ${this.state.sessionId}`)
    } catch (error) {
      console.error('[Playback Manager] Error saving playback state:', error)
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.disableAutoPersist()
    this.stateChangeCallback = null
    console.log(`[Playback Manager] Destroyed playback manager for session ${this.state.sessionId}`)
  }

  /**
   * Notify state change callback
   */
  private notifyStateChange(): void {
    if (this.stateChangeCallback) {
      this.stateChangeCallback(this.getState())
    }
  }
}

/**
 * Load playback state from CozoDB
 *
 * @param agentDb - Agent database instance
 * @param agentId - Agent ID
 * @param sessionId - Session ID
 * @returns Playback state or null if not found
 */
export async function loadPlaybackState(
  agentDb: AgentDatabase,
  agentId: string,
  sessionId: string
): Promise<PlaybackState | null> {
  try {
    const state = await getPlaybackState(agentDb, agentId, sessionId)

    if (!state) {
      console.log(`[Playback Manager] No playback state found for session ${sessionId}`)
      return null
    }

    const playbackState: PlaybackState = {
      agentId: state.agent_id,
      sessionId: state.session_id || sessionId,
      isPlaying: state.is_playing,
      currentPosition: state.current_position,
      playbackSpeed: state.playback_speed,
      updatedAt: state.updated_at
    }

    console.log(`[Playback Manager] Loaded playback state for session ${sessionId}`)
    return playbackState
  } catch (error) {
    console.error('[Playback Manager] Error loading playback state:', error)
    return null
  }
}

/**
 * Create or reset playback state
 *
 * @param agentDb - Agent database instance
 * @param agentId - Agent ID
 * @param sessionId - Session ID
 * @param initialState - Initial playback state (optional)
 * @returns Created playback state
 */
export async function createPlaybackState(
  agentDb: AgentDatabase,
  agentId: string,
  sessionId: string,
  initialState: {
    isPlaying?: boolean
    currentPosition?: number
    playbackSpeed?: number
  } = {}
): Promise<PlaybackState> {
  const now = Date.now()

  const state: PlaybackState = {
    agentId,
    sessionId,
    isPlaying: initialState.isPlaying ?? false,
    currentPosition: initialState.currentPosition ?? 0,
    playbackSpeed: initialState.playbackSpeed ?? 1.0,
    updatedAt: now
  }

  try {
    await upsertPlaybackState(agentDb, {
      agent_id: state.agentId,
      session_id: state.sessionId,
      is_playing: state.isPlaying,
      current_position: state.currentPosition,
      playback_speed: state.playbackSpeed
    })

    console.log(`[Playback Manager] Created playback state for session ${sessionId}`)
    return state
  } catch (error) {
    console.error('[Playback Manager] Error creating playback state:', error)
    throw error
  }
}

/**
 * Save playback state to CozoDB
 *
 * @param agentDb - Agent database instance
 * @param state - Playback state to save
 * @returns Promise that resolves when save completes
 */
export async function savePlaybackState(
  agentDb: AgentDatabase,
  state: PlaybackState
): Promise<void> {
  try {
    await upsertPlaybackState(agentDb, {
      agent_id: state.agentId,
      session_id: state.sessionId,
      is_playing: state.isPlaying,
      current_position: state.currentPosition,
      playback_speed: state.playbackSpeed
    })

    console.log(`[Playback Manager] Saved playback state for session ${state.sessionId}`)
  } catch (error) {
    console.error('[Playback Manager] Error saving playback state:', error)
    throw error
  }
}

/**
 * Delete playback state from CozoDB
 *
 * @param agentDb - Agent database instance
 * @param agentId - Agent ID
 * @param sessionId - Session ID
 * @returns Promise that resolves when delete completes
 */
export async function deletePlaybackState(
  agentDb: AgentDatabase,
  agentId: string,
  sessionId: string
): Promise<void> {
  try {
    await agentDb.run(`
      ?[agent_id, session_id] := *playback_state{agent_id, session_id},
        agent_id = ?,
        session_id = ?
      :delete playback_state
    `)

    console.log(`[Playback Manager] Deleted playback state for session ${sessionId}`)
  } catch (error) {
    console.error('[Playback Manager] Error deleting playback state:', error)
    throw error
  }
}
