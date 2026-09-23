'use client'

import { useEffect } from 'react'

/**
 * Reports every page load to the server log with what the browser knows about
 * it: navigation type (navigate / reload / back_forward), how long the previous
 * page lived, and the last uncaught error before it ended. Added after repeated
 * unexplained dashboard resets that no server log could explain (2026-09-23).
 */
export default function ClientDiagnostics() {
  useEffect(() => {
    const KEY = 'aim-diag'
    let previous: { startedAt?: number; lastError?: string } = {}
    try { previous = JSON.parse(sessionStorage.getItem(KEY) || '{}') } catch { /* none */ }
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
    fetch('/api/debug/client-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'page_load',
        navType: nav?.type ?? 'unknown',
        previousLifetimeSec: previous.startedAt ? Math.round((Date.now() - previous.startedAt) / 1000) : null,
        lastError: previous.lastError ?? null,
        path: location.pathname + location.search,
        heapMB: heap ? Math.round(heap.usedJSHeapSize / 1e6) : null,
      }),
    }).catch(() => { /* diagnostics must never break the page */ })

    const state = { startedAt: Date.now(), lastError: undefined as string | undefined }
    const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(state)) } catch { /* private mode */ } }
    save()
    const onError = (e: ErrorEvent) => { state.lastError = `${e.message} @ ${e.filename}:${e.lineno}`; save() }
    const onRejection = (e: PromiseRejectionEvent) => { state.lastError = `unhandled rejection: ${String(e.reason?.message ?? e.reason)}`; save() }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
  return null
}
