/**
 * Playback Types for Phase 5 Features
 *
 * Defines interfaces for controlling and managing transcript playback.
 */

/**
 * Playback state - current playback position and settings
 */
export interface PlaybackState {
  agentId: string                          // Agent that owns this playback state
  sessionId?: string                        // Session being played (optional for cross-session playback)
  isPlaying: boolean                       // Currently playing or paused
  currentMessageIndex: number                // Index of current message in transcript
  speed: number                             // Playback speed multiplier (0.5x, 1x, 1.5x, 2x)
  totalMessages?: number                      // Total messages in transcript (optional)
  createdAt: number                         // Unix timestamp when state was created
  updatedAt: number                         // Unix timestamp when state was last updated
}

/**
 * Playback control - actions for controlling playback
 */
export interface PlaybackControl {
  action: 'play' | 'pause' | 'seek' | 'setSpeed' | 'reset'
  value?: number                             // Numeric value for seek or setSpeed actions
}

/**
 * Playback control interface (class-based)
 * Defines methods for controlling playback state
 */
export interface IPlaybackControl {
  start(): void                              // Start playback
  pause(): void                              // Pause playback
  seek(position: number): void               // Seek to specific message index
  setSpeed(speed: number): void             // Set playback speed (0.5x to 2.0x)
  getState(): PlaybackState                    // Get current playback state
  toggle(): void                             // Toggle play/pause
  next(): void                                // Move to next message
  previous(): void                            // Move to previous message
  jumpToStart(): void                        // Jump to start of transcript
  jumpToEnd(totalMessages: number): void     // Jump to end of transcript
}
