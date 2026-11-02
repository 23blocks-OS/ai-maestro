'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { Loader2 } from 'lucide-react'

/**
 * The top of a chat list: loads older messages when it scrolls into view, with a button as well
 * (and for when the observer is not available). Says so when the conversation has no more.
 */
export default function LoadEarlierMessages({ hasMore, loading, failed, atStart, onLoad, rootRef }: {
  hasMore: boolean
  loading: boolean
  failed: boolean
  /** The whole conversation is loaded */
  atStart: boolean
  onLoad: () => void
  rootRef: RefObject<HTMLElement | null>
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !hasMore || loading || failed || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(
      entries => { if (entries.some(e => e.isIntersecting)) onLoad() },
      { root: rootRef.current, rootMargin: '200px 0px 0px 0px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasMore, loading, failed, onLoad, rootRef])

  if (!hasMore) {
    return atStart ? <div className="text-center text-[11px] text-gray-600 py-2">Beginning of this conversation</div> : null
  }

  return (
    <div ref={ref} className="flex justify-center py-2">
      {loading ? (
        <span className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading earlier messages…
        </span>
      ) : (
        <button
          type="button"
          onClick={onLoad}
          className="text-xs text-gray-400 hover:text-gray-200 px-3 py-1 rounded-full border border-gray-700 hover:border-gray-500"
        >
          {failed ? 'Could not load earlier messages. Try again' : 'Load earlier messages'}
        </button>
      )}
    </div>
  )
}
