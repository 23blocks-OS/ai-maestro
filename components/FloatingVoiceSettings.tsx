'use client'

import type { TTSConfig, TTSVoice } from '@/types/tts'

/**
 * Floating Voice Settings - Glassmorphism panel for voice configuration
 */
export default function FloatingVoiceSettings({
  config,
  availableVoices,
  onConfigChange,
}: {
  config: TTSConfig
  availableVoices: TTSVoice[]
  onConfigChange: (update: Partial<TTSConfig>) => void
}) {
  return (
    <div className="bg-black/60 backdrop-blur-xl rounded-2xl p-4 space-y-3 border border-white/10">
      {/* Voice selection */}
      <div>
        <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">Voice</label>
        <select
          value={config.voiceId || ''}
          onChange={(e) => onConfigChange({ voiceId: e.target.value || null })}
          className="w-full bg-white/10 text-white/80 text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-blue-500/50 focus:outline-none"
        >
          <option value="">System Default</option>
          {availableVoices.map((voice) => (
            <option key={voice.id} value={voice.id}>
              {voice.name} ({voice.lang})
            </option>
          ))}
        </select>
      </div>

      {/* Volume */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] text-white/40 uppercase tracking-wider">Volume</label>
          <span className="text-[10px] text-white/40">{Math.round(config.volume * 100)}%</span>
        </div>
        <input
          type="range" min="0" max="1" step="0.05"
          value={config.volume}
          onChange={(e) => onConfigChange({ volume: parseFloat(e.target.value) })}
          className="w-full accent-blue-500 h-1"
        />
      </div>

      {/* Speed */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] text-white/40 uppercase tracking-wider">Speed</label>
          <span className="text-[10px] text-white/40">{config.rate.toFixed(1)}x</span>
        </div>
        <input
          type="range" min="0.5" max="2" step="0.1"
          value={config.rate}
          onChange={(e) => onConfigChange({ rate: parseFloat(e.target.value) })}
          className="w-full accent-blue-500 h-1"
        />
      </div>

      {/* Provider toggle */}
      <div>
        <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">Provider</label>
        <div className="flex gap-2">
          <button
            onClick={() => onConfigChange({ provider: 'web-speech', voiceId: null })}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              config.provider === 'web-speech'
                ? 'bg-blue-500/30 text-blue-300'
                : 'bg-white/5 text-white/40 hover:text-white/60'
            }`}
          >
            Browser
          </button>
          <button
            onClick={() => onConfigChange({ provider: 'openai', voiceId: null })}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              config.provider === 'openai'
                ? 'bg-blue-500/30 text-blue-300'
                : 'bg-white/5 text-white/40 hover:text-white/60'
            }`}
          >
            OpenAI
          </button>
          <button
            onClick={() => onConfigChange({ provider: 'elevenlabs', voiceId: null })}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              config.provider === 'elevenlabs'
                ? 'bg-blue-500/30 text-blue-300'
                : 'bg-white/5 text-white/40 hover:text-white/60'
            }`}
          >
            ElevenLabs
          </button>
        </div>
      </div>

      {/* OpenAI API key */}
      {config.provider === 'openai' && (
        <div>
          <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">API Key</label>
          <input
            type="password"
            value={config.openaiApiKey || ''}
            onChange={(e) => onConfigChange({ openaiApiKey: e.target.value })}
            placeholder="sk-..."
            className="w-full bg-white/10 text-white/80 text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-blue-500/50 focus:outline-none placeholder-white/20"
          />
        </div>
      )}

      {/* ElevenLabs API key */}
      {config.provider === 'elevenlabs' && (
        <div>
          <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">API Key</label>
          <input
            type="password"
            value={config.elevenLabsApiKey || ''}
            onChange={(e) => onConfigChange({ elevenLabsApiKey: e.target.value })}
            placeholder="xi-..."
            className="w-full bg-white/10 text-white/80 text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-blue-500/50 focus:outline-none placeholder-white/20"
          />
        </div>
      )}
    </div>
  )
}
