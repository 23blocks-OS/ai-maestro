'use client'

import { useState, useCallback, useRef } from 'react'

interface MobileKeyToolbarProps {
  onSendKey: (data: string) => void
  visible: boolean
}

// ANSI escape sequences for special keys
const KEY_ESC = '\x1b'
const KEY_TAB = '\x09'
const KEY_UP = '\x1b[A'
const KEY_DOWN = '\x1b[B'
const KEY_RIGHT = '\x1b[C'
const KEY_LEFT = '\x1b[D'
const KEY_PGUP = '\x1b[5~'
const KEY_PGDN = '\x1b[6~'
// const KEY_HOME = '\x1b[H'
// const KEY_END = '\x1b[F'

type ModifierState = 'off' | 'once' | 'locked'

// Ctrl+<key> = char code minus 64 (A=1, C=3, D=4, etc.)
function ctrlKey(char: string): string {
  const code = char.toUpperCase().charCodeAt(0) - 64
  if (code >= 1 && code <= 26) return String.fromCharCode(code)
  return char
}

// Alt+<key> = ESC prefix
function altKey(char: string): string {
  return '\x1b' + char
}

export default function MobileKeyToolbar({ onSendKey, visible }: MobileKeyToolbarProps) {
  const [ctrlState, setCtrlState] = useState<ModifierState>('off')
  const [altState, setAltState] = useState<ModifierState>('off')
  const ctrlLastTap = useRef(0)
  const altLastTap = useRef(0)
  const repeatTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const repeatInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  // Send a key, applying active modifiers
  const sendKey = useCallback((key: string, isModifiable = true) => {
    let data = key
    if (isModifiable) {
      // For single printable chars, apply Ctrl/Alt. For escape sequences, send raw.
      if (ctrlState !== 'off' && key.length === 1) {
        data = ctrlKey(key)
      } else if (altState !== 'off' && key.length === 1) {
        data = altKey(key)
      }
    }
    onSendKey(data)

    // Clear one-shot modifiers after use
    if (ctrlState === 'once') setCtrlState('off')
    if (altState === 'once') setAltState('off')
  }, [onSendKey, ctrlState, altState])

  // Toggle modifier: tap = one-shot, double-tap = locked, tap while active = off
  const toggleModifier = useCallback((
    _which: 'ctrl' | 'alt',
    state: ModifierState,
    setState: (s: ModifierState) => void,
    lastTapRef: React.MutableRefObject<number>
  ) => {
    const now = Date.now()
    const isDoubleTap = now - lastTapRef.current < 350
    lastTapRef.current = now

    if (state === 'off') {
      setState(isDoubleTap ? 'locked' : 'once')
    } else if (state === 'once' && isDoubleTap) {
      setState('locked')
    } else {
      setState('off')
    }
  }, [])

  // Auto-repeat: start repeating a key after 400ms hold, then every 80ms
  const startRepeat = useCallback((key: string) => {
    stopRepeat()
    repeatTimer.current = setTimeout(() => {
      repeatInterval.current = setInterval(() => {
        onSendKey(key)
      }, 80)
    }, 400)
  }, [onSendKey])

  const stopRepeat = useCallback(() => {
    if (repeatTimer.current) { clearTimeout(repeatTimer.current); repeatTimer.current = null }
    if (repeatInterval.current) { clearInterval(repeatInterval.current); repeatInterval.current = null }
  }, [])

  if (!visible) return null

  const modifierClass = (state: ModifierState) =>
    state === 'locked'
      ? 'bg-red-600/80 text-white border-red-500/50'
      : state === 'once'
        ? 'bg-amber-600/80 text-white border-amber-500/50'
        : 'bg-gray-800/80 text-gray-300 border-gray-600/50'

  const keyClass = 'bg-gray-800/80 text-gray-300 border border-gray-600/50 active:bg-gray-600/80 active:scale-95'

  // Repeatable key button (arrows, pgup/pgdn)
  const RepeatKey = ({ label, seq, className = '' }: { label: string; seq: string; className?: string }) => (
    <button
      onTouchStart={() => { sendKey(seq, false); startRepeat(seq) }}
      onTouchEnd={stopRepeat}
      onTouchCancel={stopRepeat}
      onMouseDown={() => { sendKey(seq, false); startRepeat(seq) }}
      onMouseUp={stopRepeat}
      onMouseLeave={stopRepeat}
      className={`${keyClass} ${className} rounded-lg transition-all select-none touch-manipulation`}
    >
      {label}
    </button>
  )

  return (
    <div className="flex-shrink-0 border-t border-gray-700 bg-gray-900/95 backdrop-blur-sm px-2 py-1.5">
      <div className="flex items-center gap-1 text-xs font-medium">
        {/* Esc */}
        <button
          onClick={() => sendKey(KEY_ESC, false)}
          className={`${keyClass} px-2.5 py-2 rounded-lg transition-all select-none touch-manipulation`}
        >
          Esc
        </button>

        {/* Tab */}
        <button
          onClick={() => sendKey(KEY_TAB, false)}
          className={`${keyClass} px-2.5 py-2 rounded-lg transition-all select-none touch-manipulation`}
        >
          Tab
        </button>

        {/* Ctrl modifier */}
        <button
          onClick={() => toggleModifier('ctrl', ctrlState, setCtrlState, ctrlLastTap)}
          className={`${modifierClass(ctrlState)} border px-2 py-2 rounded-lg transition-all select-none touch-manipulation`}
        >
          Ctrl{ctrlState === 'locked' ? ' *' : ctrlState === 'once' ? ' .' : ''}
        </button>

        {/* Alt modifier */}
        <button
          onClick={() => toggleModifier('alt', altState, setAltState, altLastTap)}
          className={`${modifierClass(altState)} border px-2 py-2 rounded-lg transition-all select-none touch-manipulation`}
        >
          Alt{altState === 'locked' ? ' *' : altState === 'once' ? ' .' : ''}
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Arrow keys */}
        <RepeatKey label="<" seq={KEY_LEFT} className="px-2 py-2" />
        <div className="flex flex-col gap-0.5">
          <RepeatKey label="^" seq={KEY_UP} className="px-2 py-0.5 text-[10px]" />
          <RepeatKey label="v" seq={KEY_DOWN} className="px-2 py-0.5 text-[10px]" />
        </div>
        <RepeatKey label=">" seq={KEY_RIGHT} className="px-2 py-2" />

        {/* Page Up/Down */}
        <div className="flex flex-col gap-0.5 ml-1">
          <RepeatKey label="PgU" seq={KEY_PGUP} className="px-1.5 py-0.5 text-[10px]" />
          <RepeatKey label="PgD" seq={KEY_PGDN} className="px-1.5 py-0.5 text-[10px]" />
        </div>
      </div>
    </div>
  )
}
