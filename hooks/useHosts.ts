'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import type { Host } from '@/types/host'

const HOSTS_FETCH_TIMEOUT = 10000 // 10 seconds (increased from 5s for mobile networks)
const REFRESH_INTERVAL = 30000 // 30 seconds periodic refresh
const STALE_THRESHOLD = 30000 // Consider data stale after 30s (for visibilitychange)
const MAX_RETRY_DELAY = 15000 // Max backoff delay

/**
 * Hook to fetch and manage configured hosts
 *
 * Mobile fixes:
 * - Retry with exponential backoff on failure (1s, 2s, 4s, 8s, max 15s)
 * - Periodic refresh every 30s (hosts can come online/offline)
 * - Increased timeout from 5s to 10s for mobile networks
 * - Refetch on visibilitychange if data is stale (>30s)
 */
export function useHosts() {
  const [hosts, setHosts] = useState<Host[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const lastFetchTimeRef = useRef(0)
  const retryAttemptsRef = useRef(0)
  const retryTimeoutRef = useRef<NodeJS.Timeout>()

  const fetchHosts = useCallback(async () => {
    try {
      setLoading(true)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), HOSTS_FETCH_TIMEOUT)

      const response = await fetch('/api/hosts', {
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error('Failed to fetch hosts')
      }

      const data = await response.json()
      setHosts(data.hosts || [])
      setError(null)
      lastFetchTimeRef.current = Date.now()
      retryAttemptsRef.current = 0 // Reset on success
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.error('Hosts fetch timed out after', HOSTS_FETCH_TIMEOUT, 'ms')
        setError(new Error('Hosts fetch timed out'))
      } else {
        console.error('Failed to fetch hosts:', err)
        setError(err instanceof Error ? err : new Error('Unknown error'))
      }

      // Retry with exponential backoff
      const attempt = retryAttemptsRef.current
      const delay = Math.min(1000 * Math.pow(2, attempt), MAX_RETRY_DELAY)
      retryAttemptsRef.current++

      retryTimeoutRef.current = setTimeout(() => {
        fetchHosts()
      }, delay)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchHosts()
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
      }
    }
  }, [fetchHosts])

  // Periodic refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      fetchHosts()
    }, REFRESH_INTERVAL)

    return () => clearInterval(interval)
  }, [fetchHosts])

  // Refetch on visibilitychange if data is stale
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const timeSinceLastFetch = Date.now() - lastFetchTimeRef.current
        if (timeSinceLastFetch > STALE_THRESHOLD) {
          retryAttemptsRef.current = 0 // Reset retries on visibility change
          fetchHosts()
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchHosts])

  return { hosts, loading, error }
}
