'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Session } from '@/types/session'
import { fetchSessions } from '@/lib/api'

const REFRESH_INTERVAL = 10000 // 10 seconds

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchSessions()
      setSessions(data)
    } catch (err) {
      console.error('Failed to load sessions:', err)
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshSessions = useCallback(() => {
    loadSessions()
  }, [loadSessions])

  // Initial load
  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(() => {
      loadSessions()
    }, REFRESH_INTERVAL)

    return () => clearInterval(interval)
  }, [loadSessions])

  return {
    sessions,
    loading,
    error,
    refreshSessions,
  }
}
