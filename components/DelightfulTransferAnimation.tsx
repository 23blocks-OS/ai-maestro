'use client'

/**
 * Delightful Transfer Animation Component
 *
 * Drop-in replacement for the basic progress view in TransferAgentDialog.
 * This component adds whimsy, personality, and delight to agent transfers.
 *
 * Usage:
 * import DelightfulTransferAnimation from '@/components/DelightfulTransferAnimation'
 *
 * <DelightfulTransferAnimation
 *   status={status}
 *   agentAlias={agentAlias}
 *   mode={mode}
 * />
 */

import { useEffect, useState, useCallback } from 'react'
import {
  TRANSFER_MESSAGES,
  getRandomMessage,
  getRandomPackingItem,
  checkEasterEggs,
  getRandomLoadingTip,
  type AgentPersonality,
  getPersonalityMessage
} from '@/lib/transfer-delight'
import '@/styles/transfer-animations.css'

type TransferStatus = 'idle' | 'exporting' | 'transferring' | 'importing' | 'cleaning' | 'complete' | 'error'

interface DelightfulTransferAnimationProps {
  status: TransferStatus
  agentAlias: string
  mode?: 'move' | 'clone'
  personality?: AgentPersonality
  onRetry?: () => void
}

export default function DelightfulTransferAnimation({
  status,
  agentAlias,
  mode = 'clone',
  personality = 'meticulous',
  onRetry
}: DelightfulTransferAnimationProps) {
  const [currentMessage, setCurrentMessage] = useState('')
  const [currentTip, setCurrentTip] = useState('')
  const [packingItems, setPackingItems] = useState<string[]>([])
  const [easterEgg, setEasterEgg] = useState<any>(null)
  const [retryCount, setRetryCount] = useState(0)

  // Map transfer status to animation phase
  const getPhase = (status: TransferStatus) => {
    switch (status) {
      case 'exporting': return 'PACKING'
      case 'transferring': return 'TRAVELING'
      case 'importing': return 'ARRIVING'
      case 'complete': return 'READY'
      case 'error': return 'ERROR'
      default: return 'PACKING'
    }
  }

  const phase = getPhase(status)

  // Rotate messages
  useEffect(() => {
    if (status === 'idle') return

    // Initial message
    setCurrentMessage(getPersonalityMessage(phase as any, personality))

    // Rotate messages every 2.5 seconds
    const interval = setInterval(() => {
      setCurrentMessage(getPersonalityMessage(phase as any, personality))
    }, 2500)

    return () => clearInterval(interval)
  }, [status, phase, personality])

  // Rotate loading tips
  useEffect(() => {
    if (status === 'idle') return

    setCurrentTip(getRandomLoadingTip())

    const interval = setInterval(() => {
      setCurrentTip(getRandomLoadingTip())
    }, 5000)

    return () => clearInterval(interval)
  }, [status])

  // Generate packing items
  useEffect(() => {
    if (phase === 'PACKING') {
      const items = Array.from({ length: 8 }, () => getRandomPackingItem())
      setPackingItems(items)
    }
  }, [phase])

  // Check for easter eggs
  useEffect(() => {
    if (status === 'idle') return

    const egg = checkEasterEggs({
      agentAlias,
      attemptCount: retryCount,
      timeOfDay: new Date(),
      transferCount: Number(localStorage.getItem('totalTransfers') || 0)
    })

    if (egg) {
      setEasterEgg(egg)
      // Clear after 5 seconds
      setTimeout(() => setEasterEgg(null), 5000)
    }
  }, [status, agentAlias, retryCount])

  // Handle retry
  const handleRetry = useCallback(() => {
    setRetryCount(prev => prev + 1)
    onRetry?.()
  }, [onRetry])

  // Track successful transfers
  useEffect(() => {
    if (status === 'complete') {
      const count = Number(localStorage.getItem('totalTransfers') || 0)
      localStorage.setItem('totalTransfers', String(count + 1))
    }
  }, [status])

  const phaseContent = TRANSFER_MESSAGES[phase]

  return (
    <div className="relative w-full">
      {/* Easter egg display */}
      {easterEgg && (
        <div className={`
          absolute top-0 right-0 px-4 py-2 rounded-lg animate-slide-in-right z-10
          ${easterEgg.rarity === 'legendary'
            ? 'bg-yellow-500/20 border-2 border-yellow-500 shadow-lg shadow-yellow-500/20'
            : 'bg-blue-500/20 border border-blue-500'
          }
        `}>
          <span className="text-sm text-gray-200">
            {easterEgg.rarity === 'legendary' && '⭐ '}
            {easterEgg.effect}
          </span>
        </div>
      )}

      {/* Main animation area */}
      <div className="relative w-full h-64 flex items-center justify-center overflow-hidden">
        {/* Phase-specific animations */}
        {phase === 'PACKING' && <PackingAnimation items={packingItems} />}
        {phase === 'TRAVELING' && <TravelingAnimation />}
        {phase === 'ARRIVING' && <ArrivingAnimation />}
        {phase === 'READY' && <ReadyAnimation />}
        {phase === 'ERROR' && <ErrorAnimation onRetry={handleRetry} />}

        {/* Phase icon and message */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-center max-w-md px-4">
          <div className="text-4xl mb-3 animate-fade-in">
            {phaseContent.icon}
          </div>
          <p className="text-sm text-gray-300 mb-2 animate-slide-in-up">
            {currentMessage}
          </p>
        </div>
      </div>

      {/* Loading tip */}
      {status !== 'complete' && status !== 'error' && (
        <div className="mt-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700 animate-fade-in">
          <p className="text-xs text-gray-400 italic">
            💡 {currentTip}
          </p>
        </div>
      )}

      {/* Screen reader announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {`Transfer status: ${phase}. ${currentMessage}`}
      </div>
    </div>
  )
}

/* ===== PHASE COMPONENTS ===== */

function PackingAnimation({ items }: { items: string[] }) {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Box */}
      <div className="packing-box relative w-40 h-40 bg-blue-500/20 border-2 border-blue-500 rounded-lg">
        {/* Items falling in */}
        {items.map((item, i) => (
          <div
            key={i}
            className="packing-item absolute text-xs bg-blue-500/30 px-2 py-1 rounded whitespace-nowrap"
            style={{
              animationDelay: `${i * 0.15}s`,
              left: `${10 + (i % 3) * 30}%`,
              top: `${10 + Math.floor(i / 3) * 25}%`,
              fontSize: '0.65rem'
            }}
          >
            {item}
          </div>
        ))}

        {/* Sparkles */}
        {[...Array(5)].map((_, i) => (
          <div
            key={`sparkle-${i}`}
            className="sparkle absolute text-yellow-400"
            style={{
              animationDelay: `${i * 0.3}s`,
              left: `${Math.random() * 80 + 10}%`,
              top: `${Math.random() * 80 + 10}%`
            }}
          >
            ✨
          </div>
        ))}
      </div>
    </div>
  )
}

function TravelingAnimation() {
  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Star field background */}
      <div className="star-field absolute inset-0 opacity-20" />

      {/* Rocket */}
      <div className="rocket text-6xl">
        🚀
        {/* Trail effect */}
        <div className="absolute top-1/2 -translate-y-1/2 -z-10">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="rocket-trail absolute left-0 h-1 bg-gradient-to-r from-blue-500 to-transparent"
              style={{
                animationDelay: `${i * 0.1}s`,
                width: `${40 - i * 10}px`,
                opacity: 0.5 - i * 0.15
              }}
            />
          ))}
        </div>
      </div>

      {/* Network nodes (decorative) */}
      <svg className="absolute inset-0 w-full h-full opacity-10">
        <defs>
          <radialGradient id="nodeGlow">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.8" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="20%" cy="30%" r="6" fill="url(#nodeGlow)" />
        <circle cx="50%" cy="50%" r="6" fill="url(#nodeGlow)" />
        <circle cx="80%" cy="70%" r="6" fill="url(#nodeGlow)" />
        <line x1="20%" y1="30%" x2="50%" y2="50%" stroke="currentColor" strokeWidth="1" />
        <line x1="50%" y1="50%" x2="80%" y2="70%" stroke="currentColor" strokeWidth="1" />
      </svg>
    </div>
  )
}

