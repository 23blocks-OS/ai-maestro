'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Play, Pause, SkipBack, SkipForward, RotateCcw, FastForward, MessageSquare, Clock, AlertCircle } from 'lucide-react'
import { useAgentPlayback, PLAYBACK_SPEEDS } from '@/hooks/useAgentPlayback'
import type { PlaybackState } from '@/types/playback'

interface AgentPlaybackProps {
  agentId: string
  sessionId?: string
  agentName?: string
  className?: string
  showTimeline?: boolean
}

export default function AgentPlayback({ 
  agentId, 
  sessionId,
  agentName, 
  className = '',
  showTimeline = true
}: AgentPlaybackProps) {
  const [isPlayingState, setIsPlayingState] = useState(false)
  const autoPlayRef = useRef(false)
  
  const {
    state,
    loading,
    error,
    messages,
    isPlaying,
    currentPosition,
    currentSpeed,
    totalMessages,
    progress,
    currentMessage,
    
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
    getCurrentMessage
  } = useAgentPlayback(agentId, sessionId)
  
  // Auto-play on load if enabled
  useEffect(() => {
    if (autoPlayRef.current && !loading && !isPlaying && messages.length > 0) {
      start()
      autoPlayRef.current = false
    }
  }, [loading, isPlaying, messages.length, start])
  
  // Handle play/pause toggle
  const handleToggle = useCallback(() => {
    setIsPlayingState(prev => !prev)
    toggle()
  }, [toggle])
  
  // Handle seek slider
  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const position = Number(e.target.value)
    seek(position)
  }, [seek])
  
  // Handle speed change
  const handleSpeedChange = useCallback((speed: number) => {
    setSpeed(speed)
  }, [setSpeed])
  
  // Handle keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }
      
      switch (e.key) {
        case ' ': // Space - toggle play/pause
          e.preventDefault()
          handleToggle()
          break
        case 'ArrowLeft': // Previous message
          e.preventDefault()
          previous()
          break
        case 'ArrowRight': // Next message
          e.preventDefault()
          next()
          break
        case 'Home': // Jump to start
          e.preventDefault()
          jumpToStart()
          break
        case 'End': // Jump to end
          e.preventDefault()
          jumpToEnd()
          break
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleToggle, previous, next, jumpToStart, jumpToEnd, totalMessages])
  
  // Format time
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) {
      return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
    }
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`
  }
  
  // Get role badge color
  const getRoleBadgeColor = (role: string) => {
    const colors = {
      system: 'bg-purple-100 text-purple-600',
      assistant: 'bg-blue-100 text-blue-600',
      user: 'bg-green-100 text-green-600'
    }
    return colors[role as keyof typeof colors] || colors.user
  }
  
  // Render loading state
  if (loading) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        <div className="text-center text-gray-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mx-auto mb-2" />
          <p>Loading playback...</p>
        </div>
      </div>
    )
  }
  
  // Render error state
  if (error) {
    return (
      <div className={`p-4 bg-red-900/20 border border-red-800 rounded-lg ${className}`}>
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{error.message}</span>
        </div>
      </div>
    )
  }
  
  // Render no messages state
  if (totalMessages === 0) {
    return (
      <div className={`text-center py-8 text-gray-500 ${className}`}>
        <MessageSquare className="w-12 h-12 mx-auto mb-2 text-gray-600" />
        <p>No messages to play back</p>
        <p className="text-sm mt-1">Load a conversation to start playback</p>
      </div>
    )
  }
  
  return (
    <div className={`flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-100">Playback</h3>
          {agentName && <p className="text-sm text-gray-400">{agentName}</p>}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span>{currentPosition + 1} / {totalMessages}</span>
          <span>•</span>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>
      
      {/* Current Message Display */}
      {currentMessage && (
        <div className="mb-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-1 rounded text-xs font-medium ${getRoleBadgeColor(currentMessage.role)}`}>
                {currentMessage.role}
              </span>
              {currentMessage.timestamp && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Clock className="w-3 h-3" />
                  <span>{formatTime(currentMessage.timestamp)}</span>
                </div>
              )}
            </div>
          </div>
          <div className="text-sm text-gray-200 whitespace-pre-wrap break-words">
            {currentMessage.content}
          </div>
        </div>
      )}
      
      {/* Playback Controls */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        {/* Timeline */}
        {showTimeline && (
          <div className="mb-4">
            <input
              type="range"
              min="0"
              max={Math.max(0, totalMessages - 1)}
              value={currentPosition}
              onChange={handleSeek}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #8b5cf6 ${progress}%, #374151 ${progress}%)`
              }}
            />
            <div className="flex justify-between mt-2 text-xs text-gray-400">
              <span>Start</span>
              <span>End</span>
            </div>
          </div>
        )}
        
        {/* Main Controls */}
        <div className="flex items-center justify-center gap-3 mb-4">
          {/* Jump to Start */}
          <button
            onClick={jumpToStart}
            disabled={currentPosition === 0}
            className="p-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Jump to start"
          >
            <SkipBack className="w-5 h-5" />
          </button>
          
          {/* Previous */}
          <button
            onClick={previous}
            disabled={currentPosition === 0}
            className="p-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Previous message (←)"
          >
            <SkipBack className="w-5 h-5" />
          </button>
          
          {/* Play/Pause */}
          <button
            onClick={handleToggle}
            className={`p-3 rounded-full transition-colors ${
              isPlaying
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-green-600 hover:bg-green-500 text-white'
            }`}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
          </button>
          
          {/* Next */}
          <button
            onClick={next}
            disabled={currentPosition >= totalMessages - 1}
            className="p-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Next message (→)"
          >
            <SkipForward className="w-5 h-5" />
          </button>
          
          {/* Jump to End */}
          <button
            onClick={jumpToEnd}
            disabled={currentPosition >= totalMessages - 1}
            className="p-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Jump to end"
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>
        
        {/* Secondary Controls */}
        <div className="flex items-center justify-between">
          {/* Reset */}
          <button
            onClick={reset}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors text-sm"
            title="Reset playback"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          
          {/* Speed Control */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Speed:</span>
            <div className="flex bg-gray-700 rounded-lg p-1">
              {PLAYBACK_SPEEDS.map((speed) => (
                <button
                  key={speed}
                  onClick={() => handleSpeedChange(speed)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    currentSpeed === speed
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {/* Keyboard Shortcuts */}
      <div className="mt-3 text-center text-xs text-gray-500">
        <span className="hidden md:inline">
          Keyboard: <kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-700 mx-1">Space</kbd>
          Play/Pause • 
          <kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-700 mx-1">←</kbd>
          <kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-700 mx-1">→</kbd>
          Nav • 
          <kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-700 mx-1">Home</kbd>
          <kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-700 mx-1">End</kbd>
          Jump
        </span>
      </div>
    </div>
  )
}
