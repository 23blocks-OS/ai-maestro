'use client'

import { useEffect, useState } from 'react'
import type { Host } from '@/types/host'

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
        const response = await fetch('/api/hosts')

        if (!response.ok) {
          throw new Error('Failed to fetch hosts')
        }

        const data = await response.json()
        setHosts(data.hosts || [])
        setError(null)
      } catch (err) {
        console.error('Failed to fetch hosts:', err)
        setError(err instanceof Error ? err : new Error('Unknown error'))
      } finally {
        setLoading(false)
      }
    }

    fetchHosts()
  }, [])

  return { hosts, loading, error }
}
