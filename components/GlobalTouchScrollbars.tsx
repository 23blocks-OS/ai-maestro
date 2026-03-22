'use client'

import { useEffect, useRef } from 'react'
import { useDeviceType } from '@/hooks/useDeviceType'

/**
 * Global touch scrollbar system.
 * iPadOS/iOS Safari ignores CSS ::-webkit-scrollbar pseudo-elements,
 * so this component scans the DOM for scrollable containers and renders
 * position:absolute overlay scrollbars inside each container.
 *
 * iOS-native style: thin, semi-transparent thumb over content.
 * The thumb is draggable via touch.
 *
 * Also sets `.is-touch` class on <html> so CSS can hide native scrollbars
 * when JS detects touch (including via ?touch=1 query parameter).
 */

const TRACK_W = 14
const THUMB_W = 8
const THUMB_RADIUS = THUMB_W / 2
const MIN_CONTAINER_H = 80
const SCAN_DEBOUNCE_MS = 400

/* CSS selector for scrollable containers — excludes xterm-viewport
   (xterm gets its own dedicated scroll indicator in TerminalView) */
const SELECTOR = [
  '.overflow-y-auto',
  '.overflow-y-scroll',
  '.overflow-auto',
  '.custom-scrollbar',
  '.scrollbar-thin',
].join(', ')

interface Tracked {
  el: HTMLElement
  overlay: HTMLDivElement
  thumb: HTMLDivElement
  scrollHandler: () => void
  ro: ResizeObserver
  cleanupDrag: () => void
  hadStaticPosition: boolean
}

function shouldTrack(el: HTMLElement): boolean {
  /* Skip tiny containers (dropdowns, tooltips) */
  if (el.clientHeight < MIN_CONTAINER_H) return false
  /* Skip non-overflowing */
  if (el.scrollHeight <= el.clientHeight + 1) return false
  /* Skip invisible */
  const s = getComputedStyle(el)
  if (s.visibility === 'hidden' || s.display === 'none') return false
  /* Skip elements inside xterm (handled by TerminalView's own indicator) */
  if (el.closest('.xterm')) return false
  return true
}

function positionOverlay(el: HTMLElement, overlay: HTMLDivElement, thumb: HTMLDivElement) {
  const { scrollTop, scrollHeight, clientHeight } = el
  if (scrollHeight <= clientHeight + 1) {
    overlay.style.display = 'none'
    return
  }
  overlay.style.display = ''
  /* Position the overlay at the current scroll offset so it appears
     visually fixed at the top of the visible area */
  overlay.style.top = `${scrollTop}px`
  overlay.style.height = `${clientHeight}px`

  const ratio = clientHeight / scrollHeight
  const thumbH = Math.max(ratio * clientHeight, 40)
  const maxTop = clientHeight - thumbH
  const top = scrollHeight - clientHeight > 0
    ? (scrollTop / (scrollHeight - clientHeight)) * maxTop
    : 0
  thumb.style.top = `${top}px`
  thumb.style.height = `${thumbH}px`
}

