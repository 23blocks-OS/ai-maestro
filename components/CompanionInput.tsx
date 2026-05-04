'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send } from 'lucide-react'
import { matchVoiceCommand, type VoiceCommandMatch } from '@/lib/voice-commands'

/**
 * CompanionInput - Text input for voice-to-text (WhisperFlow) capture & send
 * WhisperFlow types into the focused textarea like a virtual keyboard.
 * Enter sends, Shift+Enter inserts newline.
 */
export default function CompanionInput({
  agentId,
  disabled,
  onMessageSent,
  onCommandMatched,
}: {
  agentId: string | null
  disabled: boolean
  onMessageSent?: (text: string) => void
  onCommandMatched?: (match: VoiceCommandMatch) => void
}) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-focus on mount so WhisperFlow has a target
  useEffect(() => {
    if (!disabled && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [disabled])

  const sendMessage = async () => {
    const trimmed = text.trim()
    if (!trimmed || !agentId || disabled || sending) return

    // Intercept voice commands before sending to agent
    const match = matchVoiceCommand(trimmed)
    if (match) {
      onCommandMatched?.(match)
      setText('')
      // Show feedback toast
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
      setFeedback(match.command.feedbackMessage)
      feedbackTimerRef.current = setTimeout(() => setFeedback(null), 1500)
      textareaRef.current?.focus()
      return
    }

    setSending(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      })
      if (res.ok) {
        setText('')
        // Notify voice subsystem of the user's message
        onMessageSent?.(trimmed)
        // Re-focus for next WhisperFlow input
        textareaRef.current?.focus()
      } else {
        const data = await res.json().catch(() => ({}))
        console.error('[CompanionInput] Send failed:', data.message || data.error || res.statusText)
      }
    } catch (err) {
      console.error('[CompanionInput] Send error:', err)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const hasText = text.trim().length > 0
  const isDisabled = disabled || !agentId

  return (
    <div className="relative">
      {/* Feedback toast */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute -top-8 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-teal-500/80 backdrop-blur-md text-white text-xs font-medium whitespace-nowrap z-10"
          >
            {feedback}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-black/40 backdrop-blur-md rounded-xl border border-white/10 flex items-end gap-2 p-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isDisabled}
          placeholder={isDisabled ? 'Agent offline' : 'Speak or type a message...'}
          rows={1}
          className="flex-1 bg-transparent text-white text-sm resize-none outline-none placeholder-white/30 px-2 py-1.5 max-h-24 scrollbar-thin disabled:text-white/20 disabled:placeholder-white/15"
          style={{ minHeight: '36px' }}
        />
        <button
          onClick={sendMessage}
          disabled={isDisabled || !hasText || sending}
          className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
            hasText && !isDisabled && !sending
              ? 'bg-teal-500/80 text-white hover:bg-teal-500'
              : 'bg-white/5 text-white/20 cursor-not-allowed'
          }`}
          title="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
