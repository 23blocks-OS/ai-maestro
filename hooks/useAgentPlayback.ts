'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { PlaybackState, PlaybackControl } from '@/types/playback'

/**
 * Default playback speed
 */
const DEFAULT_PLAYBACK_SPEED = 1.0

/**
 * Valid playback speed options
 */
export const PLAYBACK_SPEEDS = [0.5, 1.0, 1.5, 2.0] as const

/**
 * Hook for managing agent transcript playback
 *
 * Handles playback state management, controls (play/pause/seek/speed),
 * and message loading for conversation transcript playback.
 *
 * @param agentId - Agent ID to manage playback for
 * @param sessionId - Session ID to play back (optional for cross-session)
 */
export function useAgentPlayback(
  agentId: string,
  sessionId?: string
) {
  const [state, setState] = useState<PlaybackState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [messages, setMessages] = useState<Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp?: number
    metadata?: Record<string, any>
  }>>([])
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true)

  // Refs for timers and tracking
  const autoSaveTimerRef = useRef<NodeJS.Timeout>()
  const isMountedRef = useRef(true)

  /**
   * Load playback state from API
   */
  const loadPlaybackState = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      console.log(`[useAgentPlayback] Loading state for agent ${agentId}, session ${sessionId || 'all'}`)

      const queryParams = sessionId ? `?sessionId=${sessionId}` : ''
      const response = await fetch(`/api/agents/${agentId}/playback${queryParams}`)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      if (!isMountedRef.current) return

      if (data.success && data.playbackState) {
        setState(data.playbackState)
        console.log(`[useAgentPlayback] Loaded state: playing=${data.playbackState.isPlaying}, position=${data.playbackState.currentMessageIndex}`)
      } else {
        // Initialize default state if none exists
        setState({
          agentId,
          sessionId,
          isPlaying: false,
          currentMessageIndex: 0,
          speed: DEFAULT_PLAYBACK_SPEED,
          totalMessages: 0,
          createdAt: Date.now(),
          updatedAt: Date.now()
        })
      }
    } catch (err) {
      if (!isMountedRef.current) return

      console.error('[useAgentPlayback] Failed to load state:', err)
      setError(err instanceof Error ? err : new Error('Failed to load playback state'))
      
      // Set default state on error
      setState({
        agentId,
        sessionId,
        isPlaying: false,
        currentMessageIndex: 0,
        speed: DEFAULT_PLAYBACK_SPEED,
        totalMessages: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      })
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
      }
    }
  }, [agentId, sessionId])

  /**
   * Update playback state via API
   */
  const updatePlaybackState = useCallback(async (action: PlaybackControl) => {
    if (!state) return

    try {
      console.log(`[useAgentPlayback] Updating state: ${action.action}`, action.value ?? '')

      const response = await fetch(`/api/agents/${agentId}/playback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: action.action,
          value: action.value,
          sessionId
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      if (!isMountedRef.current) return

      if (data.success && data.playbackState) {
        setState(data.playbackState)
      }
    } catch (err) {
      if (!isMountedRef.current) return

      console.error('[useAgentPlayback] Failed to update state:', err)
      setError(err instanceof Error ? err : new Error('Failed to update playback state'))
    }
  }, [agentId, sessionId, state])

  /**
   * Start playback
   */
  const start = useCallback(() => {
    if (!state || state.isPlaying) return
    updatePlaybackState({ action: 'play' })
  }, [state, updatePlaybackState])

  /**
   * Pause playback
   */
  const pause = useCallback(() => {
    if (!state || !state.isPlaying) return
    updatePlaybackState({ action: 'pause' })
  }, [state, updatePlaybackState])

  /**
   * Toggle play/pause
   */
  const toggle = useCallback(() => {
    if (!state) return
    if (state.isPlaying) {
      pause()
    } else {
      start()
    }
  }, [state, start, pause])

  /**
   * Seek to specific message index
   */
  const seek = useCallback((position: number) => {
    if (!state || position < 0) return
    const maxPosition = state.totalMessages !== undefined 
      ? Math.min(position, state.totalMessages - 1) 
      : position
    updatePlaybackState({ action: 'seek', value: maxPosition })
  }, [state, updatePlaybackState])

  /**
   * Set playback speed
   */
  const setSpeed = useCallback((speed: number) => {
    if (!state || speed < 0.5 || speed > 2.0) return
    updatePlaybackState({ action: 'setSpeed', value: speed })
  }, [state, updatePlaybackState])

  /**
   * Reset playback to beginning
   */
  const reset = useCallback(() => {
    updatePlaybackState({ action: 'reset' })
  }, [updatePlaybackState])

  /**
   * Move to next message
   */
  const next = useCallback(() => {
    if (!state) return
    const newPosition = state.currentMessageIndex + 1
    seek(newPosition)
  }, [state, seek])

  /**
   * Move to previous message
   */
  const previous = useCallback(() => {
    if (!state) return
    const newPosition = Math.max(0, state.currentMessageIndex - 1)
    seek(newPosition)
  }, [state, seek])

  /**
   * Jump to start
   */
  const jumpToStart = useCallback(() => {
    seek(0)
  }, [seek])

  /**
   * Jump to end
   */
  const jumpToEnd = useCallback(() => {
    if (!state || state.totalMessages === undefined || state.totalMessages === 0) return
    seek(state.totalMessages - 1)
  }, [state, seek])

  /**
   * Get current message
   */
  const getCurrentMessage = useCallback(() => {
    if (!state || !messages[state.currentMessageIndex]) return null
    return messages[state.currentMessageIndex]
  }, [state, messages])

  /**
   * Get message range for display
   */
  const getMessageRange = useCallback((count: number = 5) => {
    if (!state || messages.length === 0) return []
    
    const start = Math.max(0, state.currentMessageIndex - count)
    const end = Math.min(messages.length, state.currentMessageIndex + count + 1)
    
    return messages.slice(start, end)
  }, [state, messages])

  /**
   * Enable auto-save of playback state
   */
  const enableAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current)
    }

    autoSaveTimerRef.current = setInterval(() => {
      if (state) {
        // Auto-save current state every 5 seconds while playing
        updatePlaybackState({ action: 'seek', value: state.currentMessageIndex })
      }
    }, 5000)

    setAutoSaveEnabled(true)
    console.log('[useAgentPlayback] Auto-save enabled')
  }, [state, updatePlaybackState])

  /**
   * Disable auto-save
   */
  const disableAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current)
      autoSaveTimerRef.current = undefined
    }
    setAutoSaveEnabled(false)
    console.log('[useAgentPlayback] Auto-save disabled')
  }, [])

  /**
   * Toggle auto-save
   */
  const toggleAutoSave = useCallback(() => {
    if (autoSaveEnabled) {
      disableAutoSave()
    } else {
      enableAutoSave()
    }
  }, [autoSaveEnabled, enableAutoSave, disableAutoSave])

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      isMountedRef.current = false

      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current)
      }
    }
  }, [])

  /**
   * Load playback state on mount
   */
  useEffect(() => {
    loadPlaybackState()
  }, [loadPlaybackState])

  /**
   * Enable auto-save when playback starts
   */
  useEffect(() => {
    if (state?.isPlaying && autoSaveEnabled) {
      enableAutoSave()
    } else if (!state?.isPlaying) {
      disableAutoSave()
    }
  }, [state?.isPlaying, autoSaveEnabled, enableAutoSave, disableAutoSave])

  return {
    // State
    state,
    loading,
    error,
    messages,
    autoSaveEnabled,

    // Computed
    isPlaying: state?.isPlaying ?? false,
    currentPosition: state?.currentMessageIndex ?? 0,
    currentSpeed: state?.speed ?? DEFAULT_PLAYBACK_SPEED,
    totalMessages: state?.totalMessages ?? 0,
    progress: state && state.totalMessages !== undefined && state.totalMessages > 0
      ? (state.currentMessageIndex / Math.max(1, state.totalMessages - 1)) * 100
      : 0,
    currentMessage: getCurrentMessage(),

    // Playback controls
    start,
    pause,
    toggle,
    seek,
    setSpeed,
    reset,
    next,
    previous,
    jumpToStart,
    jumpToEnd,

    // Message utilities
    getCurrentMessage,
    getMessageRange,

    // Auto-save controls
    enableAutoSave,
    disableAutoSave,
    toggleAutoSave
  }
}