function ArrivingAnimation() {
  return (
    <div className="relative w-full h-full">
      {/* Confetti burst */}
      {[...Array(20)].map((_, i) => (
        <div
          key={i}
          className={i % 2 === 0 ? 'confetti' : 'confetti-alt'}
          style={{
            position: 'absolute',
            left: `${50 + (Math.random() * 30 - 15)}%`,
            top: '50%',
            animationDelay: `${i * 0.05}s`,
            fontSize: `${1 + Math.random()}rem`
          }}
        >
          {['🎉', '⭐', '✨', '🎊'][i % 4]}
        </div>
      ))}

      {/* Welcome banner */}
      <div className="banner absolute top-1/3 left-1/2 -translate-x-1/2 bg-green-500/20 border-2 border-green-500 px-8 py-3 rounded-full">
        <span className="text-green-300 font-semibold text-lg">Welcome Home! 🏠</span>
      </div>

      {/* Landing box */}
      <div className="landing absolute bottom-1/3 left-1/2 -translate-x-1/2 text-6xl">
        📦
      </div>
    </div>
  )
}

function ReadyAnimation() {
  const statusBars = [
    { label: 'Agent', color: 'bg-green-500', delay: 0 },
    { label: 'Sessions', color: 'bg-emerald-500', delay: 0.15 },
    { label: 'Repositories', color: 'bg-teal-500', delay: 0.3 }
  ]

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center gap-6">
      {/* Status bars */}
      <div className="w-3/4 max-w-sm space-y-3">
        {statusBars.map((bar, i) => (
          <div key={bar.label}>
            <div className="text-xs text-gray-400 mb-1.5 flex items-center gap-2">
              <span className="check-mark" style={{ animationDelay: `${bar.delay}s` }}>✓</span>
              {bar.label}
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`status-bar h-full ${bar.color} power-up`}
                style={{ animationDelay: `${bar.delay}s` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Success checkmark */}
      <div className="check-mark text-6xl" style={{ animationDelay: '0.5s' }}>
        ✅
      </div>
    </div>
  )
}

function ErrorAnimation({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center gap-6">
      {/* Sad package with band-aid */}
      <div className="error-wobble relative">
        <div className="text-7xl">📦</div>
        <div className="band-aid absolute top-4 right-2 text-3xl">🩹</div>

        {/* Confused question marks */}
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="confused absolute text-2xl text-orange-400"
            style={{
              animationDelay: `${i * 0.2}s`,
              left: `${-30 + i * 30}px`,
              top: '-30px'
            }}
          >
            ❓
          </div>
        ))}
      </div>

      {/* Repair tools */}
      <div className="flex items-center gap-3">
        <span className="repair-tool text-3xl" style={{ animationDelay: '0s' }}>🔧</span>
        <span className="repair-tool text-3xl" style={{ animationDelay: '0.2s' }}>🔨</span>
        <span className="text-2xl">☕</span>
      </div>

      {/* Retry button */}
      {onRetry && (
        <button
          onClick={onRetry}
          className="retry-button px-6 py-3 bg-orange-500 hover:bg-orange-400 text-white rounded-lg font-medium transition-colors"
        >
          🔄 Try Again
        </button>
      )}

      <p className="text-xs text-gray-500 text-center max-w-xs">
        (Don&apos;t worry, even the best agents trip sometimes!)
      </p>
    </div>
  )
}
