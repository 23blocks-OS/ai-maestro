'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { TTSConfig, TTSProvider, TTSVoice } from '@/types/tts'
import { DEFAULT_TTS_CONFIG } from '@/types/tts'
import { createWebSpeechProvider, createElevenLabsProvider } from '@/lib/tts'

interface UseTTSOptions {
  agentId: string
}

interface UseTTSReturn {
  isSpeaking: boolean
  isMuted: boolean
  config: TTSConfig
  availableVoices: TTSVoice[]
  toggleMute: () => void
  setConfig: (update: Partial<TTSConfig>) => void
  speak: (text: string) => void
  stop: () => void
}

const STORAGE_KEY_PREFIX = 'companion-tts-'

function loadConfig(agentId: string): TTSConfig {
  if (typeof window === 'undefined' || !agentId) return DEFAULT_TTS_CONFIG
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${agentId}`)
    if (stored) return { ...DEFAULT_TTS_CONFIG, ...JSON.parse(stored) }
  } catch { /* ignore */ }
  return DEFAULT_TTS_CONFIG
}

function saveConfig(agentId: string, config: TTSConfig) {
  if (typeof window === 'undefined' || !agentId) return
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${agentId}`, JSON.stringify(config))
  } catch { /* ignore */ }
}

export function useTTS(options: UseTTSOptions): UseTTSReturn {
  const { agentId } = options

  const [config, setConfigState] = useState<TTSConfig>(() => loadConfig(agentId))
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [availableVoices, setAvailableVoices] = useState<TTSVoice[]>([])

  const providerRef = useRef<TTSProvider | null>(null)
  const speakingRef = useRef(false)

  // Re-load config when agentId changes
  useEffect(() => {
    if (agentId) {
      setConfigState(loadConfig(agentId))
    }
  }, [agentId])

  // Create/swap provider when config.provider or elevenLabsApiKey changes
  useEffect(() => {
    if (config.provider === 'elevenlabs' && config.elevenLabsApiKey) {
      providerRef.current = createElevenLabsProvider(config.elevenLabsApiKey)
    } else {
      providerRef.current = createWebSpeechProvider()
    }

    // Load voices from the new provider
    providerRef.current.getVoices().then(setAvailableVoices)

    return () => {
      providerRef.current?.stop()
    }
  }, [config.provider, config.elevenLabsApiKey])

  const toggleMute = useCallback(() => {
    setConfigState(prev => {
      const next = { ...prev, muted: !prev.muted }
      saveConfig(agentId, next)
      if (next.muted) {
        providerRef.current?.stop()
        speakingRef.current = false
        setIsSpeaking(false)
      }
      return next
    })
  }, [agentId])

  const setConfig = useCallback((update: Partial<TTSConfig>) => {
    setConfigState(prev => {
      const next = { ...prev, ...update }
      saveConfig(agentId, next)
      return next
    })
  }, [agentId])

  const speak = useCallback((text: string) => {
    const provider = providerRef.current
    if (!provider || config.muted || !config.enabled) return

    const selectedVoice = config.voiceId
      ? availableVoices.find(v => v.id === config.voiceId) || undefined
      : undefined

    speakingRef.current = true
    setIsSpeaking(true)

    provider
      .speak({
        text,
        voice: selectedVoice,
        rate: config.rate,
        pitch: config.pitch,
        volume: config.volume,
      })
      .finally(() => {
        speakingRef.current = false
        setIsSpeaking(false)
      })
  }, [config, availableVoices])

  const stop = useCallback(() => {
    providerRef.current?.stop()
    speakingRef.current = false
    setIsSpeaking(false)
  }, [])

  return {
    isSpeaking,
    isMuted: config.muted,
    config,
    availableVoices,
    toggleMute,
    setConfig,
    speak,
    stop,
  }
}
