'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

export type ModifierState = 'off' | 'once' | 'locked'

export interface ModifiersHandle {
  ctrl: ModifierState
  alt: ModifierState
  shift: ModifierState
  meta: ModifierState
  clearOneShot: () => void
}

interface MobileKeyToolbarProps {
  onSendKey: (data: string) => void
  visible: boolean
  modifiersRef?: React.MutableRefObject<ModifiersHandle | null>
  forceDoubleRow?: boolean
}

// ANSI escape sequences for special keys
const KEY_ESC = '\x1b'
const KEY_TAB = '\x09'
const KEY_LEFT = '\x1b[D'
const KEY_RIGHT = '\x1b[C'
const KEY_UP = '\x1b[A'
const KEY_DOWN = '\x1b[B'
const KEY_PGUP = '\x1b[5~'
const KEY_PGDN = '\x1b[6~'
const KEY_HOME = '\x1b[H'
const KEY_END = '\x1b[F'
const KEY_DEL = '\x1b[3~'

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

// Shift+<key> = uppercase letter or US keyboard symbol mapping
const SHIFT_SYMBOLS: Record<string, string> = {
  '1': '!', '2': '@', '3': '#', '4': '$', '5': '%',
  '6': '^', '7': '&', '8': '*', '9': '(', '0': ')',
  '-': '_', '=': '+', '[': '{', ']': '}', '\\': '|',
  ';': ':', "'": '"', ',': '<', '.': '>', '/': '?', '`': '~'
}
function shiftChar(char: string): string {
  if (char >= 'a' && char <= 'z') return char.toUpperCase()
  return SHIFT_SYMBOLS[char] || char
}

