import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react'

/**
 * Keeps what the person is reading in place when older messages are added above it.
 * Call the returned function just before the prepend; the layout effect restores the offset
 * after `items` renders. Safari has no CSS scroll anchoring, so this is done by hand.
 */
export function useKeepScrollOnPrepend(containerRef: RefObject<HTMLElement | null>, items: unknown) {
  const saved = useRef<{ height: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const el = containerRef.current
    const s = saved.current
    if (!el || !s) return
    el.scrollTop = el.scrollHeight - s.height + s.top
    saved.current = null
  }, [containerRef, items])

  return useCallback(() => {
    const el = containerRef.current
    if (el) saved.current = { height: el.scrollHeight, top: el.scrollTop }
  }, [containerRef])
}
