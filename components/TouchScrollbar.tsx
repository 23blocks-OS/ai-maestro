'use client'

import { useEffect, useState, useCallback } from 'react'
import { useDeviceType } from '@/hooks/useDeviceType'

interface TouchScrollbarProps {
  /** The scrollable element to track */
  scrollRef: React.RefObject<HTMLElement | null>
  /** Width of the scrollbar track in pixels (default 24) */
  width?: number
}

/**
 * Custom always-visible scrollbar for touch devices.
 * iPadOS/iOS Safari ignores CSS ::-webkit-scrollbar pseudo-elements,
 * so this component renders a DOM-based scrollbar overlay instead.
 *
 * Usage: parent must have position:relative. The scrollable element
 * is passed via scrollRef. Only renders on touch devices when content
 * overflows.
 */
export function TouchScrollbar({ scrollRef, width = 24 }: TouchScrollbarProps) {
  const { isTouch } = useDeviceType()
  const [state, setState] = useState({ top: 0, height: 0, visible: false })

  const update = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    if (scrollHeight <= clientHeight + 1) {
      setState(s => s.visible ? { top: 0, height: 0, visible: false } : s)
      return
    }
    const ratio = clientHeight / scrollHeight
    const thumbH = Math.max(ratio * clientHeight, 40)
    const maxTop = clientHeight - thumbH
    const top = scrollHeight - clientHeight > 0
      ? (scrollTop / (scrollHeight - clientHeight)) * maxTop
      : 0
    setState({ top, height: thumbH, visible: true })
  }, [scrollRef])

  useEffect(() => {
    if (!isTouch) return
    const el = scrollRef.current
    if (!el) return

    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    // Track content changes (items added/removed)
    const mo = new MutationObserver(update)
    mo.observe(el, { childList: true, subtree: true })

    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
      mo.disconnect()
    }
  }, [scrollRef, isTouch, update])

  if (!isTouch || !state.visible) return null

  const thumbW = width - 4
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width,
        height: '100%',
        pointerEvents: 'none',
        zIndex: 20,
      }}
      aria-hidden="true"
    >
      {/* Track */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: '#1a1720',
        opacity: 0.85,
      }} />
      {/* Thumb */}
      <div style={{
        position: 'absolute',
        top: state.top,
        left: 2,
        width: thumbW,
        height: state.height,
        background: '#3d3548',
        borderRadius: thumbW / 2,
      }} />
    </div>
  )
}
