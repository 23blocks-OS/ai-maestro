'use client'

import { useState } from 'react'
import { Volume2, VolumeX, Settings, ChevronDown } from 'lucide-react'
import type { TTSConfig, TTSVoice } from '@/types/tts'

interface VoiceControlsProps {
  config: TTSConfig
  isMuted: boolean
  isSpeaking: boolean
  availableVoices: TTSVoice[]
  isOnline: boolean
  onToggleMute: () => void
  onConfigChange: (update: Partial<TTSConfig>) => void
  onStop: () => void
}

export default function VoiceControls({
  config,
  isMuted,
  isSpeaking,
  availableVoices,
  isOnline,
  onToggleMute,
  onConfigChange,
  onStop,
}: VoiceControlsProps) {
  const [showSettings, setShowSettings] = useState(false)

  const selectedVoiceName = config.voiceId
    ? availableVoices.find(v => v.id === config.voiceId)?.name || 'Default'
    : 'Default'

  const disabled = !isOnline

  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      {/* Main controls row */}
      <div className="flex items-center gap-3">
        {/* Mute toggle */}
        <button
          onClick={() => {
            if (isSpeaking) onStop()
            onToggleMute()
          }}
          disabled={disabled}
          className={`p-2 rounded-full transition-all duration-200 ${
            disabled
              ? 'text-gray-600 cursor-not-allowed'
              : isMuted
                ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                : isSpeaking
                  ? 'text-teal-400 hover:text-teal-300 hover:bg-teal-900/30'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
          title={isMuted ? 'Unmute voice' : 'Mute voice'}
        >
          {isMuted ? (
            <VolumeX className="w-5 h-5" />
          ) : (
            <Volume2 className={`w-5 h-5 ${isSpeaking ? 'animate-pulse' : ''}`} />
          )}
        </button>

        {/* Voice name display */}
        <button
          onClick={() => !disabled && setShowSettings(!showSettings)}
          disabled={disabled}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all duration-200 ${
            disabled
              ? 'text-gray-600 cursor-not-allowed'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          <span className="truncate max-w-[120px]">{selectedVoiceName}</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
        </button>

        {/* Settings gear */}
        <button
          onClick={() => !disabled && setShowSettings(!showSettings)}
          disabled={disabled}
          className={`p-2 rounded-full transition-all duration-200 ${
            disabled
              ? 'text-gray-600 cursor-not-allowed'
              : showSettings
                ? 'text-blue-400 bg-gray-800'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
          }`}
          title="Voice settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Expandable settings panel */}
      {showSettings && !disabled && (
        <div className="w-72 bg-gray-900/95 border border-gray-700 rounded-xl p-4 space-y-4 backdrop-blur-sm">
          {/* Voice selection */}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">Voice</label>
            <select
              value={config.voiceId || ''}
              onChange={(e) => onConfigChange({ voiceId: e.target.value || null })}
              className="w-full bg-gray-800 text-gray-300 text-sm rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="">System Default</option>
              {availableVoices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          </div>

          {/* Volume slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-500 uppercase tracking-wider">Volume</label>
              <span className="text-xs text-gray-500">{Math.round(config.volume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={config.volume}
              onChange={(e) => onConfigChange({ volume: parseFloat(e.target.value) })}
              className="w-full accent-blue-500 h-1.5"
            />
          </div>

          {/* Speed slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-500 uppercase tracking-wider">Speed</label>
              <span className="text-xs text-gray-500">{config.rate.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={config.rate}
              onChange={(e) => onConfigChange({ rate: parseFloat(e.target.value) })}
              className="w-full accent-blue-500 h-1.5"
            />
          </div>

          {/* Pitch slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-500 uppercase tracking-wider">Pitch</label>
              <span className="text-xs text-gray-500">{config.pitch.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={config.pitch}
              onChange={(e) => onConfigChange({ pitch: parseFloat(e.target.value) })}
              className="w-full accent-blue-500 h-1.5"
            />
          </div>

          {/* Provider toggle */}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">Provider</label>
            <div className="flex gap-1.5">
              <button
                onClick={() => onConfigChange({ provider: 'web-speech', voiceId: null })}
                className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  config.provider === 'web-speech'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                Browser
              </button>
              <button
                onClick={() => onConfigChange({ provider: 'openai', voiceId: null })}
                className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  config.provider === 'openai'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                OpenAI
              </button>
              <button
                onClick={() => onConfigChange({ provider: 'elevenlabs', voiceId: null })}
                className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  config.provider === 'elevenlabs'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                ElevenLabs
              </button>
            </div>
            <div className="mt-1 text-[10px] text-gray-600 text-center">
              {config.provider === 'web-speech' && 'Free · Built-in browser voices'}
              {config.provider === 'openai' && 'Standard · High quality · ~$0.05/mo'}
              {config.provider === 'elevenlabs' && 'Premium · Best quality · Voice cloning'}
            </div>
          </div>

          {/* OpenAI API key (only when selected) */}
          {config.provider === 'openai' && (
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">OpenAI API Key</label>
              <input
                type="password"
                value={config.openaiApiKey || ''}
                onChange={(e) => onConfigChange({ openaiApiKey: e.target.value })}
                placeholder="sk-..."
                className="w-full bg-gray-800 text-gray-300 text-sm rounded-lg px-3 py-2 border border-gray-700 focus:border-green-500 focus:outline-none placeholder-gray-600"
              />
            </div>
          )}

          {/* ElevenLabs API key (only when selected) */}
          {config.provider === 'elevenlabs' && (
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">ElevenLabs API Key</label>
              <input
                type="password"
                value={config.elevenLabsApiKey || ''}
                onChange={(e) => onConfigChange({ elevenLabsApiKey: e.target.value })}
                placeholder="xi-..."
                className="w-full bg-gray-800 text-gray-300 text-sm rounded-lg px-3 py-2 border border-gray-700 focus:border-purple-500 focus:outline-none placeholder-gray-600"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
