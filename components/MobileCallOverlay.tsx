'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PhoneOff, MicOff, Mic, Settings } from 'lucide-react'
import type { Agent } from '@/types/agent'
import type { VoiceCommandMatch } from '@/lib/voice-commands'
import { useTTS } from '@/hooks/useTTS'
import { useSpeechLevel } from '@/hooks/useSpeechLevel'
import AgentFace from '@/components/AgentFace'
import { activityForAgentStatus } from '@/lib/avatar-motion'
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

  // Speech energy for the face. Analysed off the real waveform when the
  // provider renders to an <audio> element; a synthetic envelope otherwise
  // (web-speech exposes no stream at all — see lib/speech-level).
  const speechLevel = useSpeechLevel({
    isSpeaking: tts.isSpeaking,
    getAudioElement: tts.getAudioElement,
  })

  // The agent's own state drives posture and gaze between utterances. Speaking
  // counts as active, so the face leans in while it talks.
  const isOnline = agent.sessions?.some(s => s.status === 'online') ?? false
  const faceActivity = tts.isSpeaking
    ? 'active'
    : activityForAgentStatus(agent.sessions?.[0]?.status, isOnline)

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
          <div className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-3xl text-white font-bold shadow-lg shadow-emerald-500/30">
            {avatarUrl ? (
              <AgentFace src={avatarUrl} width={96} activity="idle" alt={displayName} />
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
          {/* Large avatar — animated: blink, breathing, micro-sway, and a jaw
              driven by the actual speech waveform. */}
          <div className="w-40 h-40 rounded-full overflow-hidden bg-gradient-to-br from-emerald-500/30 to-teal-600/30 border border-white/10 flex items-center justify-center text-4xl text-white font-bold mb-6">
            {avatarUrl ? (
              <AgentFace
                src={avatarUrl}
                width={160}
                activity={faceActivity}
                readLevel={speechLevel.read}
                alt={displayName}
              />
            ) : avatarEmoji ? (
              <motion.span
                className="text-6xl"
                // No face to rig, but an emoji can still breathe rather than
                // sit frozen while its agent talks.
                animate={faceActivity === 'offline' ? { scale: 1 } : { scale: [1, 1.04, 1] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              >
                {avatarEmoji}
              </motion.span>
            ) : (
              initials
            )}
          </div>

          {/* Speaking level — driven by the actual audio, not Math.random().
              The bars used to animate on a timer whenever isSpeaking was true,
              which meant they moved identically for silence, a word and a
              shout. */}
          <SpeechBars read={speechLevel.read} active={tts.isSpeaking} />
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

/**
 * Five bars driven by real speech energy.
 *
 * Reads from a rAF loop and writes straight to the DOM. Putting a 60Hz level in
 * React state would re-render the call screen on every frame and make the
 * decoration the most expensive thing on the page.
 */
function SpeechBars({ read, active }: { read: () => number; active: boolean }) {
  const barsRef = useRef<Array<HTMLDivElement | null>>([])
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    let raf = 0
    // Each bar lags the one before it, so the group ripples instead of moving
    // as one block — the cheapest thing that makes a level meter look like a
    // voice rather than a slider.
    const history = [0, 0, 0, 0, 0]
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const level = activeRef.current ? read() : 0
      history.unshift(level)
      history.length = 5
      barsRef.current.forEach((el, i) => {
        if (!el) return
        el.style.height = `${4 + history[i] * 22}px`
      })
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [read])

  return (
    <div className="flex items-end gap-1 h-8 mb-2">
      {[0, 1, 2, 3, 4].map(i => (
        <div
          key={i}
          ref={el => { barsRef.current[i] = el }}
          className="w-1 rounded-full bg-teal-400 transition-[height] duration-75"
          style={{ height: 4 }}
        />
      ))}
    </div>
  )
}