// Apply ANSI modifier parameter to an escape sequence
// param = 1 + shift×1 + alt×2 + ctrl×4 + meta×8
function modifySeq(baseSeq: string, param: number): string {
  if (param <= 1) return baseSeq
  // CSI letter: \x1b[A → \x1b[1;{param}A
  const letterMatch = baseSeq.match(/^\x1b\[([A-D])$/)
  if (letterMatch) return `\x1b[1;${param}${letterMatch[1]}`
  // CSI number~: \x1b[5~ → \x1b[5;{param}~
  const numMatch = baseSeq.match(/^\x1b\[(\d+)~$/)
  if (numMatch) return `\x1b[${numMatch[1]};${param}~`
  // Home/End
  if (baseSeq === '\x1b[H') return `\x1b[1;${param}H`
  if (baseSeq === '\x1b[F') return `\x1b[1;${param}F`
  return baseSeq
}

// Export helpers for use by TerminalView
export { ctrlKey, altKey, shiftChar }

// Button definition
interface BtnDef {
  label: string
  action: () => void
  onHold?: string
  modifier?: { state: ModifierState }
}

export default function MobileKeyToolbar({ onSendKey, visible, modifiersRef, forceDoubleRow }: MobileKeyToolbarProps) {
  const [ctrlState, setCtrlState] = useState<ModifierState>('off')
  const [altState, setAltState] = useState<ModifierState>('off')
  const [shiftState, setShiftState] = useState<ModifierState>('off')
  const [metaState, setMetaState] = useState<ModifierState>('off')
  const ctrlLastTap = useRef(0)
  const altLastTap = useRef(0)
  const shiftLastTap = useRef(0)
  const metaLastTap = useRef(0)
  const repeatTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const repeatInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  // Ref to latest sendKey so hold-to-repeat always uses current modifier state
  const sendKeyRef = useRef<(key: string, isModifiable?: boolean) => void>(() => {})

  // Sync modifier state to the shared ref so TerminalView can read it
  useEffect(() => {
    if (!modifiersRef) return
    modifiersRef.current = {
      ctrl: ctrlState,
      alt: altState,
      shift: shiftState,
      meta: metaState,
      clearOneShot: () => {
        if (ctrlState === 'once') setCtrlState('off')
        if (altState === 'once') setAltState('off')
        if (shiftState === 'once') setShiftState('off')
        if (metaState === 'once') setMetaState('off')
      }
    }
    // Clear the ref on unmount only if it was provided, to avoid accessing undefined.current
    return () => {
      if (modifiersRef) modifiersRef.current = null
    }
  }, [ctrlState, altState, shiftState, metaState, modifiersRef])

  // Send a key, applying all active modifiers simultaneously
  const sendKey = useCallback((key: string, isModifiable = true) => {
    let data = key
    const shiftOn = shiftState !== 'off'
    const ctrlOn = ctrlState !== 'off'
    const altOn = altState !== 'off'
    const metaOn = metaState !== 'off'

    if (isModifiable && (shiftOn || ctrlOn || altOn || metaOn)) {
      if (key === KEY_TAB && shiftOn) {
        // Shift+Tab = backtab (special case)
        data = '\x1b[Z'
      } else if (key.length > 1) {
        // Navigation key — use ANSI modifier parameter encoding
        const param = 1 + (shiftOn ? 1 : 0) + (altOn ? 2 : 0) + (ctrlOn ? 4 : 0) + (metaOn ? 8 : 0)
        data = modifySeq(key, param)
      } else {
        // Single character — apply Shift first, then Ctrl and/or Alt
        const ch = shiftOn ? shiftChar(key) : key
        if (ctrlOn) {
          data = ctrlKey(ch)
          if (altOn) data = '\x1b' + data // Ctrl+Alt → ESC + control char
        } else if (altOn) {
          data = altKey(ch)
        }
        // shiftOn alone: ch already holds the shifted character — no extra branch needed.
        // Meta on single chars: handled by TerminalView (clipboard shortcuts)
      }
    }
    onSendKey(data)

    // Clear one-shot modifiers after use
    if (ctrlState === 'once') setCtrlState('off')
    if (altState === 'once') setAltState('off')
    if (shiftState === 'once') setShiftState('off')
    if (metaState === 'once') setMetaState('off')
  }, [onSendKey, ctrlState, altState, shiftState, metaState])

  // Keep ref in sync so hold-to-repeat intervals use the latest modifier state
  sendKeyRef.current = sendKey

  // Toggle modifier: tap = one-shot, double-tap = locked (max 2 locked), tap while active = off
  const toggleModifier = useCallback((
    state: ModifierState,
    setState: (s: ModifierState) => void,
    lastTapRef: React.MutableRefObject<number>
  ) => {
    const now = Date.now()
    const isDoubleTap = now - lastTapRef.current < 350
    lastTapRef.current = now

    // Count how many modifiers are currently locked (all modifiers, including the current one).
    // The limit check `lockedCount < 2` prevents more than 2 locked modifiers at any time.
    const allModifierStates = [
      { state: ctrlState },
      { state: altState },
      { state: shiftState },
      { state: metaState },
    ]
    const lockedCount = allModifierStates.filter(
      (mod) => mod.state === 'locked'
    ).length

    if (state === 'off') {
      // Double-tap → locked (if under limit), single tap → one-shot
      if (isDoubleTap && lockedCount < 2) {
        setState('locked')
      } else {
        setState('once')
      }
    } else if (state === 'once' && isDoubleTap) {
      // Upgrade one-shot to locked if under limit
      setState(lockedCount < 2 ? 'locked' : 'once')
    } else {
      setState('off')
    }
  }, [ctrlState, altState, shiftState, metaState])

  const stopRepeat = useCallback(() => {
    if (repeatTimer.current) { clearTimeout(repeatTimer.current); repeatTimer.current = null }
    if (repeatInterval.current) { clearInterval(repeatInterval.current); repeatInterval.current = null }
  }, [])

  // Hold-to-repeat: calls sendKey (via ref) so locked modifiers apply on every repeat.
  // One-shot modifiers clear after the first sendKey call (the initial tap).
  const startRepeat = useCallback((key: string) => {
    stopRepeat()
    repeatTimer.current = setTimeout(() => {
      repeatInterval.current = setInterval(() => {
        sendKeyRef.current(key)
      }, 80)
    }, 400)
  }, [stopRepeat])

  // Measure toolbar container width for responsive 2-row layout
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [toolbarWidth, setToolbarWidth] = useState(800)
  useEffect(() => {
    if (!visible || !toolbarRef.current) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setToolbarWidth(entry.contentRect.width)
      }
    })
    ro.observe(toolbarRef.current)
    return () => ro.disconnect()
  }, [visible])

  if (!visible) return null

  // 2-row layout: always on phone-sized devices, or when container is narrow
  const useDoubleRow = forceDoubleRow || toolbarWidth < 500

  // Modifier visual: once = red text only, locked = red bg + white text
  const modStyle = (state: ModifierState) =>
    state === 'locked'
      ? 'bg-[#cc2222] text-white border-[#991111]'
      : state === 'once'
        ? 'bg-[#2a2a2e] text-[#ff4444] border-[#48484a]'
        : 'bg-[#2a2a2e] text-[#c8c8cc] border-[#48484a] active:bg-[#48484a]'

  const normalBtn = 'bg-[#2a2a2e] text-[#c8c8cc] border-[#48484a] active:bg-[#48484a]'

  // Button groups matching the reference image
  const groups: BtnDef[][] = [
    [
      { label: 'Esc', action: () => sendKey(KEY_ESC) },
      { label: 'Tab', action: () => sendKey(KEY_TAB) },
    ],
    [
      { label: '◀︎', action: () => sendKey(KEY_LEFT), onHold: KEY_LEFT },
      { label: '▶︎', action: () => sendKey(KEY_RIGHT), onHold: KEY_RIGHT },
    ],
    [
      { label: '▲', action: () => sendKey(KEY_UP), onHold: KEY_UP },
      { label: '▼', action: () => sendKey(KEY_DOWN), onHold: KEY_DOWN },
    ],
    [
      { label: 'PgUp', action: () => sendKey(KEY_PGUP), onHold: KEY_PGUP },
      { label: 'PgDn', action: () => sendKey(KEY_PGDN), onHold: KEY_PGDN },
    ],
    [
      { label: 'Home', action: () => sendKey(KEY_HOME), onHold: KEY_HOME },
      { label: 'End', action: () => sendKey(KEY_END), onHold: KEY_END },
    ],
    [
      { label: 'Del', action: () => sendKey(KEY_DEL), onHold: KEY_DEL },
    ],
    [
      { label: 'Shift', action: () => toggleModifier(shiftState, setShiftState, shiftLastTap), modifier: { state: shiftState } },
      { label: 'Ctrl', action: () => toggleModifier(ctrlState, setCtrlState, ctrlLastTap), modifier: { state: ctrlState } },
      { label: 'Opt', action: () => toggleModifier(altState, setAltState, altLastTap), modifier: { state: altState } },
      { label: 'Cmd', action: () => toggleModifier(metaState, setMetaState, metaLastTap), modifier: { state: metaState } },
    ],
  ]

  // Build flat layout: buttons with flex-grow values + spacers with specific widths
  // Per-group grow values measured from reference image pixel widths:
  // G1(Esc,Tab)=50, G2(←→)=53, G3(↑↓)=49, G4(PgUp,PgDn)=51,
  // G5(Home,End)=50, G6(Del)=58, G7(modifiers)=110 each
  // Inter-group gaps: 8/14/8/8/12/18px matching reference proportions
  type LayoutItem =
    | { kind: 'btn'; btn: BtnDef; grow: number }
    | { kind: 'gap'; width: number }

  const layout: LayoutItem[] = [
    // Group 1: Esc, Tab
    { kind: 'btn', btn: groups[0][0], grow: 50 },
    { kind: 'btn', btn: groups[0][1], grow: 50 },
    { kind: 'gap', width: 8 },
    // Group 2: ←, →
    { kind: 'btn', btn: groups[1][0], grow: 53 },
    { kind: 'btn', btn: groups[1][1], grow: 53 },
    { kind: 'gap', width: 14 },
    // Group 3: ↑, ↓
    { kind: 'btn', btn: groups[2][0], grow: 49 },
    { kind: 'btn', btn: groups[2][1], grow: 49 },
    { kind: 'gap', width: 8 },
    // Group 4: PgUp, PgDn
    { kind: 'btn', btn: groups[3][0], grow: 51 },
    { kind: 'btn', btn: groups[3][1], grow: 51 },
    { kind: 'gap', width: 8 },
    // Group 5: Home, End
    { kind: 'btn', btn: groups[4][0], grow: 50 },
    { kind: 'btn', btn: groups[4][1], grow: 50 },
    { kind: 'gap', width: 12 },
    // Group 6: Del
    { kind: 'btn', btn: groups[5][0], grow: 58 },
    { kind: 'gap', width: 18 },
    // Group 7: Shift, Ctrl, Opt, Cmd
    { kind: 'btn', btn: groups[6][0], grow: 110 },
    { kind: 'btn', btn: groups[6][1], grow: 110 },
    { kind: 'btn', btn: groups[6][2], grow: 110 },
    { kind: 'btn', btn: groups[6][3], grow: 110 },
  ]

  const btnBase = 'inline-flex items-center justify-center rounded-[6px] border select-none touch-manipulation transition-colors tracking-wide min-w-0'

  const renderButton = (item: LayoutItem, i: number, btnHeight: string, btnFontSize: string) => {
    if (item.kind === 'gap') {
      return <div key={`g${i}`} style={{ width: useDoubleRow ? Math.min(item.width, 6) : item.width, flexShrink: 0 }} />
    }
    const { btn, grow } = item
    const isMod = !!btn.modifier
    const btnClass = isMod ? modStyle(btn.modifier!.state) : normalBtn
    const btnStyle = { flex: `${grow} 1 0%`, height: btnHeight, fontSize: btnFontSize }

    if (btn.onHold) {
      // Use a flag to prevent mousedown from firing after touchstart on touch devices.
      // iOS Safari fires both touchstart AND mousedown for a single tap, which would
      // send the key twice (cursor moves 2 lines instead of 1).
      let touchFired = false
      return (
        <button
          key={i}
          onTouchStart={(e) => { e.preventDefault(); touchFired = true; btn.action(); startRepeat(btn.onHold!) }}
          onTouchEnd={() => { stopRepeat(); touchFired = false }}
          onTouchCancel={() => { stopRepeat(); touchFired = false }}
          onMouseDown={(e) => { if (touchFired) return; e.preventDefault(); btn.action(); startRepeat(btn.onHold!) }}
          onMouseUp={stopRepeat}
          onMouseLeave={stopRepeat}
          style={btnStyle}
          className={`${btnBase} ${btnClass}`}
        >
          {btn.label}
        </button>
      )
    }

    // Same touch/mouse guard as hold buttons to prevent double-firing on iOS
    let touched = false
    return (
      <button
        key={i}
        onTouchStart={(e) => { e.preventDefault(); touched = true; btn.action() }}
        onMouseDown={(e) => { if (touched) return; e.preventDefault(); btn.action() }}
        style={btnStyle}
        className={`${btnBase} ${btnClass}`}
      >
        {btn.label}
      </button>
    )
  }

  if (useDoubleRow) {
    // Split: Row 1 = groups 1-6 (nav keys + Del), Row 2 = modifiers (group 7)
    // Layout indices: 0-14=groups1-5+gaps, 15=Del, 16=gap, 17-20=modifiers
    // Row 1: items 0..15 (through Del button), skip trailing gap
    const row1 = layout.slice(0, 16)
    // Row 2: items 17..20 (Shift Ctrl Opt Cmd), skip gap at index 16
    const row2 = layout.slice(17)
    const btnH = '36px'
    const btnFs = '12px'

    return (
      <div ref={toolbarRef} className="flex-shrink-0 bg-[#1c1c1e]" style={{ padding: '5px 8px' }}>
        <div className="flex items-center w-full mb-1" style={{ gap: '4px' }}>
          {row1.map((item, i) => renderButton(item, i, btnH, btnFs))}
        </div>
        <div className="flex items-center w-full" style={{ gap: '4px' }}>
          {row2.map((item, i) => renderButton(item, i + 100, btnH, btnFs))}
        </div>
      </div>
    )
  }

  return (
    <div ref={toolbarRef} className="flex-shrink-0 bg-[#1c1c1e]" style={{ padding: '7px 10px' }}>
      <div className="flex items-center w-full" style={{ gap: 'clamp(6px, 0.9vw, 9px)' }}>
        {layout.map((item, i) => renderButton(item, i, 'clamp(36px, 8vw, 44px)', 'clamp(11px, 3vw, 14px)'))}
      </div>
    </div>
  )
}