export function GlobalTouchScrollbars() {
  const { isTouch } = useDeviceType()
  const trackedRef = useRef(new Map<HTMLElement, Tracked>())
  const scanTimerRef = useRef<ReturnType<typeof setTimeout>>()

  /* Add/remove .is-touch class on <html> so CSS can respond to JS touch detection
     (including ?touch=1 query parameter, which CSS media queries can't detect) */
  useEffect(() => {
    if (isTouch) {
      document.documentElement.classList.add('is-touch')
    } else {
      document.documentElement.classList.remove('is-touch')
    }
    return () => {
      document.documentElement.classList.remove('is-touch')
    }
  }, [isTouch])

  useEffect(() => {
    if (!isTouch) return

    const tracked = trackedRef.current

    function addOverlay(el: HTMLElement) {
      if (tracked.has(el)) return

      /* Ensure the scrollable element is a positioning context */
      const computed = getComputedStyle(el)
      const hadStaticPosition = computed.position === 'static'
      if (hadStaticPosition) {
        el.style.position = 'relative'
      }

      const overlay = document.createElement('div')
      overlay.setAttribute('data-touch-scrollbar', '1')
      overlay.setAttribute('aria-hidden', 'true')
      overlay.style.cssText = [
        'position:absolute',
        'right:0',
        `width:${TRACK_W}px`,
        'pointer-events:none',
        'z-index:20',
        'background:transparent',
      ].join(';')

      const thumb = document.createElement('div')
      thumb.style.cssText = [
        'position:absolute',
        `right:${(TRACK_W - THUMB_W) / 2}px`,
        `width:${THUMB_W}px`,
        `border-radius:${THUMB_RADIUS}px`,
        'background:rgba(200,200,220,0.35)',
        'min-height:40px',
        'pointer-events:auto',
        'touch-action:none',
      ].join(';')
      overlay.appendChild(thumb)
      el.appendChild(overlay)

      /* --- Touch drag handling on the thumb --- */
      let dragState: {
        startY: number
        startScrollTop: number
        scrollRange: number
        trackH: number
      } | null = null

      const onTouchMove = (e: TouchEvent) => {
        if (!dragState) return
        e.preventDefault()
        const touch = e.touches[0]
        const deltaY = touch.clientY - dragState.startY
        const scrollDelta = dragState.trackH > 0
          ? (deltaY / dragState.trackH) * dragState.scrollRange
          : 0
        el.scrollTop = Math.max(0, Math.min(
          dragState.startScrollTop + scrollDelta,
          dragState.scrollRange
        ))
      }

      const onTouchEnd = () => {
        dragState = null
        document.removeEventListener('touchmove', onTouchMove)
        document.removeEventListener('touchend', onTouchEnd)
        document.removeEventListener('touchcancel', onTouchEnd)
      }

      thumb.addEventListener('touchstart', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const touch = e.touches[0]
        const thumbH = parseFloat(thumb.style.height) || 40
        dragState = {
          startY: touch.clientY,
          startScrollTop: el.scrollTop,
          scrollRange: el.scrollHeight - el.clientHeight,
          trackH: el.clientHeight - thumbH,
        }
        document.addEventListener('touchmove', onTouchMove, { passive: false })
        document.addEventListener('touchend', onTouchEnd)
        document.addEventListener('touchcancel', onTouchEnd)
      }, { passive: false })

      const cleanupDrag = () => {
        if (dragState) {
          dragState = null
          document.removeEventListener('touchmove', onTouchMove)
          document.removeEventListener('touchend', onTouchEnd)
          document.removeEventListener('touchcancel', onTouchEnd)
        }
      }

      const scrollHandler = () => positionOverlay(el, overlay, thumb)
      el.addEventListener('scroll', scrollHandler, { passive: true })

      const ro = new ResizeObserver(scrollHandler)
      ro.observe(el)

      positionOverlay(el, overlay, thumb)
      tracked.set(el, { el, overlay, thumb, scrollHandler, ro, cleanupDrag, hadStaticPosition })
    }

    function removeOverlay(info: Tracked) {
      info.cleanupDrag()
      info.el.removeEventListener('scroll', info.scrollHandler)
      info.ro.disconnect()
      info.overlay.remove()
      if (info.hadStaticPosition) {
        info.el.style.position = ''
      }
      tracked.delete(info.el)
    }

    function scan() {
      const candidates = document.querySelectorAll<HTMLElement>(SELECTOR)
      const live = new Set<HTMLElement>()

      candidates.forEach(el => {
        if (shouldTrack(el)) {
          live.add(el)
          addOverlay(el)
        }
      })

      /* Remove overlays for elements no longer scrollable or removed from DOM */
      tracked.forEach((info, el) => {
        if (!live.has(el) || !document.body.contains(el)) {
          removeOverlay(info)
        }
      })

      /* Update positions for all surviving overlays */
      tracked.forEach(info => positionOverlay(info.el, info.overlay, info.thumb))
    }

    function debouncedScan() {
      clearTimeout(scanTimerRef.current)
      scanTimerRef.current = setTimeout(scan, SCAN_DEBOUNCE_MS)
    }

    /* Initial scan */
    scan()

    /* Rescan when DOM changes (new scrollable containers appear) */
    const mo = new MutationObserver(debouncedScan)
    mo.observe(document.body, { childList: true, subtree: true })

    /* Periodic rescan to catch async-loaded content */
    const interval = setInterval(scan, 2000)

    return () => {
      mo.disconnect()
      clearInterval(interval)
      clearTimeout(scanTimerRef.current)
      tracked.forEach(info => removeOverlay(info))
    }
  }, [isTouch])

  return null
}
