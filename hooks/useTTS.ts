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
  // Use ref for voices so speak() always has the latest list without re-creating the callback
  const voicesRef = useRef<TTSVoice[]>([])
  voicesRef.current = availableVoices

  // Use ref for config so speak() always reads the latest values
  const configRef = useRef(config)
  configRef.current = config

  // Re-load config when agentId changes
  useEffect(() => {
    if (agentId) {
      const newConfig = loadConfig(agentId)
      setConfigState(newConfig)
      configRef.current = newConfig
    }
  }, [agentId])

  // Create/swap provider when config.provider, elevenLabsApiKey, OR agentId changes
  // Including agentId ensures voices reload when switching agents (config may use a different voiceId)
  useEffect(() => {
    // Stop any in-progress speech from previous provider
    if (providerRef.current) {
      providerRef.current.stop()
      speakingRef.current = false
      setIsSpeaking(false)
    }

    if (config.provider === 'elevenlabs' && config.elevenLabsApiKey) {
      providerRef.current = createElevenLabsProvider(config.elevenLabsApiKey)
    } else {
      providerRef.current = createWebSpeechProvider()
    }

    // Load voices from the new provider
    let cancelled = false
    providerRef.current.getVoices().then(voices => {
      if (!cancelled) {
        setAvailableVoices(voices)
        voicesRef.current = voices
      }
    })

    return () => {
      cancelled = true
      providerRef.current?.stop()
    }
  }, [config.provider, config.elevenLabsApiKey, agentId])

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

  // speak() uses refs so it always reads the latest config and voices
  // without needing config/availableVoices in the dependency array
  const speak = useCallback((text: string) => {
    const provider = providerRef.current
    const currentConfig = configRef.current
    if (!provider || currentConfig.muted || !currentConfig.enabled) return

    const currentVoices = voicesRef.current
    const selectedVoice = currentConfig.voiceId
      ? currentVoices.find(v => v.id === currentConfig.voiceId) || undefined
      : undefined

    speakingRef.current = true
    setIsSpeaking(true)

    provider
      .speak({
        text,
        voice: selectedVoice,
        rate: currentConfig.rate,
        pitch: currentConfig.pitch,
        volume: currentConfig.volume,
      })
      .finally(() => {
        speakingRef.current = false
        setIsSpeaking(false)
      })
  }, [])

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
