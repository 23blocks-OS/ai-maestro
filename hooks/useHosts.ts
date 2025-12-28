'use client'

import { useEffect, useState } from 'react'
import type { Host } from '@/types/host'

const HOSTS_FETCH_TIMEOUT = 5000 // 5 seconds for local hosts list

/**
 * Hook to fetch and manage configured hosts
 */
export function useHosts() {
  const [hosts, setHosts] = useState<Host[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const fetchHosts = async () => {
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
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          console.error('Hosts fetch timed out after', HOSTS_FETCH_TIMEOUT, 'ms')
          setError(new Error('Hosts fetch timed out'))
        } else {
          console.error('Failed to fetch hosts:', err)
          setError(err instanceof Error ? err : new Error('Unknown error'))
        }
      } finally {
        setLoading(false)
      }
    }

    fetchHosts()
  }, [])

  return { hosts, loading, error }
}
