'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PhoneOff, MicOff, Mic, Settings } from 'lucide-react'
import type { Agent } from '@/types/agent'
import type { VoiceCommandMatch } from '@/lib/voice-commands'
import { useTTS } from '@/hooks/useTTS'
import { useCompanionWebSocket } from '@/hooks/useCompanionWebSocket'
import CompanionInput from '@/components/CompanionInput'
import FloatingVoiceSettings from '@/components/FloatingVoiceSettings'

type CallPhase = 'ringing' | 'connected'

interface MobileCallOverlayProps {
  agent: Agent
  onClose: () => void
}

export default function MobileCallOverlay({ agent, onClose }: MobileCallOverlayProps) {
  const [phase, setPhase] = useState<CallPhase>('ringing')
  const [showSettings, setShowSettings] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const displayName = agent.label || agent.name || agent.alias || agent.id
  const isAvatarUrl = agent.avatar && (agent.avatar.startsWith('http') || agent.avatar.startsWith('/') || agent.avatar.startsWith('data:'))
  const avatarUrl = isAvatarUrl ? agent.avatar : null
  const avatarEmoji = agent.avatar && !isAvatarUrl ? agent.avatar : null
  const initials = displayName.slice(0, 2).toUpperCase()

  // TTS
  const tts = useTTS({ agentId: agent.id })

  // WebSocket for speech events
  const handleSpeech = useCallback((text: string) => {
    tts.speak(text)
  }, [tts.speak])

  useCompanionWebSocket({
    agentId: phase === 'connected' ? agent.id : null,
    onSpeech: handleSpeech,
  })

  // Auto-transition from ringing → connected
  useEffect(() => {
    const timer = setTimeout(() => setPhase('connected'), 2500)
    return () => clearTimeout(timer)
  }, [])

  // Call duration timer
  useEffect(() => {
    if (phase === 'connected') {
      timerRef.current = setInterval(() => {
        setCallDuration(d => d + 1)
      }, 1000)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [phase])

  // Cleanup TTS on unmount
  useEffect(() => {
    return () => { tts.stop() }
  }, [tts.stop])

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const handleEndCall = () => {
    tts.stop()
    onClose()
  }

  const handleMessageSent = useCallback((_text: string) => {
    // Notify voice subsystem about user message
  }, [])

  const handleCommandMatched = useCallback((match: VoiceCommandMatch) => {
    switch (match.command.action) {
      case 'mute':
        if (!tts.isMuted) tts.toggleMute()
        break
      case 'unmute':
        if (tts.isMuted) tts.toggleMute()
        break
      case 'repeat':
        // no-op for now
        break
    }
  }, [tts.isMuted, tts.toggleMute])

  // ── Ringing Phase ──
  if (phase === 'ringing') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Pulsing ring */}
        <div className="relative mb-8">
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-emerald-400"
            animate={{
              scale: [1, 1.6, 1.6],
              opacity: [0.6, 0, 0],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeOut',
            }}
            style={{ width: 120, height: 120, top: -10, left: -10 }}
          />
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-emerald-400"
            animate={{
              scale: [1, 1.4, 1.4],
              opacity: [0.4, 0, 0],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeOut',
              delay: 0.3,
            }}
            style={{ width: 120, height: 120, top: -10, left: -10 }}
          />
          {/* Avatar circle */}
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-3xl text-white font-bold shadow-lg shadow-emerald-500/30">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="w-full h-full rounded-full object-cover" />
            ) : avatarEmoji ? (
              <span className="text-4xl">{avatarEmoji}</span>
            ) : (
              initials
            )}
          </div>
        </div>

        <h2 className="text-white text-xl font-semibold mb-1">{displayName}</h2>
        <p className="text-white/50 text-sm mb-12">Calling...</p>

        {/* Cancel button */}
        <button
          onClick={handleEndCall}
          className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30 active:scale-95 transition-transform"
        >
          <PhoneOff className="w-7 h-7 text-white" />
        </button>
      </motion.div>
    )
  }

  // ── Connected Phase ──
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-black flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-full h-full object-cover scale-110 blur-md" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-900 via-emerald-950 to-gray-900" />
        )}
        {/* Vignette */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black/80" />
        {/* Activity glow */}
        <AnimatePresence>
          {tts.isSpeaking && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.3 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
              style={{
                background: 'radial-gradient(circle at 50% 40%, rgba(20,184,166,0.4) 0%, transparent 60%)',
              }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Content */}
      <div className="relative flex-1 flex flex-col z-10">
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-sm font-semibold text-white">
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="w-full h-full rounded-full object-cover" />
              ) : avatarEmoji ? (
                <span className="text-lg">{avatarEmoji}</span>
              ) : (
                initials
              )}
            </div>
            <div>
              <h2 className="text-white text-sm font-semibold">{displayName}</h2>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-white/50 text-xs">{formatDuration(callDuration)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Center area - avatar + waveform */}
        <div className="flex-1 flex flex-col items-center justify-center">
          {/* Large avatar */}
          <div className="w-28 h-28 rounded-full bg-gradient-to-br from-emerald-500/30 to-teal-600/30 border border-white/10 flex items-center justify-center text-4xl text-white font-bold mb-6">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="w-full h-full rounded-full object-cover" />
            ) : avatarEmoji ? (
              <span className="text-5xl">{avatarEmoji}</span>
            ) : (
              initials
            )}
          </div>

          {/* Speaking waveform */}
          <div className="flex items-end gap-1 h-8 mb-2">
            {[0, 1, 2, 3, 4].map(i => (
              <motion.div
                key={i}
                className="w-1 rounded-full bg-teal-400"
                animate={tts.isSpeaking ? {
                  height: [8, 24 + Math.random() * 8, 8],
                } : {
                  height: 4,
                }}
                transition={tts.isSpeaking ? {
                  duration: 0.4 + i * 0.08,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: i * 0.08,
                } : {
                  duration: 0.3,
                }}
              />
            ))}
          </div>
          <p className="text-white/40 text-xs">
            {tts.isSpeaking ? 'Speaking...' : tts.isMuted ? 'Muted' : 'Listening...'}
          </p>
        </div>

        {/* Voice settings panel */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.2 }}
              className="absolute left-4 right-4 bottom-48 z-20"
            >
              <FloatingVoiceSettings
                config={tts.config}
                availableVoices={tts.availableVoices}
                onConfigChange={tts.setConfig}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom controls */}
        <div className="px-5 pb-4 space-y-3">
          {/* Message input */}
          <CompanionInput
            agentId={agent.id}
            disabled={false}
            onMessageSent={handleMessageSent}
            onCommandMatched={handleCommandMatched}
          />

          {/* Control buttons */}
          <div className="flex items-center justify-center gap-6 py-2">
            {/* Mute */}
            <button
              onClick={tts.toggleMute}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                tts.isMuted
                  ? 'bg-white/20 text-white'
                  : 'bg-white/10 text-white/70'
              }`}
            >
              {tts.isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {/* End call */}
            <button
              onClick={handleEndCall}
              className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30 active:scale-95 transition-transform"
            >
              <PhoneOff className="w-7 h-7 text-white" />
            </button>

            {/* Settings */}
            <button
              onClick={() => setShowSettings(s => !s)}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                showSettings
                  ? 'bg-white/20 text-white'
                  : 'bg-white/10 text-white/70'
              }`}
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
