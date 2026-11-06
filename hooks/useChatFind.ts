'use client'

/** Search in the chat, for both views. The host searches the whole conversation; history loads down to a result. */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { foundKey } from '@/lib/chat-utils'
import type { HistoryCursor } from '@/lib/chat-history-paging'

export interface ChatFindResult {
  index: number
  uuid?: string
  timestamp?: string
  type: 'user' | 'assistant'
  snippet: string
}

const SEARCH_DELAY_MS = 300
const SEARCH_TIMEOUT_MS = 10000

export function useChatFind({ agentId, send, cursorRef, rootRef, messages }: {
  agentId: string
  send: (type: string, payload?: Record<string, unknown>) => boolean
  cursorRef: RefObject<HistoryCursor | null>
  rootRef: RefObject<HTMLElement | null>
  messages: unknown[]
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ChatFindResult[] | null>(null)
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<'idle' | 'searching' | 'failed'>('idle')
  const [found, setFound] = useState<string | null>(null)
  const asked = useRef('')
  const scrolled = useRef<string | null>(null)
  const lateRef = useRef<() => void>(() => {})

  useEffect(() => {
    const wanted = query.trim()
    asked.current = wanted
    if (!open || wanted.length < 2) {
      setResults(null)
      setStatus('idle')
      return
    }
    setStatus('searching')
    let late: ReturnType<typeof setTimeout>
    const start = setTimeout(() => {
      if (!send('chat:search', { agentId, query: wanted })) return setStatus('failed')
      // A host on an older version does not answer
      late = setTimeout(() => setStatus('failed'), SEARCH_TIMEOUT_MS)
    }, SEARCH_DELAY_MS)
    lateRef.current = () => clearTimeout(late)
    return () => {
      clearTimeout(start)
      clearTimeout(late)
    }
  }, [query, open, agentId, send])

  const receive = useCallback((data: { query?: string; results?: ChatFindResult[]; total?: number; failed?: boolean }) => {
    if (data.query !== asked.current) return
    lateRef.current()
    setResults(data.results || [])
    setTotal(data.total || 0)
    setStatus(data.failed ? 'failed' : 'idle')
  }, [])

  const pick = useCallback((result: ChatFindResult) => {
    const key = foundKey(result)
    scrolled.current = null
    setFound(key)
    setOpen(false)
    const cursor = cursorRef.current
    if (cursor && result.index < cursor.start) {
      send('chat:requestHistory', { agentId, before: cursor.start, conversationFile: cursor.file, through: result.index })
    }
  }, [agentId, send, cursorRef])

  // After the list is drawn, and after the view keeps its scroll position for a prepended page
  useEffect(() => {
    if (!found || scrolled.current === found) return
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => {
      const mark = rootRef.current?.querySelector('[data-chat-found]')
      if (!mark) return
      scrolled.current = found
      mark.scrollIntoView({ block: 'center' })
    }))
    return () => cancelAnimationFrame(frame)
  }, [found, messages, rootRef])

  return { open, setOpen, query, setQuery, results, total, status, found, receive, pick }
}

export type ChatFindState = ReturnType<typeof useChatFind>
